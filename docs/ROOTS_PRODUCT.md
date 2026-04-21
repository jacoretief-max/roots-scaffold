# Roots — Product & Design Specification
*Version 1.1 · April 2026 · Confidential*

---

## 1. What Roots Is

Roots is a **private relationship management app** for adults. It helps people maintain meaningful connections with the people who matter most in their lives.

**Not social media.** No public posts, no follower counts, no algorithm, no advertising.

**Three pillars:**
- **Memories** — shared events where connected people contribute photos and writing
- **Circle** — private relationship CRM with connection health scores and AI nudges
- **Globe** — timezone-aware view of where connections are and their availability

**Design principle:** Roots should feel like a warm Sunday afternoon, not a productivity app. Every interaction should be warm, personal and low-friction.

---

## 2. Target Audience & Age Policy

- Adults aged **18 and over only** — hard gate enforced at registration
- Date of birth required at signup — users under 18 cannot proceed
- Compliance: COPPA (USA), GDPR (EU), POPIA (South Africa)
- No child profiles — children referenced naturally in adult memory text
- When a child turns 18, parent notified, child can discover memories made about them

---

## 3. Design System

### Colour Palette — Warm Earth
```
Background:       #F7F0E6   App background, screen fills
Card:             #FFFCF7   Card surfaces, inputs
Tan:              #EAE0D0   Borders, chips, tags, dividers
Terracotta:       #C45A3A   Primary — buttons, accents, nav active
Terracotta Dark:  #9A3A22   Pressed states
Sage Green:       #4A7A52   Score bars, health indicators, positive states
Dark Text:        #2A1A10   Body text, headings
Light Text:       #8A6A58   Labels, secondary text, placeholders
Globe Background: #0F1F2E   Deep navy — Globe screen only
Score Healthy:    #4A7A52   Score > 75
Score Medium:     #C45A3A   Score 50–75
Score Low:        #E24B4A   Score < 50
Status Available: #4A7A52   Green dot
Status Busy:      #C45A3A   Terracotta dot
Status Sleeping:  #85B7EB   Blue dot
```

### Typography
- **Primary font:** Georgia (serif) — warm, analogue, trustworthy
- No secondary font — Georgia at varying weights creates hierarchy
- Labels: 10pt, ALL CAPS, letter-spacing 0.8px, terracotta colour
- Body text: 14pt, dark text
- Headings: 18–22pt, bold

### Spacing
```
xs: 4px   sm: 8px   md: 12px   lg: 16px   xl: 24px   xxl: 32px
```

### Border Radius
```
sm: 8px   md: 12px   lg: 16px   pill: 999px
```

### Tab Bar
- 5 tabs, icons only, no labels
- SVG icons: Book · Globe · Heart · Search · Profile
- Active tab: terracotta icon + small terracotta dot below
- Inactive: muted grey icon
- Height: 64px

---

## 4. Navigation Structure

Bottom navigation bar with 5 primary screens. Sub-screens push onto a stack.

```
(tabs)/
  index.tsx        → Memories (home)
  globe.tsx         → Globe (timezone list)
  circle.tsx        → Circle (Dunbar diagram + connections)
  connect.tsx       → Connect (search + sync + invite)
  profile.tsx       → Profile / Settings

app/
  memory/[id].tsx   → Event screen (structured + immersive views)
  person/[id].tsx   → Person screen (connection detail + timeline)
  new-memory.tsx    → New Memory wizard (modal, 4 steps)
  onboarding.tsx    → 3-step welcome carousel (shown once)
  auth/index.tsx    → Login + Register

  profile/
    account.tsx      → Display name, city, email (read-only), DOB (read-only)
    personalise.tsx  → Avatar colour (photo upload Phase 4)
    password.tsx     → Change password
    privacy.tsx      → Privacy policy + account deletion
    verification.tsx → Age verification + ID upload (Phase 4)
    security.tsx     → 2FA toggle + push notifications toggle
```

---

## 5. Dunbar Layers

| Layer | Limit | Default Contact Frequency | Description |
|---|---|---|---|
| Intimate | 5 | 3 days | The people you'd call at 3am |
| Close | 15 | 14 days | Your trusted inner circle |
| Active | 50 | 30 days | Regular meaningful contact |
| Meaningful | 150 | 90 days | Your broader community |

---

## 6. Visibility Levels (Memories)

| Level | Who Can See |
|---|---|
| Only us | Tagged people only |
| Intimate | Tagged + intimate circle (up to 5) |
| Close | Tagged + intimate and close (up to 15) |
| Active | Tagged + first 50 connections |
| Everyone meaningful | Full meaningful network (up to 150) |

Tagged people always have access. They cannot be excluded from their own memory.

