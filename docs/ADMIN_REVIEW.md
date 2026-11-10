# Admin review page — admin.rooikatlabs.com

Desktop page for reviewing held photos/videos and reports. Served by the Railway
backend (`server/admin/index.html`, `server/routes/admin.js`), **only** on
`admin.rooikatlabs.com` — the Railway domain returns 404 for it.

## Three locks
1. **Cloudflare Access** — one-time code to your email before the page loads. The API
   also verifies Cloudflare's signed token (`CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD`),
   so calling `/api/admin/*` via the Railway domain is refused.
2. **Rooted In login** (your normal account).
3. **Admin list** — your user ID in `ADMIN_USER_IDS`.

Every decision is written to `admin_actions` (Audit log tab).

## Setup (in this order)
1. **Database** — run `server/migrate_phase9_admin_audit.sql` (3 one-line statements).
2. **Deploy** the code (push to GitHub → Railway).
3. **Cloudflare Zero Trust** (dash.cloudflare.com → Zero Trust). First time: pick a team
   name (e.g. `rooikatlabs`) and the **Free** plan.
   - Access → Applications → **Add an application → Self-hosted**
   - Name: `Rooted In Review` · Domain: `admin.rooikatlabs.com` · Session: 24 hours
   - Policy: **Allow** · Include → **Emails** → your email
   - Login method: **One-time PIN**
   - Save, then copy the **Application Audience (AUD) Tag** from the app's overview.
   - Your **team domain** is under Settings → Team name and domain
     (e.g. `rooikatlabs.cloudflareaccess.com`).
4. **Railway → backend service → Variables**:
   - `CF_ACCESS_TEAM_DOMAIN` = `rooikatlabs.cloudflareaccess.com` (yours)
   - `CF_ACCESS_AUD` = the AUD tag
5. **Railway → Settings → Networking → Custom Domain** → `admin.rooikatlabs.com`.
   Railway shows a **CNAME target** (and maybe a TXT record).
6. **Cloudflare → rooikatlabs.com → DNS → Add record**: `CNAME`, name `admin`,
   target = Railway's value, **Proxied (orange cloud)** — required for Access.
   Add Railway's TXT record too if it showed one.
   Cloudflare → SSL/TLS → mode must be **Full** (not Flexible).
7. Open **https://admin.rooikatlabs.com** → email code → Rooted In login.
   The header should show your name **without** "Cloudflare check off".

## Day to day
- **Held media**: approve / remove / remove + suspend. Videos always wait here.
- **Reports**: child safety first (red). Follow the banner — do not download; keep
  removed (not deleted); report to NCMEC; put the CyberTipline number in the note.
- View links expire after 10 minutes — press Refresh if a video won't play.

## Later: an agent
Add a separate agent credential that can only *recommend* decisions; a person
approves. Never let an agent review child-safety items. For volume, Rekognition
Video can pre-scan videos so only flagged ones wait.
