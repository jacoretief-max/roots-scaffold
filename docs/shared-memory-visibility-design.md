# Shared Memory Visibility — Per-Author Design

Status: design phase, decisions locked 2026-08-04. This is the scoping follow-up to the "Related open question" flagged in `find-my-150-design.md` and the addendum in `roots-handoff-monetization-and-memories.md`.

## Why this matters

Genuinely mutual shared memories — where each contributor controls who beyond the two of you sees *their* content — is a real differentiator. Every comparable personal-CRM app (Dex, Cloze, Monica) is a private database about people, not a shared object two people both author and both control. This is also the strongest organic invite loop identified so far: a private journal gives no one a reason to join Roots; "David added his side of a memory you're in" does.

## Decisions locked

1. **An event only appears to a viewer at all if they qualify for at least one author's chosen visibility layer.** No partial/empty-shell rendering for people who don't qualify for anything — the memory simply doesn't show up in their circle.
2. **Shared event metadata (title, date, location, music) is shown in full to anyone who can see any content in the event** — not masked per-author. Hiding the metadata while showing some photos would feel broken/inconsistent.
3. **Default visibility for a contributor who hasn't explicitly set one is the event's original visibility value** — preserves current behavior for existing/simple memories and for authors who don't bother changing the default.
4. **Per-photo override toggle — parked, not building for now.** Considered (dial one photo down to "only us" regardless of general setting) but decided against for this pass — adds a decision point to every photo upload for a case that likely comes up rarely. Per-author visibility alone covers the main need. Can revisit later if the plain per-author model proves too coarse in practice.

## Current mechanism (confirmed in `server.js`, `GET /api/memories`)

Today, exactly one `visibility` value lives on the `events` row, and it's evaluated only against the *creator's* connections:

```sql
e.visibility != 'onlyUs'
AND EXISTS (
  SELECT 1 FROM connections c
  WHERE c.user_id = e.created_by_user_id
    AND c.connected_user_id = $1
    AND c.status = 'active'
    AND (
      (e.visibility = 'intimate'   AND c.layer = 'intimate') OR
      (e.visibility = 'close'      AND c.layer IN ('intimate','close')) OR
      (e.visibility = 'active'     AND c.layer IN ('intimate','close','active')) OR
      (e.visibility = 'meaningful' AND c.layer IN ('intimate','close','active','meaningful'))
    )
)
```

This containment logic (broader layer settings include all tighter layers) is correct and reusable — it just needs to run **per author**, not only against `created_by_user_id`.

## Schema diff

```sql
-- One row per (event, author) capturing the layer that author chose for
-- their own contributions to this memory. Defaults to the event's own
-- visibility on backfill, per decision #3.
CREATE TABLE IF NOT EXISTS memory_author_visibility (
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  visibility  TEXT NOT NULL DEFAULT 'onlyUs'
                CHECK (visibility IN ('onlyUs','intimate','close','active','meaningful')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
```

No changes to `memory_media` or `memory_entries` needed — both continue to inherit visibility purely from their author's `memory_author_visibility` row, with no per-item override. This keeps the schema diff to one new table.

**Backfill on migration:** for every existing event, insert one `memory_author_visibility` row per distinct author found across `created_by_user_id` and any `memory_entries.author_id`/`memory_media.user_id` for that event, all set to the event's current `visibility` value. This makes every existing memory behave identically to today until someone actively changes their own setting — no silent visibility change on ship day.

## Generalized query logic

Replace the single creator-check with a per-author `EXISTS`, then intersect at the content level:

**Event-visible-to-viewer (gate for the event appearing at all):**
```sql
e.created_by_user_id = $1
OR $1 = ANY(e.participant_ids)
OR EXISTS (
  SELECT 1 FROM memory_author_visibility mav
  JOIN connections c ON c.user_id = mav.user_id AND c.connected_user_id = $1 AND c.status = 'active'
  WHERE mav.event_id = e.id
    AND mav.visibility != 'onlyUs'
    AND (
      (mav.visibility = 'intimate'   AND c.layer = 'intimate') OR
      (mav.visibility = 'close'      AND c.layer IN ('intimate','close')) OR
      (mav.visibility = 'active'     AND c.layer IN ('intimate','close','active')) OR
      (mav.visibility = 'meaningful' AND c.layer IN ('intimate','close','active','meaningful'))
    )
)
```

**Per-item visible-to-viewer** (applied identically to `memory_media` and `memory_entries` when assembling content for a viewer who already passed the event-level gate — same check, just keyed to the row's `user_id`/`author_id`):
```sql
row.author_id = $1  -- own contribution, always visible to self
OR $1 = ANY(e.participant_ids)  -- participants see all contributions
OR EXISTS ( /* same per-author layer check as above, keyed to row.author_id */ )
```

No per-item override column — every photo and entry from a given author follows that author's single `memory_author_visibility` setting for the memory.

## API surface changes
- `POST /api/memories/:id/entries` and photo upload — accept an optional `visibility` param the first time an author contributes, upserting their `memory_author_visibility` row. Subsequent contributions reuse it unless explicitly changed.
- New: `PATCH /api/memories/:id/my-visibility` — lets a contributor change their own layer for a memory after the fact, independent of the creator.
- `GET /api/memories` / `GET /api/memories/:id` — rewritten per the query logic above.

## UI implications
- The single "visibility" picker currently shown to the creator becomes "your visibility for this memory" shown to whoever's adding content, not just the creator.
- No per-photo UI needed — one visibility choice covers everything a contributor adds to a given memory.
- Worth revisiting `privacy.tsx` copy once this ships — it should describe visibility as something each contributor sets for their own content, not something the memory's creator sets on everyone's behalf.

## Sequencing note

This is a self-contained change: it touches `events`/`memory_entries`/`memory_media` visibility resolution only. It doesn't affect connections, scoring, nudges, or the paywall gate decisions — can be built independently of those, and independently of the Find My 150 work (different files, different tables, no shared code path other than both ultimately feeding the same `AddPersonModal`/circle view).