---

## 7. Screen Specifications

### 7.1 Memories Screen (index.tsx)
**Purpose:** Home screen. Shows memory feed and all memories grid.

**Features:**
- Header with title "Memories" + terracotta circle `+` button (top right) → opens New Memory wizard
- Two tabs: Recent (feed) | All Memories (drill-down grid)
- **Recent tab:** FlatList of MemoryCards sorted by latest activity
- **All Memories tab:** Timeline → Year → Month → mixed-size event grid
- **MemoryCard:** Full-bleed rotating colour background (2.2s cycle from warm palette), dark overlay, participant avatars (expandable on tap to show names), NEW badge, title, location/year, perspective count
- Empty state with instructions to add first memory
- React Query cache 5 min stale time

**Memory card palette:** Generated deterministically from event ID — same event always gets same colours. 8 warm palettes available.

**Expandable avatars:** Tap avatar cluster → names slide out → tap again to collapse.

### 7.2 Globe Screen (globe.tsx)
**Purpose:** Shows connections grouped by timezone with local time and status.

**Features:**
- Header: "Globe" title + your current local time + total connection count
- Status + day/night legend
- Connections grouped by region: Africa, Europe, Americas, Middle East & Asia, Oceania, Location not set
- Each region is a collapsible card
- Each connection shows: avatar, name, city, local time (right), status (Available/Busy/Sleeping), time-of-day progress bar (amber=day, purple=night)
- Refreshes every 60 seconds
- Tap connection → Person screen

**Status logic:**
- Available: 09:00–18:00 local time
- Busy: 18:00–22:00 local time
- Sleeping: 22:00–07:00 local time

**Timezone lookup:** CITY_TIMEZONES map in globe.tsx — 30+ cities mapped to IANA timezone strings. Falls back to UTC if city not found.

**Note:** 3D globe parked for Phase 4. Will use react-native-maps with dark tile layer.

### 7.3 Circle Screen (circle.tsx)
**Purpose:** Tend existing relationships. Shows connection health and nudges.

**Features:**
- Dunbar ring diagram (4 concentric SVG circles) with tappable layer count pills
- Tapping a layer filters the connection list. Tap again to reset.
- Layer description shown when filter active
- Connection cards: avatar + status dot, name, relation + city, score bar (colour-coded), last contact text, nudge text if present
- Empty state with "Go to Connect" button
- Score colours: green >75, terracotta 50–75, red <50

### 7.4 Connect Screen (connect.tsx)
**Purpose:** Find and add people, sync contacts and calendar, invite non-users.

**Features:**
- Search bar — searches all Roots users, excludes self and existing connections
- Search results show: avatar, name, city, Add button (or "In circle" badge if already added)
- Add → opens AddToCircleModal (relation chips, Dunbar layer selector, since when, contact frequency)
- If no results: invite card with WhatsApp and SMS options
- Empty state (no search): Sync contacts card + Sync calendar card + Find My 150 stub

**Sync contacts flow:**
1. Request iOS Contacts permission
2. Read all contacts (name + phone)
3. Exact name match → auto-sync phone number
4. 75%+ fuzzy match → suggestion card with match % + "Yes that's them" / "Not the same"
5. Phone number stored on matched user record

**Contacts review flow — adding connections from phone:**

This is the primary onboarding path for new users. After granting contacts permission, the user reviews their phone contacts to decide who belongs in their Roots circle. The flow is:

1. User taps "Sync contacts" on the Connect screen
2. Exact matches against existing Roots users are confirmed silently (phone number linked)
3. Fuzzy matches (75%+) surface as suggestion cards — user confirms or dismisses each one
4. After sync, user browses the Connect screen search to find matched Roots users and adds them to their circle via the Add to Circle modal (relation, layer, frequency, since when)
5. For contacts not yet on Roots — user can invite via WhatsApp deep link or SMS directly from the no-results state

The intent is a one-time deliberate review, not an auto-import. Every connection added to Roots is a conscious choice. The contact sync enriches the match quality (phone number as identifier) but the user always decides who enters their circle and at which Dunbar layer.

**Sync calendar flow:**
1. Request Calendar permission
2. Read events from last 90 days with attendees
3. Match attendees against connections by email (primary) or exact name
4. Show CalendarMatchCard for each match
5. "Yes, we met" → shows note input → Save/Skip note → creates contact_event record, updates last_contact_at
6. "Not relevant" → dismisses

**Find My 150:** Stubbed with "Coming in Phase 3" badge.

### 7.5 Profile Screen (profile.tsx)
**Purpose:** Account settings and personalisation.

**Layout:** Avatar + name header → tappable settings rows grouped into sections.

