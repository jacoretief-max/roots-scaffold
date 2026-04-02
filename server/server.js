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
       RETURNING
         id,
         display_name as "displayName",
         email,
         avatar_colour as "avatarColour",
         date_of_birth as "dateOfBirth",
         city, lat, lng,
         to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt"`,
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
            avatar_url, date_of_birth, city, lat, lng, settings, created_at
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
    createdAt: u.created_at,
  }});
});

// PATCH /api/users/me — update profile
app.patch('/api/users/me', requireAuth, async (req, res) => {
  const { displayName, city, avatarColour, avatarUrl, phoneNumber } = req.body;
  const { rows: [u] } = await db.query(
    `UPDATE users SET
       display_name    = COALESCE($1, display_name),
       city            = COALESCE($2, city),
       avatar_colour   = COALESCE($3, avatar_colour),
       avatar_url      = COALESCE($4, avatar_url),
       phone_number    = COALESCE($5, phone_number)
     WHERE id = $6
     RETURNING id, display_name, email, phone_number, avatar_colour,
               avatar_url, date_of_birth, city, lat, lng, settings, created_at`,
    [displayName, city, avatarColour, avatarUrl, phoneNumber, req.userId]
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
  if (!valid) return res.status(401).json({ error: 'Current password incorrect' });
  const hash = await bcrypt.hash(newPassword, 12);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.userId]);
  res.json({ data: { ok: true } });
});

// ── Connection routes ──────────────────────────────────

// GET /api/connections/search?q=name
app.get('/api/connections/search', requireAuth, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json({ data: [] });

  const { rows } = await db.query(
    `SELECT
       c.id as "connectionId",
       c.layer,
       c.relation,
       u.id,
       u.display_name as "displayName",
       u.avatar_colour as "avatarColour",
       u.city
     FROM connections c
     JOIN users u ON u.id = c.connected_user_id
     WHERE c.user_id = $1
     AND LOWER(u.display_name) LIKE LOWER($2)
     ORDER BY c.score DESC
     LIMIT 10`,
    [req.userId, `%${q}%`]
  );
  res.json({ data: rows });
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
       to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
       json_build_object(
         'id', u.id,
         'displayName', u.display_name,
         'avatarColour', u.avatar_colour,
         'city', u.city
       ) as "connectedUser"
     FROM connections c
     JOIN users u ON u.id = c.connected_user_id
     WHERE ${where}
     ORDER BY c.score DESC`,
    params
  );
  res.json({ data: rows });
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
       CASE WHEN c.id IS NOT NULL THEN true ELSE false END as "inCircle"
     FROM users u
     LEFT JOIN connections c
       ON c.connected_user_id = u.id AND c.user_id = $1
     WHERE u.id != $1
     AND LOWER(u.display_name) LIKE LOWER($2)
     ORDER BY u.display_name
     LIMIT 20`,
    [req.userId, `%${q}%`]
  );
  res.json({ data: rows });
});

// POST /api/connections
// Add someone to your circle
app.post('/api/connections', requireAuth, async (req, res) => {
  const { connectedUserId, relation, layer, since, contactFrequency } = req.body;
  if (!connectedUserId || !layer) {
    return res.status(400).json({ error: 'connectedUserId and layer required' });
  }

  try {
    const { rows: [connection] } = await db.query(
      `INSERT INTO connections
         (user_id, connected_user_id, relation, layer, since, contact_frequency)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, connected_user_id)
       DO UPDATE SET layer = $4, relation = $3
       RETURNING *`,
      [
        req.userId,
        connectedUserId,
        relation ?? null,
        layer,
        since ?? null,
        contactFrequency ?? 14,
      ]
    );
    res.status(201).json({ data: connection });
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
// Update layer, relation, contact frequency
app.patch('/api/connections/:id', requireAuth, async (req, res) => {
  const { layer, relation, contactFrequency } = req.body;
  const { rows: [connection] } = await db.query(
    `UPDATE connections
     SET
       layer = COALESCE($1, layer),
       relation = COALESCE($2, relation),
       contact_frequency = COALESCE($3, contact_frequency)
     WHERE id = $4 AND user_id = $5
     RETURNING *`,
    [layer, relation, contactFrequency, req.params.id, req.userId]
  );
  if (!connection) return res.status(404).json({ error: 'Connection not found' });
  res.json({ data: connection });
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
       e.lat,
       e.lng,
       e.music,
       e.created_by_user_id as "createdByUserId",
       e.visibility,
       e.participant_ids as "participantIds",
       e.photo_urls as "photoUrls",
       to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
       COUNT(me.id) FILTER (WHERE me.is_new = true) AS "newEntryCount"
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
    `SELECT
       me.id,
       me.event_id as "eventId",
       me.author_id as "authorId",
       me.text,
       me.time,
       me.is_new as "isNew",
       to_char(me.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
       json_build_object(
         'id', u.id,
         'displayName', u.display_name,
         'avatarColour', u.avatar_colour
       ) as author
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

// PATCH /api/memories/:eventId/entries/:entryId
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

// POST /api/media/upload — base64 image upload (dev only)
// Replace with real S3 presign in production
app.post('/api/media/upload', requireAuth, async (req, res) => {
  const { base64, contentType } = req.body;
  if (!base64) return res.status(400).json({ error: 'base64 required' });

  const dataUrl = `data:${contentType ?? 'image/jpeg'};base64,${base64}`;

  await db.query(
    'UPDATE users SET avatar_url = $1 WHERE id = $2',
    [dataUrl, req.userId]
  );

  res.json({ data: { publicUrl: dataUrl } });
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
