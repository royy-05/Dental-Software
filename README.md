# Kivi Health Booking Platform — Phase 2A (production backend)

A multi-clinic healthcare appointment booking SaaS built from
[`docs/Kivi_Health_Booking_Platform_Scope_of_Work.docx`](docs/Kivi_Health_Booking_Platform_Scope_of_Work.docx)
(plain-text copy: [`docs/spec.txt`](docs/spec.txt)).

Phase 1 was a clickable prototype that ran on fake data in the browser. Phase 2A (this branch) adds the real
backend: Postgres with row-level security, logins with 2FA, a transactional booking engine, an API for every
module, a message queue and worker, SQL reports, end-to-end tests and CI. The three panels (patient widget,
clinic panel, super admin panel) now read and write through that API. All demo data is still fake.

Status: [`docs/phase2a-status.md`](docs/phase2a-status.md) · API: [`docs/api.md`](docs/api.md) · Decisions: [`docs/assumptions.md`](docs/assumptions.md)

## Quick Start (Automated for Windows, macOS & Linux)

Requirements: Node.js 22+, npm, Docker Desktop (for PostgreSQL).

Run the automated setup script (creates `.env` with secure crypto keys if missing, boots Docker, runs Prisma migrations and seeds demo data):

```powershell
npm install
npm run setup
```

Then start the application in two terminal windows:

**Terminal 1 (Next.js web app):**
```powershell
npm run dev
```

**Terminal 2 (pg-boss background worker for notifications & reminders):**
```powershell
npm run worker
```

Open http://localhost:3000 in your browser.

Demo accounts (password `Demo-Passw0rd-2026`) are listed on `/login` while `DEMO_MODE=true`. Never enable `DEMO_MODE` in production.

---

## Manual Windows Setup (Step-by-Step)

If you prefer running each step manually on Windows PowerShell:

1. **Start Docker Postgres:**
   ```powershell
   docker compose up -d
   ```

2. **Configure Environment:**
   Copy `.env.example` to `.env`:
   ```powershell
   Copy-Item .env.example .env
   ```
   Generate secure random keys with Node.js crypto (no OpenSSL or bash required):
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
   Paste the generated string into `AUTH_SECRET`, `APP_ENCRYPTION_KEY`, and `LINK_SIGNING_SECRET` in `.env`.

   *Note for custom ports:* If host port 5432 is already used by another service, set `POSTGRES_PORT="55432"` in `.env` and update the port in `DATABASE_URL`, `DIRECT_DATABASE_URL`, `TEST_DATABASE_URL`, and `TEST_DIRECT_DATABASE_URL` to `55432`.

3. **Install dependencies & generate Prisma client:**
   ```powershell
   npm install
   npx prisma generate
   ```

4. **Deploy database migrations and seed:**
   ```powershell
   npm run db:setup
   ```

5. **Start dev server and background worker:**
   ```powershell
   npm run dev
   # In a second terminal:
   npm run worker
   ```

---

## Troubleshooting

### 1. Port already in use (Error: bind: address already in use)
- **Problem**: Host port `5432` or `5433` is already in use by a local PostgreSQL installation or another Docker container.
- **Solution**:
  1. Open `.env` and set `POSTGRES_PORT="55432"` (or any free port).
  2. In `.env`, change the port in all database connection strings to match `55432`:
     ```env
     DATABASE_URL="postgresql://kivi_app:kivi_app_local_only@localhost:55432/kivi"
     DIRECT_DATABASE_URL="postgresql://kivi:kivi_local_only@localhost:55432/kivi"
     TEST_DATABASE_URL="postgresql://kivi_app:kivi_app_local_only@localhost:55432/kivi_test"
     TEST_DIRECT_DATABASE_URL="postgresql://kivi:kivi_local_only@localhost:55432/kivi_test"
     ```
  3. Restart the container:
     ```powershell
     docker compose down
     docker compose up -d
     ```

### 2. Docker not running
- **Problem**: Running `docker compose up -d` fails with `error during connect: ... open //./pipe/docker_engine: The system cannot find the file specified`.
- **Solution**:
  1. Launch **Docker Desktop** from the Windows Start menu.
  2. Wait until the Docker status icon in the system tray shows green ("Engine running").
  3. In Docker Desktop Settings → General, ensure **WSL 2 based engine** is enabled.
  4. Retry `npm run setup` or `docker compose up -d`.

