// Roots — Node.js/Express backend scaffold
// Run: node server.js (or use nodemon for dev)
// Requires: npm install express pg redis jsonwebtoken bcrypt cors dotenv

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool, types } = require('pg');

// Postgres DATE columns (oid 1082) default to being parsed into JS Date
// objects, which then get serialized with a timezone-dependent instant
// (midnight UTC) and can render as the wrong calendar day on a device in
// a different timezone (e.g. a DOB of 1972-04-12 showing as 11 April).
// Returning the raw 'YYYY-MM-DD' string instead sidesteps that entirely —
// applies to every DATE column read anywhere in this file (date_of_birth,
// offline_dob, etc.), including `SELECT *` queries.
types.setTypeParser(1082, (val) => val);
const redis = require('redis');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');
const { runNudgeEngine } = require('./nudgeEngine');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const twilio = require('twilio');
const { createExport, deleteAccount } = require('./lib/accountData');
const safety = require('./lib/safety');
const { sendPush } = require('./nudgeEngine');

// ── Twilio client (SMS OTP for phone verification) ─────
const twilioClient = twilio(
  process.env.TWILIO_API_KEY_SID,
  process.env.TWILIO_API_KEY_SECRET,
  { accountSid: process.env.TWILIO_ACCOUNT_SID }
);
const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;

// Startup check: report which Twilio env vars are present (never prints values)
{
  const twilioVars = ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_VERIFY_SERVICE_SID'];
  const missing = twilioVars.filter(k => !process.env[k]);
  if (missing.length) console.error('[verify] startup: MISSING env vars:', missing.join(', '));
  else console.log('[verify] startup: all Twilio env vars present', {
    account: process.env.TWILIO_ACCOUNT_SID.slice(0, 6) + '…',
    service: TWILIO_VERIFY_SERVICE_SID.slice(0, 6) + '…',
  });
}

// Mask phone numbers in logs (keep country code area, hide last 4)
const maskPhone = (n) => (typeof n === 'string' && n.length > 4 ? n.slice(0, -4) + '****' : '****');
const twilioErr = (err) => ({ code: err.code, status: err.status, message: err.message, moreInfo: err.moreInfo });

// ── SMS consent (Twilio Verify / CTIA) ─────────────────
// Disclosure text shown in the app, keyed by version. When the app copy
// changes, add a new version here (keep the old ones — they're evidence).
// Must match src/constants/smsConsent.ts.
const SMS_CONSENT_TEXTS = {
  '2026-10-30': "I agree to receive a one-time security code by text at this number. Standard message and data rates may apply. See Privacy Policy and Terms: https://rooikatlabs.com/roots/legal",
};

// Records a consent event before any OTP is sent. Returns false if the
// request didn't carry valid consent (caller should 400).
async function recordSmsConsent(req, { phoneNumber, purpose, userId = null }) {
  const { smsConsent, consentVersion } = req.body;
  const consentText = SMS_CONSENT_TEXTS[consentVersion];
  if (smsConsent !== true || !consentText) return false;
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null;
  await db.query(
    `INSERT INTO sms_consents (user_id, phone_number, purpose, consent_version, consent_text, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, phoneNumber, purpose, consentVersion, consentText, ip, req.headers['user-agent'] || null]
  );
  console.log('[verify] consent recorded', { purpose, to: maskPhone(phoneNumber), version: consentVersion });
  return true;
}
const CONSENT_REQUIRED_MSG = 'Please agree to receive a verification code by text before we send it.';

// ── AWS S3 client ──────────────────────────────────────
const s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const S3_BUCKET = process.env.AWS_S3_BUCKET;
const S3_BASE_URL = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION ?? 'us-east-1'}.amazonaws.com`;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    cb(null, file.mimetype.startsWith('image/'));
  },
});

// Levenshtein distance for fuzzy name matching
const levenshtein = (a, b) => {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
};

const nameSimilarity = (a, b) => {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return (maxLen - levenshtein(a, b)) / maxLen;
};

// Smarter name comparison that handles word order, initials, and partial matches.
// Returns a score 0–1. Combines character-level Levenshtein with word-level overlap.
const nameScore = (rawA, rawB) => {
  // NFD decomposition strips diacritics (é→e, ö→o, etc.) before comparison
  const clean = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z\s]/g, '').trim();
  const a = clean(rawA);
  const b = clean(rawB);
  if (!a || !b) return 0;

  // Exact match
  if (a === b) return 1.0;

  // Overall Levenshtein score
  const overall = nameSimilarity(a, b);

  // Also try reversed order (e.g. "Botha Jan" vs "Jan Botha")
  const aWords = a.split(/\s+/).filter(w => w.length > 1);
  const bWords = b.split(/\s+/).filter(w => w.length > 1);
  const aReversed = [...aWords].reverse().join(' ');
  const bReversed = [...bWords].reverse().join(' ');
  const reversedScore = Math.max(
    nameSimilarity(a, bReversed),
    nameSimilarity(aReversed, b),
  );

  // Word-level overlap: how many words from one name appear in the other
  // (accounts for initials, nicknames, middle names)
  const wordOverlapScore = (() => {
    if (aWords.length === 0 || bWords.length === 0) return 0;
    let matchCount = 0;
    for (const aw of aWords) {
      for (const bw of bWords) {
        // Exact word match or one is initial of the other
        if (aw === bw) { matchCount++; break; }
        if (aw.length === 1 && bw.startsWith(aw)) { matchCount += 0.5; break; }
        if (bw.length === 1 && aw.startsWith(bw)) { matchCount += 0.5; break; }
        // High similarity on individual words (handles "Jan" / "Jannie")
        if (nameSimilarity(aw, bw) >= 0.80) { matchCount += 0.8; break; }
      }
    }
    return matchCount / Math.max(aWords.length, bWords.length);
  })();

  return Math.max(overall, reversedScore, wordOverlapScore * 0.95);
};

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cors({ origin: '*' })); // tighten in production

// ── Admin review page: only on ADMIN_HOST (admin.rooikatlabs.com) ──
// Not reachable via the Railway domain, so it's always behind Cloudflare Access.
const ADMIN_HOST = (process.env.ADMIN_HOST || 'admin.rooikatlabs.com').toLowerCase();
const ADMIN_PAGE = require('path').join(__dirname, 'admin', 'index.html');
app.use((req, res, next) => {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].split(':')[0].trim().toLowerCase();
  if (host !== ADMIN_HOST || req.path.startsWith('/api/')) return next();
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
  res.set({
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.amazonaws.com",
      "media-src 'self' blob: https://*.amazonaws.com",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; '),
  });
  res.sendFile(ADMIN_PAGE);
});

// ── Database ───────────────────────────────────────────
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Redis ──────────────────────────────────────────────
const redisClient = redis.createClient({ url: process.env.REDIS_URL });
redisClient.connect().catch(console.error);

// ── JWT helpers ────────────────────────────────────────
const signAccess = (userId) =>
  jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '15m' });

const signRefresh = (userId) =>
  jwt.sign({ sub: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '30d' });

// ── Auth middleware ────────────────────────────────────
const requireAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  let payload;
  try {
    payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    req.userId = payload.sub;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  safety.getAuthState(db, req.userId)
    .then(state => {
      if (!state.exists) return res.status(401).json({ error: 'Account no longer exists', code: 'ACCOUNT_GONE' });
      if (state.pwdChangedSec && payload.iat < state.pwdChangedSec) {
        return res.status(401).json({ error: 'Your password was changed. Please sign in again.', code: 'SESSION_REVOKED' });
      }
      if (state.suspended) {
        return res.status(403).json({ error: 'This account has been suspended. Contact info@rooikatlabs.com.', code: 'ACCOUNT_SUSPENDED' });
      }
      next();
    })
    .catch(err => { console.error('[safety] auth state check failed', err.message); next(); });
};

// Marks "password changed now": every token issued before this second is revoked.
// Uses the server clock (same clock that stamps JWT iat) to avoid skew.
async function markPasswordChanged(userId, hash) {
  const nowSec = Math.floor(Date.now() / 1000);
  await db.query('UPDATE users SET password_hash = $1, password_changed_at = to_timestamp($2) WHERE id = $3', [hash, nowSec, userId]);
  safety.invalidateSuspension(userId);
}
const MIN_PASSWORD_LENGTH = 8;

// Removes user IDs that are blocked by / have blocked `userId`
async function withoutBlocked(userId, ids) {
  if (!Array.isArray(ids) || !ids.length) return ids;
  const { rows } = await db.query(
    `SELECT unnest($2::uuid[]) AS id
     EXCEPT
     SELECT CASE WHEN blocker_id = $1 THEN blocked_id ELSE blocker_id END
     FROM user_blocks WHERE blocker_id = $1 OR blocked_id = $1`, [userId, ids]);
  const keep = new Set(rows.map(r => r.id));
  return ids.filter(id => keep.has(id));
}

// ── Admin review API (/api/admin/*) — see routes/admin.js ──
app.use('/api/admin', require('./routes/admin')({
  db, requireAuth, safety, s3, bucket: S3_BUCKET, s3BaseUrl: S3_BASE_URL, getSignedUrl, GetObjectCommand,
}));

// ── Health check ───────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// ── Auth routes ────────────────────────────────────────

