# Roots — Handoff: Monetization Direction & Shared Memories Gap

*(original planning doc, preserved as-is below; see addendum at top for Cowork verification against the real codebase)*

## Addendum — Cowork verification (2026-08-04)

The "Shared memories" gap analysis in this doc is **stale**. It was written against 11 screen files with no backend visibility, and the codebase has since moved past that state. Confirmed by reading `server/schema.sql`, `server/server.js`, `src/types/index.ts`, `src/api/hooks.ts`, and `app/person/[id].tsx`:

- **Real data model exists**: `events` table (memory container: title, date, location, visibility, `participant_ids[]`, `offline_participant_connection_ids[]`, photo_urls), `memory_entries` table (one row per author's perspective — text, author_id, time), `memory_media` table (S3 photos with per-uploader ownership + caption). This is not a stub — it's a built relational model.
- **Bidirectional authorship already works**: `memory_entries` is one-row-per-author. Any participant can `POST /api/memories/:id/entries` to add their own perspective; `hasMyEntry` and `newEntryCount` are computed per-viewer. This is closer to "you and James's memory" than "your memory about James" already — the doc's gap item #2 is largely done.
- **Symmetric visibility already works**: `GET /api/memories` and `GET /api/memories/:id` query by `participant_ids @> user` (via `WHERE u.id = ANY(e.participant_ids)`), not by creator — a memory shows up for every tagged participant, not just the author. Gap item #4 is done.
- **Push notifications on new memories exist**: `server.js` ~line 1552–1587 queries push tokens for participants and sends via Expo push on memory creation. Gap item #3 is done.
- **The person-detail stub is gone**: the "Memories you share with {displayName} will appear here" placeholder text the doc quotes from `_id_.tsx` no longer exists in `app/person/[id].tsx`. There's now a dedicated `app/memory/[id].tsx` screen (~50KB, substantial) for full memory detail, and contact-timeline entries on the person screen render a `memory` event type with its own color/icon.

**What's genuinely still open** (not verified false):
- Whether `privacy.tsx`'s "author sets visibility layer" copy still matches reality now that entries are multi-author — worth a copy pass regardless of backend readiness (doc's gap item #5 concern still stands).
- The monetization questions (paywall gate shape, free allowance, Find My 150 vs. memories vs. monetization sequencing) are unaffected by this — those are still open product decisions, not implementation-state questions.

**Recommendation**: don't scope a "shared memories rebuild" as if from scratch. Re-run this planning conversation's shared-memories section against the actual `app/memory/[id].tsx` and `server.js` memories routes to see what's left (likely: UI/copy reframing, and maybe hardening/edge cases) rather than a full data model + bidirectional authorship build.

---

## Original doc (context only — see addendum above for what's outdated)

Context doc from a claude.ai Projects planning session, for continuity in Cowork. This chat did not have live access to the codebase — only 11 screen files (connect.tsx, circle.tsx, globe.tsx, profile.tsx, [id].tsx, and the profile sub-screens). Cowork should verify assumptions below against the actual hooks/types/backend before acting on them.

### 1. Monetization direction (brainstorm stage, not finalized)
Shape agreed on: freemium, tiered from day one — not "free now, charge later." Free-then-charge risks a trust backlash with early users; tiered from launch sets expectations honestly and doesn't require a painful cutover moment.

Where the paywall sits — open question, current thinking:
- Circle / Connect / Globe (organizing your circle, seeing people, scores, nudges) → free, permanently. This is the growth engine — Roots is two-sided (Connect only works if the person you're adding is also on Roots), so new users need zero friction to join when invited.
- Memories / moments (actually recording content) → paid tier, ~$2/month or $20/year.
- Open question raised but not resolved: gating by content (memories) vs. gating by circle size (e.g. Intimate+Close free, Active+Meaningful paid) — the latter ties monetization to Dunbar's number itself and monetizes engaged users rather than blocking new ones on day one. Worth a real decision before implementation.
- Caution flagged: gating memories entirely could mean free users experience the app's anxiety (decaying scores, nudges) without its payoff (capturing the moment) — bad taste, possibly bad retention. Consider a free allowance (e.g. 5–10 memories) before the paywall hits, so free users get the "aha" before being asked to pay.

Pricing note: $2/mo is low vs. comparable personal-CRM apps (Dex, Cloze, Monica: $4–12/mo). Not wrong, but should be an intentional choice (volume vs. margin), not a default. Apple/Google take ~15% (App Store Small Business Program, under $1M/yr) to 30% otherwise — net on $20/yr is roughly $17.

Infra cost concern — addressed, not a real blocker:
- S3 storage itself is cheap (~$0.023/GB/mo). With client-side compression (resize ~1600px, JPEG ~80%), photos land ~200–400KB. Even at 10,000 paying users uploading 20 photos/month, storage costs are single-digit dollars monthly.
- The actual cost lever is egress (repeated photo views), not storage. Fix: CloudFront in front of S3, caching after first fetch — standard addition on top of the already-planned presigned-URL pattern.
- Recommended safety net: a per-account storage cap (e.g. 5GB) as insurance against outlier uploaders, not a real constraint on normal use.
- Railway (Postgres/Redis/compute) is likely a bigger recurring cost driver than S3 at current/near-term scale — worth watching both, but S3 is not expected to break unit economics at $2/mo.

### 2. What would actually drive growth to scale (e.g. "10,000 users")
Three levers identified as higher-leverage than pricing mechanics:
1. Find My 150 (already scoped as Phase 3, currently a "Coming in Phase 3" stub in connect.tsx) — AI-assisted contact import to pre-populate a real circle at onboarding. Solves the core reason personal-CRM apps die: nobody manually adds 150 people to a new app. Likely the single highest-leverage thing to build for reducing onboarding drop-off.
2. Nudge/score quality — the retention engine. Worth more design attention than pricing: nudges need to feel helpful, not naggy/guilt-inducing, for the score mechanic to build a habit rather than anxiety.
3. Shared memories done as genuinely mutual (see below) — likely the best invite driver, since it reframes Roots from private journal (nothing to invite anyone for) to something inherently social.

### 3. Shared memories: current state vs. target state (SEE ADDENDUM — this section is now outdated)
Current state (confirmed from actual code, `_id_.tsx`) — *as of the original planning chat, before this codebase state existed*:
The "Shared memories" section on the person detail screen is a pure UI stub — no data model, no creation flow, no list view. The only product description of the intended model came from `privacy.tsx`'s copy, which described a one-directional, author-owned model.

Target state gap items (priority order) — *status per addendum above*:
1. Real memory data model — **now exists** (`events`, `memory_entries`, `memory_media`).
2. Bidirectional authorship — **now exists** (multi-author `memory_entries`).
3. Notification on tag — **now exists** (Expo push on memory creation).
4. Symmetric visibility — **now exists** (participant-based queries).
5. UI/copy reframing ("your memory about James" → "you and James's memory") — **not verified, likely still worth a pass**.

### 4. Open questions to resolve before building
- Paywall gate: content-based (memories) vs. circle-size-based (Dunbar layer)?
- Free memory allowance before paywall, or hard gate from memory #1?
- Does "shared memory" require both people to be Roots users, or can one side be pending/invited?
- Priority order: Find My 150 vs. shared-memories rebuild vs. monetization plumbing — which ships first?
