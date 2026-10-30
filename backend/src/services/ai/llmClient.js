import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';

/** Thrown whenever the LLM cannot serve a request. Callers degrade gracefully on this type. */
export class AiUnavailableError extends AppError {
  constructor(message, reason) {
    super(503, 'AI_UNAVAILABLE', message);
    this.reason = reason;
  }
}

// Simple circuit breaker: after repeated failures stop hammering a down/rate-limited API for a while.
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 60_000;
const breaker = { failures: 0, openUntil: 0 };

let client = null;
const getClient = () => {
  if (!env.anthropicApiKey) return null;
  // SDK retries 429/5xx/network errors with exponential backoff before we ever see a failure.
  client ??= new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 2, timeout: env.aiTimeoutMs });
  return client;
};

export const isAiConfigured = () => Boolean(env.anthropicApiKey);

function describeError(err) {
  if (err?.status === 429) return 'AI provider rate limit reached';
  if (err?.status === 401 || err?.status === 403) return 'AI provider rejected the API key';
  if (err?.status >= 500) return 'AI provider is having problems';
  if (err?.name?.includes('Timeout')) return 'AI request timed out';
  return 'AI request failed';
}

/**
 * Calls the model and forces a structured result through a single tool definition.
 * Tool-use gives schema-validated JSON without fragile text parsing.
 */
export async function callStructured({ system, user, tool, maxTokens }) {
  const c = getClient();
  if (!c) throw new AiUnavailableError('AI assistance is not configured', 'not_configured');
  if (Date.now() < breaker.openUntil) {
    throw new AiUnavailableError('AI assistance is temporarily paused after repeated errors', 'circuit_open');
  }

  const started = Date.now();
  try {
    const res = await c.messages.create({
      model: env.aiModel,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
    });
    const block = res.content.find((b) => b.type === 'tool_use');
    if (!block) throw new Error('Model returned no structured output');
    breaker.failures = 0;
    return {
      output: block.input,
      model: res.model,
      latencyMs: Date.now() - started,
      usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
    };
  } catch (err) {
    breaker.failures += 1;
    if (breaker.failures >= BREAKER_THRESHOLD) {
      breaker.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
      logger.warn(`AI circuit breaker open for ${BREAKER_COOLDOWN_MS / 1000}s`);
    }
    logger.warn('LLM call failed:', err?.status ?? '', err?.message);
    const e = new AiUnavailableError(describeError(err), 'provider_error');
    e.latencyMs = Date.now() - started;
    throw e;
  }
}
