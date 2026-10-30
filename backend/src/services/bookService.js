import { query } from '../db/pool.js';
import { toCamel } from '../utils/case.js';

const COLUMNS = `b.book_id, b.title, b.isbn, b.genre, b.publication_date, b.status, b.mrp,
  b.author_royalty_per_copy, b.total_copies_sold, b.total_royalty_earned, b.royalty_paid,
  b.royalty_pending, b.last_royalty_payout_date, b.print_partner, b.available_on, b.author_id`;

/** Books for one author. Books still in production are included (with null MRP/date) and flagged. */
export async function listForAuthor(authorId) {
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM books b WHERE b.author_id = $1 ORDER BY b.publication_date DESC NULLS FIRST, b.book_id`,
    [authorId],
  );
  return toCamel(rows).map(withFlags);
}

export async function listAll(authorId) {
  const { rows } = await query(
    `SELECT ${COLUMNS}, u.name AS author_name
       FROM books b JOIN authors a ON a.author_id = b.author_id JOIN users u ON u.id = a.user_id
      WHERE ($1::text IS NULL OR b.author_id = $1)
      ORDER BY b.author_id, b.book_id`,
    [authorId || null],
  );
  return toCamel(rows).map(withFlags);
}

const withFlags = (b) => ({ ...b, inProduction: b.publicationDate === null });
