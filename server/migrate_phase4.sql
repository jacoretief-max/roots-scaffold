-- Roots — Phase 4 migration
-- Run once against your live database:
--   psql $DATABASE_URL -f server/migrate_phase4.sql
--
-- Safe to re-run: all statements use IF NOT EXISTS / IF EXISTS / DO NOTHING guards.

-- ── 1. connections: make connected_user_id nullable (offline contacts have no Roots user) ──
ALTER TABLE connections
  ALTER COLUMN connected_user_id DROP NOT NULL;

-- ── 2. connections: add status ──────────────────────────────────────────────────────────────
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending', 'offline'));

-- ── 3. connections: offline contact fields ─────────────────────────────────────────────────
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS offline_name   TEXT;
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS offline_phone  TEXT;
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS offline_email  TEXT;
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS offline_dob    DATE;

-- ── 4. connections: nudge engine fields ────────────────────────────────────────────────────
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS nudge_sent_at   TIMESTAMPTZ;
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS always_in_touch BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS invite_sent_at  TIMESTAMPTZ;

-- ── 5. connections: drop the unique constraint that blocks offline rows ─────────────────────
-- (offline rows have connected_user_id = NULL, so the old UNIQUE(user_id, connected_user_id)
--  would allow multiple NULLs anyway in Postgres, but let's make intent explicit)
-- No action needed — Postgres NULLs are not considered equal in UNIQUE constraints.

-- ── 6. connection_requests table (new — needed for pending flow) ───────────────────────────
CREATE TABLE IF NOT EXISTS connection_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  layer         TEXT,
  relation      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(from_user_id, to_user_id)
);

CREATE INDEX IF NOT EXISTS conn_requests_to_idx ON connection_requests(to_user_id);

-- ── 7. connections: offline city field ─────────────────────────────────────────────────────
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS offline_city TEXT;
