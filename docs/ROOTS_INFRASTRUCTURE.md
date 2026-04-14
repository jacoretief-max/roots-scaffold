# Roots — Infrastructure
*Version 1.0 · April 2026*

---

## 1. Railway (Backend Hosting)

**Project:** roots (at railway.app)

### Services

| Service | Type | URL / Connection |
|---|---|---|
| roots-scaffold | Node.js (GitHub deploy) | `https://roots-scaffold-production.up.railway.app` |
| PostgreSQL | Managed PostgreSQL | `hopper.proxy.rlwy.net:13921` |
| Redis | Managed Redis | `crossover.proxy.rlwy.net:30860` |

### Backend URL
```
https://roots-scaffold-production.up.railway.app
```

### Health check
```bash
curl https://roots-scaffold-production.up.railway.app/health
# Returns: {"status":"ok"}
```

### Deployment
- Auto-deploys from `main` branch on GitHub push
- Root directory set to `server/`
- Start command: `node server.js`
- Port: 8080 (Railway injects PORT env var)

### Environment Variables (set in Railway dashboard)
```
DATABASE_URL        auto-filled by Railway from PostgreSQL service
REDIS_URL           auto-filled by Railway from Redis service
JWT_SECRET          set manually
JWT_REFRESH_SECRET  set manually
NODE_ENV            production
PORT                8080 (auto-set by Railway)
```

---

## 2. PostgreSQL (Railway)

### Connection strings
```
# External (from your machine or app)
postgresql://postgres:GVWcjNaynyglcASInozWZugGgJpMOqNO@hopper.proxy.rlwy.net:13921/railway

# Internal (Railway service-to-service, faster)
Set automatically as DATABASE_URL in Railway environment
```

### Run schema migrations
```bash
psql postgresql://postgres:GVWcjNaynyglcASInozWZugGgJpMOqNO@hopper.proxy.rlwy.net:13921/railway -f server/schema.sql
```

### Useful queries
```sql
-- Check all users
SELECT id, display_name, email, city FROM users;

-- Check connections for test user
SELECT u.display_name, c.layer, c.score, c.nudge, c.last_contact_at
FROM connections c
JOIN users u ON u.id = c.connected_user_id
WHERE c.user_id = 'db52d54f-2cb3-45fc-b8a4-20f1305b2f85';

-- Check contact events
SELECT ce.type, ce.title, ce.date, ce.note
FROM contact_events ce
WHERE ce.user_id = 'db52d54f-2cb3-45fc-b8a4-20f1305b2f85'
ORDER BY ce.date DESC LIMIT 10;

-- Check push tokens
SELECT token, platform FROM push_tokens
WHERE user_id = 'db52d54f-2cb3-45fc-b8a4-20f1305b2f85';

-- Manually trigger nudge test (set Priya 65 days overdue)
UPDATE connections
SET last_contact_at = NOW() - INTERVAL '65 days', nudge_sent_at = NULL
WHERE connected_user_id = '58d492a6-72d1-46fc-893c-e4e3cb356427';

-- Clear bad avatar data
UPDATE users SET avatar_url = NULL WHERE avatar_url LIKE 'data:image%';

-- Reset contact frequency defaults by layer
UPDATE connections SET contact_frequency = 3   WHERE layer = 'intimate'   AND contact_frequency = 14;
UPDATE connections SET contact_frequency = 14  WHERE layer = 'close'      AND contact_frequency = 14;
UPDATE connections SET contact_frequency = 30  WHERE layer = 'active'     AND contact_frequency = 14;
UPDATE connections SET contact_frequency = 90  WHERE layer = 'meaningful' AND contact_frequency = 14;
```

---

## 3. Redis (Railway)

```
redis://default:ZStnqeveVBGvorGmEhtscsTcjBTuUDIU@crossover.proxy.rlwy.net:30860
```

Used for:
- Session state (which refresh tokens are valid)
- Rate limit counters (per-user request counts, 60s sliding window)
- Nudge deduplication state

---

## 4. GitHub

**Repository:** `https://github.com/jacoretief-max/roots-scaffold`
**Visibility:** Private
**Default branch:** `main`

### Branch strategy
```
main          → always deployable, auto-deploys to Railway
feat/xxx      → feature branches, PR to main when complete
```

