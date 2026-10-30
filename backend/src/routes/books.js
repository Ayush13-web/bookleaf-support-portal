import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { booksQuery } from '../validators/schemas.js';
import * as bookService from '../services/bookService.js';
import { ROLES } from '../constants.js';

const router = Router();

/** Authors: always their own books (query params ignored). Admins: all books, optional ?authorId=. */
router.get('/', validate({ query: booksQuery }), asyncHandler(async (req, res) => {
  const data = req.user.role === ROLES.ADMIN
    ? await bookService.listAll(req.query.authorId)
    : await bookService.listForAuthor(req.user.authorId);
  res.json({ data });
}));

export default router;
