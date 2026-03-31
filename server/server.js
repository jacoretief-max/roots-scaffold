// Roots — Node.js/Express backend scaffold
// Run: node server.js (or use nodemon for dev)
// Requires: npm install express pg redis jsonwebtoken bcrypt cors dotenv

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const redis = require('redis');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' })); // tighten in production

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
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// ── Health check ───────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// ── Auth routes ────────────────────────────────────────

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { displayName, email, password, dateOfBirth, phoneNumber } = req.body;
  if (!displayName || !email || !password || !dateOfBirth) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // 18+ gate — enforced server-side regardless of client
  const dob = new Date(dateOfBirth);
  const ageDiff = Date.now() - dob.getTime();
  const ageYears = ageDiff / (1000 * 60 * 60 * 24 * 365.25);
  if (ageYears < 18) {
    return res.status(400).json({ error: 'Roots is for adults aged 18 and over.' });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await db.query(
      `INSERT INTO users (display_name, email, password_hash, date_of_birth, phone_number)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, display_name, email, avatar_colour, date_of_birth, city, lat, lng, created_at`,
      [displayName, email.toLowerCase(), hash, dateOfBirth, phoneNumber ?? null]
    );
    const user = rows[0];
    const tokens = {
      accessToken: signAccess(user.id),
      refreshToken: signRefresh(user.id),
      expiresAt: Date.now() + 15 * 60 * 1000,
    };
    res.status(201).json({ data: { user, tokens } });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
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

    const tokens = {
      accessToken: signAccess(user.id),
      refreshToken: signRefresh(user.id),
      expiresAt: Date.now() + 15 * 60 * 1000,
    };
    const { password_hash, ...safeUser } = user;
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
            date_of_birth, city, lat, lng, settings, created_at
     FROM users WHERE id = $1`,
    [req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json({ data: rows[0] });
});

// ── Connection routes ──────────────────────────────────

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
    `SELECT c.*, u.display_name, u.avatar_colour, u.city, u.lat, u.lng
     FROM connections c
     JOIN users u ON u.id = c.connected_user_id
     WHERE ${where}
     ORDER BY c.score DESC`,
    params
  );
  res.json({ data: rows });
});

// ── Memory routes ──────────────────────────────────────

// GET /api/memories
app.get('/api/memories', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT e.*, COUNT(me.id) FILTER (WHERE me.is_new = true) AS new_entry_count
     FROM events e
     LEFT JOIN memory_entries me ON me.event_id = e.id
     WHERE $1 = ANY(e.participant_ids)
     GROUP BY e.id
     ORDER BY e.created_at DESC`,
    [req.userId]
  );
  res.json({ data: rows });
});

// GET /api/memories/:id
app.get('/api/memories/:id', requireAuth, async (req, res) => {
  const { rows: [event] } = await db.query(
    'SELECT * FROM events WHERE id = $1 AND $2 = ANY(participant_ids)',
    [req.params.id, req.userId]
  );
  if (!event) return res.status(404).json({ error: 'Not found' });

  const { rows: entries } = await db.query(
    `SELECT me.*, u.display_name, u.avatar_colour
     FROM memory_entries me
     JOIN users u ON u.id = me.author_id
     WHERE me.event_id = $1
     ORDER BY me.created_at ASC`,
    [req.params.id]
  );
  res.json({ data: { ...event, entries } });
});

// POST /api/memories
app.post('/api/memories', requireAuth, async (req, res) => {
  const { title, date, location, lat, lng, music, visibility, participantIds } = req.body;
  const { rows: [event] } = await db.query(
    `INSERT INTO events (title, date, location, lat, lng, music, visibility,
                         participant_ids, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [title, date, location, lat, lng, music ? JSON.stringify(music) : null,
     visibility ?? 'intimate', participantIds ?? [req.userId], req.userId]
  );
  res.status(201).json({ data: event });
});

// POST /api/memories/:id/entries
app.post('/api/memories/:id/entries', requireAuth, async (req, res) => {
  const { text } = req.body;
  const { rows: [entry] } = await db.query(
    `INSERT INTO memory_entries (event_id, author_id, text)
     VALUES ($1, $2, $3) RETURNING *`,
    [req.params.id, req.userId, text]
  );
  res.status(201).json({ data: entry });
});

// ── Media presign (stub — replace with real AWS S3 presign) ──
app.post('/api/media/presign', requireAuth, async (req, res) => {
  // TODO: replace with real AWS SDK presigned URL generation
  // const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  res.json({
    data: {
      uploadUrl: 'https://your-s3-bucket.s3.amazonaws.com/placeholder',
      publicUrl: 'https://your-cdn.com/placeholder',
    },
  });
});

app.post('/api/media/confirm', requireAuth, (_, res) => res.json({ data: { ok: true } }));

// ── Start ──────────────────────────────────────────────
const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`Roots API running on http://localhost:${PORT}`));
