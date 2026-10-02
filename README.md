# AutoJobs — Job Auto-Apply System (Phase 1 MVP)

Web app (UI in Bahasa Indonesia) that searches JobStreet, Glints and LinkedIn, filters listings against a campaign's
criteria, shows a mandatory preview, then applies to the selected listings one at a time per portal account with a random
120–180 s gap, and reports every attempt. Built from `PRD — Job Auto-Apply System.md`.

## Architecture

```
Browser ──> apps/web (Next.js: UI + Server Actions)        ──┐
AutoJobs extension ──> /api/extension/* (bearer)            ├──> PostgreSQL (data + persistent queue)
Admin ──> apps/admin (Next.js: admin console, port 3001)    │     encrypted files (CVs, proofs, QRIS)
Worker (Node): searches, token payments, recovery, retention┘
```

Monorepo (npm workspaces): `apps/web` (the SaaS and the worker), `apps/admin` (console), `packages/shared` (database,
auth, encryption, settings, pricing and payments, shared UI). `extension/` and `db/migrations/` stay at the root, and
one root `.env` serves everything.

- **Applying runs in the user's own browser.** The AutoJobs extension (`extension/`, Chrome/Edge, Manifest V3) pulls work
  for its user, opens each job in a dedicated "AutoJobs" window, and fills and submits the form there, with the user's
  own portal logins on their own internet connection. When a portal shows a CAPTCHA or verification step, the extension
  brings the window forward and waits for the user to complete it; it never solves one itself.
- **The extension is a thin executor.** Portal patterns (`apps/web/src/lib/adapters/*`), answers (`apps/web/src/lib/apply-plan.ts`),
  the gap, daily caps, retries and result handling all live on the server. Fixing a portal means editing its adapter
  file: no extension update needed.
- **PostgreSQL is also the queue.** `claimNextForUser` locks the next due item with `FOR UPDATE SKIP LOCKED`, so an account
  never has two attempts at once and the 120–180 s gap holds even with several browsers paired.
- **Worker** (`npm run worker`): runs campaign searches (JobStreet and LinkedIn over plain HTTPS; Glints pages are loaded
  by the extension, since Glints only answers a real browser the user has verified), re-queues attempts whose browser
  disappeared, and deletes proof files after the retention period.
- The server stores no portal passwords, sessions or cookies.

## Decisions (from the PRD open questions and follow-ups)

