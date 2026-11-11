// ── Trust & safety ─────────────────────────────────────────────────────
// Upload moderation (AWS Rekognition), reports, blocks, suspension, legal hold.
// Apple App Review 1.2 (UGC): filter + report + block + contact info.
// US 18 U.S.C. §2258A: child-safety reports put the account on legal hold so
// evidence is preserved (1 year) and can be reported to NCMEC by the operator.

const { RekognitionClient, DetectModerationLabelsCommand } = require('@aws-sdk/client-rekognition');

const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Rekognition labels (top-level or sub-category) that hold a photo for review.
// Deliberately excludes "Suggestive"/"Swimwear"/"Non-Explicit Nudity…Kissing"
// — too common in a relationships app; those are covered by user reports.
const FLAG_LABELS = new Set([
  'Explicit', 'Explicit Nudity', 'Explicit Sexual Activity', 'Sex Toys',
  'Violence', 'Graphic Violence', 'Graphic Violence Or Gore', 'Self-Harm', 'Self Injury',
  'Visually Disturbing', 'Hate Symbols',
]);
const FLAG_MIN_CONFIDENCE = 80;

const REPORT_REASONS = ['child_safety', 'sexual', 'harassment', 'violence', 'spam', 'other'];
const REPORT_TARGETS = ['photo', 'memory', 'entry', 'user'];
const REASON_LABEL = {
  child_safety: 'Child safety', sexual: 'Nudity or sexual content', harassment: 'Harassment',
  violence: 'Violence', spam: 'Spam', other: 'Other',
};

