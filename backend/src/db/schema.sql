-- BookLeaf Support Portal schema (idempotent)

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('author', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS authors (
  author_id   TEXT PRIMARY KEY,                       -- e.g. AUTH001 (from dataset)
  user_id     INT  NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  phone       TEXT,
  city        TEXT,
  joined_date DATE
);

CREATE TABLE IF NOT EXISTS books (
  book_id                  TEXT PRIMARY KEY,          -- e.g. BK001
  author_id                TEXT NOT NULL REFERENCES authors(author_id) ON DELETE CASCADE,
  title                    TEXT NOT NULL,
  isbn                     TEXT,
  genre                    TEXT,
  publication_date         DATE,                      -- NULL while in production
  status                   TEXT NOT NULL,
  mrp                      NUMERIC(10,2),             -- NULL while in production
  author_royalty_per_copy  NUMERIC(10,2),
  total_copies_sold        INT NOT NULL DEFAULT 0,
  total_royalty_earned     NUMERIC(12,2) NOT NULL DEFAULT 0,
  royalty_paid             NUMERIC(12,2) NOT NULL DEFAULT 0,
  royalty_pending          NUMERIC(12,2) NOT NULL DEFAULT 0,
  last_royalty_payout_date DATE,
  print_partner            TEXT,
  available_on             TEXT[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author_id);

CREATE TABLE IF NOT EXISTS tickets (
  id                    SERIAL PRIMARY KEY,
  author_id             TEXT NOT NULL REFERENCES authors(author_id),
  book_id               TEXT REFERENCES books(book_id),   -- NULL = General / Account level
  subject               TEXT NOT NULL,
  description           TEXT NOT NULL,
  attachments           JSONB NOT NULL DEFAULT '[]',      -- metadata only (upload is out of scope)
  status                TEXT NOT NULL DEFAULT 'Open'
                        CHECK (status IN ('Open','In Progress','Resolved','Closed')),
  category              TEXT NOT NULL DEFAULT 'General Inquiry'
                        CHECK (category IN ('Royalty & Payments','ISBN & Metadata Issues','Printing & Quality',
                          'Distribution & Availability','Book Status & Production Updates','General Inquiry')),
  category_source       TEXT NOT NULL DEFAULT 'pending'
                        CHECK (category_source IN ('pending','ai','rules','admin','seed')),
  priority              TEXT NOT NULL DEFAULT 'Medium'
                        CHECK (priority IN ('Critical','High','Medium','Low')),
  priority_source       TEXT NOT NULL DEFAULT 'pending'
                        CHECK (priority_source IN ('pending','ai','rules','admin','seed')),
  -- pending: triage queued | done: AI triaged | fallback: AI unavailable, rules used
  ai_status             TEXT NOT NULL DEFAULT 'pending'
                        CHECK (ai_status IN ('pending','done','fallback','skipped')),
  ai_reasoning          TEXT,
  assigned_to           INT REFERENCES users(id) ON DELETE SET NULL,
  ai_draft              TEXT,                              -- cached draft (cleared when stale)
  ai_draft_flags        JSONB NOT NULL DEFAULT '[]',
  ai_draft_generated_at TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tickets_author   ON tickets(author_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status   ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_created  ON tickets(created_at);

-- Visible conversation between author and BookLeaf team
CREATE TABLE IF NOT EXISTS ticket_messages (
  id          SERIAL PRIMARY KEY,
  ticket_id   INT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_id   INT NOT NULL REFERENCES users(id),
  sender_role TEXT NOT NULL CHECK (sender_role IN ('author','admin')),
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_ticket ON ticket_messages(ticket_id, created_at);

-- Internal notes: never returned by author-facing endpoints
CREATE TABLE IF NOT EXISTS ticket_notes (
  id         SERIAL PRIMARY KEY,
  ticket_id  INT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  admin_id   INT NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notes_ticket ON ticket_notes(ticket_id, created_at);

-- Audit log of every LLM call: powers cost monitoring and debugging
CREATE TABLE IF NOT EXISTS ai_calls (
  id            SERIAL PRIMARY KEY,
  ticket_id     INT REFERENCES tickets(id) ON DELETE SET NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('triage','draft')),
  model         TEXT,
  input_tokens  INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  latency_ms    INT,
  success       BOOLEAN NOT NULL,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_calls_created ON ai_calls(created_at);
