# Roots — Current Build State
*Version 1.0 · April 2026*

---

## Phase Summary

| Phase | Status | Description |
|---|---|---|
| Phase 1 | ✅ Complete | Foundation — RN/Expo setup, backend, auth, Railway |
| Phase 2 | ✅ Complete | All 5 screens built and polished |
| Phase 3 | ✅ Complete | Contacts sync, nudge engine, calendar integration |
| Phase 3 (partial) | ⏳ Pending | WhatsApp Business API — awaiting Meta approval |
| Phase 4 | ⬜ Not started | S3 media, voice notes, TestFlight, App Store |

---

## What's Built and Working

### Authentication
- ✅ Register with 18+ DOB gate (enforced server-side)
- ✅ Login with email + password
- ✅ JWT auth with 15-min access token + 30-day refresh token
- ✅ Token stored in iOS Keychain / Android Keystore (AsyncStorage fallback for Expo Go)
- ✅ Proactive token refresh when app returns from background
- ✅ Logout clears all tokens
- ✅ App launch auto-login if valid token found

### Onboarding
- ✅ 3-step carousel (shown once on first login)
- ✅ Skip intro option

### Memories Screen
- ✅ Feed of memory cards with rotating colour backgrounds (2.2s cycle)
- ✅ Participant avatars on cards — expandable on tap to show names
- ✅ Perspective count shown on each card
- ✅ NEW badge for unread perspectives
- ✅ Recent tab (feed) and All Memories tab (timeline drill-down)
- ✅ All Memories: Year timeline → Month list → Mixed-size event grid
- ✅ Add memory button (+ circle, top right of header)

### Memory Event Screen
- ✅ Story view — perspective cards with author, date, NEW badge
- ✅ Immersive view — full-screen colour cycling, drifting text, selector dots
- ✅ Add perspective (text input, keyboard handling, Done typing)
- ✅ Edit perspective (pageSheet modal, pre-filled text, char count)
- ✅ One perspective per user — shows "You've added your perspective + Edit"
- ✅ Participant avatars shown in event header

### New Memory Wizard
- ✅ Step 1: Title, date (inline spinner), location
- ✅ Step 2: People — circle search suggestions + free text, pill chips, skip option
- ✅ Step 3: Perspective text with keyboard handling
- ✅ Step 4: Visibility selector (5 levels)
- ✅ Next/Save in header — consistent across all steps
- ✅ Creates event + first entry in one API call
- ✅ Navigates to event screen on completion

### Circle Screen
- ✅ Dunbar ring diagram (4 concentric SVG circles)
- ✅ Tappable layer count pills — filters connection list
- ✅ Layer description shown when filter active
- ✅ Connection cards with score bar, last contact, nudge text
- ✅ Empty state with Go to Connect button
- ✅ Tapping a card → Person screen

### Globe Screen
- ✅ Timezone list grouped by region (Africa, Europe, Americas, Middle East & Asia, Oceania)
- ✅ Each connection shows local time, status, time-of-day progress bar
- ✅ Collapsible region groups
- ✅ Refreshes every 60 seconds
- ✅ Your current local time in header

### Connect Screen
- ✅ Search all Roots users by name
- ✅ Add to circle modal (relation, layer, frequency, since)
- ✅ "In circle" badge for existing connections
- ✅ Invite via WhatsApp deep link or SMS if not found
- ✅ Sync contacts — exact name match auto-syncs, 75%+ fuzzy shows suggestion card
- ✅ Sync calendar — shared events matched, confirm flow with optional note
- ✅ Find My 150 stub with "Coming in Phase 3" badge

### Profile / Settings
- ✅ Profile header with avatar initial + edit badge
- ✅ Account details — edit display name and city
- ✅ Change password
- ✅ Avatar colour — 8 colour swatches
- ✅ Privacy & Cookies — full policy text + account deletion flow
- ✅ Verification — DOB display, age, compliance badges
- ✅ Security — 2FA toggle (stub) + push notifications toggle
- ✅ Sign out

### Person Screen
- ✅ Profile card — avatar, name, city, layer badge, relation badge, since
- ✅ Connection health card — score, score bar, last contact, target frequency
- ✅ Nudge card (if nudge exists)
- ✅ Always in touch toggle — exempts from score decay
- ✅ Log contact → note capture flow (text + Save/Skip) → creates contact_event
- ✅ Edit layer & frequency modal
- ✅ Remove from circle
- ✅ Recent moments timeline — last 5 contact events with type icon, date, note
- ✅ Shared memories stub

