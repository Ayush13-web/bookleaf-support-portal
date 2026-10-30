import { CATEGORIES, PRIORITIES, PRIORITY_RANK, DEFAULT_CATEGORY, DEFAULT_PRIORITY } from '../../constants.js';
import { callStructured, AiUnavailableError } from './llmClient.js';
import { TRIAGE_SYSTEM, TRIAGE_TOOL, buildTriageUser } from './prompts.js';
import { ruleBasedClassify } from './fallbackClassifier.js';

/** Business rule from the KB: ISBN errors are always treated as high priority. */
function applyPriorityFloor(category, priority) {
  if (category === 'ISBN & Metadata Issues' && PRIORITY_RANK[priority] < PRIORITY_RANK.High) return 'High';
  return priority;
}

/**
 * Classifies a ticket and scores its priority. Never throws for AI outages:
 * falls back to rules and reports `source: 'rules'` plus the AI error so it can be logged.
 */
export async function triageTicket({ subject, description, book }) {
  try {
    const r = await callStructured({
      system: TRIAGE_SYSTEM,
      user: buildTriageUser({ subject, description, book }),
      tool: TRIAGE_TOOL,
      maxTokens: 200, // tiny structured output
    });
    // Validate model output even though the schema is enforced: defence in depth.
    const category = CATEGORIES.includes(r.output.category) ? r.output.category : DEFAULT_CATEGORY;
    const priority = PRIORITIES.includes(r.output.priority) ? r.output.priority : DEFAULT_PRIORITY;
    return {
      category,
      priority: applyPriorityFloor(category, priority),
      reasoning: String(r.output.reasoning || '').slice(0, 300),
      source: 'ai',
      usage: r.usage, model: r.model, latencyMs: r.latencyMs,
    };
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) throw err;
    const fb = ruleBasedClassify({ subject, description });
    return {
      ...fb,
      priority: applyPriorityFloor(fb.category, fb.priority),
      source: 'rules',
      aiError: err.message, latencyMs: err.latencyMs,
    };
  }
}