// POST /api/auth/phone/send-code — sends a Twilio Verify SMS OTP to a phone number
app.post('/api/auth/phone/send-code', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber || !/^\+[1-9]\d{6,14}$/.test(phoneNumber)) {
    return res.status(400).json({ error: 'A valid phone number in international format (e.g. +14155552671) is required.' });
  }
  try {
    if (!(await recordSmsConsent(req, { phoneNumber, purpose: 'signup' }))) {
      return res.status(400).json({ error: CONSENT_REQUIRED_MSG });
    }
    const verification = await twilioClient.verify.v2
      .services(TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({ to: phoneNumber, channel: 'sms' });
    console.log('[verify] send-code ok', { route: req.path, to: maskPhone(phoneNumber), sid: verification.sid, status: verification.status });
    res.json({ data: { status: verification.status } });
  } catch (err) {
    console.error('[verify] send-code FAILED', { route: req.path, to: maskPhone(phoneNumber), ...twilioErr(err) });
    res.status(400).json({ error: 'Could not send verification code. Check the number and try again.' });
  }
});

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { displayName, email, password, dateOfBirth, phoneNumber, code, inviteToken, bio } = req.body;
  if (!displayName || !email || !password || !dateOfBirth || !phoneNumber || !code) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // 18+ gate — enforced server-side regardless of client
  const dob = new Date(dateOfBirth);
  const ageDiff = Date.now() - dob.getTime();
  const ageYears = ageDiff / (1000 * 60 * 60 * 24 * 365.25);
  if (ageYears < 18) {
    return res.status(400).json({ error: 'Roots is for adults aged 18 and over.' });
  }

  // Verify the SMS code with Twilio before creating the account (bot-prevention gate)
  try {
    const check = await twilioClient.verify.v2
      .services(TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({ to: phoneNumber, code });
    if (check.status !== 'approved') {
      console.warn('[verify] check NOT approved', { route: req.path, to: maskPhone(phoneNumber), status: check.status });
      return res.status(400).json({ error: 'Invalid or expired verification code.' });
    }
    console.log('[verify] check ok', { route: req.path, to: maskPhone(phoneNumber), status: check.status });
  } catch (err) {
    console.error('[verify] check FAILED', { route: req.path, to: maskPhone(phoneNumber), ...twilioErr(err) });
    return res.status(400).json({ error: 'Invalid or expired verification code.' });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const trimmedBio = typeof bio === 'string' ? bio.trim().slice(0, 300) : null;
    const { rows } = await db.query(
      `INSERT INTO users (display_name, email, password_hash, date_of_birth, phone_number, bio)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING
         id,
         display_name as "displayName",
         email,
         avatar_colour as "avatarColour",
         date_of_birth as "dateOfBirth",
         city, lat, lng, bio,
         to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt"`,
      [displayName, email.toLowerCase(), hash, dateOfBirth, phoneNumber ?? null, trimmedBio || null]
    );
    const user = rows[0];

    // Link this number's signup consent record(s) to the new account
    try {
      await db.query(
        `UPDATE sms_consents SET user_id = $1
         WHERE phone_number = $2 AND user_id IS NULL AND purpose = 'signup'`,
        [user.id, phoneNumber]
      );
    } catch (e) {
      console.error('[verify] could not link consent to user', { userId: user.id, message: e.message });
    }

    // Auto-connect if user registered via an invite link
    if (inviteToken) {
      const { rows: [inviteConn] } = await db.query(
        `SELECT * FROM connections WHERE invite_token = $1 AND status = 'offline'`,
        [inviteToken]
      );
      if (inviteConn) {
        // Upgrade the inviter's offline connection to active
        await db.query(
          `UPDATE connections
           SET connected_user_id = $1, status = 'active', invite_token = NULL, offline_name = NULL
           WHERE id = $2`,
          [user.id, inviteConn.id]
        );
        // Create reciprocal connection for the new user
        await db.query(
          `INSERT INTO connections (user_id, connected_user_id, relation, layer, contact_frequency, status)
           VALUES ($1, $2, $3, $4, 14, 'active')
           ON CONFLICT DO NOTHING`,
          [user.id, inviteConn.user_id, inviteConn.relation, inviteConn.layer]
        );
      }
    }

    const tokens = {
      accessToken: signAccess(user.id),
      refreshToken: signRefresh(user.id),
      expiresAt: Date.now() + 15 * 60 * 1000,
    };
    res.status(201).json({ data: { user, tokens } });
  } catch (err) {
    if (err.code === '23505') {
      if (err.constraint && err.constraint.includes('phone')) {
        return res.status(409).json({ error: 'This phone number is already registered to an account.' });
      }
      return res.status(409).json({ error: 'Email already registered' });
    }
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});


// ── Password reset by SMS code ─────────────────────────
// Never reveals whether an email has an account. Rate-limited per email and IP.
const resetAttempts = new Map(); // key -> [timestamps]
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const list = (resetAttempts.get(key) || []).filter(t => now - t < windowMs);
  if (list.length >= max) { resetAttempts.set(key, list); return true; }
  list.push(now); resetAttempts.set(key, list);
  return false;
}
const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
const RESET_SENT_MSG = 'If an account exists for this email, we have texted a code to its phone number.';

