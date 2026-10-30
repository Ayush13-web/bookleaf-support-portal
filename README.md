# BookLeaf Author Support & Communication Portal

Full-stack ticketing portal with AI-assisted triage and reply drafting.
**React (Vite) · Node.js/Express · PostgreSQL · Anthropic Claude (Haiku)**

| | |
|---|---|
| Author portal | Login, My Books, Submit a Query, My Tickets (live updates, follow-up replies) |
| Admin portal | Prioritised queue with filters, AI classification + priority (overridable), AI-drafted replies (editable), status, assignment, internal notes |
| API | Versioned REST (`/api/v1`), JWT auth, role-based access, zod validation, OpenAPI spec |
| Realtime | Server-Sent Events |

## Quick start

Prerequisites: Node 18+, PostgreSQL 14+ (or `docker compose up -d` for a ready database).

```bash
# 1. Backend
cd backend
cp .env.example .env          # set JWT_SECRET; add ANTHROPIC_API_KEY to enable AI
npm install
npm run seed                  # creates tables + loads the 10 authors / 18 books + demo tickets
npm run dev                   # http://localhost:4000

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173 (proxies /api to :4000)
```

Without `ANTHROPIC_API_KEY` the app still works end to end: triage falls back to rules and admins write replies manually.

### Test logins (created by `npm run seed`)
| Role | Email | Password |
|---|---|---|
| Admin | `admin@bookleaf.com` (also `ops@bookleaf.com`) | `Admin@123` |
| Author | any email from the dataset, e.g. `priya.sharma@email.com` | `Author@123` |

Useful author accounts for edge cases: `ananya.reddy@email.com` (sales, **zero payouts**), `kavita.deshmukh@email.com` (one book **in typesetting**, one with ₹850 pending, **below the ₹1,000 threshold**), `sneha.kulkarni@email.com` (3 books, one in cover design).

### Deploy (single service, e.g. Render / Railway)
1. Provision PostgreSQL with your hosting provider or a free external provider such as Supabase or Neon. Set its connection string as `DATABASE_URL` (and `DATABASE_SSL=true` if required), `JWT_SECRET`, and optionally `ANTHROPIC_API_KEY`.
2. Build: `cd frontend && npm install && npm run build && cd ../backend && npm install`
3. Start: `cd backend && npm run seed && npm start`. Express serves `frontend/dist` when it exists, so one URL hosts both portals and the API. Same-origin means no CORS configuration.

For Render, the included `render.yaml` creates only the web service. Add the external PostgreSQL connection string as the `DATABASE_URL` environment variable before the first deploy.

Tests: `cd backend && npm test` (classification fallback, payout-window maths, account-facts edge cases, KB sectioning).

## Architecture

```
backend/src
  config/        env validation (secrets only ever read here)
  db/            pool, schema.sql, seed.js
  middleware/    authenticate, requireRole, validate (zod), errorHandler
  validators/    request schemas
  routes/        thin HTTP layer: auth, books, tickets (author), admin, events (SSE)
  services/      business logic: auth, books, tickets, eventHub, ticketAiService
    ai/          llmClient, prompts, knowledgeBase, accountContext, triage, drafter, fallbackClassifier
frontend/src
  api/ context/ hooks/ components/ pages/{author,admin}
```

Decisions:
- **Layering**: routes validate and delegate; services own SQL and rules; the AI package has no HTTP or DB knowledge except through `ticketAiService`, which orchestrates and persists.
- **Schema**: `users` (role) → `authors` → `books`; `tickets` with *source columns* (`category_source`, `priority_source` = `ai | rules | admin | seed`) so overrides are tracked and AI can never clobber an admin; `ticket_messages` (visible) and `ticket_notes` (internal) are separate tables so author endpoints cannot leak notes by construction; `ai_calls` logs tokens/latency/failures.
- **Authorisation**: `authenticate` guards everything under `/api/v1` except login; `/tickets` requires the author role and every query is filtered by the token's `authorId`; `/admin` requires the admin role. Another author's ticket returns **404**, not 403, so ids can't be probed.
- **Realtime**: SSE events carry only `{ ticketId }`; clients refetch via REST. The frontend reads the stream with `fetch` so the JWT stays in a header, not a URL. Internal-note events go to admins only.
- **Ticket lifecycle**: Open → In Progress → Resolved → Closed. Assigning moves Open to In Progress; an author reply re-opens Resolved tickets; Closed is final (409).
- **Queue ordering**: unresolved first, then Critical → Low, then oldest. Tickets unresolved > 48h get a red marker and age highlight, plus dashboard counters.

## AI integration

**Model choice: Claude Haiku (`AI_MODEL`, default `claude-haiku-5-5`).** Triage and drafting are short, structured, policy-grounded tasks; a small model is cheap and fast enough, and tool-use gives reliable structured output. The model is a single env var, and `llmClient.js` is the only file that knows about the provider (swapping to OpenAI means changing that one file).

