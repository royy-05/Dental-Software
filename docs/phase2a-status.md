# Phase 2A status

Branch: `build/phase2a`. Phase 2A turns the Phase 1 clickable prototype into a working application: Postgres with row-level security, real logins, a server-side booking engine, an API for every module, a message queue with a worker, SQL reports, and the three panels reading and writing through that API. The browser `localStorage` store is gone.

See [`api.md`](api.md) (generated, 146 endpoints), [`assumptions.md`](assumptions.md) and the README for setup.

## Done

### Step 1: database
- Prisma schema for every entity (`prisma/schema.prisma`), migrations `init` and `rls`.
- Row-level security on every clinic table, scoped per transaction (`app.scope`, `app.clinic_id`), FORCE RLS, runtime role `kivi_app` with NOBYPASSRLS; append-only audit log; gist exclusion constraints against provider and operatory double booking; `clinic_id_for_slug()` security-definer lookup.
- `src/server/db.ts` (`withTenant`, `withPlatform`), mappers, seed from the Phase 1 demo data (5 clinics, 11 users, 1,093 appointments), 12 RLS isolation tests.

### Step 2: auth and permissions
- Argon2id passwords with strength rules; TOTP 2FA (secrets AES-256-GCM at rest); login rate limits per email and IP; lockout after 10 failures; audited logins.
- Server-side sessions behind Auth.js JWTs: 30-minute idle timeout, 12-hour maximum, revocation; background polls do not count as activity. Client-side idle timer signs the browser out at 30 minutes too.
- Invites (7-day links), password reset (1-hour, single use, revokes sessions), password change, 2FA setup/disable; platform users must enrol in 2FA at first login.
- `handler()` in `src/server/http.ts`: every route runs authenticate → authorize (role matrix from `src/lib/permissions.ts` plus feature flags) → zod validate → act. Support agents reach clinics only through audited impersonation.
- Staff management: clinic owners/managers invite staff, change roles, deactivate (sessions revoked); super admins invite platform users, force 2FA, deactivate, send resets.
- Real `/login` with the demo account panel when `DEMO_MODE=true`; `/forgot-password`, `/reset-password/[token]`, `/invite/[token]`, `/account/security`.

### Step 3: API layer and UI migration
- Clinic routes under `/api/clinics/:clinicId/...` for every module: configuration bundle, reasons (CRUD, reorder, duplicate), providers, operatories, schedule (hours, holidays, blockouts), insurances and insurance settings, referrers, templates (clinic copies of the global defaults, reset, real test send), booking flow (draft, publish, roll back, starter templates), users, tickets, ad spend, delivery log, opt-outs, SMS simulator (DEMO_MODE), appointments (list, detail with PHI-access audit, status changes, notes, reschedule, resend, CSV export that masks PHI on request), staff slots, patient export and delete.
- Super admin routes under `/api/admin/...`: dashboard, clinics (wizard with CSV import, edit, soft delete and 30-day restore, clone settings, impersonation), groups, plans, invoices and dunning, coupons, users, libraries (carriers, default templates, starter flows, legal), messaging logs and opt-outs, support desk and announcements, platform analytics, audit log, platform settings, demo reset.
- Public routes under `/api/public/...` for the widget and patient pages (see step 4 and 5).
- Clinic panel, super admin panel and patient widget read and write through the API (TanStack Query hooks in `src/lib/api/`). The Zustand store keeps UI state only (selected clinic, Hide PHI).

### Step 4: booking engine
- `src/server/services/booking.ts`: holds, bookings, staff bookings, reschedules and status changes run inside one transaction under a per-clinic advisory lock; the slot is re-validated after the lock with the same pure slot engine the widget preview uses (`src/lib/slots.ts`). The exclusion constraints are the backstop.
- 5-minute holds (`slot_holds`), one per widget session, invisible to other sessions, purged hourly.
- Test: 20 concurrent bookings for one slot produce exactly one appointment and 19 `slot_taken` errors (`booking.int.test.ts`).
- Patients are upserted per clinic (email or phone + last name + date of birth) and un-archived on booking when the setting is on.