| Topic | Decision |
|---|---|
| Users / hosting | Public multi-user SaaS: sign-up with consent, email verification, admin role (`ADMIN_EMAILS`) |
| Stack | Lean TypeScript: Next.js + a small worker + PostgreSQL as queue; no NestJS/Redis/MinIO, no server-side browser |
| Where applying runs | AutoJobs browser extension in the user's Chrome/Edge (portals' Cloudflare checks reject server-side automated browsers) |
| Scope | Phase 1: all P0. Auto-apply on JobStreet and Glints; LinkedIn is search-only (recorded as manual) |
| Gap | 120–180 s **per portal account** (portals run side by side). Admin-configurable, floor 120 s |
| Daily cap | 25 per portal account (admin-configurable); overflow waits for the next day (Asia/Jakarta) |
| Preview | Mandatory; the user unticks listings and confirms before launch. Filtered-out listings are listed with their reason, and criteria can be edited and re-run before launch |
| Unknown experience level | Kept in the preview, flagged "level tidak diketahui" |
| Email | Any SMTP via `SMTP_URL`; without it, links are printed to the server log |
| Validation | **Dry run** launch option: fills every form, never clicks submit |
| Proof | Confirmation text + HTML snapshot of the page. Screenshots too, if the user allows "access to all sites" in the extension popup (needed by Chrome's screenshot API) |

Never done by design: solving or bypassing CAPTCHAs, 2FA or bot checks; disguising automation; storing portal
passwords; guessing answers to screening questions.

## Run locally

Requirements: Node 20.9+ (tested on 24), Docker, Chrome or Edge.

```bash
npm install
cp .env.example .env        # then set ENCRYPTION_KEY (command is in the file) and ADMIN_EMAILS
docker compose up -d postgres
npm run migrate
npm run dev                 # web on http://localhost:3000
npm run worker              # in a second terminal
npm run dev:admin           # admin console on http://localhost:3001 (a third terminal, when needed)
```

If port 5432 is taken (e.g. a local PostgreSQL), set `PG_PORT=55432` in `.env` and use that port in `DATABASE_URL`.

### Production mode on this computer (faster, restarts by itself)

Stop `npm run dev` / `npm run dev:admin` / `npm run worker` first (they use ports 3000/3001 and the same queue), then:

```bash
docker compose up -d --build web admin worker
```

The web app (production build) is on http://localhost:3000 and the console on http://localhost:3001; all restart
automatically, and `docker compose stop web admin worker` stops them cleanly (no orphaned worker processes). Files stay
in `./data`.

### Admin console and token payments

Admins (accounts in `ADMIN_EMAILS`) sign in to the console with their AutoJobs email and password; it has its own
12-hour session. It shows users (name, phone, applications sent, token usage), payments, revenue (with an Excel/CSV
download), the audit trail and overall metrics, and edits token packs and the app's settings.

Token purchases are confirmed automatically: each purchase pays its pack price minus a unique code (Rp1–99) through a
QR that already carries the amount. An Android phone with the DANA Bisnis app forwards each "payment received"
notification to `POST /api/payments/notify` (the free app MacroDroid), and the amount in it pays the purchase waiting
for exactly that amount. To set it up, in the console → **Pengaturan**:

1. **QRIS**: upload the static QRIS image of your DANA Bisnis account. Its code is read and used for every purchase.
2. **Notifikasi DANA**: create the key, then follow the MacroDroid steps shown there (one macro forwards DANA
   notifications to the secret URL, a second one pings every 15 minutes so the console can tell the phone is online).

The phone must stay on and online; a purchase paid while it is off stays pending for 24 hours and is credited once its
notification arrives. Users can also upload a transfer proof, which an admin approves under **Pembayaran**, where
unrecognised payments can be assigned by hand.

### Sign in with Google (optional)

Google Cloud Console → APIs & Services → **OAuth consent screen** (External; while in *Testing*, add your Google
account under Test users) → **Credentials** → Create credentials → **OAuth client ID** → Web application:

- Authorized JavaScript origins: `http://localhost:3000`
- Authorized redirect URIs: `http://localhost:3000/api/auth/google/callback` (in production: `<APP_URL>/api/auth/google/callback`)

Put the Client ID and secret in `.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and restart the web app. The
Google buttons appear on the sign-in and sign-up pages. A Google account whose email already has an AutoJobs account
signs into that account; signing up with Google needs the same two consents as signing up with a password.

### Install and pair the extension

1. AutoJobs → Koneksi Portal → **Unduh ekstensi (.zip)** (`/autojobs-extension.zip`, built per request from
   `extension/` with `APP_URL` in its host permissions and as the popup's default address), extract it to a folder that
   stays put. Chrome → `chrome://extensions` (Edge → `edge://extensions`) → turn on **Developer mode** → **Load
   unpacked** → pick that folder. (Developing: load the `extension` folder itself.) New version: download again,
   overwrite the folder, click reload on the extension card.
2. In AutoJobs → Koneksi Portal → **Buat kode pairing**. Click the AutoJobs icon in the browser toolbar, enter the
   AutoJobs address (`http://localhost:3000`) and the code.
3. Sign in to JobStreet and Glints in the same browser as usual (JobStreet uses a one-time code by email; both may show
   a "Verifikasi bahwa Anda adalah manusia" checkbox). Then click **Periksa login portal** in the popup.
4. Keep the browser open while a campaign runs.

For public distribution through the Chrome Web Store, package the same way as the download (the `localhost`/`127.0.0.1`
host permissions are for development and tests; the download already swaps them for `APP_URL`).

## Deploy (Docker Compose)

Step by step for a VPS, GitHub auto-deploy, backups and the security checklist: **[docs/DEPLOY.md](docs/DEPLOY.md)**
(Indonesian). In short: `.env` from `.env.example` (ENCRYPTION_KEY, POSTGRES_PASSWORD, APP_URL, ADMIN_URL,
ADMIN_EMAILS, SMTP), `mkdir -p data && sudo chown -R 1000:1000 data` (the containers run as uid 1000), then
`docker compose --profile https up -d --build`; later updates with `sh scripts/deploy.sh` (or automatically from GitHub
Actions on every push to `main`). Caddy terminates TLS for `DOMAIN` and `ADMIN_DOMAIN` and adds HSTS. The web container
runs migrations on start. **Back up `ENCRYPTION_KEY`**: without it, CVs and proof files can't be read.

## Tests

```bash
npm test          # logic, crypto, queue and payments (DB), and extension end-to-end
npm run typecheck # both apps
```

`apps/web/tests/payments.test.ts` covers QRIS, unique amounts and crediting each payment exactly once against a fake DANA.
`apps/web/tests/extension.test.ts` loads the real extension into Microsoft Edge (via Playwright), pairs it with the real API route
handlers, loads a page for the search worker, and applies on `apps/web/tests/fixture-portal.ts`, a fake JobStreet-style Quick
Apply. It needs Edge because branded Chrome no longer loads unpacked extensions from the command line; it is skipped
when Edge isn't installed.

## First real run (per portal)

The real apply forms are behind each portal's login, so the apply patterns were written from public knowledge of the
flows and checked only against the fake portal. Before live use on each portal:

1. Pair the extension and sign in to the portal (above).
2. Launch a small campaign with **Uji coba (dry run)** ticked. Watch the AutoJobs window if you like.
3. Open each result in Laporan: the timeline and the downloadable HTML snapshot show exactly where the flow stopped.
   Adjust `apps/web/src/lib/adapters/<portal>.ts` (button texts, `prepare` radios) if needed, then repeat until dry runs pass.

## Not in this build (PRD P1/P2, later phases)

LinkedIn Easy Apply (Phase 2), live next-submission countdown (the campaign page shows the next time instead), CSV/Excel
export, email/WhatsApp notifications (in-app badges/banners and browser notifications for now), cover-letter templates,
daily scheduled campaigns, manual pipeline statuses (Interview/Offer), English UI.