**Flow**
1. `POST /tickets` inserts the ticket and returns `201` immediately, then triage runs in the background: one forced tool call returns `{category, priority, reasoning}`. Result is validated, and a business rule enforces the KB's "ISBN errors are at least High". Admins see a live update when it lands.
2. When an admin opens a ticket, the UI calls `POST /admin/tickets/:id/draft` (cached or generated). The result fills an **editable** textarea together with "check before sending" flags. Sending posts it to the author's thread.
3. Overriding the category clears the cached draft (different policy applies) and regenerating uses the new category.

**Prompt strategy** (`services/ai/prompts.js`, `knowledgeBase.js`)
- System prompt = persona + BookLeaf tone guidelines + hard rules (use only supplied facts, never invent dates/figures, only promise what policy supports, plain text, 110-200 words, fixed sign-off, always end with a next step and timeline).
- User prompt uses tagged sections: `<policy>` (only the KB sections for this category), `<category_guidance>` (distilled from the assignment's sample query → response table), `<account_facts>`, `<ticket>`, `<thread_so_far>`.
- `<account_facts>` is built from the database in code: sales, paid/pending, last payout, **next payout deadline**, threshold check, "no payout ever", books in production with their stage and typical delay cause, data-consistency check. The dataset's edge cases (zero payouts, in-production books, sub-threshold balances) are therefore handled explicitly rather than left to the model.
- Ticket/thread text is declared untrusted data in both prompts (prompt-injection hygiene).

**Cost management**: triage prompt has no KB (~300 tokens, `max_tokens` 200); drafts include one KB section (~150-250 tokens), one book, and the last 4 messages truncated; drafts are lazy + cached + de-duplicated if double-clicked; every call is logged to `ai_calls` and surfaced in `/admin/stats`. Typical cost is a fraction of a cent per ticket.

**Failure handling**: SDK retries (2×, exponential backoff, 20s timeout) → circuit breaker (3 failures pauses AI 60s) → rule-based triage (`ai_status = fallback`, badge shows "auto", admin can re-run AI) and draft endpoint returns `503 AI_UNAVAILABLE` which the UI renders as a calm banner with a manual reply box. Ticket creation never depends on AI.

**API key security**: `ANTHROPIC_API_KEY` is read only in `config/env.js` from the environment, used only server-side, never sent to the browser, and `.env` is git-ignored. There is no AI endpoint callable from the frontend with a user-supplied prompt.

## API

Full spec: [`backend/docs/openapi.yaml`](backend/docs/openapi.yaml) (open in Swagger Editor). Summary:

| Method & path | Role | Purpose |
|---|---|---|
| `POST /auth/login` · `GET /auth/me` | public / any | Sign in, current user |
| `GET /books` | any | Own books (author) or all (admin, `?authorId=`) |
| `GET /events` | any | SSE stream (`ticket.created`, `ticket.updated`) |
| `GET /tickets` · `GET /tickets/:id` | author | My tickets (no internal data) |
| `POST /tickets` | author | Submit ticket (`bookId` null = General / Account level) |
| `POST /tickets/:id/messages` | author | Follow-up reply |
| `GET /admin/meta` · `GET /admin/stats` | admin | Enums, counters, AI usage |
| `GET /admin/tickets` | admin | Queue: `status category priority assigned q from to sort limit offset` |
| `GET /admin/tickets/:id` | admin | Full ticket incl. notes, book, author, AI fields |
| `PATCH /admin/tickets/:id` | admin | `status category priority assignee` (overrides) |
| `POST /admin/tickets/:id/notes` | admin | Internal note |
| `POST /admin/tickets/:id/respond` | admin | Send reply (+ set status) |
| `POST /admin/tickets/:id/draft` | admin | AI draft (`regenerate`) |
| `POST /admin/tickets/:id/reclassify` | admin | Re-run AI triage |

Success: `{ data, meta? }`. Errors: `{ error: { code, message, details? } }` with `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 TICKET_CLOSED`, `422 VALIDATION_ERROR` (per-field), `429 RATE_LIMITED`, `503 AI_UNAVAILABLE`, and a generic `500` that never leaks internals.

## Known limitations / next steps
- Attachments are UI + metadata only (no file storage).
- SSE hub is in-memory (single instance); use Redis pub/sub to scale out.
- Triage runs in-process via `setImmediate`; a durable queue would add retries across restarts.
- Authors' passwords are seeded; no reset flow. JWT stored in `localStorage` (httpOnly cookie preferable).
- The KB lives in code (`knowledgeBase.js`); for a larger KB use an admin-editable store and retrieval.
- Classification accuracy should be measured against labelled historical tickets before trusting it unattended.
