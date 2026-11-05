# Phase 2A status

Branch: `build/phase2a`. Work stopped on request. The branch is a work in progress: the panels are only partly moved off the Phase 1 localStorage store, so the app as a whole does not work end to end yet.

## Done

### Step 1: database (commit 52ff0ae)
- Prisma schema for every entity in `src/types` (`prisma/schema.prisma`).
- Migrations:
  - `init`
  - `rls`: row-level security on every clinic table, scoped per transaction by `app.scope` and `app.clinic_id`. Uses FORCE RLS and the `kivi_app` runtime role, which has NOBYPASSRLS.
  - The audit log is append-only.
  - Gist exclusion constraints stop provider and operatory double booking.
  - `clinic_id_for_slug()` is a security-definer function for public lookups.
- `src/server/db.ts`: `withTenant`, `withPlatform` and `clinicIdForSlug`.
- `src/server/mappers.ts`: maps database rows to the domain types.
- `src/server/seed.ts` and `prisma/seed.ts` load the demo data from `src/mock` (5 clinics, 11 users, 1,093 appointments, all fake).
- `src/server/rls.int.test.ts`: 12 isolation tests (no scope gives no rows, no reading, updating or inserting across clinics, the scope does not leak between queries, and global templates are read-only for tenants).
- `docker-compose.yml`, `docker/postgres-init.sh` and `.env.example`.

### Step 2: auth and permissions
- Passwords:
  - argon2id hashing.
  - Rules: 12+ characters, 3 character classes, no common passwords, no email name (`src/server/auth/password.ts`).
- 2FA:
  - TOTP built on node:crypto, tested against the RFC test vectors (`totp.ts`).
  - Secrets are encrypted at rest with AES-256-GCM (`crypto.ts`).
- Sign-in (`src/server/auth/login.ts`):
  - Login with rate limits per email and per IP.
  - The account locks after 10 failures.
  - Successes and failures are written to the audit log.
- Sessions:
  - Each session has a database row, with a 30-minute idle timeout, a 12-hour maximum and revocation (`context.ts`).
  - Background polls do not count as activity.
- Invites, password reset, password change, and 2FA setup and disable (`accounts.ts`).
- Auth.js:
  - Credentials provider (`src/auth.ts`) and edge config (`src/auth.config.ts`).
  - `src/middleware.ts` guards pages and adds security headers.
- `src/server/http.ts` `handler()`: every route runs authenticate, then authorize (the role matrix from `src/lib/permissions.ts`, checked on the server, plus feature flags), then validate (zod), then act.
- Rate limiter stored in Postgres (`rate-limit.ts`). Audit helper (`audit.ts`). Logger that redacts PHI fields (`log.ts`).
- Impersonation API: a reason of at least 5 characters is required, it is audited, and access is limited to the impersonated clinic.
- Email adapter: Resend, console and memory drivers. SMS adapter: mock driver, with Twilio and MSG91 as stubs.
- Pages:
  - Real `/login`. The demo account panel appears only when `DEMO_MODE=true`.
  - `/forgot-password`, `/reset-password/[token]`, `/invite/[token]` and `/account/security`.
- Tests: `src/server/auth/auth.int.test.ts` and `totp.test.ts`.

## In progress (step 3: API layer and UI migration)
- Done so far:
  - `src/lib/api/client.ts`: fetch wrapper. A 401 sends the user to `/login`; a missing 2FA setup sends them to `/account/security`.
  - `src/lib/api/session.ts`: `useMe`, `useClinicId`, `useEffectiveRole`, `useCurrentClinic`, `useFeature` and `useApiMutation`.
  - `src/store/ui.ts`: Zustand now holds UI state only (selected clinic, Hide PHI).
  - `src/lib/schemas.ts`: zod schemas for all domain types.
  - Endpoints:
    - `GET /api/me`
    - `GET /api/clinics/[clinicId]`
    - `PATCH /api/clinics/[clinicId]/profile`
    - notifications (GET and mark read)
    - announcements
    - `GET /api/catalog/plans`
  - Migrated to the API: the clinic shell (nav, clinic selector, bell, banners, sign-out), the guards and the PHI mask.
- Remaining:
  - About 50 components still read and write the legacy `useApp` store in `src/store/app.ts`, which still builds the demo data in the browser:
    - every clinic module except the shell
    - the whole super admin panel
    - the booking widget
  - The central hooks `useClinicData`, `useClinicConfig` and `useSaveClinic` have not been moved yet.
  - The admin shell (`src/components/admin/shell.tsx`) still uses the legacy store.

## Not started
- Step 4: server-side booking engine (holds and bookings under an advisory lock) and the 20-way concurrency test.
- Step 5: signed, expiring confirm, reschedule and cancel links; capturing referrer, UTM and click IDs onto the appointment on the server; storing the consent record; honeypot and rate limits on the public endpoints.
- Step 6: pg-boss queue and worker. `scripts/setup-jobs.ts` does not exist yet, so `npm run db:setup` and `npm run worker` will fail. Also not started: reminders, quiet hours, two-way SMS webhook, delivery log written by the worker.
- Step 7: patient export and delete endpoints, the retention setting UI and the purge job (`retentionDays` exists in the schema only).
- Step 8: SQL report aggregations and the parity tests.
- Step 9: Playwright tests, GitHub Actions CI, `docs/api.md` generator, README and `docs/assumptions.md` updates, PR.

## Known failing checks
- `npm run lint` fails with 1 error: `@typescript-eslint/no-explicit-any` in `src/test/route.ts` (the `json: any` return type of `call()`).
- `npm run typecheck`: passed at the last run.
- `npm test`: 17 files and 120 tests passed at the last run. This needs local Postgres with `TEST_DATABASE_URL` and `TEST_DIRECT_DATABASE_URL` set (see `.env.example`).
- Panels still on the legacy store, end-to-end flows, `npm run db:setup` and `npm run worker` will fail until step 3 is finished and step 6 is built.

## Local setup (as it stands)
```bash
docker compose up -d
cp .env.example .env   # then fill in AUTH_SECRET, APP_ENCRYPTION_KEY and LINK_SIGNING_SECRET
npx dotenv -- prisma migrate deploy
npm run db:seed
npm run dev
```
Demo accounts: every seeded user, with password `Demo-Passw0rd-2026`. Accounts with 2FA use the demo secret `KIVIDEMOKIVIDEMOKIVIDEMOKIVIDEMO`. These are for development only.
