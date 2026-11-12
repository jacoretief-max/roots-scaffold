#!/usr/bin/env node
/**
 * Seed (or re-create) the App Review demo account with realistic data.
 *
 *   node server/scripts/seed-reviewer.js            create if missing, otherwise do nothing
 *   node server/scripts/seed-reviewer.js --reset    delete the demo accounts and create them fresh
 *
 * Needs in server/.env (or the environment):
 *   DATABASE_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET
 *   REVIEWER_PASSWORD   — the password you give Apple (never committed; this repo is public)
 *   REVIEWER_EMAIL      — optional, default review@rooikatlabs.com
 *
 * Photos: put JPEGs in server/scripts/reviewer-photos/ (git-ignored). Strip GPS and
 * faces you don't want Apple to see before adding them. Files are matched by name below.
 *
 * Friends are fake accounts (@rootsdebug.local, no phone numbers, random passwords).
 * Nothing here touches any other account.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { deleteAccount } = require('../lib/accountData');

const RESET = process.argv.includes('--reset');
const REVIEWER_EMAIL = (process.env.REVIEWER_EMAIL || 'review@rooikatlabs.com').toLowerCase();
const REVIEWER_PASSWORD = process.env.REVIEWER_PASSWORD;
const PHOTO_DIR = process.env.REVIEWER_PHOTO_DIR || path.join(__dirname, 'reviewer-photos');
const BUCKET = process.env.AWS_S3_BUCKET;
const REGION = process.env.AWS_REGION ?? 'us-east-1';
const S3_BASE_URL = `https://${BUCKET}.s3.${REGION}.amazonaws.com`;

if (!REVIEWER_PASSWORD || REVIEWER_PASSWORD.length < 10) {
  console.error('Set REVIEWER_PASSWORD (10+ characters) in server/.env or the environment.');
  process.exit(1);
}
for (const k of ['DATABASE_URL', 'AWS_S3_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']) {
  if (!process.env[k]) { console.error(`Missing ${k}`); process.exit(1); }
}

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const s3 = new S3Client({
  region: REGION,
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
});

// ── The cast ───────────────────────────────────────────
const REVIEWER = { key: 'me', name: 'Alex Morgan', email: REVIEWER_EMAIL, dob: '1986-04-12', city: 'Denver', lat: 39.7392, lng: -104.9903, colour: '#C45A3A',
  bio: 'Trail runner, terrible cook, keeper of two dogs and one very opinionated cat.' };
const daysFromNow = (d) => { const t = new Date(); t.setDate(t.getDate() + d); return t; };
const upcomingBirthday = (inDays, year) => { const t = daysFromNow(inDays); return `${year}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
const FRIENDS = [
  { key: 'maya',   name: 'Maya Morgan',  layer: 'intimate',   relation: 'Partner',          since: '2014',      freq: 1,  lastDays: 0,  city: 'Denver',     lat: 39.7392,  lng: -104.9903, colour: '#7A8B6F', dob: '1988-09-03' },
  { key: 'daniel', name: 'Daniel Morgan',layer: 'intimate',   relation: 'Brother',          since: 'Always',    freq: 7,  lastDays: 4,  city: 'Cape Town',  lat: -33.9249, lng: 18.4241,   colour: '#5B7FA6', dob: upcomingBirthday(5, 1983) },
  { key: 'priya',  name: 'Priya Shah',   layer: 'close',      relation: 'Best friend',      since: 'Uni days',  freq: 14, lastDays: 9,  city: 'London',     lat: 51.5072,  lng: -0.1276,   colour: '#B5838D', dob: '1987-02-20' },
  { key: 'tom',    name: 'Tom Becker',   layer: 'close',      relation: 'Hiking buddy',     since: '2019',      freq: 14, lastDays: 31, city: 'Boulder',    lat: 40.015,   lng: -105.2705, colour: '#C9A227', dob: '1985-07-14' },
  { key: 'lena',   name: 'Lena Fischer', layer: 'active',     relation: 'Old colleague',    since: '2016',      freq: 30, lastDays: 22, city: 'Berlin',     lat: 52.52,    lng: 13.405,    colour: '#6D597A', dob: '1990-11-30' },
  { key: 'chris',  name: 'Chris Ngata',  layer: 'meaningful', relation: 'Running club',     since: '2022',      freq: 60, lastDays: 75, city: 'Auckland',   lat: -36.8485, lng: 174.7633,  colour: '#2A9D8F', dob: '1992-05-08' },
];
const OFFLINE = [{ key: 'rose', name: 'Grandma Rose', layer: 'intimate', relation: 'Grandmother', phone: '+13035550142', dob: '1941-03-02' }];

// Memories: who created it, who was there, photos (file name → uploader), perspectives
const MEMORIES = [
  { title: 'Autumn camping weekend', daysAgo: 26, location: 'Buena Vista, CO', by: 'me', with: ['maya', 'daniel'], vis: 'intimate',
    photos: [['photo-06.jpg', 'me'], ['photo-07.jpg', 'maya']],
    entries: [['me', 'Cold mornings, the old kettle on the camp stove, and the best burgers we have ever burnt. Daniel finally learned to build a fire.'],
              ['maya', 'Coffee by the river while everyone else was still asleep. Let\'s do this every October.'],
              ['daniel', 'For the record, the fire was perfect. The burgers were Alex\'s fault.']] },
  { title: 'Hike above the valley', daysAgo: 25, location: 'Steamboat Springs, CO', by: 'me', with: ['tom'], vis: 'close',
    photos: [['photo-08.jpg', 'me']],
    entries: [['me', 'Tom set a pace I could not keep. Worth it for that view at the top.'], ['tom', 'Next time we start earlier and beat the wind.']] },
  { title: 'Elk on the drive home', daysAgo: 23, location: 'Estes Park, CO', by: 'maya', with: ['me', 'maya'], vis: 'intimate',
    photos: [['photo-10.jpg', 'maya']],
    entries: [['maya', 'A whole herd just grazing by the road. We sat in the car for twenty minutes.'], ['me', 'Best traffic jam ever.']] },
  { title: 'Old town afternoon', daysAgo: 60, location: 'Baltimore, MD', by: 'priya', with: ['me', 'priya', 'lena'], vis: 'close',
    photos: [['photo-04.jpg', 'priya'], ['photo-05.jpg', 'me']],
    entries: [['priya', 'Brick streets, too many coffee stops and one very long lunch. Missed this.'], ['lena', 'I still think we should have tried the crab cakes.'], ['me', 'Same time next year?']] },
  { title: 'Harbour walk before work', daysAgo: 62, location: 'Baltimore, MD', by: 'me', with: ['lena'], vis: 'active',
    photos: [['photo-03.jpg', 'me']],
    entries: [['me', 'Lena convinced me 6am was a good idea. She was right, the water was glass.']] },
  { title: 'Fall colours in the park', daysAgo: 18, location: 'Denver, CO', by: 'me', with: ['chris'], vis: 'meaningful',
    photos: [['photo-02.jpg', 'me']],
    entries: [['me', 'Long run with Chris over the old stone bridge. The trees were on fire.'], ['chris', 'Good pace today. Same loop next month.']] },
  { title: 'First day on the slopes', daysAgo: 6, location: 'Keystone, CO', by: 'me', with: ['daniel'], vis: 'intimate',
    photos: [['photo-14.jpg', 'me']],
    entries: [['me', 'Opening weekend. Fell more times than I will admit.'], ['daniel', 'Video evidence available on request.']] },
  { title: 'The dogs meet Grandma Rose', daysAgo: 40, location: 'Home', by: 'me', with: ['maya'], offline: ['rose'], vis: 'intimate',
    photos: [['photo-01.jpg', 'me']],
    entries: [['me', 'Grandma came for lunch and the dogs would not leave her side.'], ['maya', 'They knew she had the good treats.']] },
  { title: 'Lazy Sunday with Tiger', daysAgo: 3, location: 'Home', by: 'me', with: [], vis: 'onlyUs',
    photos: [['photo-12.jpg', 'me'], ['photo-15.jpg', 'me']],
    entries: [['me', 'Tiger claimed the stairs and my lap, in that order. A private one just for me.']] },
];

const MOMENTS = [
  ['daniel', 'call', 'Sunday call', 4, 'Talked about his trip home in December.'],
  ['maya', 'manual', 'Dinner out', 2, 'Tried the new Thai place.'],
  ['priya', 'call', 'Catch-up call', 9, 'She got the promotion!'],
  ['tom', 'manual', 'Coffee', 31, 'Planning a winter hut trip.'],
  ['lena', 'calendar', 'Video call', 22, 'Her new project in Berlin.'],
  ['chris', 'manual', 'Run club', 75, null],
];

// ── Helpers ────────────────────────────────────────────
async function upload(file, ownerId) {
  const full = path.join(PHOTO_DIR, file);
  if (!fs.existsSync(full)) { console.warn(`  ! photo missing, skipped: ${file}`); return null; }
  const key = `memories/${ownerId}/review-${path.parse(file).name}-${crypto.randomBytes(3).toString('hex')}.jpg`;
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: fs.readFileSync(full), ContentType: 'image/jpeg' }));
  return `${S3_BASE_URL}/${key}`;
}
const fakeEmail = (key) => `review-${key}@rootsdebug.local`;

async function removeExisting() {
  const emails = [REVIEWER_EMAIL, ...FRIENDS.map(f => fakeEmail(f.key))];
  const { rows } = await db.query('SELECT id, email, legal_hold FROM users WHERE email = ANY($1)', [emails]);
  const admins = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim());
  for (const u of rows) {
    if (admins.includes(u.id)) throw new Error(`${u.email} is listed in ADMIN_USER_IDS — refusing to delete it.`);
    if (u.legal_hold) throw new Error(`${u.email} is on legal hold — refusing to delete it.`);
  }
  for (const u of rows) {
    await deleteAccount(db, u.id, { s3, bucket: BUCKET, s3BaseUrl: S3_BASE_URL });
    console.log(`  removed ${u.email}`);
  }
}

async function main() {
  const { rows: [existing] } = await db.query('SELECT id FROM users WHERE email = $1', [REVIEWER_EMAIL]);
  if (existing && !RESET) {
    console.log(`${REVIEWER_EMAIL} already exists. Run with --reset to recreate it.`);
    return;
  }
  if (RESET) { console.log('Removing existing demo accounts…'); await removeExisting(); }

  const ids = {};
  const pw = await bcrypt.hash(REVIEWER_PASSWORD, 12);
  ids.me = (await db.query(
    `INSERT INTO users (display_name, email, password_hash, date_of_birth, city, lat, lng, avatar_colour, bio)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [REVIEWER.name, REVIEWER.email, pw, REVIEWER.dob, REVIEWER.city, REVIEWER.lat, REVIEWER.lng, REVIEWER.colour, REVIEWER.bio])).rows[0].id;
  console.log(`Created ${REVIEWER.email}`);

  const conn = {};
  for (const f of FRIENDS) {
    const hash = await bcrypt.hash(crypto.randomBytes(24).toString('base64'), 10);
    ids[f.key] = (await db.query(
      `INSERT INTO users (display_name, email, password_hash, date_of_birth, city, lat, lng, avatar_colour, show_dob_to_connections)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING id`,
      [f.name, fakeEmail(f.key), hash, f.dob, f.city, f.lat, f.lng, f.colour])).rows[0].id;
    const last = daysFromNow(-f.lastDays);
    const score = Math.max(25, Math.min(98, 100 - Math.round((f.lastDays / f.freq) * 35)));
    conn[f.key] = (await db.query(
      `INSERT INTO connections (user_id, connected_user_id, relation, layer, since, contact_frequency, score, last_contact_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active') RETURNING id`,
      [ids.me, ids[f.key], f.relation, f.layer, f.since, f.freq, score, last])).rows[0].id;
    await db.query(
      `INSERT INTO connections (user_id, connected_user_id, relation, layer, contact_frequency, score, last_contact_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active')`,
      [ids[f.key], ids.me, 'Friend', f.layer, f.freq, score, last]);
  }
  for (const o of OFFLINE) {
    conn[o.key] = (await db.query(
      `INSERT INTO connections (user_id, layer, relation, contact_frequency, status, offline_name, offline_phone, offline_dob, last_contact_at)
       VALUES ($1,$2,$3,7,'offline',$4,$5,$6,$7) RETURNING id`,
      [ids.me, o.layer, o.relation, o.name, o.phone, o.dob, daysFromNow(-12)])).rows[0].id;
  }
  console.log(`Created ${FRIENDS.length} friends and ${OFFLINE.length} offline contact`);

  let photoCount = 0;
  for (const m of MEMORIES) {
    const date = daysFromNow(-m.daysAgo).toISOString().slice(0, 10);
    const participants = [...new Set([m.by, 'me', ...m.with].map(k => ids[k]))];
    const offlineIds = (m.offline || []).map(k => conn[k]);
    const evId = (await db.query(
      `INSERT INTO events (title, date, location, created_by_user_id, visibility, participant_ids, offline_participant_connection_ids, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [m.title, date, m.location, ids[m.by], m.vis, participants, offlineIds, daysFromNow(-m.daysAgo)])).rows[0].id;
    for (const [i, [who, text]] of m.entries.entries()) {
      const at = daysFromNow(-m.daysAgo); at.setHours(at.getHours() + 2 + i * 3);
      await db.query(`INSERT INTO memory_entries (event_id, author_id, text, created_at, is_new) VALUES ($1,$2,$3,$4,false)`, [evId, ids[who], text, at]);
    }
    for (const [file, who] of m.photos) {
      const url = await upload(file, ids[who]);
      if (!url) continue;
      await db.query(
        `INSERT INTO memory_media (event_id, user_id, url, created_at, moderation_status, moderated_at)
         VALUES ($1,$2,$3,$4,'approved',now())`, [evId, ids[who], url, daysFromNow(-m.daysAgo)]);
      photoCount++;
    }
    // Most memories already "seen"; the two newest stay unread so the NEW ring shows
    if (m.daysAgo > 6) await db.query(`INSERT INTO memory_views (user_id, event_id, last_viewed_at) VALUES ($1,$2,now())`, [ids.me, evId]);
  }
  console.log(`Created ${MEMORIES.length} memories with ${photoCount} photos`);

  for (const [who, type, title, daysAgo, note] of MOMENTS) {
    await db.query(`INSERT INTO contact_events (user_id, connection_id, type, title, date, note) VALUES ($1,$2,$3,$4,$5,$6)`,
      [ids.me, conn[who], type, title, daysFromNow(-daysAgo), note]);
  }
  console.log(`Logged ${MOMENTS.length} moments`);

  const admins = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim());
  if (admins.includes(ids.me)) console.warn('WARNING: the reviewer is in ADMIN_USER_IDS — remove it so Apple can test deletion.');
  console.log(`\nDone. App Review login:\n  Email:    ${REVIEWER_EMAIL}\n  Password: (the REVIEWER_PASSWORD you set)\n`);
  console.log(`Daniel's birthday is in 5 days and Tom/Chris are overdue, so nudges appear after the next nudge run.`);
}

main().then(() => db.end()).catch(async (err) => { console.error('FAILED:', err.message); await db.end(); process.exit(1); });