### Common commands
```bash
# Start new feature
git checkout -b feat/feature-name

# Save work
git add .
git commit -m "feat: description"
git push origin feat/feature-name

# Merge to main
git checkout main
git merge feat/feature-name
git push origin main
```

---

## 5. Expo / EAS

**Expo account:** `jacoretief`
**EAS Project ID:** `5864b3fe-1869-4837-a321-2d9290e9537b`
**Project URL:** `https://expo.dev/accounts/jacoretief/projects/roots-app`

### Development
```bash
npx expo start          # Start dev server (Expo Go)
npx expo start --clear  # Start with cache cleared
```

### Building for distribution (Phase 4)
```bash
eas build --platform ios      # Build iOS binary via EAS cloud
eas build --platform android  # Build Android APK via EAS cloud
eas submit --platform ios     # Submit to TestFlight
```

### Push notifications
- Push tokens stored as `ExponentPushToken[...]` format
- Sent via Expo Push API in `nudgeEngine.js`
- Uses `expo-server-sdk` on backend
- No Firebase setup required for Expo Push tokens

### Test push notification manually
```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -d '{"to": "ExponentPushToken[CMC9xuE25vrVKI73B7JWZY]", "title": "Roots test", "body": "Test notification"}'
```

---

## 6. Apple Developer Account (Phase 4)

**Account:** $99/year — enrol at developer.apple.com
**Bundle identifier:** `com.yourcompany.roots` (update in app.json before TestFlight)
**Required for:** TestFlight, push notification certificates, Keychain entitlements

### TestFlight process (Phase 4)
1. `eas build --platform ios` → produces .ipa
2. Upload to App Store Connect via Xcode or EAS Submit
3. Enrol build in TestFlight
4. Invite testers by email
5. Each build valid for 90 days

---

## 7. Google Play Developer Account (Phase 4)

**Account:** $25 once-off — register at play.google.com/console
**Package name:** `com.yourcompany.roots` (update in app.json before submission)

### Internal testing process (Phase 4)
1. `eas build --platform android` → produces .aab
2. Upload to Google Play Console
3. Internal testing track → invite testers by email

---

## 8. WhatsApp Business API (Pending)

**Meta Business Account:** Created under new LLC
**Status:** Application submitted, awaiting Meta approval (2–4 weeks typical)

### When approved, add these environment variables:
```
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
```

### Current invite flow (works without API approval)
- Deep link: `whatsapp://send?text=encoded_message`
- SMS fallback: `sms:?body=encoded_message`
- Located in `connect.tsx` → `handleInvite` function

---

## 9. Local Development Setup

### Prerequisites
- Node.js 18+
- Git
- Expo Go app on iPhone/Android

### First time setup
```bash
git clone https://github.com/jacoretief-max/roots-scaffold.git
cd roots-scaffold
npm install
cp .env.example .env
# Edit .env with real values (see section 1 and 2 above)

cd server
npm install
cd ..

npx expo start
```

### Find your local IP (for .env API_BASE_URL in local dev)
```bash
# Mac
ipconfig getifaddr en0
```

### Run backend locally
```bash
cd server
npm run dev
# Runs on http://localhost:3000
```

### Test the live backend
```bash
# Health check
curl https://roots-scaffold-production.up.railway.app/health

# Login
curl -X POST https://roots-scaffold-production.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test2@roots.app","password":"roots123"}'

# Trigger nudge engine manually
curl https://roots-scaffold-production.up.railway.app/api/admin/run-nudges
```

---

## 10. Migrating to a New Machine

1. Install Node.js 18+ from nodejs.org
2. `xcode-select --install` (Mac — installs Git)
3. `git clone https://github.com/jacoretief-max/roots-scaffold.git`
4. `cd roots-scaffold && npm install`
5. `cd server && npm install && cd ..`
6. `cp .env.example .env` → fill in values from above
7. `sudo npm install -g eas-cli`
8. `eas login` → log in as `jacoretief`
9. Configure git: `git config --global user.name "..."` and `git config --global user.email "..."`
10. Generate GitHub Personal Access Token (github.com → Settings → Developer settings → PAT → repo scope)
11. Use token as password on first `git push`
12. `npx expo start` → scan QR code in Expo Go

**Railway, PostgreSQL, Redis, and the deployed backend are cloud services — nothing to migrate.**

---

*End of Infrastructure*