// POST /api/auth/password/send-code { email, smsConsent, consentVersion }
app.post('/api/auth/password/send-code', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Please enter your email address.' });
  if (req.body?.smsConsent !== true) return res.status(400).json({ error: CONSENT_REQUIRED_MSG });
  if (rateLimited('ip:' + clientIp(req), 20, 60 * 60 * 1000) || rateLimited('email:' + email, 5, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many attempts. Please wait an hour and try again, or email info@rooikatlabs.com.' });
  }
  try {
    const { rows: [u] } = await db.query('SELECT id, phone_number FROM users WHERE email = $1', [email]);
    if (!u || !u.phone_number) {
      console.log('[reset] send-code: no account or no phone', { hasAccount: !!u });
      return res.json({ data: { message: RESET_SENT_MSG } }); // same answer either way
    }
    if (!(await recordSmsConsent(req, { phoneNumber: u.phone_number, purpose: 'password_reset', userId: u.id }))) {
      return res.status(400).json({ error: CONSENT_REQUIRED_MSG });
    }
    const v = await twilioClient.verify.v2.services(TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({ to: u.phone_number, channel: 'sms' });
    console.log('[verify] send-code ok', { route: req.path, to: maskPhone(u.phone_number), sid: v.sid, status: v.status });
    res.json({ data: { message: RESET_SENT_MSG } });
  } catch (err) {
    console.error('[verify] send-code FAILED', { route: req.path, ...twilioErr(err) });
    res.json({ data: { message: RESET_SENT_MSG } }); // don't leak failures tied to a real account
  }
});

// POST /api/auth/password/reset { email, code, newPassword } → signs in
app.post('/api/auth/password/reset', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const { code, newPassword } = req.body ?? {};
  const INVALID = 'That code is invalid or has expired. Please request a new one.';
  if (!email || !code) return res.status(400).json({ error: 'Please enter the code we texted you.' });
  if (!newPassword || String(newPassword).length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
  }
  if (rateLimited('verify-ip:' + clientIp(req), 30, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many attempts. Please wait an hour and try again.' });
  }
  try {
    const { rows: [u] } = await db.query('SELECT id, phone_number, suspended_at FROM users WHERE email = $1', [email]);
    if (!u || !u.phone_number) return res.status(400).json({ error: INVALID });
    let check;
    try {
      check = await twilioClient.verify.v2.services(TWILIO_VERIFY_SERVICE_SID)
        .verificationChecks.create({ to: u.phone_number, code: String(code).trim() });
    } catch (err) {
      console.error('[verify] check FAILED', { route: req.path, to: maskPhone(u.phone_number), ...twilioErr(err) });
      return res.status(400).json({ error: INVALID });
    }
    if (check.status !== 'approved') {
      console.warn('[verify] check NOT approved', { route: req.path, to: maskPhone(u.phone_number), status: check.status });
      return res.status(400).json({ error: INVALID });
    }
    const hash = await bcrypt.hash(String(newPassword), 12);
    await markPasswordChanged(u.id, hash); // signs out every other device
    console.log('[reset] password reset ok', { userId: u.id });
    if (u.suspended_at) {
      return res.status(403).json({ error: 'Your password was changed, but this account is suspended. Contact info@rooikatlabs.com.', code: 'ACCOUNT_SUSPENDED' });
    }
    const tokens = { accessToken: signAccess(u.id), refreshToken: signRefresh(u.id), expiresAt: Date.now() + 15 * 60 * 1000 };
    res.json({ data: { tokens } });
  } catch (err) {
    console.error('[reset] FAILED', { message: err.message });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  try {
    const { rows } = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.suspended_at) {
      return res.status(403).json({ error: 'This account has been suspended. Contact info@rooikatlabs.com.', code: 'ACCOUNT_SUSPENDED' });
    }

    const tokens = {
      accessToken: signAccess(user.id),
      refreshToken: signRefresh(user.id),
      expiresAt: Date.now() + 15 * 60 * 1000,
    };
    const safeUser = {
      id: user.id,
      displayName: user.display_name,
      email: user.email,
      phoneNumber: user.phone_number,
      avatarColour: user.avatar_colour,
      dateOfBirth: user.date_of_birth,
      city: user.city,
      lat: user.lat,
      lng: user.lng,
      settings: user.settings,
      bio: user.bio,
      whatsappNumber: user.whatsapp_number,
      whatsappOptedIn: user.whatsapp_opted_in,
      showDobToConnections: user.show_dob_to_connections,
      createdAt: user.created_at,
    };
    res.json({ data: { user: safeUser, tokens } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/refresh
app.post('/api/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const { rows: [exists] } = await db.query(
      'SELECT suspended_at, FLOOR(EXTRACT(EPOCH FROM password_changed_at))::bigint AS pwd_sec FROM users WHERE id = $1', [payload.sub]);
    if (!exists) return res.status(401).json({ error: 'Account no longer exists' });
    if (exists.pwd_sec && payload.iat < Number(exists.pwd_sec)) {
      return res.status(401).json({ error: 'Your password was changed. Please sign in again.', code: 'SESSION_REVOKED' });
    }
    if (exists.suspended_at) return res.status(403).json({ error: 'This account has been suspended.', code: 'ACCOUNT_SUSPENDED' });
    const tokens = {
      accessToken: signAccess(payload.sub),
      refreshToken: signRefresh(payload.sub),
      expiresAt: Date.now() + 15 * 60 * 1000,
    };
    res.json({ data: tokens });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// ── User routes ────────────────────────────────────────

// GET /api/users/me
app.get('/api/users/me', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, display_name, email, phone_number, avatar_colour,
            avatar_url, date_of_birth, city, lat, lng, settings, bio,
            whatsapp_number, whatsapp_opted_in, show_dob_to_connections, created_at
     FROM users WHERE id = $1`,
    [req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  const u = rows[0];
  res.json({ data: {
    id: u.id,
    displayName: u.display_name,
    email: u.email,
    phoneNumber: u.phone_number,
    avatarColour: u.avatar_colour,
    avatarUrl: u.avatar_url,
    dateOfBirth: u.date_of_birth,
    city: u.city,
    lat: u.lat,
    lng: u.lng,
    settings: u.settings,
    bio: u.bio,
    whatsappNumber: u.whatsapp_number,
    whatsappOptedIn: u.whatsapp_opted_in,
    showDobToConnections: u.show_dob_to_connections,
    createdAt: u.created_at,
  }});
});

// PATCH /api/users/me — update profile
// Note: phoneNumber is intentionally NOT accepted here — changing it requires
// OTP re-verification via /api/users/me/phone/send-code + PATCH /api/users/me/phone.
app.patch('/api/users/me', requireAuth, async (req, res) => {
  const { displayName, city, avatarColour, avatarUrl, email, showDobToConnections, bio } = req.body;
  // bio uses `undefined` (omitted) to mean "leave unchanged" and '' to mean
  // "clear it" — both are distinct from a real bio string, so we can't use
  // a plain COALESCE the way the other text fields do.
  const bioParam = typeof bio === 'string' ? bio.trim().slice(0, 300) : undefined;
  try {
    const { rows: [u] } = await db.query(
      `UPDATE users SET
         display_name            = COALESCE($1, display_name),
         city                    = COALESCE($2, city),
         avatar_colour           = COALESCE($3, avatar_colour),
         avatar_url              = COALESCE($4, avatar_url),
         email                   = COALESCE($5, email),
         show_dob_to_connections = COALESCE($6, show_dob_to_connections),
         bio                     = CASE WHEN $8 THEN $7 ELSE bio END
       WHERE id = $9
       RETURNING id, display_name, email, phone_number, avatar_colour,
                 avatar_url, date_of_birth, city, lat, lng, settings, bio,
                 show_dob_to_connections, created_at`,
      [
        displayName, city, avatarColour, avatarUrl,
        email ? email.toLowerCase() : null,
        typeof showDobToConnections === 'boolean' ? showDobToConnections : null,
        bioParam ?? null,
        bioParam !== undefined,
        req.userId,
      ]
    );
    res.json({ data: {
      id: u.id,
      displayName: u.display_name,
      email: u.email,
      phoneNumber: u.phone_number,
      avatarColour: u.avatar_colour,
      avatarUrl: u.avatar_url,
      dateOfBirth: u.date_of_birth,
      city: u.city,
      lat: u.lat,
      lng: u.lng,
      settings: u.settings,
      bio: u.bio,
      showDobToConnections: u.show_dob_to_connections,
      createdAt: u.created_at,
    }});
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That email is already in use by another account.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Profile update failed' });
  }
});


// ── Account data: export & deletion ────────────────────
// See server/lib/accountData.js. Export contains exactly what the user can
// see in the app; deletion is one transaction, then S3 cleanup.
const s3Ctx = () => ({ s3, bucket: S3_BUCKET, s3BaseUrl: S3_BASE_URL });
const exportsInProgress = new Set();

// POST /api/users/me/export — build ZIP (HTML memory book + photos + data.json),
// upload to S3, return a 1-hour download link.
app.post('/api/users/me/export', requireAuth, async (req, res) => {
  if (exportsInProgress.has(req.userId)) {
    return res.status(429).json({ error: 'Your export is already being prepared. Please wait a moment.' });
  }
  exportsInProgress.add(req.userId);
  req.setTimeout?.(10 * 60 * 1000);
  try {
    const result = await createExport(db, req.userId, s3Ctx());
    res.json({ data: result });
  } catch (err) {
    console.error('[export] FAILED', { userId: req.userId, message: err.message, code: err.code });
    res.status(500).json({ error: 'Could not prepare your export. Please try again.' });
  } finally {
    exportsInProgress.delete(req.userId);
  }
});

// GET /api/users/me/photos-on-others — how many photos this user added to
// memories created by other people (drives the "keep them?" question).
app.get('/api/users/me/photos-on-others', requireAuth, async (req, res) => {
  const { rows: [r] } = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM memory_media mm JOIN events e ON e.id = mm.event_id
     WHERE mm.user_id = $1 AND e.created_by_user_id != $1`, [req.userId]);
  res.json({ data: { count: r.count } });
});

// DELETE /api/users/me — permanently delete the account. Requires password.
app.delete('/api/users/me', requireAuth, async (req, res) => {
  const { password } = req.body ?? {};
  if (!password) return res.status(400).json({ error: 'Please enter your password to confirm.' });
  try {
    const { rows: [u] } = await db.query('SELECT password_hash, legal_hold FROM users WHERE id = $1', [req.userId]);
    if (!u) return res.status(404).json({ error: 'Account not found' });
    if (safety.isAdmin(req.userId)) {
      console.warn('[delete-account] refused — admin account', { userId: req.userId });
      return res.status(403).json({ error: 'This is an admin account and can\'t be deleted from the app. Remove it from ADMIN_USER_IDS first.', code: 'ADMIN_ACCOUNT' });
    }
    if (u.legal_hold) {
      console.warn('[delete-account] refused — legal hold', { userId: req.userId });
      return res.status(403).json({ error: 'Your account can\'t be deleted right now. Please contact info@rooikatlabs.com.', code: 'LEGAL_HOLD' });
    }
    if (!(await bcrypt.compare(password, u.password_hash))) {
      return res.status(403).json({ error: 'That password is incorrect.' });
    }
    const keepPhotosOnOthers = req.body?.keepPhotosOnOthers === true;
    console.log('[delete-account] starting', { userId: req.userId, keepPhotosOnOthers });
    const result = await deleteAccount(db, req.userId, s3Ctx(), { keepPhotosOnOthers });
    res.json({ data: { deleted: true, ...result } });
  } catch (err) {
    console.error('[delete-account] FAILED — nothing deleted', {
      userId: req.userId, message: err.message, code: err.code,
      table: err.table, constraint: err.constraint, detail: err.detail,
    });
    res.status(500).json({ error: 'We could not delete your account right now. Nothing was removed — please try again or contact info@rooikatlabs.com.' });
  }
});


// ── Trust & safety: reports, blocks ────────────────────
// POST /api/reports { targetType: photo|memory|entry|user, targetId, reason, details? }
app.post('/api/reports', requireAuth, async (req, res) => {
  const { targetType, targetId, reason, details } = req.body ?? {};
  try {
    const report = await safety.createReport(db, sendPush, { reporterId: req.userId, targetType, targetId, reason, details });
    res.status(201).json({ data: report });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[safety] report FAILED', { userId: req.userId, message: err.message });
    res.status(500).json({ error: 'Could not send your report. Please try again or email info@rooikatlabs.com.' });
  }
});

// POST /api/users/:id/block — block a user (ends the connection both ways)
app.post('/api/users/:id/block', requireAuth, async (req, res) => {
  if (req.params.id === req.userId) return res.status(400).json({ error: 'You cannot block yourself' });
  try {
    const { rows: [u] } = await db.query('SELECT 1 FROM users WHERE id = $1', [req.params.id]);
    if (!u) return res.status(404).json({ error: 'User not found' });
    await safety.blockUser(db, req.userId, req.params.id);
    console.log('[safety] user blocked', { blocker: req.userId, blocked: req.params.id });
    res.json({ data: { blocked: true } });
  } catch (err) {
    console.error('[safety] block FAILED', { message: err.message, code: err.code });
    res.status(500).json({ error: 'Could not block this person. Please try again.' });
  }
});

// DELETE /api/users/:id/block — unblock (does not restore the connection)
app.delete('/api/users/:id/block', requireAuth, async (req, res) => {
  await db.query('DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2', [req.userId, req.params.id]);
  res.json({ data: { blocked: false } });
});

// GET /api/users/me/blocks — people I've blocked
app.get('/api/users/me/blocks', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id, u.display_name AS "displayName", u.avatar_colour AS "avatarColour",
            to_char(b.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "blockedAt"
     FROM user_blocks b JOIN users u ON u.id = b.blocked_id
     WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`, [req.userId]);
  res.json({ data: rows });
});

// POST /api/users/me/phone/send-code — send an OTP to a NEW phone number
// the authenticated user wants to switch to (does not touch the DB yet)
app.post('/api/users/me/phone/send-code', requireAuth, async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber || !/^\+[1-9]\d{6,14}$/.test(phoneNumber)) {
    return res.status(400).json({ error: 'A valid phone number in international format (e.g. +14155552671) is required.' });
  }
  try {
    const { rows: [existing] } = await db.query(
      'SELECT id FROM users WHERE phone_number = $1 AND id != $2',
      [phoneNumber, req.userId]
    );
    if (existing) {
      return res.status(409).json({ error: 'This phone number is already registered to another account.' });
    }
    if (!(await recordSmsConsent(req, { phoneNumber, purpose: 'change_phone', userId: req.userId }))) {
      return res.status(400).json({ error: CONSENT_REQUIRED_MSG });
    }
    const verification = await twilioClient.verify.v2
      .services(TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({ to: phoneNumber, channel: 'sms' });
    console.log('[verify] send-code ok', { route: req.path, to: maskPhone(phoneNumber), sid: verification.sid, status: verification.status });
    res.json({ data: { status: verification.status } });
  } catch (err) {
    console.error('[verify] send-code FAILED', { route: req.path, to: maskPhone(phoneNumber), ...twilioErr(err) });
    res.status(400).json({ error: 'Could not send verification code. Check the number and try again.' });
  }
});

// PATCH /api/users/me/phone — confirm the OTP and commit the new phone number
app.patch('/api/users/me/phone', requireAuth, async (req, res) => {
  const { phoneNumber, code } = req.body;
  if (!phoneNumber || !code) {
    return res.status(400).json({ error: 'Phone number and code are required.' });
  }
  try {
    const check = await twilioClient.verify.v2
      .services(TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({ to: phoneNumber, code });
    if (check.status !== 'approved') {
      console.warn('[verify] check NOT approved', { route: req.path, to: maskPhone(phoneNumber), status: check.status });
      return res.status(400).json({ error: 'Invalid or expired verification code.' });
    }
    console.log('[verify] check ok', { route: req.path, to: maskPhone(phoneNumber), status: check.status });
  } catch (err) {
    console.error('[verify] check FAILED', { route: req.path, to: maskPhone(phoneNumber), ...twilioErr(err) });
    return res.status(400).json({ error: 'Invalid or expired verification code.' });
  }

  try {
    const { rows: [u] } = await db.query(
      `UPDATE users SET phone_number = $1 WHERE id = $2
       RETURNING id, display_name, email, phone_number, avatar_colour,
                 avatar_url, date_of_birth, city, lat, lng, settings, created_at`,
      [phoneNumber, req.userId]
    );
    res.json({ data: {
      id: u.id,
      displayName: u.display_name,
      email: u.email,
      phoneNumber: u.phone_number,
      avatarColour: u.avatar_colour,
      avatarUrl: u.avatar_url,
      dateOfBirth: u.date_of_birth,
      city: u.city,
      lat: u.lat,
      lng: u.lng,
      settings: u.settings,
      createdAt: u.created_at,
    }});
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This phone number is already registered to another account.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Phone update failed' });
  }
});

// PATCH /api/users/me/password
app.patch('/api/users/me/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both passwords required' });
  }
  const { rows: [user] } = await db.query(
    'SELECT * FROM users WHERE id = $1', [req.userId]
  );
  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return res.status(403).json({ error: 'Current password incorrect' });
  if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
  }
  const hash = await bcrypt.hash(newPassword, 12);
  await markPasswordChanged(req.userId, hash);
  // Other devices are signed out; this device gets fresh tokens
  const tokens = { accessToken: signAccess(req.userId), refreshToken: signRefresh(req.userId), expiresAt: Date.now() + 15 * 60 * 1000 };
  res.json({ data: { ok: true, tokens } });
});

// POST /api/users/me/photo — multipart avatar upload
app.post('/api/users/me/photo', requireAuth, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const { buffer, mimetype } = req.file;
  const mod = await safety.moderateImage({ bytes: buffer });
  if (mod.status !== 'approved') {
    console.warn('[moderation] avatar rejected', { userId: req.userId, labels: mod.labels, error: mod.error });
    return res.status(422).json({ error: 'This photo can\'t be used as a profile picture. Please choose another.', code: 'PHOTO_REJECTED' });
  }
  await db.query(
    'UPDATE users SET avatar_data = $1, avatar_mime = $2 WHERE id = $3',
    [buffer, mimetype, req.userId]
  );
  const avatarUrl = `/api/users/${req.userId}/photo`;
  await db.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, req.userId]);
  res.json({ avatarUrl });
});

// GET /api/users/:id/photo — serve avatar image (no auth required)
app.get('/api/users/:id/photo', async (req, res) => {
  const { rows: [row] } = await db.query(
    'SELECT avatar_data, avatar_mime FROM users WHERE id = $1',
    [req.params.id]
  );
  if (!row?.avatar_data) return res.status(404).send('No photo');
  res.set('Content-Type', row.avatar_mime);
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(row.avatar_data);
});

// ── Connection routes ──────────────────────────────────

// GET /api/connections/search?q=name
// Returns both active Roots users and offline contacts from the caller's circle.
app.get('/api/connections/search', requireAuth, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json({ data: [] });

  try {
    const { rows } = await db.query(
      `-- Active Roots connections
       SELECT
         c.id                    as "connectionId",
         c.layer,
         c.relation,
         u.id                    as id,
         u.display_name          as "displayName",
         u.avatar_colour         as "avatarColour",
         u.city,
         false                   as "isOffline"
       FROM connections c
       JOIN users u ON u.id = c.connected_user_id
       WHERE c.user_id = $1
         AND c.status != 'offline'
         AND LOWER(u.display_name) LIKE LOWER($2)

       UNION ALL

       -- Offline contacts
       SELECT
         c.id                    as "connectionId",
         c.layer,
         c.relation,
         NULL                    as id,
         c.offline_name          as "displayName",
         '#C45A3A'               as "avatarColour",
         NULL                    as city,
         true                    as "isOffline"
       FROM connections c
       WHERE c.user_id = $1
         AND c.status = 'offline'
         AND c.offline_name IS NOT NULL
         AND LOWER(c.offline_name) LIKE LOWER($2)

       ORDER BY "isOffline" ASC, "displayName" ASC
       LIMIT 10`,
      [req.userId, `%${q}%`]
    );
    res.json({ data: rows });
  } catch (err) {
    console.error('GET /connections/search error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/connections
app.get('/api/connections', requireAuth, async (req, res) => {
  const { layer } = req.query;
  const params = [req.userId];
  let where = 'c.user_id = $1';
  if (layer) {
    params.push(layer);
    where += ` AND c.layer = $${params.length}`;
  }
  const { rows } = await db.query(
    `SELECT
       c.id,
       c.user_id as "userId",
       c.connected_user_id as "connectedUserId",
       c.relation,
       c.layer,
       c.since,
       c.contact_frequency as "contactFrequency",
       c.score,
       c.last_contact_at as "lastContactAt",
       c.nudge,
       c.status,
       c.offline_name as "offlineName",
       c.offline_phone as "offlinePhone",
       c.invite_sent_at as "inviteSentAt",
       to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
       CASE
         WHEN u.id IS NOT NULL THEN json_build_object(
           'id', u.id,
           'displayName', u.display_name,
           'avatarColour', u.avatar_colour,
           'city', u.city,
           'phoneNumber', u.phone_number
         )
         ELSE json_build_object(
           'id', null,
           'displayName', c.offline_name,
           'avatarColour', '#C4956A',
           'city', null,
           'phoneNumber', c.offline_phone
         )
       END as "connectedUser"
     FROM connections c
     LEFT JOIN users u ON u.id = c.connected_user_id
     WHERE ${where}
     ORDER BY c.score DESC`,
    params
  );
  res.json({ data: rows });
});

// GET /api/connections/:id
app.get('/api/connections/:id', requireAuth, async (req, res) => {
  const { rows: [c] } = await db.query(
    `SELECT
       c.id,
       c.user_id as "userId",
       c.connected_user_id as "connectedUserId",
       c.relation,
       c.layer,
       c.since,
       c.contact_frequency as "contactFrequency",
       c.score,
       c.last_contact_at as "lastContactAt",
       c.nudge,
       c.always_in_touch as "alwaysInTouch",
       c.status,
       c.offline_name as "offlineName",
       c.offline_phone as "offlinePhone",
       c.offline_email as "offlineEmail",
       c.offline_dob as "offlineDob",
       c.invite_sent_at as "inviteSentAt",
       to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
       CASE
         WHEN u.id IS NOT NULL THEN json_build_object(
           'id', u.id,
           'displayName', u.display_name,
           'avatarColour', u.avatar_colour,
           'city', u.city,
           'phoneNumber', u.phone_number,
           'dateOfBirth', CASE WHEN u.show_dob_to_connections THEN u.date_of_birth ELSE NULL END
         )
         ELSE json_build_object(
           'id', null,
           'displayName', c.offline_name,
           'avatarColour', '#C4956A',
           'city', null,
           'phoneNumber', c.offline_phone
         )
       END as "connectedUser"
     FROM connections c
     LEFT JOIN users u ON u.id = c.connected_user_id
     WHERE c.id = $1 AND c.user_id = $2`,
    [req.params.id, req.userId]
  );
  if (!c) return res.status(404).json({ error: 'Connection not found' });
  res.json({ data: c });
});

// GET /api/users/search?q=name
// Search all Roots users (excluding self + existing connections)
app.get('/api/users/search', requireAuth, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json({ data: [] });

  const { rows } = await db.query(
    `SELECT
       u.id,
       u.display_name as "displayName",
       u.avatar_colour as "avatarColour",
       u.city,
       u.bio,
       CASE WHEN c.id IS NOT NULL THEN true ELSE false END as "inCircle"
     FROM users u
     LEFT JOIN connections c
       ON c.connected_user_id = u.id AND c.user_id = $1
     WHERE u.id != $1
     AND u.suspended_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM user_blocks ub WHERE (ub.blocker_id = $1 AND ub.blocked_id = u.id) OR (ub.blocker_id = u.id AND ub.blocked_id = $1))
     AND LOWER(u.display_name) LIKE LOWER($2)
     ORDER BY u.display_name
     LIMIT 20`,
    [req.userId, `%${q}%`]
  );
  res.json({ data: rows });
});

// POST /api/connections
// Three paths: (1) add Roots user → pending request, (2) add offline contact with phone → check for match, (3) add offline contact
app.post('/api/connections', requireAuth, async (req, res) => {
  const { connectedUserId, relation, layer, since, contactFrequency,
          offlineName, offlinePhone, offlineEmail, offlineDob, message } = req.body;
  if (!layer) return res.status(400).json({ error: 'layer required' });
  const trimmedMessage = typeof message === 'string' ? message.trim().slice(0, 300) : null;

  try {
    // ── Path 1: Adding an existing Roots user ──────────────
    if (connectedUserId) {
      if (await safety.isBlockedEitherWay(db, req.userId, connectedUserId)) {
        return res.status(403).json({ error: 'You can\'t add this person.' });
      }
      const { rows: [existing] } = await db.query(
        'SELECT id, status FROM connections WHERE user_id = $1 AND connected_user_id = $2',
        [req.userId, connectedUserId]
      );
      if (existing) return res.status(409).json({ error: 'Already in circle', data: existing });

      // Create request record
      await db.query(
        `INSERT INTO connection_requests (from_user_id, to_user_id, layer, relation, message)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (from_user_id, to_user_id) DO NOTHING`,
        [req.userId, connectedUserId, layer, relation ?? null, trimmedMessage || null]
      );
      // Create pending connection on sender's side
      const { rows: [connection] } = await db.query(
        `INSERT INTO connections
           (user_id, connected_user_id, relation, layer, since, contact_frequency, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         RETURNING *`,
        [req.userId, connectedUserId, relation ?? null, layer, since ?? null, contactFrequency ?? 14]
      );
      // Push notification to target
      const { rows: tokens } = await db.query(
        'SELECT token FROM push_tokens WHERE user_id = $1', [connectedUserId]
      );
      if (tokens.length) {
        const { rows: [me] } = await db.query(
          'SELECT display_name FROM users WHERE id = $1', [req.userId]
        );
        fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: tokens.map(t => t.token),
            title: 'New connection request',
            body: `${me.display_name} added you to their circle`,
            data: { type: 'connection_request' },
          }),
        }).catch(() => {});
      }
      return res.status(201).json({ data: connection });
    }

    // ── Path 2 & 3: Offline contact ────────────────────────
    if (!offlineName) return res.status(400).json({ error: 'offlineName required' });

    // Check if phone matches a Roots user
    if (offlinePhone) {
      const cleanPhone = offlinePhone.replace(/\D/g, '');
      const { rows: [matchedUser] } = await db.query(
        `SELECT id, display_name as "displayName", avatar_colour as "avatarColour", city
         FROM users
         WHERE REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g') = $1
         AND id != $2`,
        [cleanPhone, req.userId]
      );
      if (matchedUser) {
        return res.status(200).json({ suggestion: true, matchedUser });
      }
    }

    // Create offline connection
    const { rows: [connection] } = await db.query(
      `INSERT INTO connections
         (user_id, relation, layer, since, contact_frequency, status,
          offline_name, offline_phone, offline_email, offline_dob)
       VALUES ($1, $2, $3, $4, $5, 'offline', $6, $7, $8, $9)
       RETURNING *`,
      [req.userId, relation ?? null, layer, since ?? null, contactFrequency ?? 14,
       offlineName, offlinePhone ?? null, offlineEmail ?? null, offlineDob ?? null]
    );
    return res.status(201).json({ data: connection });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add connection' });
  }
});

// DELETE /api/connections/:id
// Remove someone from your circle
app.delete('/api/connections/:id', requireAuth, async (req, res) => {
  await db.query(
    'DELETE FROM connections WHERE id = $1 AND user_id = $2',
    [req.params.id, req.userId]
  );
  res.json({ data: { ok: true } });
});

// PATCH /api/connections/:id
// Update relation settings and (for offline contacts) personal contact info
app.patch('/api/connections/:id', requireAuth, async (req, res) => {
  try {
    const {
      layer, relation, contactFrequency, alwaysInTouch,
      // Offline contact info (only written when connection is offline)
      offlineName, offlinePhone, offlineEmail, offlineDob, offlineCity,
    } = req.body;

    const { rows: [connection] } = await db.query(
      `UPDATE connections
       SET
         layer             = COALESCE($1,  layer),
         relation          = COALESCE($2,  relation),
         contact_frequency = COALESCE($3,  contact_frequency),
         always_in_touch   = COALESCE($4,  always_in_touch),
         -- Offline fields: only update when the connection is actually offline
         offline_name  = CASE WHEN status = 'offline' THEN COALESCE($5,  offline_name)  ELSE offline_name  END,
         offline_phone = CASE WHEN status = 'offline' THEN COALESCE($6,  offline_phone) ELSE offline_phone END,
         offline_email = CASE WHEN status = 'offline' THEN COALESCE($7,  offline_email) ELSE offline_email END,
         offline_dob   = CASE WHEN status = 'offline' THEN COALESCE($8::DATE, offline_dob) ELSE offline_dob END,
         offline_city  = CASE WHEN status = 'offline' THEN COALESCE($9,  offline_city)  ELSE offline_city  END
       WHERE id = $10 AND user_id = $11
       RETURNING *`,
      [
        layer ?? null, relation ?? null, contactFrequency ?? null, alwaysInTouch ?? null,
        offlineName ?? null, offlinePhone ?? null, offlineEmail ?? null,
        offlineDob ?? null, offlineCity ?? null,
        req.params.id, req.userId,
      ]
    );
    if (!connection) return res.status(404).json({ error: 'Connection not found' });
    res.json({ data: connection });
  } catch (err) {
    console.error('PATCH /connections/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update connection' });
  }
});

// ── Connection requests ────────────────────────────────

// GET /api/connection-requests — incoming requests for current user
app.get('/api/connection-requests', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT
       cr.id,
       cr.from_user_id as "fromUserId",
       cr.layer,
       cr.relation,
       cr.message,
       to_char(cr.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
       json_build_object(
         'id', u.id,
         'displayName', u.display_name,
         'avatarColour', u.avatar_colour,
         'city', u.city,
         'bio', u.bio
       ) as "fromUser"
     FROM connection_requests cr
     JOIN users u ON u.id = cr.from_user_id
     WHERE cr.to_user_id = $1
     ORDER BY cr.created_at DESC`,
    [req.userId]
  );
  res.json({ data: rows });
});

// POST /api/connection-requests/:id/accept
app.post('/api/connection-requests/:id/accept', requireAuth, async (req, res) => {
  const { rows: [request] } = await db.query(
    'SELECT * FROM connection_requests WHERE id = $1 AND to_user_id = $2',
    [req.params.id, req.userId]
  );
  if (!request) return res.status(404).json({ error: 'Request not found' });

  const { relation, layer, contactFrequency, since } = req.body;
  if (!relation || !layer) return res.status(400).json({ error: 'relation and layer are required' });

  try {
    // Activate sender's pending connection
    await db.query(
      `UPDATE connections SET status = 'active'
       WHERE user_id = $1 AND connected_user_id = $2`,
      [request.from_user_id, req.userId]
    );
    // Create reciprocal connection using the accepter's own relation/layer/frequency
    await db.query(
      `INSERT INTO connections
         (user_id, connected_user_id, relation, layer, contact_frequency, since, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       ON CONFLICT (user_id, connected_user_id) DO UPDATE
         SET status = 'active', relation = $3, layer = $4,
             contact_frequency = $5, since = $6`,
      [req.userId, request.from_user_id, relation, layer, contactFrequency ?? 14, since ?? null]
    );
    // Delete the request
    await db.query('DELETE FROM connection_requests WHERE id = $1', [req.params.id]);
    // Push notification to requester
    const { rows: tokens } = await db.query(
      'SELECT token FROM push_tokens WHERE user_id = $1', [request.from_user_id]
    );
    if (tokens.length) {
      const { rows: [me] } = await db.query(
        'SELECT display_name FROM users WHERE id = $1', [req.userId]
      );
      fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: tokens.map(t => t.token),
          title: 'Connection accepted',
          body: `${me.display_name} accepted your connection request`,
          data: { type: 'connection_accepted' },
        }),
      }).catch(() => {});
    }
    res.json({ data: { ok: true } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to accept request' });
  }
});

// POST /api/connection-requests/:id/decline
app.post('/api/connection-requests/:id/decline', requireAuth, async (req, res) => {
  const { rows: [request] } = await db.query(
    'SELECT * FROM connection_requests WHERE id = $1 AND to_user_id = $2',
    [req.params.id, req.userId]
  );
  if (!request) return res.status(404).json({ error: 'Request not found' });

  // Sender's connection stays but downgrades to offline — they can still track privately
  await db.query(
    `UPDATE connections SET status = 'offline'
     WHERE user_id = $1 AND connected_user_id = $2`,
    [request.from_user_id, req.userId]
  );
  await db.query('DELETE FROM connection_requests WHERE id = $1', [req.params.id]);
  res.json({ data: { ok: true } });
});

// ── Invite flow ────────────────────────────────────────

// POST /api/connections/:id/invite — generate tokenised invite link
app.post('/api/connections/:id/invite', requireAuth, async (req, res) => {
  const { rows: [connection] } = await db.query(
    `SELECT * FROM connections WHERE id = $1 AND user_id = $2 AND status = 'offline'`,
    [req.params.id, req.userId]
  );
  if (!connection) return res.status(404).json({ error: 'Offline connection not found' });

  const token = require('crypto').randomBytes(16).toString('hex');
  await db.query(
    `UPDATE connections SET invite_token = $1, invite_sent_at = NOW() WHERE id = $2`,
    [token, req.params.id]
  );
  const inviteUrl = `https://roots.app/invite/${token}`;
  res.json({ data: { inviteUrl, token } });
});

// GET /api/invite/:token — resolve token (shown on registration screen)
app.get('/api/invite/:token', async (req, res) => {
  const { rows: [row] } = await db.query(
    `SELECT c.id, c.offline_name as "offlineName",
            u.display_name as "inviterName",
            u.avatar_colour as "inviterAvatarColour"
     FROM connections c
     JOIN users u ON u.id = c.user_id
     WHERE c.invite_token = $1`,
    [req.params.token]
  );
  if (!row) return res.status(404).json({ error: 'Invalid invite link' });
  res.json({ data: row });
});

// ── Onboarding suggestions ─────────────────────────────

// POST /api/users/me/onboarding-suggestions
// Called once after registration — returns users who have this phone as an offline contact
app.post('/api/users/me/onboarding-suggestions', requireAuth, async (req, res) => {
  const { rows: [me] } = await db.query(
    'SELECT phone_number FROM users WHERE id = $1', [req.userId]
  );
  if (!me?.phone_number) return res.json({ data: [] });

  const cleanPhone = me.phone_number.replace(/\D/g, '');
  const { rows } = await db.query(
    `SELECT
       c.id as "connectionId",
       json_build_object(
         'id', u.id,
         'displayName', u.display_name,
         'avatarColour', u.avatar_colour,
         'city', u.city
       ) as "user"
     FROM connections c
     JOIN users u ON u.id = c.user_id
     WHERE REGEXP_REPLACE(COALESCE(c.offline_phone,''), '[^0-9]', '', 'g') = $1
     AND c.status = 'offline'
     AND c.user_id != $2`,
    [cleanPhone, req.userId]
  );
  res.json({ data: rows });
});

// POST /api/connections/sync-contacts
// Receives array of { name, phoneNumber, email } from device
// Matches against connections and updates phone + email
app.post('/api/connections/sync-contacts', requireAuth, async (req, res) => {
  try {
  const { contacts } = req.body;
  if (!Array.isArray(contacts)) {
    return res.status(400).json({ error: 'contacts array required' });
  }

  const { rows: connections } = await db.query(
    // LEFT JOIN so offline contacts (connected_user_id IS NULL) are included.
    // For offline contacts, use offline_name / offline_phone from the connection row.
    `SELECT
       c.id,
       c.status,
       c.connected_user_id,
       c.offline_name,
       c.offline_phone,
       COALESCE(u.display_name, c.offline_name) AS display_name,
       COALESCE(u.phone_number,  c.offline_phone) AS phone_number
     FROM connections c
     LEFT JOIN users u ON u.id = c.connected_user_id
     WHERE c.user_id = $1`,
    [req.userId]
  );

  const matched = [];
  const suggestions = [];

  for (const connection of connections) {
    if (!connection.display_name) continue; // skip rows with no name at all
    const connectionName = connection.display_name;
    let bestMatch = null;
    let bestScore = 0;

    for (const contact of contacts) {
      if (!contact.name || contact.name.length < 3) continue;

      // Phone match takes priority — treated as exact
      const phoneMatch = contact.phoneNumber &&
        connection.phone_number &&
        contact.phoneNumber.replace(/\D/g, '').endsWith(
          connection.phone_number.replace(/\D/g, '').slice(-9)
        );

      if (phoneMatch) {
        bestScore = 1.0;
        bestMatch = { contact, score: 1.0 };
        break; // Phone match is definitive — stop looking
      }

      // Name similarity (diacritic-aware, word-order-aware)
      const score = nameScore(contact.name, connectionName);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = { contact, score };
      }
    }

    if (!bestMatch) continue;

    if (bestMatch.score === 1.0) {
      // Perfect match — sync phone + email automatically
      if (connection.connected_user_id) {
        // Active/pending Roots user → update their profile
        await db.query(
          `UPDATE users
           SET phone_number = COALESCE($1, phone_number),
               email        = COALESCE($2, email)
           WHERE id = $3`,
          [
            bestMatch.contact.phoneNumber ?? null,
            bestMatch.contact.email ?? null,
            connection.connected_user_id,
          ]
        );
      } else {
        // Offline contact → update the connection row
        await db.query(
          `UPDATE connections
           SET offline_phone = COALESCE($1, offline_phone),
               offline_email = COALESCE($2, offline_email)
           WHERE id = $3`,
          [
            bestMatch.contact.phoneNumber ?? null,
            bestMatch.contact.email ?? null,
            connection.id,
          ]
        );
      }
      matched.push({
        connectionId: connection.id,
        name: connection.display_name,
        phoneNumber: bestMatch.contact.phoneNumber,
        email: bestMatch.contact.email,
      });
    } else if (bestMatch.score >= 0.65) {
      // Fuzzy match — present to user to confirm
      suggestions.push({
        connectionId: connection.id,
        connectedUserId: connection.connected_user_id,  // null for offline
        isOffline: !connection.connected_user_id,
        rootsName: connection.display_name,
        contactName: bestMatch.contact.name,
        phoneNumber: bestMatch.contact.phoneNumber,
        score: Math.round(bestMatch.score * 100),
      });
    }
  }

  res.json({ data: { matched, suggestions, total: contacts.length } });
  } catch (err) {
    console.error('POST /connections/sync-contacts error:', err.message);
    res.status(500).json({ error: 'Sync failed' });
  }
});

