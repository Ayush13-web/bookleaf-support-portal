import { query } from '../db/pool.js';
import { AppError } from '../utils/AppError.js';
import { toCamel } from '../utils/case.js';
import { logger } from '../utils/logger.js';
import { triageTicket } from './ai/triage.js';
import { generateDraft } from './ai/drafter.js';
import { AiUnavailableError } from './ai/llmClient.js';
import { notify } from './ticketService.js';

async function logCall({ ticketId, kind, model, usage, latencyMs, success, error }) {
  try {
    await query(
      `INSERT INTO ai_calls (ticket_id, kind, model, input_tokens, output_tokens, latency_ms, success, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [ticketId, kind, model ?? null, usage?.inputTokens ?? 0, usage?.outputTokens ?? 0, latencyMs ?? null, success, error ?? null],
    );
  } catch (e) {
    logger.warn('Failed to log AI call', e.message); // logging must never break the flow
  }
}

async function loadBook(bookId) {
  if (!bookId) return null;
  const { rows } = await query('SELECT * FROM books WHERE book_id = $1', [bookId]);
  return rows[0] ? toCamel(rows[0]) : null;
}

/**
 * Background triage for a new ticket (or an admin-requested re-run).
 * Always leaves the ticket in a valid state and never throws.
 */
export async function triageInBackground(ticketId) {
  try {
    const { rows } = await query('SELECT subject, description, book_id FROM tickets WHERE id = $1', [ticketId]);
    if (!rows[0]) return;
    const book = await loadBook(rows[0].book_id);
    const result = await triageTicket({ subject: rows[0].subject, description: rows[0].description, book });
    const viaAi = result.source === 'ai';

    // Skip fields an admin already overrode while triage was running.
    await query(
      `UPDATE tickets SET
         category        = CASE WHEN category_source = 'admin' THEN category ELSE $2 END,
         category_source = CASE WHEN category_source = 'admin' THEN 'admin' ELSE $3 END,
         priority        = CASE WHEN priority_source = 'admin' THEN priority ELSE $4 END,
         priority_source = CASE WHEN priority_source = 'admin' THEN 'admin' ELSE $3 END,
         ai_status = $5, ai_reasoning = $6, updated_at = now()
       WHERE id = $1`,
      [ticketId, result.category, result.source, result.priority, viaAi ? 'done' : 'fallback', result.reasoning],
    );
    await logCall({ ticketId, kind: 'triage', model: result.model, usage: result.usage, latencyMs: result.latencyMs, success: viaAi, error: result.aiError });
    await notify('ticket.updated', ticketId, { adminOnly: true });
  } catch (err) {
    logger.error(`Triage failed for ticket ${ticketId}`, err);
    await query("UPDATE tickets SET ai_status = 'fallback' WHERE id = $1 AND ai_status = 'pending'", [ticketId]).catch(() => {});
  }
}

const inFlight = new Map(); // ticketId -> Promise, prevents duplicate paid calls on double-clicks

/**
 * Returns the cached draft, or generates one lazily (only when an admin actually opens the ticket).
 * Throws AiUnavailableError (HTTP 503) when the model can't be reached; the UI then offers manual reply.
 */
export function getOrCreateDraft(ticketId, { regenerate = false } = {}) {
  const key = ticketId;
  if (inFlight.has(key)) return inFlight.get(key);
  const p = produceDraft(ticketId, regenerate).finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

async function produceDraft(ticketId, regenerate) {
  const { rows } = await query(
    `SELECT t.id, t.subject, t.description, t.category, t.priority, t.book_id, t.author_id,
            t.ai_draft, t.ai_draft_flags, t.ai_draft_generated_at, u.name AS author_name
       FROM tickets t JOIN authors a ON a.author_id = t.author_id JOIN users u ON u.id = a.user_id
      WHERE t.id = $1`,
    [ticketId],
  );
  const t = rows[0];
  if (!t) throw AppError.notFound('Ticket');
  if (t.ai_draft && !regenerate) {
    return { draft: t.ai_draft, flags: t.ai_draft_flags, generatedAt: t.ai_draft_generated_at, cached: true };
  }

  const [book, others, msgs] = await Promise.all([
    loadBook(t.book_id),
    t.book_id ? [] : query('SELECT * FROM books WHERE author_id = $1 ORDER BY book_id', [t.author_id]).then((r) => toCamel(r.rows)),
    query('SELECT sender_role, body FROM ticket_messages WHERE ticket_id = $1 ORDER BY created_at, id', [ticketId]).then((r) => toCamel(r.rows)),
  ]);

  try {
    const r = await generateDraft({
      ticket: { subject: t.subject, description: t.description, category: t.category, priority: t.priority },
      author: { name: t.author_name }, book, otherBooks: others, messages: msgs,
    });
    await query(
      `UPDATE tickets SET ai_draft = $2, ai_draft_flags = $3, ai_draft_generated_at = now() WHERE id = $1`,
      [ticketId, r.draft, JSON.stringify(r.flags)],
    );
    await logCall({ ticketId, kind: 'draft', model: r.model, usage: r.usage, latencyMs: r.latencyMs, success: true });
    return { draft: r.draft, flags: r.flags, generatedAt: new Date().toISOString(), cached: false };
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      await logCall({ ticketId, kind: 'draft', success: false, error: err.message, latencyMs: err.latencyMs });
    }
    throw err;
  }
}
