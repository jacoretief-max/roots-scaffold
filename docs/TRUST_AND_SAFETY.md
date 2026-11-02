# Trust & Safety — Rooted In

Covers Apple App Review 1.2 (UGC: filter, report, block, contact) and US 18 U.S.C. §2258A
(report apparent CSAM to NCMEC on actual knowledge; preserve for 1 year).

## How it works
- **Upload filter** — every photo is checked by AWS Rekognition (`server/lib/safety.js`).
  Explicit / violent / disturbing / hate-symbol labels ≥ 80% confidence → `pending_review`
  (only the uploader sees it). **All videos** are `pending_review` until manually approved.
  If Rekognition fails, the photo is held (fail closed). Flagged profile photos are rejected.
- **Report** — photo, memory, perspective or person. Hidden for the reporter immediately.
  **Child safety** reports hide the content from everyone, suspend the uploader and set
  `legal_hold` (account, photos and perspectives can't be deleted). Admins get a push alert.
- **Block** — removes the connection both ways, cancels requests, hides each other in search,
  memories and photos, and strips the blocked person from new tags.
- **Admin** — user IDs in Railway env `ADMIN_USER_IDS` (comma-separated) receive push alerts
  and can use `/api/admin/*` (building blocks for the future website / agent review flow).

## Setup
1. Run `server/migrate_phase8_safety.sql` (statement by statement in Railway's query tab).
2. Railway → Variables: `ADMIN_USER_IDS=<your user id>` (log in to the app on your phone so
   your push token is registered).
3. AWS IAM → the user whose keys are in Railway → add this inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": "rekognition:DetectModerationLabels", "Resource": "*" },
    { "Effect": "Allow", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::roots-media-prod/*" }
  ]
}
```
4. Register Rooikat Labs as an Electronic Service Provider with NCMEC's CyberTipline
   (https://report.cybertip.org/ — "ESP registration") **before launch**.

## Daily review (SQL, until the web review page exists)
Open reports, child safety first:
```sql
SELECT r.id, r.reason, r.target_type, r.target_id, r.details, r.created_at, u.display_name AS reported_user, u.id AS reported_user_id
FROM content_reports r LEFT JOIN users u ON u.id = r.reported_user_id
WHERE r.status = 'open' ORDER BY (r.reason = 'child_safety') DESC, r.created_at
```
Media awaiting review (open the URL in a private browser window — S3 link):
```sql
SELECT mm.id, mm.url, mm.moderation_labels, mm.created_at, u.display_name AS uploader
FROM memory_media mm LEFT JOIN users u ON u.id = mm.user_id
WHERE mm.moderation_status = 'pending_review' ORDER BY mm.created_at
```
Decide (replace the id):
```sql
UPDATE memory_media SET moderation_status = 'approved', moderated_at = now() WHERE id = '<media id>'
```
```sql
UPDATE memory_media SET moderation_status = 'removed', moderated_at = now() WHERE id = '<media id>'
```
Close a report:
```sql
UPDATE content_reports SET status = 'actioned', resolution_note = '<what you did>', resolved_at = now() WHERE id = '<report id>'
```
Lift a wrongful suspension / release a legal hold (only when no legal duty remains):
```sql
UPDATE users SET suspended_at = NULL WHERE id = '<user id>'
```
```sql
UPDATE users SET legal_hold = false WHERE id = '<user id>'
```
(SQL changes to suspension take up to 60 seconds to apply; the admin API applies instantly.)

## If you find apparent CSAM — do this, in order
1. **Do not** download, screenshot, forward or show it to anyone.
2. Set the media to `removed` (hidden, **not deleted**). Confirm the account is suspended and on legal hold.
3. Report to NCMEC's CyberTipline (as the registered ESP) with the account details and S3 key.
4. Preserve for at least 1 year. Do not release the legal hold until that period ends and no request is pending.
5. Respond to law-enforcement requests via info@rooikatlabs.com.

## Later
- Web review page on rooikatlabs.com (videos + reports) using `/api/admin/*`, then hand to an agent.
- PhotoDNA / Thorn Safer hash matching once there are real users.
