# Roots — Technical Architecture
*Version 1.0 · April 2026*

---

## 1. Tech Stack

### Frontend
- **React Native** — single codebase for iOS and Android
- **Expo SDK 54** — build toolchain, device APIs, Expo Go for development
- **Expo Router v4** — file-based routing (like Next.js but for React Native)
- **TypeScript** — strict mode enabled
- **Zustand** — lightweight client state (auth store)
- **React Query (@tanstack/react-query v5)** — server state, caching, background refetch
- **Axios** — HTTP client with JWT interceptor
- **dayjs** — date formatting and manipulation
- **react-native-svg** — SVG rendering (Dunbar diagram, tab bar icons)
- **expo-contacts** — device contacts access
- **expo-calendar** — device calendar access
- **expo-notifications** — push notification registration and handling
- **expo-secure-store** — Keychain/Keystore token storage
- **expo-file-system/legacy** — file reading (base64 for uploads)
- **expo-image-picker** — photo library access
- **expo-location** — GPS (Phase 4)

### Backend
- **Node.js + Express** — REST API
- **PostgreSQL** — primary database (Railway managed)
- **Redis** — session state, rate limiting (Railway managed)
- **expo-server-sdk** — Expo Push API for push notifications
- **bcrypt** — password hashing
- **jsonwebtoken** — JWT signing and verification
- **pg** — PostgreSQL client

### Infrastructure
- **Railway** — hosts Node.js server, PostgreSQL, Redis
- **GitHub** — source control (`jacoretief-max/roots-scaffold`)
- **Expo EAS** — build service, project ID: `5864b3fe-1869-4837-a321-2d9290e9537b`

---

## 2. Project Structure

```
roots-scaffold/
├── app/                          # Expo Router screens
│   ├── _layout.tsx               # Root layout — providers, auth redirect, push registration
│   ├── (tabs)/                   # Bottom tab screens
│   │   ├── _layout.tsx           # Tab bar with SVG icons
│   │   ├── index.tsx             # Memories screen
│   │   ├── globe.tsx             # Globe / timezone screen
│   │   ├── circle.tsx            # Circle screen
│   │   ├── connect.tsx           # Connect screen
│   │   └── profile.tsx           # Profile screen
│   ├── memory/
│   │   └── [id].tsx              # Memory event screen
│   ├── person/
│   │   └── [id].tsx              # Person / connection screen
│   ├── profile/
│   │   ├── account.tsx           # Account details
│   │   ├── personalise.tsx       # Avatar colour
│   │   ├── password.tsx          # Change password
│   │   ├── privacy.tsx           # Privacy policy + deletion
│   │   ├── verification.tsx      # Age verification
│   │   └── security.tsx          # 2FA + notifications
│   ├── new-memory.tsx            # New Memory wizard (modal)
│   ├── onboarding.tsx            # 3-step welcome carousel
│   └── auth/
│       └── index.tsx             # Login + Register
│
├── src/
│   ├── api/
│   │   ├── client.ts             # Axios instance + JWT interceptor + refresh rotation
│   │   └── hooks.ts              # All React Query hooks
│   ├── constants/
│   │   └── theme.ts              # Design tokens — colours, typography, spacing
│   ├── store/
│   │   └── authStore.ts          # Zustand auth store + SecureStore/AsyncStorage token persistence
│   └── types/
│       └── index.ts              # All TypeScript types
│
├── server/
│   ├── server.js                 # Express API — all routes
│   ├── nudgeEngine.js            # Scheduled nudge computation + push sending
│   ├── schema.sql                # PostgreSQL schema (run once to create tables)
│   └── package.json             # Server dependencies
│
├── docs/                         # Project documentation (this folder)
├── assets/                       # App icons, splash screen
├── app.json                      # Expo config + permissions
├── package.json                  # Frontend dependencies
├── tsconfig.json                 # TypeScript config with @/* path alias
├── babel.config.js               # Babel + module-resolver
├── metro.config.js               # Metro bundler config
└── .env                          # Environment variables (not in git)
```

---

## 3. Data Models

