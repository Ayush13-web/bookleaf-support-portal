import { query, withTransaction } from '../db/pool.js';
import { AppError } from '../utils/AppError.js';
import { toCamel } from '../utils/case.js';
import { publish } from './eventHub.js';
import { CLOSED_STATUSES } from '../constants.js';

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

/** Tells interested clients a ticket changed. Looks up the owning author's user id for routing. */
export async function notify(type, ticketId, { adminOnly = false } = {}) {
  const { rows } = await query(
    `SELECT a.user_id FROM tickets t JOIN authors a ON a.author_id = t.author_id WHERE t.id = $1`,
    [ticketId],
  );
  publish(type, { ticketId }, { authorUserId: rows[0]?.user_id ?? null, adminOnly });
}

const AUTHOR_MESSAGES_SQL = `
  COALESCE((SELECT json_agg(json_build_object(
      'id', m.id, 'senderRole', m.sender_role, 'body', m.body, 'createdAt', m.created_at
    ) ORDER BY m.created_at, m.id)
    FROM ticket_messages m WHERE m.ticket_id = t.id), '[]'::json) AS messages`;

/** Author-safe projection: no internal notes, AI reasoning, drafts, or assignee details. */
const AUTHOR_TICKET_SQL = `
  SELECT t.id, t.subject, t.description, t.status, t.category, t.attachments,
         t.created_at, t.updated_at, t.book_id, b.title AS book_title,
         ${AUTHOR_MESSAGES_SQL}
    FROM tickets t LEFT JOIN books b ON b.book_id = t.book_id`;

/* ------------------------------------------------------------------ *
 * Author operations (always scoped by author_id)
 * ------------------------------------------------------------------ */

