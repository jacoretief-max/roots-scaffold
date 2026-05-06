-- Roots — PostgreSQL schema
-- Run this against your database to create all tables.
-- psql $DATABASE_URL -f schema.sql

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name      TEXT NOT NULL,
  email             TEXT NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  phone_number      TEXT,
  avatar_colour     TEXT NOT NULL DEFAULT '#C45A3A',
  date_of_birth     DATE NOT NULL,
  city              TEXT,
  lat               DOUBLE PRECISION,
  lng               DOUBLE PRECISION,
  settings          JSONB NOT NULL DEFAULT '{
    "bgUrl": null,
    "bgOpacity": 10,
    "bgBlur": 10,
    "twofa": false,
    "notifs": true
  }'::jsonb,
  whatsapp_number   TEXT,
  whatsapp_opted_in BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);

-- ── Connections ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS connections (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connected_user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relation              TEXT,                          -- e.g. "best friend"
  layer                 TEXT NOT NULL CHECK (layer IN ('intimate','close','active','meaningful')),
  since                 DATE,
  contact_frequency     INTEGER DEFAULT 14,            -- target days between contact
  score                 INTEGER NOT NULL DEFAULT 80 CHECK (score BETWEEN 0 AND 100),
  last_contact_at       TIMESTAMPTZ,
  nudge                 TEXT,                          -- AI-generated nudge string
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, connected_user_id)
);

CREATE INDEX IF NOT EXISTS connections_user_idx   ON connections(user_id);
CREATE INDEX IF NOT EXISTS connections_layer_idx  ON connections(user_id, layer);

-- ── Events (Memory containers) ─────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  date                DATE NOT NULL,
  location            TEXT,
  lat                 DOUBLE PRECISION,
  lng                 DOUBLE PRECISION,
  music               JSONB,                   -- { title, artist }
  created_by_user_id  UUID NOT NULL REFERENCES users(id),
  visibility          TEXT NOT NULL DEFAULT 'intimate'
                        CHECK (visibility IN ('onlyUs','intimate','close','active','meaningful')),
  participant_ids     UUID[] NOT NULL DEFAULT '{}',
  photo_urls          TEXT[] NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_participants_idx ON events USING GIN(participant_ids);
CREATE INDEX IF NOT EXISTS events_date_idx         ON events(date DESC);

-- ── Memory entries (perspectives within an event) ──────
CREATE TABLE IF NOT EXISTS memory_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES users(id),
  text        TEXT NOT NULL,
  time        TEXT,                             -- optional time within event
  is_new      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entries_event_idx ON memory_entries(event_id);

-- ── Invites ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invites (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id     UUID NOT NULL REFERENCES users(id),
  to_phone         TEXT,
  to_email         TEXT,
  name             TEXT NOT NULL,
  relation_context TEXT,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at      TIMESTAMPTZ,
  CHECK (to_phone IS NOT NULL OR to_email IS NOT NULL)
);

-- ── Device push tokens (for FCM / APNs) ───────────────
CREATE TABLE IF NOT EXISTS push_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  platform    TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON push_tokens(user_id);

-- ── Media attachments (S3-backed photos/videos on memories) ──
CREATE TABLE IF NOT EXISTS memory_media (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  url         TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, url)
);

CREATE INDEX IF NOT EXISTS memory_media_event_idx ON memory_media(event_id);
