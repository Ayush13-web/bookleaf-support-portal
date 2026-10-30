# Write-up: BookLeaf Author Support Portal

**What I prioritised.** The ticket lifecycle and the AI layer, in that order, because they are what an ops team feels first. An author submits a query and gets an instant response; triage (category + priority) happens in the background; an admin opens the ticket and finds a draft grounded in BookLeaf policy *and this author's actual numbers*; the sent reply reaches the author live over SSE.

**Key decisions and trade-offs.**
- *Facts are computed in code, the model writes the words.* Payout deadline (quarter end + 45 days), the ₹1,000 threshold, "never paid" and "in production" edge cases are derived deterministically and passed as a short facts block. Drafts quote real figures instead of guessing, and the model does no arithmetic.
- *Cost.* Triage uses a ~300-token prompt with no knowledge base. Drafting injects only the policy section for the ticket's category (not the whole KB), only the referenced book, and the last 4 messages (600 chars each). Drafts are generated lazily when an admin opens the ticket, cached, and invalidated only when the author replies or the category changes. Every call is logged with token counts. Haiku-class model.
- *Graceful degradation.* AI never sits on the critical path: ticket creation returns before triage starts. If the model fails, a keyword classifier still routes and prioritises (flagged "rule-based", with a re-run button) and the reply box is simply empty with a banner. A circuit breaker avoids hammering a failing API.
- *Human in the loop.* Admin overrides are authoritative: a late AI result never overwrites them. Drafts include "check before sending" flags for the reviewer.
- *REST + SSE signals, not data over the socket.* Events only say "ticket X changed"; clients refetch through the authorised REST API, so access control lives in one place.

**Known gaps.** No file upload (metadata only), single-node in-memory SSE hub, no pagination UI beyond the first 100 queue rows, no password reset, JWT in localStorage.

**Path to production.** Redis pub/sub for events; a job queue (BullMQ) for triage with retries; S3 uploads with virus scanning; httpOnly cookie sessions + SSO for admins; DB migrations tooling; an eval set of labelled historical tickets to measure classification accuracy and draft acceptance rate (how often admins send drafts unedited); prompt caching and a small embedding-based retrieval step once the KB grows beyond a few pages; audit log and SLA timers with escalation; email notifications.