// POST /api/connections/confirm-contact-match
// Handles both Roots users (connectedUserId present) and offline contacts (connectionId only)
app.post('/api/connections/confirm-contact-match', requireAuth, async (req, res) => {
  const { connectedUserId, connectionId, phoneNumber } = req.body;
  if (connectedUserId) {
    // Active/pending Roots user — update their profile phone
    await db.query(
      'UPDATE users SET phone_number = $1 WHERE id = $2',
      [phoneNumber, connectedUserId]
    );
  } else if (connectionId) {
    // Offline contact — update offline_phone on the connection row
    await db.query(
      'UPDATE connections SET offline_phone = $1 WHERE id = $2 AND user_id = $3',
      [phoneNumber, connectionId, req.userId]
    );
  } else {
    return res.status(400).json({ error: 'connectedUserId or connectionId required' });
  }
  res.json({ data: { ok: true } });
});

// POST /api/connections/:id/log-contact
app.post('/api/connections/:id/log-contact', requireAuth, async (req, res) => {
  const { note } = req.body;

  const { rows: [connection] } = await db.query(
    `UPDATE connections
     SET last_contact_at = NOW(),
         score = LEAST(100, score + 5)
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [req.params.id, req.userId]
  );
  if (!connection) return res.status(404).json({ error: 'Connection not found' });

  await db.query(
    `INSERT INTO contact_events
       (user_id, connection_id, type, title, date, note)
     VALUES ($1, $2, 'manual', 'Contact logged', NOW(), $3)`,
    [req.userId, req.params.id, note ?? null]
  );

  res.json({ data: connection });
});

// POST /api/connections/sync-calendar
// Receives recent calendar events, matches to connections by attendee name
app.post('/api/connections/sync-calendar', requireAuth, async (req, res) => {
  const { events } = req.body;
  if (!Array.isArray(events)) return res.status(400).json({ error: 'events array required' });

  const { rows: connections } = await db.query(
    `SELECT c.id, c.connected_user_id, u.display_name, u.phone_number
     FROM connections c
     JOIN users u ON u.id = c.connected_user_id
     WHERE c.user_id = $1`,
    [req.userId]
  );

  const matches = [];

  for (const event of events) {
    const attendees = (event.attendees ?? []).map(a => a.toLowerCase().trim());
    const title = (event.title ?? '').toLowerCase();

    for (const conn of connections) {
      const name = conn.display_name.toLowerCase().trim();
      const nameParts = name.split(' ');

      const nameMatch =
        attendees.some(a => nameSimilarity(a, name) >= 0.85) ||
        nameParts.some(part => title.includes(part) && part.length > 2);

      if (nameMatch) {
        matches.push({
          connectionId: conn.id,
          connectionName: conn.display_name,
          eventTitle: event.title,
          eventDate: event.date,
        });
        break;
      }
    }
  }

  res.json({ data: { matches, total: events.length } });
});

// POST /api/connections/confirm-calendar-match
app.post('/api/connections/confirm-calendar-match', requireAuth, async (req, res) => {
  const { connectionId, eventDate, eventTitle, note } = req.body;

  const { rows: [conn] } = await db.query(
    `UPDATE connections
     SET last_contact_at = GREATEST(COALESCE(last_contact_at, $1), $1),
         score = LEAST(100, score + 5)
     WHERE id = $2 AND user_id = $3
     RETURNING id`,
    [eventDate, connectionId, req.userId]
  );
  if (!conn) return res.status(404).json({ error: 'Connection not found' });

  await db.query(
    `INSERT INTO contact_events
       (user_id, connection_id, type, title, date, note)
     VALUES ($1, $2, 'calendar', $3, $4, $5)`,
    [req.userId, connectionId, eventTitle ?? 'Calendar event', eventDate, note ?? null]
  );

  res.json({ data: { ok: true } });
});

// GET /api/connections/:id/events
app.get('/api/connections/:id/events', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, type, title, date, note,
            audio_url as "audioUrl",
            memory_event_id as "memoryEventId",
            created_at as "createdAt"
     FROM contact_events
     WHERE connection_id = $1 AND user_id = $2
     ORDER BY date DESC
     LIMIT 50`,
    [req.params.id, req.userId]
  );
  res.json({ data: rows });
});

