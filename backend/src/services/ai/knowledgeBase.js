/**
 * BookLeaf Knowledge Base, split into sections so each prompt only carries the policy it needs
 * (cost control + less noise for the model). Wording follows the assignment's KB verbatim in substance.
 */
export const KB_SECTIONS = {
  company: `COMPANY
- BookLeaf Publishing is a self-publishing company operating in India and the US.
- Packages: Standard Free (no upfront cost) and Bestseller Breakthrough (premium, paid; marketing and distribution add-ons).
- We handle cover design, typesetting, ISBN assignment, printing, distribution and royalty management.
- In-house printing facility and warehouse are in Delhi. Print partners: Repro India and Epitome Books.
- Metadata updates (e.g. Amazon book description, author bio) can be submitted through the author dashboard or by emailing the BookLeaf team; changes typically reflect on platforms within 3-5 business days.`,

  royalty: `ROYALTY POLICY
- 80/20 split: 80% of net profit per book goes to the author, 20% to BookLeaf.
- Net profit = MRP minus printing cost, platform commission (Amazon/Flipkart) and shipping charges.
- Royalties are calculated quarterly and paid within 45 days of the quarter ending.
- Minimum payout threshold: Rs 1,000. Below it, royalties roll over to the next quarter.
- Payouts are bank transfers to the account linked in the author's dashboard.
- Authors can see a detailed royalty breakdown (sales per platform) in their dashboard; we can also share a line-by-line breakdown on request.`,

  isbn: `ISBN POLICY
- Every book published through BookLeaf gets a unique ISBN assigned by BookLeaf, registered under BookLeaf's publisher imprint.
- An ISBN under the author's own imprint must be obtained independently by the author.
- An ISBN error (duplicate, wrong book linked, mismatch between platform and print) is HIGH PRIORITY and is escalated to the production team immediately.`,

  printing: `PRINTING & QUALITY
- In-house printing handles most orders; overflow or specific formats go to Repro India or Epitome Books.
- Standard print turnaround: 5-7 business days from order confirmation.
- Quality issues (misprints, binding defects, colour inconsistency): BookLeaf arranges a FREE reprint after verification. The author may need to share photos of the defective copy.`,

  distribution: `DISTRIBUTION & AVAILABILITY
- Books are listed on Amazon India, Flipkart, Amazon US, Amazon UK and the BookLeaf Store.
- New listings typically go live 7-10 business days after publication is complete.
- A book showing "Currently Unavailable" usually means a stock sync issue; the team can trigger a re-sync, which takes 24-48 hours.`,

  production: `PRODUCTION STAGES
- Stages in order: Manuscript Received -> Editing (if opted) -> Cover Design -> Typesetting -> Proofreading -> ISBN Assignment -> Printing -> Distribution Setup -> Published & Live.
- Authors are emailed at each stage. Delays typically happen at Cover Design (waiting for author approval) and Proofreading (revision rounds).`,
};

/** Which KB sections each ticket category needs. General gets company info only. */
export const CATEGORY_SECTIONS = {
  'Royalty & Payments': ['royalty'],
  'ISBN & Metadata Issues': ['isbn', 'company'],
  'Printing & Quality': ['printing'],
  'Distribution & Availability': ['distribution'],
  'Book Status & Production Updates': ['production'],
  'General Inquiry': ['company'],
};

export const TONE_GUIDELINES = `TONE (how BookLeaf talks to authors)
- Empathetic and professional. Authors are partners, not customers to be managed.
- Acknowledge the concern first, then move to solutions.
- Be specific: use the actual numbers, dates and statuses you are given instead of vague reassurance.
- If BookLeaf is at fault (delayed royalty, ISBN error), own it directly. No corporate deflection.
- If escalation or investigation is needed, give a clear timeline (e.g. "within 48 hours"), never an open-ended promise.
- Never blame the author for a delay, even when it sits on their side: frame it collaboratively.
- Always end with a clear next step for the author and/or the BookLeaf team.`;

/** One calibration hint per category, distilled from the sample query/response table. */
export const CATEGORY_GUIDANCE = {
  'Royalty & Payments': `If no royalty received: acknowledge the frustration, explain the quarterly cycle and 45-day window, say which payout date applies, mention the bank-details check, and escalate with a 48-hour timeline ONLY if payment is genuinely overdue per the account facts. If the amount looks low: explain net profit (MRP minus printing, platform commission, shipping), offer a line-by-line breakdown, stay transparent and non-defensive.`,
  'ISBN & Metadata Issues': `Treat as high priority. Acknowledge it is a serious data issue, confirm escalation to the production team now, and give a 48-hour resolution timeline.`,
  'Printing & Quality': `Apologise sincerely. Ask for photos of the defective copies. Confirm a free reprint once verified and give the 5-7 business day reprint timeline.`,
  'Distribution & Availability': `Explain this is typically a stock sync issue, confirm a re-sync is being triggered with the distribution team, set the 24-48 hour expectation.`,
  'Book Status & Production Updates': `Use the real production stage from the account facts. If delayed, be honest about the typical cause (e.g. awaiting proof approval) without blaming the author, and give a specific next step with a timeline.`,
  'General Inquiry': `Answer directly from policy. If the answer is not in the policy, say the team will confirm within 48 hours rather than guessing.`,
};

/** Assembles only the policy text relevant to a category (typically ~150-250 tokens). */
export function buildPolicyContext(category) {
  const keys = CATEGORY_SECTIONS[category] ?? CATEGORY_SECTIONS['General Inquiry'];
  return keys.map((k) => KB_SECTIONS[k]).join('\n\n');
}