const adminIds = () => (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const isAdmin = (userId) => adminIds().includes(userId);

// ── Moderation ─────────────────────────────────────────────────────────
// Returns { status: 'approved' | 'pending_review', labels, error? }.
// Fails CLOSED: if Rekognition can't check the image, it's held for review.
async function moderateImage({ bucket, key, bytes }) {
  try {
    const Image = bytes ? { Bytes: bytes } : { S3Object: { Bucket: bucket, Name: key } };
    const r = await rekognition.send(new DetectModerationLabelsCommand({ Image, MinConfidence: 60 }));
    const labels = (r.ModerationLabels || []).map(l => ({
      name: l.Name, parent: l.ParentName || null, confidence: Math.round(l.Confidence * 10) / 10,
    }));
    const flagged = labels.some(l =>
      l.confidence >= FLAG_MIN_CONFIDENCE && (FLAG_LABELS.has(l.name) || FLAG_LABELS.has(l.parent)));
    return { status: flagged ? 'pending_review' : 'approved', labels };
  } catch (err) {
    console.error('[moderation] Rekognition FAILED — holding for review', { key, message: err.message, code: err.name });
    return { status: 'pending_review', labels: null, error: err.name || err.message };
  }
}

const isVideoKey = (key) => /\.(mp4|mov|m4v|webm)$/i.test(key || '');

// ── Push alerts to admins ──────────────────────────────────────────────
async function alertAdmins(db, sendPush, title, body, data = {}) {
  const ids = adminIds();
  if (!ids.length) { console.warn('[safety] ADMIN_USER_IDS not set — no admin alert sent', { title }); return; }
  try {
    const { rows } = await db.query('SELECT token FROM push_tokens WHERE user_id = ANY($1::uuid[])', [ids]);
    await sendPush(rows.map(r => r.token), title, body, data);
  } catch (err) {
    console.error('[safety] admin alert failed', { message: err.message });
  }
}

// ── Blocks ─────────────────────────────────────────────────────────────
// True if either user has blocked the other.
async function isBlockedEitherWay(db, a, b) {
  const { rows } = await db.query(
    `SELECT 1 FROM user_blocks
     WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`, [a, b]);
  return rows.length > 0;
}

async function blockUser(db, blockerId, blockedId) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [blockerId, blockedId]);
    // End the relationship both ways (moments tied to those connections go too)
    await client.query(
      `DELETE FROM contact_events WHERE connection_id IN (
         SELECT id FROM connections
         WHERE (user_id = $1 AND connected_user_id = $2) OR (user_id = $2 AND connected_user_id = $1))`, [blockerId, blockedId]);
    await client.query(
      `DELETE FROM connections
       WHERE (user_id = $1 AND connected_user_id = $2) OR (user_id = $2 AND connected_user_id = $1)`, [blockerId, blockedId]);
    await client.query(
      `DELETE FROM connection_requests
       WHERE (from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1)`, [blockerId, blockedId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ── Reports ────────────────────────────────────────────────────────────
// Resolves who owns the reported content. Returns null if the reporter
// can't reference it (not found).
async function resolveTarget(db, targetType, targetId) {
  const q = {
    photo:  `SELECT user_id AS owner FROM memory_media WHERE id = $1`,
    memory: `SELECT created_by_user_id AS owner FROM events WHERE id = $1`,
    entry:  `SELECT author_id AS owner FROM memory_entries WHERE id = $1`,
    user:   `SELECT id AS owner FROM users WHERE id = $1`,
  }[targetType];
  const { rows: [r] } = await db.query(q, [targetId]);
  return r ? { ownerId: r.owner } : null;
}

async function createReport(db, sendPush, { reporterId, targetType, targetId, reason, details }) {
  if (!REPORT_TARGETS.includes(targetType)) throw Object.assign(new Error('Invalid target'), { status: 400 });
  if (!REPORT_REASONS.includes(reason)) throw Object.assign(new Error('Invalid reason'), { status: 400 });
  const target = await resolveTarget(db, targetType, targetId);
  if (!target) throw Object.assign(new Error('Not found'), { status: 404 });
  if (target.ownerId === reporterId) throw Object.assign(new Error('You cannot report your own content'), { status: 400 });

  const trimmed = typeof details === 'string' ? details.trim().slice(0, 1000) : null;
  const { rows: [report] } = await db.query(
    `INSERT INTO content_reports (reporter_id, target_type, target_id, reported_user_id, reason, details)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [reporterId, targetType, targetId, target.ownerId, reason, trimmed || null]);

  // Child safety: hide from EVERYONE, suspend + legal hold on the account.
  // Content is hidden, never deleted — it must be preserved.
  if (reason === 'child_safety') {
    if (targetType === 'photo')  await db.query(`UPDATE memory_media SET moderation_status = 'removed', moderated_at = now() WHERE id = $1`, [targetId]);
    if (targetType === 'entry')  await db.query(`UPDATE memory_entries SET hidden_at = now() WHERE id = $1`, [targetId]);
    if (targetType === 'memory') await db.query(`UPDATE events SET hidden_at = now() WHERE id = $1`, [targetId]);
    if (target.ownerId) {
      await db.query(`UPDATE users SET legal_hold = true, suspended_at = COALESCE(suspended_at, now()) WHERE id = $1`, [target.ownerId]);
      invalidateSuspension(target.ownerId);
    }
  }

  const urgent = reason === 'child_safety';
  console.log('[safety] report created', { reportId: report.id, targetType, reason, urgent });
  await alertAdmins(db, sendPush,
    urgent ? '🚨 URGENT: child safety report' : 'New report',
    `${REASON_LABEL[reason]} — ${targetType}${urgent ? '. Account suspended and on legal hold.' : ''}`,
    { type: 'safety_report', reportId: report.id });
  return { id: report.id };
}

// ── Account state check (cached, used by requireAuth) ──────────────────
// exists: account not deleted · suspended: locked by moderation ·
// pwdChangedSec: tokens issued before this second are revoked (password change/reset)
const authStateCache = new Map(); // userId -> { exists, suspended, pwdChangedSec, at }
const AUTH_STATE_TTL_MS = 60 * 1000;
function invalidateSuspension(userId) { authStateCache.delete(userId); }
async function getAuthState(db, userId) {
  const hit = authStateCache.get(userId);
  if (hit && Date.now() - hit.at < AUTH_STATE_TTL_MS) return hit;
  const { rows: [u] } = await db.query(
    `SELECT suspended_at, FLOOR(EXTRACT(EPOCH FROM password_changed_at))::bigint AS pwd_sec FROM users WHERE id = $1`, [userId]);
  const state = { exists: !!u, suspended: !!u?.suspended_at, pwdChangedSec: u?.pwd_sec ? Number(u.pwd_sec) : null, at: Date.now() };
  authStateCache.set(userId, state);
  return state;
}
async function isSuspended(db, userId) { return (await getAuthState(db, userId)).suspended; }

module.exports = {
  moderateImage, isVideoKey, alertAdmins, isAdmin,
  isBlockedEitherWay, blockUser, createReport,
  isSuspended, invalidateSuspension, getAuthState,
  REPORT_REASONS, REPORT_TARGETS,
};