### users
```sql
id              UUID PK
display_name    TEXT
email           TEXT UNIQUE
password_hash   TEXT
phone_number    TEXT
avatar_colour   TEXT DEFAULT '#C45A3A'
avatar_url      TEXT                    -- Phase 4 (S3)
date_of_birth   DATE NOT NULL           -- 18+ enforced server-side
city            TEXT                    -- drives timezone on Globe screen
lat             DOUBLE PRECISION
lng             DOUBLE PRECISION
birthday        DATE                    -- for nudge engine birthday detection
settings        JSONB DEFAULT {...}     -- bgUrl, bgOpacity, bgBlur, twofa, notifs
created_at      TIMESTAMPTZ
```

### connections
```sql
id                  UUID PK
user_id             UUID FK → users     -- owner
connected_user_id   UUID FK → users     -- the other person
relation            TEXT                -- e.g. "Best friend"
layer               TEXT CHECK IN ('intimate','close','active','meaningful')
since               DATE
contact_frequency   INTEGER             -- target days: 3/14/30/90 by layer
score               INTEGER DEFAULT 80  -- 0–100, computed by nudge engine
last_contact_at     TIMESTAMPTZ
nudge               TEXT                -- AI-generated nudge text
nudge_sent_at       TIMESTAMPTZ         -- for rate-limiting (max 1/week)
always_in_touch     BOOLEAN DEFAULT false -- exempts from score decay
created_at          TIMESTAMPTZ
UNIQUE(user_id, connected_user_id)
```

### events (memories)
```sql
id                  UUID PK
title               TEXT
date                DATE
location            TEXT
lat                 DOUBLE PRECISION
lng                 DOUBLE PRECISION
music               JSONB               -- { title, artist }
created_by_user_id  UUID FK → users
visibility          TEXT CHECK IN ('onlyUs','intimate','close','active','meaningful')
participant_ids     UUID[]
photo_urls          TEXT[]
created_at          TIMESTAMPTZ
```

### memory_entries
```sql
id          UUID PK
event_id    UUID FK → events
author_id   UUID FK → users
text        TEXT
time        TEXT                        -- optional time within event
is_new      BOOLEAN DEFAULT true
created_at  TIMESTAMPTZ
```

### contact_events
```sql
id              UUID PK
user_id         UUID FK → users
connection_id   UUID FK → connections
type            TEXT CHECK IN ('calendar','call','whatsapp','memory','manual')
title           TEXT                    -- e.g. "Coffee catch up", "Phone call"
date            TIMESTAMPTZ
note            TEXT                    -- optional user note
memory_event_id UUID FK → events        -- optional link to memory
created_at      TIMESTAMPTZ
```

### invites
```sql
id               UUID PK
from_user_id     UUID FK → users
to_phone         TEXT
to_email         TEXT
name             TEXT
relation_context TEXT
sent_at          TIMESTAMPTZ
accepted_at      TIMESTAMPTZ
```

### push_tokens
```sql
id          UUID PK
user_id     UUID FK → users
token       TEXT UNIQUE             -- ExponentPushToken[...]
platform    TEXT CHECK IN ('ios','android')
created_at  TIMESTAMPTZ
```

---

## 4. API Endpoints

All endpoints prefixed with `/api`. All except auth routes require `Authorization: Bearer <token>`.

### Auth
```
POST /api/auth/register     { displayName, email, password, dateOfBirth }
POST /api/auth/login        { email, password }
POST /api/auth/refresh      { refreshToken }
```

### Users
```
GET    /api/users/me              Returns camelCase user object
PATCH  /api/users/me              { displayName?, city?, avatarColour?, avatarUrl?, phoneNumber? }
PATCH  /api/users/me/password     { currentPassword, newPassword }
GET    /api/users/search?q=name   Search all users (excludes self + existing connections)
```

### Connections
```
GET    /api/connections              ?layer= optional filter
GET    /api/connections/:id          Single connection with connectedUser
POST   /api/connections              { connectedUserId, relation, layer, since?, contactFrequency }
PATCH  /api/connections/:id          { layer?, relation?, contactFrequency?, alwaysInTouch? }
DELETE /api/connections/:id
POST   /api/connections/:id/log-contact   { note? }
GET    /api/connections/:id/events        Last 20 contact events
POST   /api/connections/:id/events        { type, title?, date, note?, memoryEventId? }
GET    /api/connections/search?q=name     Search within user's circle only
POST   /api/connections/sync-contacts     { contacts: [{ name, phoneNumber? }] }
POST   /api/connections/confirm-contact-match  { connectedUserId, phoneNumber }
POST   /api/connections/sync-calendar     { events: [{ title, date, attendees }] }
POST   /api/connections/confirm-calendar-match  { connectionId, eventDate, eventTitle?, note? }
```

