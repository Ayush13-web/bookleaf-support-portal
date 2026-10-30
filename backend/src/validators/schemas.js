import { z } from 'zod';
import { CATEGORIES, PRIORITIES, TICKET_STATUSES } from '../constants.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const idParams = z.object({ id: z.coerce.number().int().positive() });

export const loginBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export const createTicketBody = z.object({
  bookId: z.string().trim().min(1).nullish(),
  subject: z.string().trim().min(5, 'Subject must be at least 5 characters').max(200),
  description: z.string().trim().min(20, 'Please describe the issue in at least 20 characters').max(5000),
  // UI-only in this version: we persist file metadata, not the file itself.
  attachments: z
    .array(z.object({ name: z.string().max(255), size: z.number().int().nonnegative().optional() }))
    .max(5)
    .default([]),
});

export const messageBody = z.object({ body: z.string().trim().min(1).max(5000) });

export const booksQuery = z.object({ authorId: z.string().trim().max(20).optional() });

export const adminListQuery = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  category: z.enum(CATEGORIES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigned: z.enum(['me', 'unassigned']).optional(),
  q: z.string().trim().max(100).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(['urgency', 'newest', 'oldest']).default('urgency'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const adminPatchBody = z
  .object({
    status: z.enum(TICKET_STATUSES),
    category: z.enum(CATEGORIES),
    priority: z.enum(PRIORITIES),
    assignee: z.enum(['me', 'none']),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'Provide at least one field to update');

export const respondBody = z.object({
  body: z.string().trim().min(1).max(5000),
  status: z.enum(['In Progress', 'Resolved', 'Closed']).default('In Progress'),
});

export const noteBody = z.object({ body: z.string().trim().min(1).max(3000) });

export const draftBody = z.object({ regenerate: z.boolean().default(false) });