**Sections:**
- Account → account.tsx (name, city editable; email, DOB read-only)
- Personalise → personalise.tsx (8 avatar colour swatches; photo upload Phase 4)
- Privacy → privacy.tsx (plain language policy + account deletion)
- Verification → verification.tsx (DOB display + ID upload Phase 4)
- Security → security.tsx (WhatsApp nudges toggle + number input, push notifications toggle, 2FA toggle stub)
- Sign out button

### 7.6 Memory Event Screen (memory/[id].tsx)
**Purpose:** View and contribute to a shared memory event.

**Features:**
- Header: back button + Story/Immersive toggle
- Event meta: title, date, location, music chip (if set), participant avatars
- **Story view:** Chronological list of perspective cards. Each card: author avatar, name, date, text. NEW badge on unread entries. Your own entry has terracotta border. "You've added your perspective" + Edit if already written.
- **Immersive view:** Full-screen colour background cycling every 5.2s, memory text drifts upward, selector dots at bottom, auto-cycles
- **Add perspective:** Text input at bottom (lifted, rounded card, not stuck to edges)
- **Edit perspective:** Slides up as pageSheet modal with pre-filled text, char count, Save/Cancel
- One perspective per user per event

### 7.7 Person Screen (person/[id].tsx)
**Purpose:** Full detail view of a connection. CRM-style relationship view.

**Features:**
- Profile card: avatar (colour initial), name, city, layer badge, relation badge, since date
- Connection health card: score (0–100), colour-coded score bar, last contact, target frequency
- Nudge card (if nudge exists): terracotta left border, italic text
- Actions section:
  - Always in touch toggle (Switch) — exempts from nudge engine and score decay
  - Log contact button → shows note capture flow (text input + Save/Skip)
  - Edit layer & frequency → EditModal (layer selector + frequency chips)
  - Remove from circle → confirmation alert
- Recent moments timeline: last 5 contact events with type icon, title, date, note
- Shared memories stub (Phase 3)

**Contact event types and icons:**
- calendar: 📅 purple
- call: 📞 sage green
- whatsapp: 💬 green — logged via inbound WhatsApp message to Roots number
- memory: 📖 terracotta
- manual: ✓ grey

### 7.8 New Memory Wizard (new-memory.tsx)
**Purpose:** 4-step modal flow to create a new memory.

**Steps:**
1. **Details:** Title (required), date (inline spinner picker, keyboard dismisses first), location
2. **People:** Search circle connections (suggestions shown), type free text names, pill chips, Skip option
3. **Perspective:** Multiline text, char count, Done typing button dismisses keyboard, Next in header
4. **Visibility:** Radio button selector for 5 visibility levels with descriptions

**Navigation:** Next/Save button in header (top right) on all steps. Cancel/Back in header (top left). Progress dots below header.

**On save:** Creates event + first memory entry simultaneously. Navigates to event screen.

**People logic:**
- Roots circle members shown as suggestions when typing (search by name, current user's circle only)
- Linked Roots users shown with terracotta dot indicator
- Non-Roots names stored as text only — can be linked later
- "Skip — just me" shortcut on Step 2

---

## 8. Key Business Logic

### Score Decay (Nudge Engine)
Runs every 6 hours on Railway. Nudges delivered via push notification and, if opted in, WhatsApp message using the approved `roots_nudge` template.

| Layer | Nudge fires at | Decay per day overdue | Min score |
|---|---|---|---|
| Intimate | 1.5x target frequency | 5 pts | 20 |
| Close | 1.5x target frequency | 3 pts | 20 |
| Active | 2x target frequency | 2 pts | 20 |
| Meaningful | 2x target frequency | 1 pt | 20 |

- Score recovers +2 per day when contact is current
- Max 1 nudge per connection per 7 days
- Always in touch = exempt from decay entirely
- Score capped at 100 max, 20 min

### Birthday Nudges
- 21 days before: soft nudge
- 7 days before: stronger nudge
- Day of: birthday nudge

### Contact Events (Recent Moments)
All interactions logged to `contact_events` table:
- `manual` — Log contact button
- `calendar` — Calendar sync confirm
- `whatsapp` — Inbound WhatsApp message parsed as contact log (e.g. "Just had coffee with Sarah")
- `call` — Call log sync (Android, Phase 3)
- `memory` — Tagged in a memory (Phase 3)

Each creates a timeline entry on the Person screen.

---

## 9. Onboarding Flow

3-step carousel shown once on first login:
1. Welcome — Roots philosophy
2. How it works — Find people, build history, stay connected
3. The promise — Private, no ads, no algorithm

Skip intro always available. After completing → Memories screen.

---

*End of Product & Design Specification*
