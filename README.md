# Roots — Project Setup Guide

## Prerequisites

Before running anything, make sure you have:

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18+ | https://nodejs.org |
| npm | 9+ | comes with Node |
| Git | any | https://git-scm.com |
| Expo Go (phone) | latest | App Store / Google Play |

---

## Step 1 — Clone and install

```bash
git clone https://github.com/YOUR_ORG/roots-app.git
cd roots-app
npm install
```

---

## Step 2 — Environment variables

```bash
cp .env.example .env
```

Open `.env` and set `API_BASE_URL` to your local machine's IP address
(not `localhost` — the phone can't reach that):

```
# Find your local IP:
# Mac:     ipconfig getifaddr en0
# Windows: ipconfig
# Linux:   hostname -I

API_BASE_URL=http://192.168.1.42:3000/api
```

Leave all other variables blank for now — you only need the API URL
to get the app running on your phone.

---

## Step 3 — Start the app

```bash
npx expo start
```

You'll see a QR code in the terminal.

1. Open **Expo Go** on your iPhone or Android phone
2. Scan the QR code
3. The app loads live on your device

Any code changes you save will hot-reload on the phone instantly.

---

## Step 4 — EAS Build account (for TestFlight later)

```bash
npm install -g eas-cli
eas login
eas build:configure
```

This creates `eas.json` and links your project to Expo's build service.
You'll need this in Phase 5 when you submit to the App Store.

---

## Step 5 — Apple Developer Account

1. Go to https://developer.apple.com and enrol ($99/yr)
2. In `app.json`, replace `com.yourcompany.roots` with your actual
   bundle identifier (e.g. `com.acme.roots`)
3. Replace `YOUR_EAS_PROJECT_ID` in `app.json` with the ID from
   `eas build:configure`

---

## Step 6 — Google Play Developer Account

1. Go to https://play.google.com/console and register ($25 once-off)
2. In `app.json`, replace the Android `package` value to match your
   bundle identifier

---

## Project structure

```
roots-app/
├── app/                        # Expo Router screens
│   ├── _layout.tsx             # Root layout + providers
│   ├── (tabs)/                 # Bottom tab screens
│   │   ├── _layout.tsx         # Tab bar config
│   │   ├── index.tsx           # Memories (home)
│   │   ├── globe.tsx           # Globe (Three.js — Phase 2)
│   │   ├── circle.tsx          # Circle + Dunbar diagram
│   │   ├── connect.tsx         # Connect (Phase 2)
│   │   └── profile.tsx         # Profile / Settings (Phase 2)
│   ├── memory/[id].tsx         # Individual memory event
│   ├── person/[id].tsx         # Person screen
│   ├── new-memory.tsx          # New memory modal (Phase 2)
│   ├── onboarding.tsx          # 3-step welcome (Phase 1)
│   └── auth/                   # Login / register screens
├── src/
│   ├── api/
│   │   ├── client.ts           # Axios + JWT interceptor + refresh
│   │   └── hooks.ts            # React Query hooks
│   ├── constants/
│   │   └── theme.ts            # Colours, typography, spacing, Dunbar layers
│   ├── store/
│   │   └── authStore.ts        # Zustand auth store + Keychain storage
│   ├── types/
│   │   └── index.ts            # All TypeScript types (mirrors spec §8)
│   └── utils/
├── assets/                     # Icons, splash screen, images
├── app.json                    # Expo config + permissions
├── package.json
├── tsconfig.json
├── babel.config.js
└── .env.example
```

---

## What's built vs what's next

### ✅ Done in this scaffold
- Full project structure and routing (Expo Router)
- Design tokens — all colours, typography, spacing from spec §6
- TypeScript types for every data model in spec §8
- Bottom tab navigation (5 screens, spec §7)
- Memories home screen — feed + FAB
- Circle screen — Dunbar diagram + connection health cards
- Zustand auth store with Keychain/Keystore token storage
- Axios API client with JWT + refresh token rotation
- React Query hooks for memories and connections
- Direct-to-S3 presigned upload flow
- All device permissions declared (iOS + Android)
- Environment variable template

### 🔲 Phase 1 next steps (Weeks 1–4)
- [ ] Auth screens — login, register with 18+ DOB gate
- [ ] Onboarding 3-step welcome carousel
- [ ] Backend: Node.js + Express scaffolding
- [ ] Backend: PostgreSQL schema migrations
- [ ] Backend: JWT auth endpoints (/register, /login, /refresh)
- [ ] Backend: S3 presign endpoint
- [ ] Placeholder assets (icon.png, splash.png)

### 🔲 Phase 2 (Weeks 5–10)
- [ ] Globe screen — react-three-fiber + Natural Earth GeoJSON
- [ ] Immersive memory view with animations
- [ ] New Memory 4-step wizard
- [ ] Visibility selector with auto-suggestion
- [ ] All Memories grid (year → month → event)
- [ ] Connect screen — Find My 150 flow
- [ ] Settings / Profile screen

---

## Useful commands

```bash
npx expo start              # Start dev server (Expo Go)
npx expo start --ios        # Open in iOS simulator (requires Mac + Xcode)
npx expo start --android    # Open in Android emulator (requires Android Studio)
eas build --platform ios    # Build iOS binary via EAS (no Mac needed)
eas build --platform android # Build Android APK via EAS
eas submit --platform ios   # Submit to TestFlight via EAS
```

---

## Finding your local IP

```bash
# Mac
ipconfig getifaddr en0

# Windows
ipconfig

# Linux
hostname -I
```

Set the result as `API_BASE_URL` in your `.env` file.

---

*Roots v1.0 — Confidential*
# Roots — migrated to new machine Mon Apr 13 11:34:45 MDT 2026
