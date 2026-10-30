import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import {
  adminListQuery, adminPatchBody, draftBody, idParams, noteBody, respondBody,
} from '../validators/schemas.js';
import * as tickets from '../services/ticketService.js';
import { getOrCreateDraft, triageInBackground } from '../services/ticketAiService.js';
import { AiUnavailableError, isAiConfigured } from '../services/ai/llmClient.js';
import { CATEGORIES, PRIORITIES, TICKET_STATUSES } from '../constants.js';

// Mounted behind requireRole('admin').
const router = Router();

router.get('/meta', (_req, res) => {
  res.json({ data: { statuses: TICKET_STATUSES, categories: CATEGORIES, priorities: PRIORITIES, aiConfigured: isAiConfigured() } });
});

router.get('/stats', asyncHandler(async (_req, res) => {
  res.json({ data: await tickets.adminStats() });
}));

router.get('/tickets', validate({ query: adminListQuery }), asyncHandler(async (req, res) => {
  const { items, total } = await tickets.adminList(req.query, req.user.id);
  res.json({ data: items, meta: { total, limit: req.query.limit, offset: req.query.offset } });
}));

router.get('/tickets/:id', validate({ params: idParams }), asyncHandler(async (req, res) => {
  res.json({ data: await tickets.adminGet(req.params.id) });
}));

router.patch('/tickets/:id', validate({ params: idParams, body: adminPatchBody }), asyncHandler(async (req, res) => {
  res.json({ data: await tickets.adminUpdate(req.params.id, req.body, req.user.id) });
}));

router.post('/tickets/:id/notes', validate({ params: idParams, body: noteBody }), asyncHandler(async (req, res) => {
  res.status(201).json({ data: await tickets.addNote(req.params.id, req.user.id, req.body.body) });
}));

router.post('/tickets/:id/respond', validate({ params: idParams, body: respondBody }), asyncHandler(async (req, res) => {
  res.status(201).json({ data: await tickets.respond(req.params.id, req.user, req.body) });
}));

/** Returns the cached AI draft, generating it on first open. 503 AI_UNAVAILABLE => write manually. */
router.post('/tickets/:id/draft', validate({ params: idParams, body: draftBody }), asyncHandler(async (req, res, next) => {
  try {
    res.json({ data: await getOrCreateDraft(req.params.id, { regenerate: req.body.regenerate }) });
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return next(Object.assign(err, { details: { fallback: 'manual', reason: err.reason } }));
    }
    next(err);
  }
}));

/** Re-runs AI triage (e.g. after an outage left the ticket on rule-based triage). */
router.post('/tickets/:id/reclassify', validate({ params: idParams }), asyncHandler(async (req, res) => {
  await tickets.adminGet(req.params.id); // 404 if missing
  await triageInBackground(req.params.id);
  res.json({ data: await tickets.adminGet(req.params.id) });
}));

export default router;
