import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgres://unused';
process.env.JWT_SECRET ??= 'test';

const { ruleBasedClassify } = await import('../src/services/ai/fallbackClassifier.js');
const { nextPayoutWindow, buildAccountFacts } = await import('../src/services/ai/accountContext.js');
const { buildPolicyContext } = await import('../src/services/ai/knowledgeBase.js');

test('rule-based fallback classifies the sample queries', () => {
  const cases = [
    ['Royalty', 'I published 4 months ago and still have not received any royalty', 'Royalty & Payments'],
    ['ISBN mismatch', 'My book shows a different ISBN on Amazon than the physical copy', 'ISBN & Metadata Issues'],
    ['Quality', 'Author copies are blurry and the pages are misaligned', 'Printing & Quality'],
    ['Unavailable', 'My book is showing as Currently Unavailable on Amazon', 'Distribution & Availability'],
    ['Update bio', 'Can I update my author bio please, whenever convenient?', 'General Inquiry'],
  ];
  for (const [subject, description, expected] of cases) {
    assert.equal(ruleBasedClassify({ subject, description }).category, expected, subject);
  }
});

test('fallback priority: legal threats are Critical, plain questions are Low', () => {
  assert.equal(ruleBasedClassify({ subject: 'Fraud', description: 'This is fraud, I will call my lawyer' }).priority, 'Critical');
  assert.equal(ruleBasedClassify({ subject: 'Bio', description: 'Can I update my author bio?' }).priority, 'Low');
});

test('payout window = quarter end + 45 days', () => {
  assert.deepEqual(nextPayoutWindow(new Date('2026-10-30')), { quarterEnd: '2026-09-30', payoutDeadline: '2026-11-14' });
  assert.deepEqual(nextPayoutWindow(new Date('2026-11-20')), { quarterEnd: '2026-12-31', payoutDeadline: '2027-02-14' });
});

test('account facts handle unpublished books and sub-threshold royalties', () => {
  const inProd = { bookId: 'BK015', title: 'Raising Roots', isbn: 'x', genre: 'g', publicationDate: null, status: 'In Production - Typesetting', availableOn: [] };
  const f1 = buildAccountFacts({ author: { name: 'K' }, book: inProd, today: new Date('2026-10-30') });
  assert.match(f1, /Typesetting, stage 4 of 9/);
  assert.match(f1, /no MRP, sales or royalties/);

  const small = { bookId: 'B', title: 'T', isbn: 'x', genre: 'g', publicationDate: '2024-11-05', status: 'Published & Live', mrp: 299,
    authorRoyaltyPerCopy: 25, totalCopiesSold: 34, totalRoyaltyEarned: 850, royaltyPaid: 0, royaltyPending: 850, lastRoyaltyPayoutDate: null, printPartner: 'In-House', availableOn: ['Amazon India'] };
  assert.match(buildAccountFacts({ author: { name: 'K' }, book: small, today: new Date('2026-10-30') }), /BELOW the Rs 1,000 minimum/);
});

test('policy context only includes the relevant KB section', () => {
  const ctx = buildPolicyContext('Printing & Quality');
  assert.match(ctx, /FREE reprint/);
  assert.doesNotMatch(ctx, /80\/20/);
});