### Memories
```
GET    /api/memories                Returns events with participant objects + entry/newEntry counts
GET    /api/memories/:id            Single event with entries (author object included)
POST   /api/memories                { title, date, location?, visibility, participantIds, memoryText? }
POST   /api/memories/:id/entries    { text }
PATCH  /api/memories/:eventId/entries/:entryId   { text }
```

### Media
```
POST   /api/media/presign           Returns { uploadUrl, publicUrl } — stub for Phase 4
POST   /api/media/confirm           { publicUrl }
POST   /api/media/upload            { base64, contentType } — dev only, replace with S3 in Phase 4
```

### Push Tokens
```
POST   /api/push-tokens             { token, platform }
```

### Admin (remove before launch)
```
GET    /api/admin/run-nudges        Manually triggers nudge engine
```

---

## 5. Response Format Convention

All responses wrapped in `{ data: ... }`:
```json
{ "data": { "id": "...", "displayName": "..." } }
{ "data": [...] }
{ "data": { "ok": true } }
```

Errors:
```json
{ "error": "Description of error" }
```

**All field names are camelCase** in responses. PostgreSQL snake_case columns are aliased in SQL queries using `column_name AS "camelCase"` or `json_build_object('camelCase', value)`.

---

## 6. Authentication Flow

### JWT Tokens
- **Access token:** 15 minute expiry, held in memory only (not persisted)
- **Refresh token:** 30 day expiry, stored in iOS Keychain / Android Keystore via expo-secure-store, with AsyncStorage fallback for Expo Go development

### Token Refresh
- Axios response interceptor catches 401 errors
- Queues failed requests while refresh is in progress
- Posts refresh token to `/api/auth/refresh`
- Retries all queued requests with new access token
- On refresh failure: clears tokens, user must log in again

### App Launch
- `loadTokensFromStorage` called on app mount
- Reads token from SecureStore (fallback: AsyncStorage)
- Calls `GET /api/users/me` to validate token and get user
- On success: sets `isAuthenticated = true`, navigates to tabs
- On failure: clears token, navigates to auth screen

### Foreground Token Refresh
- `AppState` listener in `_layout.tsx`
- When app returns from background: calls `ensureFreshToken`
- If token expires within 2 minutes: proactively refreshes before any API calls

---

## 7. Key Patterns

### React Query hooks (src/api/hooks.ts)
All data fetching goes through React Query hooks. Pattern:
```typescript
export const useConnections = (layer?: string) =>
  useQuery({
    queryKey: [...QueryKeys.connections, layer],
    queryFn: async () => { ... },
    staleTime: 1000 * 60 * 5,
  });
```

Mutations invalidate relevant query keys on success:
```typescript
onSuccess: () => qc.invalidateQueries({ queryKey: QueryKeys.connections }),
```

### Path alias
`@/` maps to `src/` — configured in `tsconfig.json` and `babel.config.js`.

### camelCase convention
Frontend types use camelCase. Backend SQL queries alias all columns to camelCase. Never use snake_case field names in frontend code.

### Nudge Engine
- Runs in `server/nudgeEngine.js`
- Called from `server.js` via `setInterval` every 6 hours
- Also callable via `GET /api/admin/run-nudges` for testing
- Uses Expo Push API (`expo-server-sdk`) — no Firebase setup needed
- Push token stored in `push_tokens` table on app launch

---

## 8. Environment Variables

### Frontend (.env)
```
API_BASE_URL=https://roots-scaffold-production.up.railway.app/api
```

### Backend (server/.env or Railway environment variables)
```
DATABASE_URL=postgresql://...@hopper.proxy.rlwy.net:13921/railway
REDIS_URL=redis://...@crossover.proxy.rlwy.net:30860
JWT_SECRET=...
JWT_REFRESH_SECRET=...
PORT=8080
NODE_ENV=production
```

---

*End of Technical Architecture*
