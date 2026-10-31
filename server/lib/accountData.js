// ── Account data: export (ZIP) and deletion ────────────────────────────
// Export: builds RootedIn-Export-<date>.zip containing
//   "Open me.html"  — readable memory book (self-contained, works offline)
//   photos/         — original photos referenced by the HTML
//   data.json       — full structured export (portability)
// Visibility rule: the export contains exactly what the user can see in the
// app — the same per-author visibility rules as GET /api/memories/:id.
// Other people's entries/photos are included only where visible, labelled
// with the author's name.

const fs = require('fs');
const os = require('os');
const path = require('path');
const archiver = require('archiver');
const { GetObjectCommand, PutObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const MAX_EXPORT_PHOTO_BYTES = 1024 * 1024 * 1024; // 1 GB of photos per export
const EXPORT_LINK_SECONDS = 60 * 60;               // download link valid 1 hour

// Same layer rule used throughout server.js
const LAYER_MATCH = (vis, layerCol) => `(
  (${vis} = 'intimate'   AND ${layerCol} = 'intimate') OR
  (${vis} = 'close'      AND ${layerCol} IN ('intimate','close')) OR
  (${vis} = 'active'     AND ${layerCol} IN ('intimate','close','active')) OR
  (${vis} = 'meaningful' AND ${layerCol} IN ('intimate','close','active','meaningful'))
)`;

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const safeName = (s) => String(s ?? '').replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'memory';

// ── Data gathering ─────────────────────────────────────────────────────
async function gatherExportData(db, userId) {
  const { rows: [profile] } = await db.query(
    `SELECT display_name as "displayName", email, phone_number as "phoneNumber",
            to_char(date_of_birth, 'YYYY-MM-DD') as "dateOfBirth", city, bio,
            avatar_colour as "avatarColour",
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt"
     FROM users WHERE id = $1`, [userId]);
  if (!profile) throw new Error('User not found');

  const { rows: connections } = await db.query(
    `SELECT c.id,
            COALESCE(u.display_name, c.offline_name) as name,
            (c.connected_user_id IS NULL) as "isOffline",
            c.relation, c.layer, c.since, c.status,
            c.contact_frequency as "contactFrequencyDays", c.score,
            to_char(c.last_contact_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "lastContactAt",
            c.offline_phone as phone, c.offline_email as email,
            to_char(c.offline_dob, 'YYYY-MM-DD') as "dateOfBirth"
     FROM connections c
     LEFT JOIN users u ON u.id = c.connected_user_id
     WHERE c.user_id = $1
     ORDER BY CASE c.layer WHEN 'intimate' THEN 1 WHEN 'close' THEN 2 WHEN 'active' THEN 3 ELSE 4 END, name`,
    [userId]);

  const { rows: moments } = await db.query(
    `SELECT ce.type, ce.title, ce.note,
            to_char(ce.date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as date,
            COALESCE(u.display_name, c.offline_name) as "with"
     FROM contact_events ce
     LEFT JOIN connections c ON c.id = ce.connection_id
     LEFT JOIN users u ON u.id = c.connected_user_id
     WHERE ce.user_id = $1
     ORDER BY ce.date DESC`,
    [userId]);

  // Events visible to the user — same rule as GET /api/memories
  const { rows: events } = await db.query(
    `SELECT e.id, e.title, to_char(e.date, 'YYYY-MM-DD') as date, e.location, e.visibility,
            e.music, e.participant_ids as "participantIds",
            e.offline_participant_connection_ids as "offlineParticipantConnectionIds",
            e.photo_urls as "photoUrls",
            e.created_by_user_id as "createdByUserId",
            cu.display_name as "createdBy"
     FROM events e
     JOIN users cu ON cu.id = e.created_by_user_id
     WHERE e.created_by_user_id = $1
        OR $1 = ANY(e.participant_ids)
        OR EXISTS (
          SELECT 1
          FROM (
            SELECT e.created_by_user_id AS author_id
            UNION SELECT me.author_id FROM memory_entries me WHERE me.event_id = e.id
            UNION SELECT mm.user_id    FROM memory_media  mm WHERE mm.event_id = e.id
          ) authors
          LEFT JOIN memory_author_visibility mav
            ON mav.event_id = e.id AND mav.user_id = authors.author_id
          JOIN connections c
            ON c.user_id = authors.author_id AND c.connected_user_id = $1 AND c.status = 'active'
          WHERE COALESCE(mav.visibility, e.visibility) != 'onlyUs'
            AND ${LAYER_MATCH('COALESCE(mav.visibility, e.visibility)', 'c.layer')}
        )
     ORDER BY e.date DESC, e.created_at DESC`,
    [userId]);

  const memories = [];
  for (const e of events) {
    const params = [e.id, userId, e.participantIds, e.visibility];
    const visibleClause = (authorCol) => `(
      ${authorCol} = $2
      OR $2 = ANY($3::uuid[])
      OR EXISTS (
        SELECT 1 FROM connections c
        WHERE c.user_id = ${authorCol} AND c.connected_user_id = $2 AND c.status = 'active'
          AND ${LAYER_MATCH('COALESCE(mav.visibility, $4)', 'c.layer')}
      )
    )`;
    const { rows: entries } = await db.query(
      `SELECT u.display_name as author, (me.author_id = $2) as "isMine", me.text, me.time,
              to_char(me.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt"
       FROM memory_entries me
       JOIN users u ON u.id = me.author_id
       LEFT JOIN memory_author_visibility mav ON mav.event_id = me.event_id AND mav.user_id = me.author_id
       WHERE me.event_id = $1 AND ${visibleClause('me.author_id')}
       ORDER BY me.created_at ASC`, params);
    const { rows: media } = await db.query(
      `SELECT mm.url, mm.caption, COALESCE(u.display_name, 'Former member') as "uploadedBy",
              COALESCE(mm.user_id = $2, false) as "isMine"
       FROM memory_media mm
       LEFT JOIN users u ON u.id = mm.user_id
       LEFT JOIN memory_author_visibility mav ON mav.event_id = mm.event_id AND mav.user_id = mm.user_id
       WHERE mm.event_id = $1 AND (mm.user_id IS NULL OR ${visibleClause('mm.user_id')})
       ORDER BY mm.created_at ASC`, params);
    const { rows: people } = await db.query(
      `SELECT display_name as name FROM users WHERE id = ANY($1::uuid[])
       UNION ALL
       SELECT offline_name FROM connections WHERE id = ANY($2::uuid[])`,
      [e.participantIds || [], e.offlineParticipantConnectionIds || []]);

    memories.push({
      title: e.title, date: e.date, location: e.location, music: e.music,
      createdBy: e.createdByUserId === userId ? 'You' : e.createdBy,
      people: people.map(p => p.name).filter(Boolean),
      entries: entries.map(en => ({ ...en, author: en.isMine ? 'You' : en.author })),
      // Legacy photo_urls on the event belong to its creator
      photos: [
        ...((e.photoUrls || []).map(url => ({ url, caption: null, uploadedBy: e.createdByUserId === userId ? 'You' : e.createdBy }))),
        ...media.map(m => ({ url: m.url, caption: m.caption, uploadedBy: m.isMine ? 'You' : m.uploadedBy })),
      ],
    });
  }
  return { profile, connections, moments, memories };
}

// ── Photo fetching ─────────────────────────────────────────────────────
function s3KeyFromUrl(url, s3BaseUrl) {
  if (typeof url !== 'string' || !url.startsWith(s3BaseUrl + '/')) return null;
  return decodeURIComponent(url.slice(s3BaseUrl.length + 1).split('?')[0]);
}

async function fetchPhoto(url, { s3, bucket, s3BaseUrl }) {
  if (url.startsWith('data:')) {
    const m = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!m) return null;
    return { buf: Buffer.from(m[3], m[2] ? 'base64' : 'utf8'), type: m[1] || 'image/jpeg' };
  }
  const key = s3KeyFromUrl(url, s3BaseUrl);
  if (key) {
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const buf = Buffer.from(await obj.Body.transformToByteArray());
    return { buf, type: obj.ContentType || '' , ext: path.extname(key).slice(1) };
  }
  if (/^https?:\/\//.test(url)) {
    const r = await fetch(url);
    if (!r.ok) return null;
    return { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') || '' };
  }
  return null;
}

const extFor = (type, fallback) => {
  if (fallback) return fallback === 'jpeg' ? 'jpg' : fallback;
  if (/png/.test(type)) return 'png';
  if (/webp/.test(type)) return 'webp';
  if (/mp4/.test(type)) return 'mp4';
  if (/quicktime/.test(type)) return 'mov';
  return 'jpg';
};

// ── HTML memory book ───────────────────────────────────────────────────
const LAYER_LABEL = { intimate: 'Intimate (5)', close: 'Close (15)', active: 'Active (50)', meaningful: 'Meaningful (150)' };

function buildHtml(data, exportedAt) {
  const { profile, connections, moments, memories } = data;
  const fmtDate = (d) => {
    if (!d) return '';
    const dt = new Date(d.length === 10 ? d + 'T12:00:00Z' : d);
    return isNaN(dt) ? esc(d) : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  };
  const media = (p) => /\.(mp4|mov)$/i.test(p.file)
    ? `<video controls src="${esc(p.file)}"></video>`
    : `<img loading="lazy" src="${esc(p.file)}" alt="${esc(p.caption || 'Photo')}" />`;

  const memoryHtml = memories.map(m => `
    <article class="memory">
      <div class="m-date">${fmtDate(m.date)}${m.location ? ` · ${esc(m.location)}` : ''}</div>
      <h3>${esc(m.title)}</h3>
      ${m.people.length ? `<div class="m-people">With ${esc(m.people.join(', '))}</div>` : ''}
      ${m.music?.title ? `<div class="m-music">♪ ${esc(m.music.title)}${m.music.artist ? ' — ' + esc(m.music.artist) : ''}</div>` : ''}
      ${m.entries.map(en => `
        <blockquote class="${en.isMine ? 'mine' : ''}">
          <p>${esc(en.text).replace(/\n/g, '<br>')}</p>
          <cite>${esc(en.author)}${en.time ? ' · ' + esc(en.time) : ''}</cite>
        </blockquote>`).join('')}
      ${m.photos.some(p => p.file) ? `<div class="photos">${m.photos.filter(p => p.file).map(p => `
        <figure>${media(p)}${p.caption || p.uploadedBy !== 'You' ? `<figcaption>${esc(p.caption || '')}${p.uploadedBy !== 'You' ? `<span>${p.caption ? ' · ' : ''}by ${esc(p.uploadedBy)}</span>` : ''}</figcaption>` : ''}</figure>`).join('')}</div>` : ''}
      ${m.photos.some(p => p.missing) ? `<div class="note">Some photos could not be included in this export.</div>` : ''}
    </article>`).join('');

  const circleHtml = ['intimate', 'close', 'active', 'meaningful'].map(layer => {
    const people = connections.filter(c => c.layer === layer);
    if (!people.length) return '';
    return `<div class="layer"><h4>${LAYER_LABEL[layer]}</h4><ul>${people.map(c =>
      `<li><strong>${esc(c.name)}</strong>${c.relation ? ` — ${esc(c.relation)}` : ''}${c.since ? ` <span class="muted">· since ${esc(c.since)}</span>` : ''}</li>`).join('')}</ul></div>`;
  }).join('');

  const momentsHtml = moments.length ? `<ul class="moments">${moments.map(mo =>
    `<li><span class="muted">${fmtDate(mo.date)}</span> ${esc(mo.title || mo.type)}${mo.with ? ` with <strong>${esc(mo.with)}</strong>` : ''}${mo.note ? `<div class="mo-note">${esc(mo.note)}</div>` : ''}</li>`).join('')}</ul>` : '<p class="muted">No moments logged.</p>';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(profile.displayName)} — Rooted In memories</title>
<style>
:root{--bg:#FAF6F0;--card:#FFFFFF;--ink:#2B2420;--muted:#8A7F76;--accent:#C45A3A;--tan:#E8DCCB;--sage:#7A8B6F}
@media (prefers-color-scheme:dark){:root{--bg:#1B1715;--card:#262019;--ink:#F1E9DF;--muted:#A99C90;--tan:#3A3129}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 Georgia,'Times New Roman',serif}
.wrap{max-width:760px;margin:0 auto;padding:40px 16px 80px}
header h1{font-size:2.2rem;margin:.2em 0}.eyebrow{color:var(--accent);font:600 .75rem/1 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase}
.muted{color:var(--muted)}nav{margin:20px 0 8px;font:500 .9rem system-ui,sans-serif}nav a{color:var(--accent);margin-right:16px}
h2{margin:48px 0 16px;padding-bottom:8px;border-bottom:1px solid var(--tan);font-size:1.6rem}
.memory{background:var(--card);border:1px solid var(--tan);border-radius:14px;padding:22px;margin:0 0 20px}
.memory h3{margin:.15em 0 .3em;font-size:1.35rem}.m-date,.m-people,.m-music{font:.85rem system-ui,sans-serif;color:var(--muted)}
blockquote{margin:14px 0;padding:10px 16px;border-left:3px solid var(--tan)}blockquote.mine{border-left-color:var(--accent)}
blockquote p{margin:0}cite{display:block;margin-top:4px;font:italic .8rem system-ui,sans-serif;color:var(--muted)}
.photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-top:14px}
figure{margin:0}figure img,figure video{width:100%;border-radius:10px;display:block;background:var(--tan)}
figcaption{font:.8rem system-ui,sans-serif;color:var(--muted);margin-top:4px}
.layer h4{margin:18px 0 6px;color:var(--accent);font:600 .8rem system-ui,sans-serif;text-transform:uppercase;letter-spacing:.1em}
.layer ul,.moments{list-style:none;padding:0;margin:0}.layer li,.moments li{padding:6px 0;border-bottom:1px solid var(--tan)}
.mo-note{font-size:.9rem;color:var(--muted)}.note{font:.8rem system-ui,sans-serif;color:var(--muted);margin-top:8px}
footer{margin-top:56px;font:.8rem system-ui,sans-serif;color:var(--muted)}
</style></head><body><div class="wrap">
<header><div class="eyebrow">Rooted In</div><h1>${esc(profile.displayName)}</h1>
<div class="muted">Exported ${fmtDate(exportedAt)} · ${memories.length} memories · ${connections.length} people in your circle</div>
<nav><a href="#memories">Memories</a><a href="#circle">Your circle</a><a href="#moments">Moments</a></nav></header>
<h2 id="memories">Memories</h2>${memoryHtml || '<p class="muted">No memories yet.</p>'}
<h2 id="circle">Your circle</h2>${circleHtml || '<p class="muted">No connections yet.</p>'}
<h2 id="moments">Moments</h2>${momentsHtml}
<footer>Exported from Rooted In by Rooikat Labs LLC. The full data is in data.json; original photos are in the photos folder.
Entries and photos by other people are included because they were shared with you in the app.</footer>
</div></body></html>`;
}

// ── Build export ZIP → S3 → presigned link ─────────────────────────────
async function createExport(db, userId, { s3, bucket, s3BaseUrl }) {
  const exportedAt = new Date().toISOString();
  const data = await gatherExportData(db, userId);
  const stamp = exportedAt.slice(0, 10);
  const zipName = `RootedIn-Export-${stamp}.zip`;
  const tmpPath = path.join(os.tmpdir(), `export-${userId}-${Date.now()}.zip`);

  const out = fs.createWriteStream(tmpPath);
  const zip = archiver('zip', { zlib: { level: 6 } });
  const done = new Promise((resolve, reject) => { out.on('close', resolve); zip.on('error', reject); out.on('error', reject); });
  zip.pipe(out);

  let photoBytes = 0, photoCount = 0, skipped = 0, n = 0;
  for (const m of data.memories) {
    for (const p of m.photos) {
      n += 1;
      try {
        if (photoBytes > MAX_EXPORT_PHOTO_BYTES) { p.missing = true; skipped++; continue; }
        const got = await fetchPhoto(p.url, { s3, bucket, s3BaseUrl });
        if (!got) { p.missing = true; skipped++; continue; }
        const file = `photos/${m.date || 'undated'}_${safeName(m.title)}_${String(n).padStart(4, '0')}.${extFor(got.type, got.ext)}`;
        zip.append(got.buf, { name: file });
        p.file = file; photoBytes += got.buf.length; photoCount++;
      } catch (err) {
        console.error('[export] photo failed', { userId, message: err.message });
        p.missing = true; skipped++;
      }
    }
  }

  // data.json: no internal URLs, just file references
  const json = {
    exportedAt, app: 'Rooted In', publisher: 'Rooikat Labs LLC',
    profile: data.profile,
    connections: data.connections.map(({ id, ...c }) => c),
    moments: data.moments,
    memories: data.memories.map(m => ({
      ...m,
      entries: m.entries.map(({ isMine, ...en }) => en),
      photos: m.photos.map(p => ({ file: p.file || null, caption: p.caption, uploadedBy: p.uploadedBy, included: !!p.file })),
    })),
  };
  zip.append(JSON.stringify(json, null, 2), { name: 'data.json' });
  zip.append(buildHtml(data, exportedAt), { name: 'Open me.html' });
  await zip.finalize();
  await done;

  const size = fs.statSync(tmpPath).size;
  const key = `exports/${userId}/${Date.now()}-${zipName}`;
  try {
    await s3.send(new PutObjectCommand({
      Bucket: bucket, Key: key, Body: fs.createReadStream(tmpPath), ContentLength: size,
      ContentType: 'application/zip',
      ContentDisposition: `attachment; filename="${zipName}"`,
    }));
  } finally {
    fs.unlink(tmpPath, () => {});
  }
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: EXPORT_LINK_SECONDS });
  console.log('[export] created', { userId, memories: data.memories.length, photos: photoCount, skipped, bytes: size });
  return { url, fileName: zipName, sizeBytes: size, expiresAt: new Date(Date.now() + EXPORT_LINK_SECONDS * 1000).toISOString(), photosSkipped: skipped };
}

// ── Account deletion ───────────────────────────────────────────────────
async function deleteAccount(db, userId, { s3, bucket, s3BaseUrl }, { keepPhotosOnOthers = false } = {}) {
  // Photos the user added to OTHER people's memories, if they chose to keep them
  const { rows: keptRows } = keepPhotosOnOthers ? await db.query(
    `SELECT mm.url FROM memory_media mm JOIN events e ON e.id = mm.event_id
     WHERE mm.user_id = $1 AND e.created_by_user_id != $1`, [userId]) : { rows: [] };
  const keptKeys = new Set(keptRows.map(r => s3KeyFromUrl(r.url, s3BaseUrl)).filter(Boolean));

  // 1. Collect S3 objects to remove after the DB commit
  const urls = new Set();
  const { rows: mediaRows } = await db.query(
    `SELECT mm.url FROM memory_media mm JOIN events e ON e.id = mm.event_id
     WHERE (mm.user_id = $1 OR e.created_by_user_id = $1)
       AND NOT ($2 AND mm.user_id = $1 AND e.created_by_user_id != $1)`, [userId, keepPhotosOnOthers]);
  mediaRows.forEach(r => urls.add(r.url));
  const { rows: evRows } = await db.query(
    `SELECT unnest(photo_urls) as url FROM events WHERE created_by_user_id = $1`, [userId]);
  evRows.forEach(r => urls.add(r.url));
  const { rows: audioRows } = await db.query(
    `SELECT audio_url as url FROM contact_events WHERE user_id = $1 AND audio_url IS NOT NULL`, [userId]);
  audioRows.forEach(r => urls.add(r.url));
  const { rows: [u] } = await db.query(
    `SELECT avatar_url as "avatarUrl", settings->>'bgUrl' as "bgUrl" FROM users WHERE id = $1`, [userId]);
  if (u?.avatarUrl) urls.add(u.avatarUrl);
  if (u?.bgUrl) urls.add(u.bgUrl);
  const keys = new Set([...urls].map(x => s3KeyFromUrl(x, s3BaseUrl)).filter(Boolean));

  // 2. Delete everything in one transaction
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const ownEvents = `SELECT id FROM events WHERE created_by_user_id = $1`;
    const userConns = `SELECT id FROM connections WHERE user_id = $1 OR connected_user_id = $1`;
    await client.query(`UPDATE contact_events SET memory_event_id = NULL WHERE memory_event_id IN (${ownEvents})`, [userId]);
    await client.query(`DELETE FROM contact_events WHERE user_id = $1 OR connection_id IN (${userConns})`, [userId]);
    await client.query(`DELETE FROM memory_views WHERE user_id = $1 OR event_id IN (${ownEvents})`, [userId]);
    if (keepPhotosOnOthers) {
      // Keep them on others' memories as "Former member" (requires migrate_phase7_media_keep.sql)
      await client.query(
        `UPDATE memory_media SET user_id = NULL
         WHERE user_id = $1 AND event_id NOT IN (${ownEvents})`, [userId]);
    }
    await client.query(`DELETE FROM memory_media WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM memory_entries WHERE author_id = $1`, [userId]);
    await client.query(`DELETE FROM memory_author_visibility WHERE user_id = $1 OR event_id IN (${ownEvents})`, [userId]);
    await client.query(`DELETE FROM events WHERE created_by_user_id = $1`, [userId]);
    await client.query(`UPDATE events SET participant_ids = array_remove(participant_ids, $1::uuid) WHERE $1::uuid = ANY(participant_ids)`, [userId]);
    await client.query(`DELETE FROM invites WHERE from_user_id = $1`, [userId]);
    // Cascades: connections, connection_requests, push_tokens. sms_consents → SET NULL (kept as evidence).
    const { rowCount } = await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
    if (rowCount !== 1) throw new Error('User row not deleted');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // 3. Remove files (best effort — the account is already gone)
  const prefixes = ['memories', 'avatars', 'audio', 'exports', 'backgrounds'].map(f => `${f}/${userId}/`);
  for (const Prefix of prefixes) {
    try {
      let token;
      do {
        const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix, ContinuationToken: token }));
        (r.Contents || []).forEach(o => keys.add(o.Key));
        token = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (token);
    } catch (err) {
      console.error('[delete-account] list failed', { userId, Prefix, message: err.message });
    }
  }
  keptKeys.forEach(k => keys.delete(k)); // never delete files the user chose to keep
  const all = [...keys];
  let failed = 0;
  for (let i = 0; i < all.length; i += 1000) {
    try {
      const r = await s3.send(new DeleteObjectsCommand({
        Bucket: bucket, Delete: { Objects: all.slice(i, i + 1000).map(Key => ({ Key })), Quiet: true },
      }));
      failed += (r.Errors || []).length;
    } catch (err) {
      failed += all.slice(i, i + 1000).length;
      console.error('[delete-account] S3 delete failed', { userId, message: err.message });
    }
  }
  console.log('[delete-account] done', { userId, filesDeleted: all.length - failed, filesFailed: failed, photosKept: keptKeys.size });
  return { filesDeleted: all.length - failed, filesFailed: failed, photosKept: keptKeys.size };
}

module.exports = { createExport, deleteAccount, gatherExportData, buildHtml };
