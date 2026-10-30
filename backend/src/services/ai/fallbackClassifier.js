import { DEFAULT_CATEGORY } from '../../constants.js';

/**
 * Deterministic keyword triage used when the LLM is unavailable (down, rate-limited, unconfigured).
 * Less accurate than the model, but it guarantees every ticket is still routed and prioritised.
 */
const RULES = {
  'ISBN & Metadata Issues': ['isbn', 'barcode', 'metadata', 'wrong book', 'duplicate', 'imprint'],
  'Royalty & Payments': ['royalty', 'royalties', 'payout', 'payment', 'paid', 'bank', 'earning', 'commission', 'threshold'],
  'Printing & Quality': ['print', 'misprint', 'binding', 'blurry', 'quality', 'reprint', 'damaged', 'defect', 'colour', 'color', 'misaligned', 'author copies'],
  'Distribution & Availability': ['amazon', 'flipkart', 'unavailable', 'out of stock', 'not available', 'stock sync', 'currently unavailable'],
  'Book Status & Production Updates': ['typesetting', 'cover design', 'proof', 'editing', 'production', 'when will', 'stage', 'manuscript', 'delay'],
};

const CRITICAL = /\b(legal|lawyer|fraud|scam|cheat(ed|ing)?|consumer court|police|defam)/i;
const URGENT = /\b(urgent|asap|immediately|still (not|haven)|never (received|got)|haven'?t (received|got)|no response|unanswered|terrible|worst)/i;
const LONG_WAIT = /\b(\d+|several|many|six|few)\s*(\+\s*)?(months?|weeks?)\b/i;

export function ruleBasedClassify({ subject, description }) {
  const text = `${subject} ${description}`.toLowerCase();
  let category = DEFAULT_CATEGORY;
  let best = 0;
  for (const [cat, words] of Object.entries(RULES)) {
    const score = words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
    if (score > best) { best = score; category = cat; }
  }

  let priority = 'Medium';
  if (CRITICAL.test(text)) priority = 'Critical';
  else if (URGENT.test(text) || (LONG_WAIT.test(text) && category !== DEFAULT_CATEGORY)) priority = 'High';
  else if (category === DEFAULT_CATEGORY) priority = 'Low';

  return { category, priority, reasoning: 'Keyword-based triage (AI unavailable)' };
}