// POST /api/connections/:id/events
app.post('/api/connections/:id/events', requireAuth, async (req, res) => {
  const { type, title, date, note, memoryEventId, audioUrl } = req.body;
  if (!type || !date) return res.status(400).json({ error: 'type and date required' });

  // Update last_contact_at and score on the connection
  await db.query(
    `UPDATE connections
     SET last_contact_at = GREATEST(COALESCE(last_contact_at, $1), $1),
         score = LEAST(100, score + 5)
     WHERE id = $2 AND user_id = $3`,
    [date, req.params.id, req.userId]
  );

  const { rows: [event] } = await db.query(
    `INSERT INTO contact_events
       (user_id, connection_id, type, title, date, note, memory_event_id, audio_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, type, title, date, note,
               audio_url as "audioUrl",
               memory_event_id as "memoryEventId",
               created_at as "createdAt"`,
    [req.userId, req.params.id, type, title ?? null, date, note ?? null, memoryEventId ?? null, audioUrl ?? null]
  );

  res.json({ data: event });
});

// ── Memory routes ──────────────────────────────────────

// GET /api/memories
app.get('/api/memories', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT
       e.id,
       e.title,
       to_char(e.date, 'YYYY-MM-DD') as date,
       e.location,
       e.visibility,
       e.participant_ids as "participantIds",
       e.photo_urls as "photoUrls",
       to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
       (SELECT COUNT(*) FROM memory_entries me WHERE me.event_id = e.id) as "entryCount",
       (
         (SELECT COUNT(*) FROM memory_entries me
          WHERE me.event_id = e.id AND me.author_id != $1 AND me.hidden_at IS NULL
            AND me.created_at > COALESCE(
              (SELECT last_viewed_at FROM memory_views WHERE user_id = $1 AND event_id = e.id),
              '1970-01-01'::timestamptz))
         +
         (SELECT COUNT(*) FROM memory_media mm
          WHERE mm.event_id = e.id AND mm.user_id != $1 AND mm.moderation_status = 'approved'
            AND mm.created_at > COALESCE(
              (SELECT last_viewed_at FROM memory_views WHERE user_id = $1 AND event_id = e.id),
              '1970-01-01'::timestamptz))
       ) AS "newEntryCount",
       (SELECT EXISTS(SELECT 1 FROM memory_entries me WHERE me.event_id = e.id AND me.author_id = $1)) AS "hasMyEntry",
       (SELECT COALESCE(json_agg(p), '[]'::json)
        FROM (
          SELECT json_build_object(
            'id',           u.id,
            'displayName',  u.display_name,
            'avatarColour', u.avatar_colour,
            'isOffline',    false
          ) as p
          FROM users u
          WHERE u.id = ANY(e.participant_ids)
          UNION ALL
          SELECT json_build_object(
            'id',           NULL,
            'connectionId', c.id,
            'displayName',  c.offline_name,
            'avatarColour', '#C45A3A',
            'isOffline',    true
          ) as p
          FROM connections c
          WHERE c.id = ANY(e.offline_participant_connection_ids)
        ) sub
       ) as participants,
       (SELECT COALESCE(json_agg(mm.url ORDER BY mm.created_at ASC), '[]'::json)
        FROM (SELECT url, created_at FROM memory_media
              WHERE event_id = e.id AND moderation_status = 'approved'
                AND NOT EXISTS (SELECT 1 FROM content_reports cr WHERE cr.reporter_id = $1 AND cr.target_type = 'photo' AND cr.target_id = memory_media.id)
              ORDER BY created_at ASC LIMIT 3) mm
       ) as media
     FROM events e
     WHERE e.hidden_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM content_reports cr WHERE cr.reporter_id = $1 AND cr.target_type = 'memory' AND cr.target_id = e.id)
       AND NOT EXISTS (SELECT 1 FROM user_blocks ub WHERE (ub.blocker_id = $1 AND ub.blocked_id = e.created_by_user_id) OR (ub.blocker_id = e.created_by_user_id AND ub.blocked_id = $1))
       AND (e.created_by_user_id = $1
        OR $1 = ANY(e.participant_ids)
        OR EXISTS (
          -- Per-author visibility: the event is visible if the viewer qualifies
          -- for AT LEAST ONE contributor's chosen layer (memory_author_visibility),
          -- falling back to the event's own visibility for any author who hasn't
          -- set a preference yet. See docs/shared-memory-visibility-design.md.
          SELECT 1
          FROM (
            SELECT e.created_by_user_id AS author_id
            UNION SELECT me.author_id FROM memory_entries me WHERE me.event_id = e.id
            UNION SELECT mm.user_id    FROM memory_media  mm WHERE mm.event_id = e.id
          ) authors
          LEFT JOIN memory_author_visibility mav
            ON mav.event_id = e.id AND mav.user_id = authors.author_id
          JOIN connections c
            ON c.user_id = authors.author_id
           AND c.connected_user_id = $1
           AND c.status = 'active'
          WHERE COALESCE(mav.visibility, e.visibility) != 'onlyUs'
            AND (
              (COALESCE(mav.visibility, e.visibility) = 'intimate'   AND c.layer = 'intimate') OR
              (COALESCE(mav.visibility, e.visibility) = 'close'      AND c.layer IN ('intimate','close')) OR
              (COALESCE(mav.visibility, e.visibility) = 'active'     AND c.layer IN ('intimate','close','active')) OR
              (COALESCE(mav.visibility, e.visibility) = 'meaningful' AND c.layer IN ('intimate','close','active','meaningful'))
            )
        )
       )
     ORDER BY e.created_at DESC`,
    [req.userId]
  );
  res.json({ data: rows });
});

// POST /api/memories/:id/view — record per-user last_viewed_at
app.post('/api/memories/:id/view', requireAuth, async (req, res) => {
  await db.query(
    `INSERT INTO memory_views (user_id, event_id, last_viewed_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, event_id) DO UPDATE SET last_viewed_at = NOW()`,
    [req.userId, req.params.id]
  );
  res.json({ ok: true });
});

// GET /api/memories/:id
app.get('/api/memories/:id', requireAuth, async (req, res) => {
  const { rows: [event] } = await db.query(
    `SELECT
       e.id,
       e.title,
       to_char(e.date, 'YYYY-MM-DD') as date,
       e.location, e.lat, e.lng, e.music, e.visibility,
       e.participant_ids                       as "participantIds",
       e.offline_participant_connection_ids    as "offlineParticipantConnectionIds",
       e.photo_urls                            as "photoUrls",
       e.created_by_user_id                    as "createdByUserId",
       to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt"
     FROM events e
     WHERE e.id = $1
       AND e.hidden_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM content_reports cr WHERE cr.reporter_id = $2 AND cr.target_type = 'memory' AND cr.target_id = e.id)
       AND NOT EXISTS (SELECT 1 FROM user_blocks ub WHERE (ub.blocker_id = $2 AND ub.blocked_id = e.created_by_user_id) OR (ub.blocker_id = e.created_by_user_id AND ub.blocked_id = $2))
       AND (
         e.created_by_user_id = $2
         OR $2 = ANY(e.participant_ids)
         OR EXISTS (
           -- Same per-author visibility rule as GET /api/memories — see
           -- docs/shared-memory-visibility-design.md.
           SELECT 1
           FROM (
             SELECT e.created_by_user_id AS author_id
             UNION SELECT me.author_id FROM memory_entries me WHERE me.event_id = e.id
             UNION SELECT mm.user_id    FROM memory_media  mm WHERE mm.event_id = e.id
           ) authors
           LEFT JOIN memory_author_visibility mav
             ON mav.event_id = e.id AND mav.user_id = authors.author_id
           JOIN connections c
             ON c.user_id = authors.author_id
            AND c.connected_user_id = $2
            AND c.status = 'active'
           WHERE COALESCE(mav.visibility, e.visibility) != 'onlyUs'
             AND (
               (COALESCE(mav.visibility, e.visibility) = 'intimate'   AND c.layer = 'intimate') OR
               (COALESCE(mav.visibility, e.visibility) = 'close'      AND c.layer IN ('intimate','close')) OR
               (COALESCE(mav.visibility, e.visibility) = 'active'     AND c.layer IN ('intimate','close','active')) OR
               (COALESCE(mav.visibility, e.visibility) = 'meaningful' AND c.layer IN ('intimate','close','active','meaningful'))
             )
         )
       )`,
    [req.params.id, req.userId]
  );
  if (!event) return res.status(404).json({ error: 'Not found' });

  // The viewer's own visibility setting for this memory (if they're a
  // contributor), for the client to show "your visibility" in the UI.
  const { rows: [myVisRow] } = await db.query(
    `SELECT visibility FROM memory_author_visibility WHERE event_id = $1 AND user_id = $2`,
    [req.params.id, req.userId]
  );
  const myVisibility = myVisRow?.visibility ?? event.visibility;

  // Entries and media are filtered per-author: visible to the author
  // themself, to any tagged participant, or to a viewer whose connection to
  // that specific author clears that author's own chosen layer (falling
  // back to the event's own visibility if the author hasn't set one).
  const { rows: entries } = await db.query(
    `SELECT
       me.id,
       me.event_id  as "eventId",
       me.author_id as "authorId",
       me.text,
       me.time,
       (me.author_id != $2 AND me.created_at > COALESCE(
         (SELECT last_viewed_at FROM memory_views WHERE user_id = $2 AND event_id = $1),
         '1970-01-01'::timestamptz
       )) as "isNew",
       to_char(me.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
       json_build_object(
         'id',           u.id,
         'displayName',  u.display_name,
         'avatarColour', u.avatar_colour,
         'avatarUrl',    u.avatar_url
       ) as author
     FROM memory_entries me
     JOIN users u ON u.id = me.author_id
     LEFT JOIN memory_author_visibility mav
       ON mav.event_id = me.event_id AND mav.user_id = me.author_id
     WHERE me.event_id = $1
       AND me.hidden_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM content_reports cr WHERE cr.reporter_id = $2 AND cr.target_type = 'entry' AND cr.target_id = me.id)
       AND NOT EXISTS (SELECT 1 FROM user_blocks ub WHERE (ub.blocker_id = $2 AND ub.blocked_id = me.author_id) OR (ub.blocker_id = me.author_id AND ub.blocked_id = $2))
       AND (
         me.author_id = $2
         OR $2 = ANY($3::uuid[])
         OR EXISTS (
           SELECT 1 FROM connections c
           WHERE c.user_id = me.author_id
             AND c.connected_user_id = $2
             AND c.status = 'active'
             AND (
               (COALESCE(mav.visibility, $4) = 'intimate'   AND c.layer = 'intimate') OR
               (COALESCE(mav.visibility, $4) = 'close'      AND c.layer IN ('intimate','close')) OR
               (COALESCE(mav.visibility, $4) = 'active'     AND c.layer IN ('intimate','close','active')) OR
               (COALESCE(mav.visibility, $4) = 'meaningful' AND c.layer IN ('intimate','close','active','meaningful'))
             )
         )
       )
     ORDER BY me.created_at ASC`,
    [req.params.id, req.userId, event.participantIds, event.visibility]
  );

  // Hydrate participants — Roots users + offline contacts
  const { rows: rootsParticipants } = await db.query(
    `SELECT id,
            display_name  as "displayName",
            avatar_colour as "avatarColour",
            city,
            false         as "isOffline"
     FROM users
     WHERE id = ANY($1::uuid[])`,
    [event.participantIds]
  );
  const { rows: offlineParticipants } = event.offlineParticipantConnectionIds?.length
    ? await db.query(
        `SELECT id           as "connectionId",
                offline_name as "displayName",
                '#C45A3A'    as "avatarColour",
                NULL         as city,
                true         as "isOffline"
         FROM connections
         WHERE id = ANY($1::uuid[])`,
        [event.offlineParticipantConnectionIds]
      )
    : { rows: [] };
  const participants = [...rootsParticipants, ...offlineParticipants];

  // Fetch media for this event, filtered per-author the same way as entries.
  const { rows: mediaRows } = await db.query(
    `SELECT mm.id, mm.user_id as "userId", mm.url, mm.caption,
            mm.moderation_status as "moderationStatus"
     FROM memory_media mm
     LEFT JOIN memory_author_visibility mav
       ON mav.event_id = mm.event_id AND mav.user_id = mm.user_id
     WHERE mm.event_id = $1
       -- approved for everyone; uploader also sees their own photo while it's under review
       AND (mm.moderation_status = 'approved' OR (mm.user_id = $2 AND mm.moderation_status = 'pending_review'))
       AND NOT EXISTS (SELECT 1 FROM content_reports cr WHERE cr.reporter_id = $2 AND cr.target_type = 'photo' AND cr.target_id = mm.id)
       AND (mm.user_id IS NULL OR NOT EXISTS (SELECT 1 FROM user_blocks ub WHERE (ub.blocker_id = $2 AND ub.blocked_id = mm.user_id) OR (ub.blocker_id = mm.user_id AND ub.blocked_id = $2)))
       AND (
         mm.user_id = $2
         OR mm.user_id IS NULL  -- kept by a former member: visible to anyone who can see the memory
         OR $2 = ANY($3::uuid[])
         OR EXISTS (
           SELECT 1 FROM connections c
           WHERE c.user_id = mm.user_id
             AND c.connected_user_id = $2
             AND c.status = 'active'
             AND (
               (COALESCE(mav.visibility, $4) = 'intimate'   AND c.layer = 'intimate') OR
               (COALESCE(mav.visibility, $4) = 'close'      AND c.layer IN ('intimate','close')) OR
               (COALESCE(mav.visibility, $4) = 'active'     AND c.layer IN ('intimate','close','active')) OR
               (COALESCE(mav.visibility, $4) = 'meaningful' AND c.layer IN ('intimate','close','active','meaningful'))
             )
         )
       )
     ORDER BY mm.created_at ASC`,
    [req.params.id, req.userId, event.participantIds, event.visibility]
  );
  const media = mediaRows.map(r => r.url);
  // Richer form alongside `media` — carries id + uploader so the client can
  // filter "your photos" and offer per-photo delete. `media` (plain URLs)
  // stays as-is for the gallery/lightbox, which don't need either.
  const mediaItems = mediaRows;

  res.json({ data: { ...event, myVisibility, entries, participants, media, mediaItems } });
});

// PATCH /api/memories/:id — creator only: update event details
app.patch('/api/memories/:id', requireAuth, async (req, res) => {
  const { title, date, location, visibility } = req.body;
  const participantIds = req.body.participantIds ? await withoutBlocked(req.userId, req.body.participantIds) : undefined;
  const { rows: [event] } = await db.query(
    `UPDATE events SET
       title          = COALESCE($1, title),
       date           = COALESCE($2::date, date),
       location       = COALESCE($3, location),
       visibility     = COALESCE($4, visibility),
       participant_ids = COALESCE($5::uuid[], participant_ids)
     WHERE id = $6 AND created_by_user_id = $7
     RETURNING
       id, title,
       to_char(date, 'YYYY-MM-DD') as date,
       location, visibility,
       participant_ids    as "participantIds",
       created_by_user_id as "createdByUserId"`,
    [
      title   ?? null,
      date    ?? null,
      location ?? null,
      visibility ?? null,
      participantIds ?? null,
      req.params.id,
      req.userId,
    ]
  );
  if (!event) return res.status(403).json({ error: 'Not found or not the creator' });
  res.json({ data: event });
});

// POST /api/memories
app.post('/api/memories', requireAuth, async (req, res) => {
  try {
    const {
      title, date, location, lat, lng, music, visibility,
      participantIds,
      offlineParticipantConnectionIds,  // connection IDs for offline-only contacts
    } = req.body;
    const finalParticipantIds = await withoutBlocked(req.userId, participantIds ?? [req.userId]);
    const finalVisibility = visibility ?? 'intimate';

    const { rows: [event] } = await db.query(
      `INSERT INTO events
         (title, date, location, lat, lng, music, visibility,
          participant_ids, offline_participant_connection_ids, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        title, date, location, lat, lng,
        music ? JSON.stringify(music) : null,
        finalVisibility,
        finalParticipantIds,
        offlineParticipantConnectionIds ?? [],
        req.userId,
      ]
    );

    // Notify everyone who can now see this memory — tagged participants plus
    // anyone the creator has connected at a layer within the visibility tier
    // (same nested-layer rule used to gate GET /api/memories).
    try {
      const taggedOthers = finalParticipantIds.filter((id) => id !== req.userId);
      const { rows: tokens } = await db.query(
        `SELECT DISTINCT pt.token
         FROM push_tokens pt
         WHERE pt.user_id != $1
           AND pt.user_id IN (
             SELECT unnest($2::uuid[])
             UNION
             SELECT c.connected_user_id
             FROM connections c
             WHERE c.user_id = $1
               AND c.status = 'active'
               AND (
                 ($3 = 'intimate'   AND c.layer = 'intimate') OR
                 ($3 = 'close'      AND c.layer IN ('intimate','close')) OR
                 ($3 = 'active'     AND c.layer IN ('intimate','close','active')) OR
                 ($3 = 'meaningful' AND c.layer IN ('intimate','close','active','meaningful'))
               )
           )`,
        [req.userId, taggedOthers, finalVisibility]
      );
      if (tokens.length) {
        const { rows: [me] } = await db.query(
          'SELECT display_name FROM users WHERE id = $1', [req.userId]
        );
        fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: tokens.map(t => t.token),
            title: 'New memory',
            body: `${me.display_name} shared a new memory: "${event.title}"`,
            data: { type: 'new_memory', eventId: event.id },
          }),
        }).catch(() => {});
      }
    } catch (pushErr) {
      // Never let a notification failure block memory creation
      console.error('Failed to send new-memory push:', pushErr.message);
    }

    res.status(201).json({ data: event });
  } catch (err) {
    console.error('POST /memories error:', err.message);
    res.status(500).json({ error: 'Failed to create memory' });
  }
});

