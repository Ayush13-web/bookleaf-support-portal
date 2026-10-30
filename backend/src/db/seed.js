/**
 * Creates the schema and seeds the BookLeaf sample dataset + two admins + a few demo tickets.
 * Safe to re-run: users/authors/books are upserted; demo tickets are only added to an empty table.
 *   npm run seed
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from './pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataset = JSON.parse(fs.readFileSync(path.resolve(here, '../../data/bookleaf_sample_data.json'), 'utf8'));

export const AUTHOR_PASSWORD = 'Author@123';
export const ADMIN_PASSWORD = 'Admin@123';
const ADMINS = [
  { email: 'admin@bookleaf.com', name: 'Aarav (BookLeaf Ops)' },
  { email: 'ops@bookleaf.com', name: 'Ishita (BookLeaf Ops)' },
];

// created_at offsets in hours; messages/notes use the same convention
const DEMO_TICKETS = [
  { author: 'AUTH003', book: 'BK005', ageH: 120, status: 'Open', category: 'Royalty & Payments', priority: 'High',
    subject: 'No royalty received since my book went live',
    description: 'Between Two Temples has been live since July 2024 and I have not received a single royalty payment. My dashboard shows 67 copies sold. Could you tell me what is going on and when I can expect to be paid?' },
  { author: 'AUTH001', book: 'BK001', ageH: 52, status: 'In Progress', category: 'Distribution & Availability', priority: 'High', assigned: 0,
    subject: 'Whispers of the Ganges shows "Currently Unavailable" on Amazon',
    description: 'My book is published but Amazon India has been showing it as Currently Unavailable since yesterday. I am worried about lost sales. Please fix this.',
    messages: [{ role: 'admin', ageH: 40, body: 'Hi Priya,\n\nThanks for flagging this. A "Currently Unavailable" label is usually a stock sync issue, and I have asked our distribution team to trigger a re-sync for Whispers of the Ganges. It should be live again within 24-48 hours, and I will confirm here once it is.\n\nWarm regards,\nBookLeaf Author Support Team' }],
    notes: [{ admin: 0, ageH: 41, body: 'Re-sync requested with distribution. Check Amazon listing tomorrow.' }] },
  { author: 'AUTH009', book: 'BK015', ageH: 30, status: 'Open', category: 'Book Status & Production Updates', priority: 'Medium',
    subject: 'Raising Roots still in typesetting after 3 weeks',
    description: 'It has been about three weeks and my book Raising Roots is still showing as being in typesetting. When will it be done?' },
  { author: 'AUTH007', book: 'BK012', ageH: 6, status: 'Open', category: 'ISBN & Metadata Issues', priority: 'High',
    subject: 'ISBN on Amazon differs from my printed copy',
    description: 'The ISBN listed on Amazon for Ctrl+Alt+Delete My Ex is different from the ISBN printed on the physical copy I received. This seems like a serious problem. Please look into it.' },
  { author: 'AUTH008', book: 'BK014', ageH: 200, status: 'Resolved', category: 'General Inquiry', priority: 'Low', assigned: 1,
    subject: 'Can I update my book description on Amazon?',
    description: 'My book Ghazal of the Forgotten is already live. Can I still change the description on Amazon?',
    messages: [{ role: 'admin', ageH: 190, body: 'Hi Farhan,\n\nYes, you can. Metadata updates can be submitted through your dashboard or by emailing our team, and changes typically show up on the platforms within 3-5 business days. Send us the new description whenever you are ready.\n\nWarm regards,\nBookLeaf Author Support Team' }] },
];

async function main() {
  const schema = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
  await pool.query(schema);

  const authorHash = await bcrypt.hash(AUTHOR_PASSWORD, 10);
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  await withTransaction(async (db) => {
    const adminIds = [];
    for (const a of ADMINS) {
      const { rows } = await db.query(
        `INSERT INTO users (email, password_hash, name, role) VALUES ($1,$2,$3,'admin')
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name RETURNING id`,
        [a.email, adminHash, a.name],
      );
      adminIds.push(rows[0].id);
    }

    for (const au of dataset.authors) {
      const { rows } = await db.query(
        `INSERT INTO users (email, password_hash, name, role) VALUES ($1,$2,$3,'author')
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name RETURNING id`,
        [au.email, authorHash, au.name],
      );
      await db.query(
        `INSERT INTO authors (author_id, user_id, phone, city, joined_date) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (author_id) DO UPDATE SET phone = EXCLUDED.phone, city = EXCLUDED.city, joined_date = EXCLUDED.joined_date`,
        [au.author_id, rows[0].id, au.phone, au.city, au.joined_date],
      );
      for (const b of au.books) {
        await db.query(
          `INSERT INTO books (book_id, author_id, title, isbn, genre, publication_date, status, mrp,
             author_royalty_per_copy, total_copies_sold, total_royalty_earned, royalty_paid, royalty_pending,
             last_royalty_payout_date, print_partner, available_on)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           ON CONFLICT (book_id) DO UPDATE SET title=EXCLUDED.title, isbn=EXCLUDED.isbn, genre=EXCLUDED.genre,
             publication_date=EXCLUDED.publication_date, status=EXCLUDED.status, mrp=EXCLUDED.mrp,
             author_royalty_per_copy=EXCLUDED.author_royalty_per_copy, total_copies_sold=EXCLUDED.total_copies_sold,
             total_royalty_earned=EXCLUDED.total_royalty_earned, royalty_paid=EXCLUDED.royalty_paid,
             royalty_pending=EXCLUDED.royalty_pending, last_royalty_payout_date=EXCLUDED.last_royalty_payout_date,
             print_partner=EXCLUDED.print_partner, available_on=EXCLUDED.available_on`,
          [b.book_id, au.author_id, b.title, b.isbn, b.genre, b.publication_date, b.status, b.mrp,
            b.author_royalty_per_copy, b.total_copies_sold, b.total_royalty_earned, b.royalty_paid,
            b.royalty_pending, b.last_royalty_payout_date, b.print_partner, b.available_on],
        );
      }
    }

    const { rows: existing } = await db.query('SELECT 1 FROM tickets LIMIT 1');
    if (existing.length) return;

    for (const t of DEMO_TICKETS) {
      const { rows } = await db.query(
        `INSERT INTO tickets (author_id, book_id, subject, description, status, category, category_source,
           priority, priority_source, ai_status, assigned_to, created_at, updated_at, resolved_at)
         VALUES ($1,$2,$3,$4,$5,$6,'seed',$7,'seed','skipped',$8,
                 now() - make_interval(hours => $9), now() - make_interval(hours => $9),
                 CASE WHEN $5 IN ('Resolved','Closed') THEN now() - make_interval(hours => $9 - 10) END)
         RETURNING id`,
        [t.author, t.book, t.subject, t.description, t.status, t.category, t.priority,
          t.assigned !== undefined ? adminIds[t.assigned] : null, t.ageH],
      );
      for (const m of t.messages ?? []) {
        await db.query('INSERT INTO ticket_messages (ticket_id, sender_id, sender_role, body, created_at) VALUES ($1,$2,$3,$4, now() - make_interval(hours => $5))',
          [rows[0].id, adminIds[t.assigned ?? 0], 'admin', m.body, m.ageH]);
      }
      for (const n of t.notes ?? []) {
        await db.query('INSERT INTO ticket_notes (ticket_id, admin_id, body, created_at) VALUES ($1,$2,$3, now() - make_interval(hours => $4))',
          [rows[0].id, adminIds[n.admin], n.body, n.ageH]);
      }
    }
  });

  console.log(`Seeded ${dataset.authors.length} authors. Logins -> authors: <email> / ${AUTHOR_PASSWORD}, admins: admin@bookleaf.com / ${ADMIN_PASSWORD}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => pool.end());