### Nudge Engine (backend)
- ✅ Runs every 6 hours on Railway
- ✅ Score decay per layer config
- ✅ Birthday nudges (21 days, 7 days, day of)
- ✅ Rate limiting (max 1 nudge per connection per 7 days)
- ✅ Always in touch exemption
- ✅ Push notifications via Expo Push API
- ✅ Push tokens registered on app launch
- ✅ Confirmed working on locked screen (iOS)

### Contacts Sync
- ✅ iOS Contacts permission request
- ✅ Exact name match → auto-sync phone number
- ✅ Fuzzy match (75%+) → suggestion card with % score
- ✅ Phone number stored on confirm
- ✅ Subsequent syncs auto-match by phone number
- ✅ Minimum 3-char name guard
- ✅ Last/First name format handling

### Calendar Integration
- ✅ iOS Calendar permission request
- ✅ Scans last 90 days for events with attendees
- ✅ Matches by email (primary) or exact name
- ✅ CalendarMatchCard with "Yes, we met" / "Not relevant"
- ✅ Note capture on confirm
- ✅ Creates contact_event record
- ✅ Updates last_contact_at on connection

---

## What's Stubbed / Coming Later

### Phase 3 (pending)
- ⏳ **WhatsApp Business API** — Meta business account created, application pending approval
  - Invite flow via deep link works already
  - Message frequency sync needs API approval
- ⬜ **Call log sync** — iOS doesn't expose call history to third-party apps; Android only via `READ_CALL_LOG` permission
- ⬜ **Find My 150** — on-device AI analysis using contacts/WhatsApp/photos; needs WhatsApp API

### Phase 4 (not started)
- ⬜ **S3 photo/video storage** — presigned URL upload flow (architecture ready, credentials not set up)
  - Profile photo upload UI removed, "Coming Phase 4" badge shown
  - base64 approach was tested and proved unreliable — proper S3 is required
  - Supports both photos and short videos
- ⬜ **Media display in Story view** — interleaved layout: two media items side by side, then a perspective block, repeating down the feed
  - Any participant (not just the creator) can add photos and videos to a shared memory
  - Tap any photo or video → full-screen lightbox with swipe-through navigation and × top-right to close
  - Deferred until S3 is in place so layout can be built and tested against real content
- ⬜ **Voice notes** — record audio for contact events and memories
- ⬜ **ID verification** — upload driver's licence/passport, extract DOB only
- ⬜ **2FA** — TOTP authenticator app setup
- ⬜ **Phone number verification** — SMS OTP
- ⬜ **GPS on Globe** — live position dot using expo-location
- ⬜ **3D globe** — replace timezone list with react-native-maps dark tile layer + connection dots
- ⬜ **Shared memories on Person screen** — show memories tagged with this person
- ⬜ **Memory anniversary notifications**
- ⬜ **TestFlight distribution**
- ⬜ **App Store submission**

---

## Known Issues

| Issue | Severity | Notes |
|---|---|---|
| Globe 3D rendering | Parked | expo-gl + three.js has SDK 54 compatibility issues; replaced with timezone list |
| Push notification foreground display | Low | Notifications work on locked screen; foreground banner needs testing |
| Contact sync: single-letter contact names | Fixed | Minimum 3-char guard added |
| Token persistence in Expo Go | Fixed | AsyncStorage fallback added alongside SecureStore |
| Base64 photo upload | Parked | Unreliable; proper S3 required for Phase 4 |

---

## Test Accounts

| Email | Password | User ID | Notes |
|---|---|---|---|
| test2@roots.app | roots123 | db52d54f-2cb3-45fc-b8a4-20f1305b2f85 | Primary test account |
| sarah@roots.app | roots123 | 48a26f1b-6cda-4aee-b5ca-595aebe234e5 | Test connection |
| james@roots.app | roots123 | 47a6d24c-3f12-4099-b00f-20ebcd0ca639 | Test connection |
| priya@roots.app | roots123 | 58d492a6-72d1-46fc-893c-e4e3cb356427 | Test connection |

---

## Phase 4 Priorities (in order)

1. **S3 setup** — AWS bucket, presigned URL endpoint, profile photo + video upload (all participants can add media)
2. **Media display in Story view** — interleaved photo/video grid + full-screen lightbox viewer
3. **Voice notes** — expo-av recording, S3 storage, playback in timeline
4. **TestFlight** — EAS build, upload to App Store Connect, internal testing
5. **App Store assets** — icon, screenshots, description, privacy policy URL
6. **App Store submission** — iOS and Google Play
7. **3D Globe** — react-native-maps with dark tile layer, connection dots at lat/lng
8. **2FA + phone verification**
9. **ID verification**
10. **WhatsApp message frequency** — once Meta approval received

---

*End of Current Build State*