const MEMORY_VISIBILITY_VALUES = ['onlyUs', 'intimate', 'close', 'active', 'meaningful'];

// Upsert the caller's own visibility choice for a memory. Called from the
// entries/media routes when a `visibility` field is provided, and from
// PATCH /api/memories/:id/my-visibility below.
async function setMyMemoryVisibility(eventId, userId, visibility) {
  await db.query(
    `INSERT INTO memory_author_visibility (event_id, user_id, visibility)
     VALUES ($1, $2, $3)
     ON CONFLICT (event_id, user_id) DO UPDATE SET visibility = $3, updated_at = NOW()`,
    [eventId, userId, visibility]
  );
}

// PATCH /api/memories/:id/my-visibility — any contributor sets their own
// visibility layer for a shared memory, independent of who created it.
app.patch('/api/memories/:id/my-visibility', requireAuth, async (req, res) => {
  const { visibility } = req.body;
  if (!MEMORY_VISIBILITY_VALUES.includes(visibility)) {
    return res.status(400).json({ error: `visibility must be one of ${MEMORY_VISIBILITY_VALUES.join(', ')}` });
  }
  const { rows: [event] } = await db.query(
    'SELECT id FROM events WHERE id = $1 AND ($2 = ANY(participant_ids) OR created_by_user_id = $2)',
    [req.params.id, req.userId]
  );
  if (!event) return res.status(403).json({ error: 'Not a participant in this memory' });

  await setMyMemoryVisibility(req.params.id, req.userId, visibility);
  res.json({ data: { eventId: req.params.id, userId: req.userId, visibility } });
});

