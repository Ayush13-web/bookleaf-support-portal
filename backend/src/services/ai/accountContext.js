/**
 * Turns database rows into a compact, deterministic "account facts" block for the LLM.
 * Doing the arithmetic and policy checks here (payout windows, thresholds, overdue flags)
 * means the model quotes facts instead of computing them - cheaper and far fewer hallucinations.
 */

const inr = (n) => `Rs ${Number(n).toLocaleString('en-IN')}`;
const DAY_MS = 86_400_000;
const iso = (d) => d.toISOString().slice(0, 10);

/** Quarterly cycle: paid within 45 days of quarter end. Returns the next payout deadline. */
export function nextPayoutWindow(today = new Date()) {
  const y = today.getUTCFullYear();
  const quarterEnds = [];
  for (let year = y - 1; year <= y + 1; year++) {
    for (const [m, d] of [[2, 31], [5, 30], [8, 30], [11, 31]]) quarterEnds.push(new Date(Date.UTC(year, m, d)));
  }
  const upcoming = quarterEnds.find((q) => q.getTime() + 45 * DAY_MS >= today.getTime());
  return { quarterEnd: iso(upcoming), payoutDeadline: iso(new Date(upcoming.getTime() + 45 * DAY_MS)) };
}

const STAGES = [
  'Manuscript Received', 'Editing', 'Cover Design', 'Typesetting', 'Proofreading',
  'ISBN Assignment', 'Printing', 'Distribution Setup', 'Published & Live',
];

function stageNote(status) {
  const idx = STAGES.findIndex((s) => status.toLowerCase().includes(s.toLowerCase()));
  if (idx === -1) return status;
  const next = STAGES[idx + 1] ? `; next stage: ${STAGES[idx + 1]}` : '';
  const risk = ['Cover Design', 'Proofreading'].includes(STAGES[idx]) ? ' (stage where delays commonly occur: waiting on author approval/revisions)' : '';
  return `${STAGES[idx]}, stage ${idx + 1} of ${STAGES.length}${next}${risk}`;
}

const daysBetween = (fromIso, to) => Math.floor((to.getTime() - new Date(fromIso).getTime()) / DAY_MS);

function describeBook(b, today) {
  if (b.publicationDate === null) {
    return [
      `Book "${b.title}" (${b.bookId}), ISBN ${b.isbn}, genre ${b.genre}`,
      `  Status: In production - ${stageNote(b.status.replace(/^In Production\s*-\s*/i, ''))}`,
      `  Not yet published: no MRP, sales or royalties exist yet (this is expected, not an error).`,
    ].join('\n');
  }
  const lines = [
    `Book "${b.title}" (${b.bookId}), ISBN ${b.isbn}, genre ${b.genre}`,
    `  Status: ${b.status}; published ${b.publicationDate} (${daysBetween(b.publicationDate, today)} days ago); print partner: ${b.printPartner}`,
    `  Listed on: ${b.availableOn.join(', ') || 'none'}; MRP ${inr(b.mrp)}; author royalty ${inr(b.authorRoyaltyPerCopy)}/copy`,
    `  Copies sold: ${b.totalCopiesSold}; royalty earned ${inr(b.totalRoyaltyEarned)}; paid ${inr(b.royaltyPaid)}; pending ${inr(b.royaltyPending)}`,
    `  Last payout: ${b.lastRoyaltyPayoutDate ? `${b.lastRoyaltyPayoutDate} (${daysBetween(b.lastRoyaltyPayoutDate, today)} days ago)` : 'NONE - no payout has ever been made'}`,
  ];
  if (b.royaltyPending > 0) {
    lines.push(b.royaltyPending < 1000
      ? `  Threshold: pending ${inr(b.royaltyPending)} is BELOW the Rs 1,000 minimum, so it rolls over to the next quarter (not overdue).`
      : `  Threshold: pending ${inr(b.royaltyPending)} is above the Rs 1,000 minimum, so it is eligible in the next payout cycle.`);
  }
  if (b.royaltyPaid === 0 && b.royaltyPending > 0 && b.totalCopiesSold > 0) {
    lines.push('  Note: sales exist but nothing has ever been paid out.');
  }
  const expected = b.totalCopiesSold * b.authorRoyaltyPerCopy;
  if (Math.abs(expected - b.totalRoyaltyEarned) > 1) {
    lines.push(`  Data check: copies x per-copy royalty = ${inr(expected)} but earned shows ${inr(b.totalRoyaltyEarned)} - flag for admin to verify.`);
  }
  return lines.join('\n');
}

/**
 * @param {object} p
 * @param {object} p.author   { name }
 * @param {object|null} p.book  the book the ticket references (camelCase row) or null
 * @param {object[]} p.otherBooks  author's books, used only for account-level tickets
 */
export function buildAccountFacts({ author, book, otherBooks = [], today = new Date() }) {
  const payout = nextPayoutWindow(today);
  const header = [
    `Author: ${author.name}`,
    `Today: ${iso(today)}. Next quarterly royalty payout deadline: ${payout.payoutDeadline} (covers quarter ending ${payout.quarterEnd}, +45 days).`,
  ];
  if (book) return [...header, describeBook(book, today)].join('\n');

  const books = otherBooks.slice(0, 8);
  const summary = books.map((b) => b.publicationDate === null
    ? `- "${b.title}" (${b.bookId}): in production - ${stageNote(b.status.replace(/^In Production\s*-\s*/i, ''))}`
    : `- "${b.title}" (${b.bookId}): ${b.status}, sold ${b.totalCopiesSold}, pending royalty ${inr(b.royaltyPending)}, last payout ${b.lastRoyaltyPayoutDate ?? 'never'}`);
  return [...header, 'Account-level query. Books on this account:', ...summary].join('\n');
}
