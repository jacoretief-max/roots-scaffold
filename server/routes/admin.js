// ── Admin review API (/api/admin/*) ────────────────────────────────────
// Used by the review page at admin.rooikatlabs.com (see admin/index.html).
// Three locks on every route:
//   1. Cloudflare Access — when CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD are set,
//      the request must carry a valid Cloudflare Access token (only requests
//      that came through admin.rooikatlabs.com have one).
//   2. A normal Roots login (JWT).
//   3. The user must be listed in ADMIN_USER_IDS.
// Every decision is written to admin_actions (audit log).

const express = require('express');
const { createRemoteJWKSet, jwtVerify } = require('jose');

module.exports = function adminRouter({ db, requireAuth, safety, s3, bucket, s3BaseUrl, getSignedUrl, GetObjectCommand }) {
  const router = express.Router();

  // ── Lock 1: Cloudflare Access ────────────────────────
  const team = (process.env.CF_ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const aud = process.env.CF_ACCESS_AUD;
  const jwks = team && aud ? createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`)) : null;
  if (!jwks) console.warn('[admin] CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD not set — Cloudflare Access check is OFF');

  const cfCookie = (req) => (req.headers.cookie || '').split(';').map(s => s.trim())
    .find(c => c.startsWith('CF_Authorization='))?.slice('CF_Authorization='.length);

  async function requireCloudflareAccess(req, res, next) {
    if (!jwks) return next();
    const token = req.headers['cf-access-jwt-assertion'] || cfCookie(req);
    if (!token) return res.status(403).json({ error: 'Forbidden' });
    try {
      const { payload } = await jwtVerify(token, jwks, { issuer: `https://${team}`, audience: aud });
      req.cfAccessEmail = payload.email || null;
      next();
    } catch (err) {
      console.warn('[admin] Cloudflare Access token rejected', { message: err.message });
      res.status(403).json({ error: 'Forbidden' });
    }
  }

  // ── Lock 3: admin list ───────────────────────────────
  const requireAdmin = (req, res, next) =>
    safety.isAdmin(req.userId) ? next() : res.status(404).json({ error: 'Not found' });

  const noStore = (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };

  router.use(noStore, requireCloudflareAccess, requireAuth, requireAdmin);

  // ── Helpers ──────────────────────────────────────────
  const keyFromUrl = (url) => (typeof url === 'string' && url.startsWith(s3BaseUrl + '/'))
    ? decodeURIComponent(url.slice(s3BaseUrl.length + 1).split('?')[0]) : null;
  const viewUrl = async (url) => {
    const key = keyFromUrl(url);
    return key ? getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 600 }) : null;
  };
  const kindOf = (url) => /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url || '') ? 'video' : 'image';
  const cleanNote = (n) => (typeof n === 'string' && n.trim() ? n.trim().slice(0, 2000) : null);

  async function audit(req, action, targetType, targetId, note, details) {
    await db.query(
      `INSERT INTO admin_actions (admin_id, action, target_type, target_id, note, details) VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.userId, action, targetType, targetId || null, note || null, details ? JSON.stringify({ ...details, cfEmail: req.cfAccessEmail }) : (req.cfAccessEmail ? JSON.stringify({ cfEmail: req.cfAccessEmail }) : null)]);
  }

  // ── Who am I / queue counts ──────────────────────────
  router.get('/me', async (req, res) => {
    const { rows: [u] } = await db.query('SELECT display_name AS "displayName", email FROM users WHERE id = $1', [req.userId]);
    res.json({ data: { isAdmin: true, ...u, cfAccess: !!jwks } });
  });

  router.get('/summary', async (_req, res) => {
    const { rows: [r] } = await db.query(
      `SELECT (SELECT COUNT(*)::int FROM memory_media WHERE moderation_status = 'pending_review') AS "pendingMedia",
              (SELECT COUNT(*)::int FROM memory_media WHERE moderation_status = 'pending_review'
                 AND url ~* '\\.(mp4|mov|m4v|webm)$') AS "pendingVideos",
              (SELECT COUNT(*)::int FROM content_reports WHERE status = 'open') AS "openReports",
              (SELECT COUNT(*)::int FROM content_reports WHERE status = 'open' AND reason = 'child_safety') AS "openChildSafety"`);
    res.json({ data: r });
  });

  // ── Held media ───────────────────────────────────────
  // GET /media?status=pending_review|removed
  router.get('/media', async (req, res) => {
    const status = ['pending_review', 'removed', 'approved'].includes(req.query.status) ? req.query.status : 'pending_review';
    const { rows } = await db.query(
      `SELECT mm.id, mm.url, mm.moderation_labels AS labels, mm.moderation_status AS status,
              mm.created_at AS "createdAt", mm.moderated_at AS "moderatedAt", mm.caption,
              e.id AS "memoryId", e.title AS "memoryTitle",
              u.id AS "uploaderId", u.display_name AS "uploader", u.email AS "uploaderEmail",
              u.suspended_at AS "uploaderSuspendedAt", COALESCE(u.legal_hold, false) AS "uploaderLegalHold",
              (SELECT COUNT(*)::int FROM content_reports cr WHERE cr.target_type = 'photo' AND cr.target_id = mm.id) AS "reportCount",
              EXISTS (SELECT 1 FROM content_reports cr WHERE cr.target_type = 'photo' AND cr.target_id = mm.id AND cr.reason = 'child_safety') AS sensitive
       FROM memory_media mm
       JOIN events e ON e.id = mm.event_id
       LEFT JOIN users u ON u.id = mm.user_id
       WHERE mm.moderation_status = $1
       ORDER BY ${status === 'pending_review' ? 'mm.created_at ASC' : 'mm.moderated_at DESC NULLS LAST'}
       LIMIT 200`, [status]);
    const data = await Promise.all(rows.map(async r => ({ ...r, kind: kindOf(r.url), viewUrl: await viewUrl(r.url), url: undefined })));
    res.json({ data });
  });

  // POST /media/:id { action: approve|remove, note?, suspendUploader? }
  router.post('/media/:id', async (req, res) => {
    const next = { approve: 'approved', remove: 'removed' }[req.body?.action];
    if (!next) return res.status(400).json({ error: "action must be 'approve' or 'remove'" });
    const note = cleanNote(req.body.note);
    const { rows: [m] } = await db.query(
      `UPDATE memory_media SET moderation_status = $1, moderated_at = now() WHERE id = $2 RETURNING user_id`, [next, req.params.id]);
    if (!m) return res.status(404).json({ error: 'Not found' });
    await audit(req, `media.${req.body.action}`, 'photo', req.params.id, note);
    if (next === 'removed' && req.body.suspendUploader && m.user_id) {
      await db.query(`UPDATE users SET suspended_at = COALESCE(suspended_at, now()) WHERE id = $1`, [m.user_id]);
      safety.invalidateSuspension(m.user_id);
      await audit(req, 'user.suspend', 'user', m.user_id, note, { via: 'media', mediaId: req.params.id });
    }
    console.log('[admin] media decision', { admin: req.userId, mediaId: req.params.id, status: next, suspended: !!req.body.suspendUploader });
    res.json({ data: { id: req.params.id, status: next } });
  });

  // ── Reports ──────────────────────────────────────────
  // GET /reports?status=open|actioned|dismissed — with a preview of the reported item
  router.get('/reports', async (req, res) => {
    const status = ['open', 'actioned', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
    const { rows } = await db.query(
      `SELECT r.id, r.target_type AS "targetType", r.target_id AS "targetId", r.reason, r.details, r.status,
              r.created_at AS "createdAt", r.resolved_at AS "resolvedAt", r.resolution_note AS "resolutionNote",
              rep.display_name AS reporter,
              tgt.id AS "reportedUserId", tgt.display_name AS "reportedUser", tgt.email AS "reportedUserEmail",
              tgt.suspended_at AS "reportedUserSuspendedAt", COALESCE(tgt.legal_hold, false) AS "reportedUserLegalHold"
       FROM content_reports r
       LEFT JOIN users rep ON rep.id = r.reporter_id
       LEFT JOIN users tgt ON tgt.id = r.reported_user_id
       WHERE r.status = $1
       ORDER BY (r.reason = 'child_safety') DESC, r.created_at ${status === 'open' ? 'ASC' : 'DESC'}
       LIMIT 200`, [status]);

    const data = await Promise.all(rows.map(async r => {
      let preview = null;
      if (r.targetType === 'photo') {
        const { rows: [m] } = await db.query(
          `SELECT mm.url, mm.moderation_status AS status, e.title FROM memory_media mm JOIN events e ON e.id = mm.event_id WHERE mm.id = $1`, [r.targetId]);
        if (m) preview = { kind: kindOf(m.url), viewUrl: await viewUrl(m.url), status: m.status, memoryTitle: m.title };
      } else if (r.targetType === 'entry') {
        const { rows: [en] } = await db.query(
          `SELECT me.text, me.hidden_at AS "hiddenAt", e.title FROM memory_entries me JOIN events e ON e.id = me.event_id WHERE me.id = $1`, [r.targetId]);
        if (en) preview = { kind: 'entry', text: en.text, hidden: !!en.hiddenAt, memoryTitle: en.title };
      } else if (r.targetType === 'memory') {
        const { rows: [e] } = await db.query(
          `SELECT title, to_char(date, 'YYYY-MM-DD') AS date, location, hidden_at AS "hiddenAt" FROM events WHERE id = $1`, [r.targetId]);
        if (e) preview = { kind: 'memory', title: e.title, date: e.date, location: e.location, hidden: !!e.hiddenAt };
      } else if (r.targetType === 'user') {
        preview = { kind: 'user', displayName: r.reportedUser };
      }
      return { ...r, preview, sensitive: r.reason === 'child_safety' };
    }));
    res.json({ data });
  });

  // POST /reports/:id { status: actioned|dismissed, note? }
  router.post('/reports/:id', async (req, res) => {
    const { status } = req.body ?? {};
    if (!['actioned', 'dismissed'].includes(status)) return res.status(400).json({ error: "status must be 'actioned' or 'dismissed'" });
    const note = cleanNote(req.body.note);
    const { rowCount } = await db.query(
      `UPDATE content_reports SET status = $1, resolution_note = $2, resolved_at = now() WHERE id = $3`, [status, note, req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    await audit(req, `report.${status}`, 'report', req.params.id, note);
    res.json({ data: { id: req.params.id, status } });
  });

  // ── Hide / unhide entries and memories ───────────────
  const hideRoute = (table, targetType) => async (req, res) => {
    const action = req.body?.action;
    if (!['hide', 'unhide'].includes(action)) return res.status(400).json({ error: "action must be 'hide' or 'unhide'" });
    const { rowCount } = await db.query(
      `UPDATE ${table} SET hidden_at = ${action === 'hide' ? 'COALESCE(hidden_at, now())' : 'NULL'} WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    await audit(req, `${targetType}.${action}`, targetType, req.params.id, cleanNote(req.body.note));
    res.json({ data: { id: req.params.id, action } });
  };
  router.post('/entries/:id', hideRoute('memory_entries', 'entry'));
  router.post('/memories/:id', hideRoute('events', 'memory'));

  // ── Accounts ─────────────────────────────────────────
  // POST /users/:id { action: suspend|unsuspend|hold|release, note? }
  router.post('/users/:id', async (req, res) => {
    const sql = {
      suspend:   `UPDATE users SET suspended_at = COALESCE(suspended_at, now()) WHERE id = $1`,
      unsuspend: `UPDATE users SET suspended_at = NULL WHERE id = $1`,
      hold:      `UPDATE users SET legal_hold = true WHERE id = $1`,
      release:   `UPDATE users SET legal_hold = false WHERE id = $1`,
    }[req.body?.action];
    if (!sql) return res.status(400).json({ error: 'action must be suspend, unsuspend, hold or release' });
    const { rowCount } = await db.query(sql, [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    safety.invalidateSuspension(req.params.id);
    await audit(req, `user.${req.body.action}`, 'user', req.params.id, cleanNote(req.body.note));
    console.log('[admin] user action', { admin: req.userId, userId: req.params.id, action: req.body.action });
    res.json({ data: { id: req.params.id, action: req.body.action } });
  });

  // ── Audit log ────────────────────────────────────────
  router.get('/audit', async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const { rows } = await db.query(
      `SELECT a.id, a.action, a.target_type AS "targetType", a.target_id AS "targetId", a.note, a.created_at AS "createdAt",
              u.display_name AS admin
       FROM admin_actions a LEFT JOIN users u ON u.id = a.admin_id
       ORDER BY a.created_at DESC LIMIT $1`, [limit]);
    res.json({ data: rows });
  });

  return router;
};