### Step 5: patient links, tracking, consent, abuse protection
- Signed, expiring confirm/reschedule/cancel links (`src/server/links.ts`): HMAC over appointment id, version and expiry; the version is bumped on reschedule and cancel so links in older messages stop working; links expire 7 days after the visit.
- Patient reschedule and cancel respect the clinic's cancellation window (409 `outside_window`).
- Source, referrer id, UTM tags and click ids are stored on the appointment; the SMS consent record stores the Terms version, timestamp, IP and user agent.
- Public booking: per-IP rate limits, honeypot field, server-side slot re-check; widget funnel events are recorded server-side (ids and step names only).

### Step 6: notifications
- The booking transaction writes delivery-log rows (`queued`, `scheduled` for reminders and quiet hours, `failed` for opt-outs) from the same pure rules as the Phase 1 simulator (`src/lib/notify.ts`).
- pg-boss queue (`send-message`, `hourly-tick`) and worker (`npm run worker`): email via Resend/console/memory adapters, SMS via the mock adapter (Twilio and MSG91 are stubs that fail loudly); retries; a safety sweep delivers rows whose job was lost; stale reminders and confirmation prompts are skipped when the appointment moved or ended.
- Quiet hours (no patient SMS 9 pm - 8 am clinic time), reminders at the clinic's offsets, re-issued on reschedule, daily summary of tomorrow's schedule at 17:00 clinic time, resend confirmation and confirmation requests from the drawer, template test sends, dunning emails.
- Two-way SMS: `POST /api/webhooks/sms` (shared secret) and the in-panel simulator share one handler: C confirms the next appointment, STOP/START opt out and in, HELP answers.
- `smsCreditsUsed` and `emailsSent` are counted on delivery.

### Step 7: patient rights and retention
- `GET/DELETE /api/clinics/:id/patients/:patientId` export or delete everything about a patient (audited).
- Retention purge in the hourly tick: patients past the clinic's `retentionDays` (or the platform default) with no newer appointment are deleted and the purge is audited.

### Step 8: reports in SQL
- Home, Performance (overview, by source, ad ROI, patients, reasons, providers, lead time, fill rate) and Form Analytics (totals, drop-off by step and reason, heatmaps) are computed in Postgres (`src/server/services/reports.ts`). Parity tests compare every figure with the Phase 1 aggregators over the seeded data.
- Super admin dashboard and platform analytics (compare clinics, growth, retention) in SQL.

### Step 9: tests, CI, docs
- Vitest: unit tests (slot engine, flow rules, notifications, links, TOTP) and integration tests against a seeded Postgres (RLS, auth, booking, routes, reports, jobs).
- Playwright end-to-end (`e2e/`): login and roles, patient booking end to end, held slots, signed-link cancel, staff confirmation, admin pages.
- GitHub Actions (`.github/workflows/ci.yml`): lint, typecheck, unit and integration tests, build, Playwright.
- `docs/api.md` is generated from the route specs (`npm run docs:api`).

## Stubbed or simulated
- SMS provider: mock driver only; Twilio/MSG91 adapters are stubs (the provider is an open question in the SOW). The inbound webhook accepts a provider-agnostic payload.
- Email: Resend adapter is implemented but not exercised in CI (memory/console drivers there). Delivery/open tracking webhooks are not wired.
- File uploads: only the file name and size are stored (no object storage).
- OTP on the widget: code shown in a toast, nothing sent.
- Reserve with Google, PMS sync, Stripe, calendar sync, custom domains, backups: status fields and simulated actions only, as in Phase 1.
- Super admin "custom roles" (section 2) are not built; the six fixed roles are enforced.

## Local setup
```bash
docker compose up -d
cp .env.example .env   # then fill in AUTH_SECRET, APP_ENCRYPTION_KEY and LINK_SIGNING_SECRET
npm install
npm run db:setup       # migrate, create the job queue, seed demo data
npm run dev            # app on http://localhost:3000
npm run worker         # in another terminal: delivers queued email/SMS, hourly tick
```
Demo accounts: every seeded user, password `Demo-Passw0rd-2026`; accounts with 2FA use the demo secret `KIVIDEMOKIVIDEMOKIVIDEMOKIVIDEMO` (the login page shows the current code while `DEMO_MODE=true`). Development only.

## Checks
- `npm run check`: lint, typecheck, vitest (needs `TEST_DATABASE_URL` and `TEST_DIRECT_DATABASE_URL`).
- `npm run test:e2e`: Playwright against a running app with the seeded dev database.
