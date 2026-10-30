import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { createTicketBody, idParams, messageBody } from '../validators/schemas.js';
import * as tickets from '../services/ticketService.js';
import { triageInBackground } from '../services/ticketAiService.js';

// Mounted behind requireRole('author'): every query below is scoped to req.user.authorId.
const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  res.json({ data: await tickets.listForAuthor(req.user.authorId) });
}));

router.post('/', validate({ body: createTicketBody }), asyncHandler(async (req, res) => {
  const { id } = await tickets.createTicket(req.user.authorId, req.body);
  // Respond first: the author never waits on (or is blocked by) the AI. Triage runs in the background.
  setImmediate(() => triageInBackground(id));
  res.status(201).json({ data: await tickets.getForAuthor(req.user.authorId, id) });
}));

router.get('/:id', validate({ params: idParams }), asyncHandler(async (req, res) => {
  res.json({ data: await tickets.getForAuthor(req.user.authorId, req.params.id) });
}));

router.post('/:id/messages', validate({ params: idParams, body: messageBody }), asyncHandler(async (req, res) => {
  res.status(201).json({ data: await tickets.addAuthorMessage(req.user, req.params.id, req.body.body) });
}));

export default router;