// POST /api/memories/:id/entries
app.post('/api/memories/:id/entries', requireAuth, async (req, res) => {
  const { text, visibility } = req.body;
  if (visibility && !MEMORY_VISIBILITY_VALUES.includes(visibility)) {
    return res.status(400).json({ error: `visibility must be one of ${MEMORY_VISIBILITY_VALUES.join(', ')}` });
  }
  // Verify the caller is a participant
  const { rows: [event] } = await db.query(
    'SELECT id FROM events WHERE id = $1 AND $2 = ANY(participant_ids)',
    [req.params.id, req.userId]
  );
  if (!event) return res.status(403).json({ error: 'Not a participant in this memory' });

  if (visibility) {
    await setMyMemoryVisibility(req.params.id, req.userId, visibility);
  }

  const { rows: [entry] } = await db.query(
    `INSERT INTO memory_entries (event_id, author_id, text)
     VALUES ($1, $2, $3) RETURNING *`,
    [req.params.id, req.userId, text]
  );
  res.status(201).json({ data: entry });
});

// PATCH /api/memories/:eventId/entries/:entryId — author only: edit own perspective
app.patch('/api/memories/:eventId/entries/:entryId', requireAuth, async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Text required' });

  const { rows: [entry] } = await db.query(
    `UPDATE memory_entries
     SET text = $1
     WHERE id = $2 AND author_id = $3
     RETURNING *`,
    [text.trim(), req.params.entryId, req.userId]
  );

  if (!entry) return res.status(404).json({ error: 'Entry not found or not yours' });
  res.json({ data: entry });
});