### 3. P1000 Authentication Error (`Authentication failed against database server for kivi_app`)
- **Problem**: The runtime user `kivi_app` cannot authenticate or has `NOLOGIN` set. This occurs on Windows if git checked out `docker/postgres-init.sh` with Windows CRLF line endings, causing Alpine's `/bin/sh` to fail during container volume initialization.
- **Solution**:
  1. Ensure line endings for `*.sh` files are LF (enforced by the repository's `.gitattributes`).
  2. If the volume was already created with invalid roles, fix the permissions directly:
     ```powershell
     docker exec -i dental-software-db-1 psql -U kivi -d kivi -c "ALTER ROLE kivi_app WITH LOGIN PASSWORD 'kivi_app_local_only';"
     ```
  3. Alternatively, recreate the Docker volume cleanly:
     ```powershell
     docker compose down -v
     docker compose up -d
     npm run db:setup
     ```

### 4. EPERM / Lock Errors inside OneDrive Folder
- **Problem**: On Windows, keeping the repository inside a synced OneDrive folder (`OneDrive\Attachments\...`) causes OneDrive to lock files during active writes, triggering `EPERM: operation not permitted` during `npm run build`, `npm install`, or `.next` cache operations.
- **Solution**:
  1. Pause OneDrive syncing while actively developing: right-click the OneDrive cloud icon in your taskbar → *Pause syncing* → *2 hours*.
  2. Add `.next` to your ignored files and ensure your OneDrive settings do not keep offline locks on temporary build artifacts.
  3. If persistent EPERM errors occur, remove the `.next` directory and rebuild:
     ```powershell
     Remove-Item -Recurse -Force .next
     npm run dev
     ```

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run setup` | One-command setup: creates `.env`, boots Docker, generates Prisma, runs migrations and seed |
| `npm run dev` / `npm run build && npm start` | Next.js app |
| `npm run worker` | pg-boss worker: message delivery, reminders, daily summaries, hourly maintenance |
| `npm run db:setup` | `prisma migrate deploy`, create the job queue, seed the demo data |
| `npm run db:seed` | Re-seed the demo data (also available from the super admin dashboard in demo mode) |
| `npm run check` | lint + typecheck + vitest (unit and Postgres integration tests; needs `TEST_DATABASE_URL`) |
| `npm run test:unit` | Unit tests only (cross-platform, skips database setup) |
| `npm run test:e2e` | Playwright end-to-end tests against the running app and the seeded database |
| `npm run docs:api` | Regenerate `docs/api.md` from the route specs |
| `npm run docs:api` | Regenerate `docs/api.md` from the route specs |

## Stack

Next.js 15 (App Router, route handlers) · TypeScript · PostgreSQL 16 + Prisma (row-level security) · Auth.js
(credentials, server-side sessions) · argon2id · TOTP · zod · pg-boss · Resend (email) · TanStack Query · Zustand
(UI state only) · Tailwind CSS · shadcn/ui-style components · Recharts · Vitest · Playwright · GitHub Actions.

## Where things are

| Path | What |
| --- | --- |
| `/login`, `/forgot-password`, `/reset-password/[token]`, `/invite/[token]`, `/account/security` | Real sign-in with 2FA, invites, resets, 2FA enrolment |
| `/book/[clinicSlug]` | Patient booking widget (themes, `referrer_id`, `utm_*`, `gclid`, `fbclid`, `theme`, `embed=1`) |
| `/book/[clinicSlug]/confirmed/[token]`, `/book/[clinicSlug]/manage/[token]` | Confirmation and signed reschedule/cancel links |
| `/embed-demo` | Inline, popup and floating "Book Online" embed modes |
| `/clinic/...` | Clinic panel: 11 modules (section 5), step and form builder (section 4) |
| `/admin/...` | Super admin panel (section 6) |
| `/api/...` | 146 endpoints, see `docs/api.md` |

```
src/
  app/api/                   route handlers (public, clinics, admin, auth, webhooks)
  server/
    http.ts                  handler(): authenticate -> authorize -> validate -> act
    db.ts                    withTenant / withPlatform (RLS scopes)
    auth/                    passwords, TOTP, sessions, login, invites and resets
    services/                booking engine, notifications, config, flow, reports (SQL), admin, public bundle
    jobs/                    pg-boss queue, worker, delivery, daily summary, retention
    messaging/               email and SMS adapters
    links.ts                 signed patient links
  lib/                       pure logic shared with the browser: slots, flow rules, notify rules, zod schemas, api hooks
  components/                UI (clinic, admin, widget, builder, appointments, reports, settings)
  types/index.ts             domain types (spec field names)
  mock/                      demo data generators (seed only)
prisma/                      schema and migrations (init, rls)
scripts/                     setup-jobs, docs-api, env preload
e2e/                         Playwright tests
```

## What is real vs simulated

Real: logins, 2FA, sessions and idle timeout, permissions on the server, clinic isolation in the database,
bookings and holds under a lock, signed patient links, every clinic and admin setting, the step and form builder,
notifications in a queue with a worker (email through Resend when configured), two-way SMS handling, reminders,
quiet hours, daily summaries, audit log, patient export/delete and retention, reports in SQL.

Simulated or stubbed: SMS sending (mock driver; Twilio/MSG91 stubs), email delivery/open tracking, OTP on the
widget (shown in a toast), file storage (name and size only), Reserve with Google, PMS sync, Stripe, calendar
sync, custom domains, backups. See `docs/phase2a-status.md` for the full list.