export async function createTicket(authorId, { bookId, subject, description, attachments }) {
  if (bookId) {
    const { rowCount } = await query('SELECT 1 FROM books WHERE book_id = $1 AND author_id = $2', [bookId, authorId]);
    if (!rowCount) throw AppError.badRequest('INVALID_BOOK', 'That book is not on your account');
  }
  const { rows } = await query(
    `INSERT INTO tickets (author_id, book_id, subject, description, attachments)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [authorId, bookId || null, subject, description, JSON.stringify(attachments)],
  );
  const id = rows[0].id;
  await notify('ticket.created', id);
  return { id };
}

export async function listForAuthor(authorId) {
  const { rows } = await query(`${AUTHOR_TICKET_SQL} WHERE t.author_id = $1 ORDER BY t.updated_at DESC`, [authorId]);
  return toCamel(rows);
}

export async function getForAuthor(authorId, ticketId) {
  const { rows } = await query(`${AUTHOR_TICKET_SQL} WHERE t.id = $1 AND t.author_id = $2`, [ticketId, authorId]);
  // 404 (not 403) so authors cannot probe for other authors' ticket ids
  if (!rows[0]) throw AppError.notFound('Ticket');
  return toCamel(rows[0]);
}

/** Author follow-up. Re-opens resolved tickets; closed tickets are final. */
export async function addAuthorMessage(user, ticketId, body) {
  await withTransaction(async (db) => {
    const { rows } = await db.query('SELECT status FROM tickets WHERE id = $1 AND author_id = $2 FOR UPDATE', [ticketId, user.authorId]);
    if (!rows[0]) throw AppError.notFound('Ticket');
    if (rows[0].status === 'Closed') {
      throw AppError.conflict('TICKET_CLOSED', 'This ticket is closed. Please open a new query.');
    }
    await db.query('INSERT INTO ticket_messages (ticket_id, sender_id, sender_role, body) VALUES ($1, $2, $3, $4)', [ticketId, user.id, 'author', body]);
    // New author input invalidates any cached AI draft and re-opens resolved tickets.
    await db.query(
      `UPDATE tickets SET ai_draft = NULL, ai_draft_flags = '[]', updated_at = now(),
              status = CASE WHEN status = 'Resolved' THEN 'Open' ELSE status END,
              resolved_at = CASE WHEN status = 'Resolved' THEN NULL ELSE resolved_at END
        WHERE id = $1`,
      [ticketId],
    );
  });
  await notify('ticket.updated', ticketId);
  return getForAuthor(user.authorId, ticketId);
}

/* ------------------------------------------------------------------ *
 * Admin operations
 * ------------------------------------------------------------------ */

const ADMIN_LIST_SQL = `
  SELECT t.id, t.subject, t.status, t.category, t.category_source, t.priority, t.priority_source,
         t.ai_status, t.assigned_to, adm.name AS assigned_to_name, t.created_at, t.updated_at,
         t.author_id, u.name AS author_name, b.book_id, b.title AS book_title,
         COUNT(*) OVER()::int AS total
    FROM tickets t
    JOIN authors a ON a.author_id = t.author_id
    JOIN users u ON u.id = a.user_id
    LEFT JOIN books b ON b.book_id = t.book_id
    LEFT JOIN users adm ON adm.id = t.assigned_to`;

const PRIORITY_SQL = `CASE t.priority WHEN 'Critical' THEN 4 WHEN 'High' THEN 3 WHEN 'Medium' THEN 2 ELSE 1 END`;
const ORDER_BY = {
  // Open work first, then most urgent, then oldest: the top of the queue is what to do next
  urgency: `(t.status IN ('Resolved','Closed')), ${PRIORITY_SQL} DESC, t.created_at ASC`,
  newest: 't.created_at DESC',
  oldest: 't.created_at ASC',
};

export async function adminList(filters, adminId) {
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  if (filters.status) add('t.status = ?', filters.status);
  if (filters.category) add('t.category = ?', filters.category);
  if (filters.priority) add('t.priority = ?', filters.priority);
  if (filters.assigned === 'me') add('t.assigned_to = ?', adminId);
  if (filters.assigned === 'unassigned') where.push('t.assigned_to IS NULL');
  if (filters.from) add('t.created_at >= ?::date', filters.from);
  if (filters.to) add("t.created_at < (?::date + 1)", filters.to);
  if (filters.q) add('(t.subject ILIKE ? OR u.name ILIKE ? OR b.title ILIKE ?)', `%${filters.q}%`);

  params.push(filters.limit, filters.offset);
  const sql = `${ADMIN_LIST_SQL}
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${ORDER_BY[filters.sort]}
    LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const { rows } = await query(sql, params);
  return { items: toCamel(rows).map(({ total, ...r }) => r), total: rows[0]?.total ?? 0 };
}

export async function adminGet(ticketId) {
  const { rows } = await query(
    `SELECT t.id, t.subject, t.description, t.attachments, t.status, t.category, t.category_source,
            t.priority, t.priority_source, t.ai_status, t.ai_reasoning, t.assigned_to,
            adm.name AS assigned_to_name, t.ai_draft, t.ai_draft_flags, t.ai_draft_generated_at,
            t.created_at, t.updated_at, t.resolved_at, t.author_id,
            json_build_object('id', t.author_id, 'name', u.name, 'email', u.email, 'city', a.city,
                              'phone', a.phone, 'joinedDate', a.joined_date) AS author,
            (SELECT row_to_json(x) FROM (
               SELECT b.book_id AS "bookId", b.title, b.isbn, b.genre, b.status,
                      b.publication_date AS "publicationDate", b.mrp,
                      b.total_copies_sold AS "totalCopiesSold", b.total_royalty_earned AS "totalRoyaltyEarned",
                      b.royalty_paid AS "royaltyPaid", b.royalty_pending AS "royaltyPending",
                      b.last_royalty_payout_date AS "lastRoyaltyPayoutDate", b.print_partner AS "printPartner",
                      b.available_on AS "availableOn") x
               WHERE t.book_id IS NOT NULL) AS book,
            COALESCE((SELECT json_agg(json_build_object('id', m.id, 'senderRole', m.sender_role,
                      'senderName', mu.name, 'body', m.body, 'createdAt', m.created_at) ORDER BY m.created_at, m.id)
                      FROM ticket_messages m JOIN users mu ON mu.id = m.sender_id WHERE m.ticket_id = t.id), '[]'::json) AS messages,
            COALESCE((SELECT json_agg(json_build_object('id', n.id, 'body', n.body, 'adminName', nu.name,
                      'createdAt', n.created_at) ORDER BY n.created_at, n.id)
                      FROM ticket_notes n JOIN users nu ON nu.id = n.admin_id WHERE n.ticket_id = t.id), '[]'::json) AS notes
       FROM tickets t
       JOIN authors a ON a.author_id = t.author_id
       JOIN users u ON u.id = a.user_id
       LEFT JOIN books b ON b.book_id = t.book_id
       LEFT JOIN users adm ON adm.id = t.assigned_to
      WHERE t.id = $1`,
    [ticketId],
  );
  if (!rows[0]) throw AppError.notFound('Ticket');
  return toCamel(rows[0]);
}

/** Partial update. Manual category/priority changes are recorded as admin overrides. */
export async function adminUpdate(ticketId, patch, adminId) {
  const sets = [];
  const params = [];
  const set = (sql, value) => {
    params.push(value);
    sets.push(sql.replace('?', `$${params.length}`));
  };

  if (patch.status) {
    set('status = ?', patch.status);
    sets.push(CLOSED_STATUSES.includes(patch.status) ? 'resolved_at = now()' : 'resolved_at = NULL');
  }
  if (patch.category) {
    set('category = ?', patch.category);
    sets.push("category_source = 'admin'");
    // A different category means different policy context: the cached draft is now stale.
    sets.push("ai_draft = NULL, ai_draft_flags = '[]'");
  }
  if (patch.priority) {
    set('priority = ?', patch.priority);
    sets.push("priority_source = 'admin'");
  }
  if (patch.assignee === 'me') {
    set('assigned_to = ?', adminId);
    // Picking a ticket up moves it out of the untouched backlog.
    if (!patch.status) sets.push("status = CASE WHEN status = 'Open' THEN 'In Progress' ELSE status END");
  }
  if (patch.assignee === 'none') sets.push('assigned_to = NULL');
  sets.push('updated_at = now()');

  params.push(ticketId);
  const { rowCount } = await query(`UPDATE tickets t SET ${sets.join(', ')} WHERE t.id = $${params.length}`, params);
  if (!rowCount) throw AppError.notFound('Ticket');
  await notify('ticket.updated', ticketId);
  return adminGet(ticketId);
}

export async function addNote(ticketId, adminId, body) {
  const { rowCount } = await query('SELECT 1 FROM tickets WHERE id = $1', [ticketId]);
  if (!rowCount) throw AppError.notFound('Ticket');
  await query('INSERT INTO ticket_notes (ticket_id, admin_id, body) VALUES ($1, $2, $3)', [ticketId, adminId, body]);
  await query('UPDATE tickets SET updated_at = now() WHERE id = $1', [ticketId]);
  await notify('ticket.updated', ticketId, { adminOnly: true }); // never signals the author
  return adminGet(ticketId);
}

/** Sends the (edited) reply to the author and moves the ticket to the chosen status. */
export async function respond(ticketId, admin, { body, status }) {
  await withTransaction(async (db) => {
    const { rows } = await db.query('SELECT assigned_to FROM tickets WHERE id = $1 FOR UPDATE', [ticketId]);
    if (!rows[0]) throw AppError.notFound('Ticket');
    await db.query('INSERT INTO ticket_messages (ticket_id, sender_id, sender_role, body) VALUES ($1, $2, $3, $4)', [ticketId, admin.id, 'admin', body]);
    await db.query(
      `UPDATE tickets SET status = $2, assigned_to = COALESCE(assigned_to, $3), updated_at = now(),
              ai_draft = NULL, ai_draft_flags = '[]',
              resolved_at = CASE WHEN $2 IN ('Resolved','Closed') THEN now() ELSE NULL END
        WHERE id = $1`,
      [ticketId, status, admin.id],
    );
  });
  await notify('ticket.updated', ticketId);
  return adminGet(ticketId);
}

export async function adminStats() {
  const [byStatus, openByPriority, health, ai] = await Promise.all([
    query('SELECT status, COUNT(*)::int AS count FROM tickets GROUP BY status'),
    query(`SELECT priority, COUNT(*)::int AS count FROM tickets WHERE status IN ('Open','In Progress') GROUP BY priority`),
    query(`SELECT COUNT(*) FILTER (WHERE assigned_to IS NULL AND status = 'Open')::int AS unassigned,
                  COUNT(*) FILTER (WHERE status IN ('Open','In Progress') AND created_at < now() - interval '48 hours')::int AS stale
             FROM tickets`),
    query(`SELECT COUNT(*)::int AS calls, COUNT(*) FILTER (WHERE NOT success)::int AS failures,
                  COALESCE(SUM(input_tokens),0)::int AS input_tokens, COALESCE(SUM(output_tokens),0)::int AS output_tokens
             FROM ai_calls WHERE created_at > now() - interval '30 days'`),
  ]);
  return toCamel({
    byStatus: Object.fromEntries(byStatus.rows.map((r) => [r.status, r.count])),
    openByPriority: Object.fromEntries(openByPriority.rows.map((r) => [r.priority, r.count])),
    ...health.rows[0],
    aiLast30Days: ai.rows[0],
  });
}