// DELETE /api/memories/:eventId/entries/:entryId
// Creator can delete any entry; authors can delete their own
app.delete('/api/memories/:eventId/entries/:entryId', requireAuth, async (req, res) => {
  const { rows: [ev] } = await db.query(
    'SELECT created_by_user_id FROM events WHERE id = $1',
    [req.params.eventId]
  );
  if (!ev) return res.status(404).json({ error: 'Memory not found' });

  const isCreator = ev.created_by_user_id === req.userId;
  const { rows: [me] } = await db.query('SELECT legal_hold FROM users WHERE id = $1', [req.userId]);
  if (me?.legal_hold) return res.status(403).json({ error: 'This content can\'t be deleted right now. Contact info@rooikatlabs.com.' });
  const { rows: [entry] } = await db.query(
    `DELETE FROM memory_entries
     WHERE id = $1 AND event_id = $2 AND ($3 OR author_id = $4)
     RETURNING id`,
    [req.params.entryId, req.params.eventId, isCreator, req.userId]
  );
  if (!entry) return res.status(403).json({ error: 'Not found or not authorised' });
  res.json({ data: { ok: true } });
});

// POST /api/media/presign — generate a presigned S3 upload URL
// Body: { contentType: 'image/jpeg' | 'video/mp4' | ..., folder: 'memories' | 'avatars' }
// Returns: { uploadUrl, publicUrl, key }
app.post('/api/media/presign', requireAuth, async (req, res) => {
  try {
    const { contentType, folder = 'memories' } = req.body;
    if (!contentType) return res.status(400).json({ error: 'contentType required' });

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'audio/m4a', 'audio/mpeg'];
    if (!allowedTypes.includes(contentType)) {
      return res.status(400).json({ error: `Unsupported content type: ${contentType}` });
    }

    const ext = contentType.split('/')[1].replace('quicktime', 'mov').replace('mpeg', 'mp3');
    const key = `${folder}/${req.userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    // ContentType intentionally omitted from signed command — avoids header mismatch 403s
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 min
    const publicUrl = `${S3_BASE_URL}/${key}`;

    res.json({ data: { uploadUrl, publicUrl, key } });
  } catch (err) {
    console.error('S3 presign error:', err);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// POST /api/media/confirm — save a confirmed S3 upload to the DB
// Body: { publicUrl, key, type: 'avatar' | 'memory', referenceId? }
app.post('/api/media/confirm', requireAuth, async (req, res) => {
  try {
    const { publicUrl, type, referenceId, visibility } = req.body;
    if (!publicUrl || !type) return res.status(400).json({ error: 'publicUrl and type required' });
    if (visibility && !MEMORY_VISIBILITY_VALUES.includes(visibility)) {
      return res.status(400).json({ error: `visibility must be one of ${MEMORY_VISIBILITY_VALUES.join(', ')}` });
    }

    // Moderation: images are checked by Rekognition; videos are held for manual review.
    const key = publicUrl.startsWith(S3_BASE_URL + '/') ? decodeURIComponent(publicUrl.slice(S3_BASE_URL.length + 1)) : null;
    let moderation = { status: 'approved', labels: null };
    if (type === 'avatar' || type === 'memory') {
      if (!key) return res.status(400).json({ error: 'Invalid media URL' });
      moderation = safety.isVideoKey(key)
        ? { status: 'pending_review', labels: [{ name: 'video_manual_review' }] }
        : await safety.moderateImage({ bucket: S3_BUCKET, key });
    }

    if (type === 'avatar') {
      if (moderation.status !== 'approved') {
        console.warn('[moderation] avatar rejected', { userId: req.userId, labels: moderation.labels, error: moderation.error });
        return res.status(422).json({ error: 'This photo can\'t be used as a profile picture. Please choose another.', code: 'PHOTO_REJECTED' });
      }
      await db.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [publicUrl, req.userId]);
    } else if (type === 'memory' && referenceId) {
      await db.query(
        `INSERT INTO memory_media (event_id, user_id, url, created_at, moderation_status, moderation_labels, moderated_at)
         VALUES ($1, $2, $3, NOW(), $4, $5, NOW())
         ON CONFLICT DO NOTHING`,
        [referenceId, req.userId, publicUrl, moderation.status, moderation.labels ? JSON.stringify(moderation.labels) : null]
      );
      if (moderation.status !== 'approved') {
        console.warn('[moderation] memory media held for review', { userId: req.userId, key, labels: moderation.labels, error: moderation.error });
        safety.alertAdmins(db, sendPush, 'Photo held for review',
          safety.isVideoKey(key) ? 'A video was uploaded and needs manual review.' : 'A photo was flagged by automatic moderation.',
          { type: 'moderation_pending' });
      }
      if (visibility) {
        await setMyMemoryVisibility(referenceId, req.userId, visibility);
      }
    } else if (type === 'contact-audio' && referenceId) {
      await db.query(
        `UPDATE contact_events SET audio_url = $1 WHERE id = $2 AND user_id = $3`,
        [publicUrl, referenceId, req.userId]
      );
    }

    res.json({ data: { ok: true, publicUrl, moderationStatus: moderation.status } });
  } catch (err) {
    console.error('Media confirm error:', err);
    res.status(500).json({ error: 'Failed to confirm media' });
  }
});

// DELETE /api/media/:mediaId — remove a single photo from a memory.
// Creator acts as admin (can remove any photo on their memory); everyone
// else can only remove their own upload. Mirrors the same permission model
// as DELETE /api/memories/:eventId/entries/:entryId.
app.delete('/api/media/:mediaId', requireAuth, async (req, res) => {
  try {
    const { rows: [media] } = await db.query(
      `SELECT mm.id, mm.user_id as "userId", mm.event_id as "eventId",
              e.created_by_user_id as "creatorId"
       FROM memory_media mm
       JOIN events e ON e.id = mm.event_id
       WHERE mm.id = $1`,
      [req.params.mediaId]
    );
    if (!media) return res.status(404).json({ error: 'Not found' });
    if (media.userId !== req.userId && media.creatorId !== req.userId) {
      return res.status(403).json({ error: 'Not authorised to delete this photo' });
    }
    // Preserve evidence: removed-by-moderation photos and anything from an account on legal hold
    const { rows: [hold] } = await db.query(
      `SELECT (mm.moderation_status = 'removed') AS removed,
              COALESCE((SELECT legal_hold FROM users WHERE id = mm.user_id), false) AS uploader_hold,
              (SELECT legal_hold FROM users WHERE id = $2) AS my_hold
       FROM memory_media mm WHERE mm.id = $1`, [req.params.mediaId, req.userId]);
    if (hold?.removed || hold?.uploader_hold || hold?.my_hold) {
      return res.status(403).json({ error: 'This photo can\'t be deleted right now. Contact info@rooikatlabs.com.' });
    }
    await db.query('DELETE FROM memory_media WHERE id = $1', [req.params.mediaId]);
    res.json({ data: { ok: true } });
  } catch (err) {
    console.error('Media delete error:', err);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

// PATCH /api/media/:mediaId — add or edit a photo's caption.
// Same permission model as delete: the person who uploaded the photo, or
// the memory's creator (acting as admin), can set/change its caption.
app.patch('/api/media/:mediaId', requireAuth, async (req, res) => {
  const { caption } = req.body;
  try {
    const { rows: [media] } = await db.query(
      `SELECT mm.id, mm.user_id as "userId", mm.event_id as "eventId",
              e.created_by_user_id as "creatorId"
       FROM memory_media mm
       JOIN events e ON e.id = mm.event_id
       WHERE mm.id = $1`,
      [req.params.mediaId]
    );
    if (!media) return res.status(404).json({ error: 'Not found' });
    if (media.userId !== req.userId && media.creatorId !== req.userId) {
      return res.status(403).json({ error: 'Not authorised to caption this photo' });
    }
    const trimmedCaption = typeof caption === 'string' ? caption.trim().slice(0, 150) : null;
    const { rows: [updated] } = await db.query(
      `UPDATE memory_media SET caption = $1 WHERE id = $2
       RETURNING id, user_id as "userId", url, caption`,
      [trimmedCaption || null, req.params.mediaId]
    );
    res.json({ data: updated });
  } catch (err) {
    console.error('Media caption error:', err);
    res.status(500).json({ error: 'Failed to update caption' });
  }
});

// ── Admin / test endpoints ─────────────────────────────
// GET /api/admin/run-nudges — test only, remove before launch
app.get('/api/admin/run-nudges', async (req, res) => {
  runNudgeEngine(db);
  res.json({ data: { ok: true, message: 'Nudge engine triggered' } });
});

// GET /api/admin/test-nudge — force a nudge on first connection
app.get('/api/admin/test-nudge', requireAuth, async (req, res) => {
  const { rows: [conn] } = await db.query(
    `UPDATE connections
     SET last_contact_at = NOW() - INTERVAL '30 days',
         score = 60
     WHERE user_id = $1
     AND connected_user_id = (
       SELECT connected_user_id FROM connections
       WHERE user_id = $1 LIMIT 1
     )
     RETURNING *`,
    [req.userId]
  );
  res.json({ data: conn });
});

// ── Push tokens ────────────────────────────────────────
app.post('/api/push-tokens', requireAuth, async (req, res) => {
  const { token, platform } = req.body;
  if (!token || !platform) return res.status(400).json({ error: 'token and platform required' });
  if (!['ios', 'android'].includes(platform)) return res.status(400).json({ error: 'platform must be ios or android' });

  await db.query(
    `INSERT INTO push_tokens (user_id, token, platform)
     VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET user_id = $1, platform = $3`,
    [req.userId, token, platform]
  );
  res.json({ data: { ok: true } });
});

// ── WhatsApp opt-in ────────────────────────────────────
// POST /api/users/me/whatsapp — save number + opt in/out
app.post('/api/users/me/whatsapp', requireAuth, async (req, res) => {
  const { whatsappNumber, optedIn } = req.body;
  if (typeof optedIn !== 'boolean') {
    return res.status(400).json({ error: 'optedIn (boolean) required' });
  }
  await db.query(
    `UPDATE users
     SET whatsapp_number = COALESCE($1, whatsapp_number),
         whatsapp_opted_in = $2
     WHERE id = $3`,
    [whatsappNumber ?? null, optedIn, req.userId]
  );
  res.json({ data: { ok: true } });
});

// ── WhatsApp webhook ───────────────────────────────────
const whatsappRoutes = require('./routes/whatsapp');
app.use('/whatsapp', whatsappRoutes(db, redisClient));

// ── Start ──────────────────────────────────────────────
const PORT = process.env.PORT ?? 3000;
// ── Nudge engine — runs every 6 hours ──────────────────
const SIX_HOURS = 6 * 60 * 60 * 1000;
setTimeout(() => {
  runNudgeEngine(db);
  setInterval(() => runNudgeEngine(db), SIX_HOURS);
}, 30000); // Wait 30s after startup before first run

app.listen(PORT, () => console.log(`Roots API running on http://localhost:${PORT}`));
