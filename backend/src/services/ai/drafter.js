import { callStructured } from './llmClient.js';
import { DRAFT_SYSTEM, DRAFT_TOOL, buildDraftUser } from './prompts.js';
import { buildAccountFacts } from './accountContext.js';

/**
 * Generates a reply draft grounded in (a) policy for this category only and
 * (b) pre-computed facts about this author/book. Throws AiUnavailableError on outage;
 * the caller decides how to degrade (admins can always write manually).
 */
export async function generateDraft({ ticket, author, book, otherBooks, messages }) {
  const today = new Date();
  const accountFacts = buildAccountFacts({ author, book, otherBooks, today });
  const r = await callStructured({
    system: DRAFT_SYSTEM,
    user: buildDraftUser({ ticket, accountFacts, messages, today: today.toISOString().slice(0, 10) }),
    tool: DRAFT_TOOL,
    maxTokens: 700,
  });
  const draft = String(r.output.draft || '').trim();
  if (!draft) throw new Error('Model returned an empty draft');
  const flags = Array.isArray(r.output.admin_flags) ? r.output.admin_flags.map(String).slice(0, 6) : [];
  return { draft, flags, usage: r.usage, model: r.model, latencyMs: r.latencyMs };
}
