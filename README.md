# Kivi Health Booking Platform — Phase 2A (production backend)

A multi-clinic healthcare appointment booking SaaS built from
[`docs/Kivi_Health_Booking_Platform_Scope_of_Work.docx`](docs/Kivi_Health_Booking_Platform_Scope_of_Work.docx)
(plain-text copy: [`docs/spec.txt`](docs/spec.txt)).

Phase 1 was a clickable prototype that ran on fake data in the browser. Phase 2A (this branch) adds the real
backend: Postgres with row-level security, logins with 2FA, a transactional booking engine, an API for every
module, a message queue and worker, SQL reports, end-to-end tests and CI. The three panels (patient widget,
clinic panel, super admin panel) now read and write through that API. All demo data is still fake.

Status: [`docs/phase2a-status.md`](docs/phase2a-status.md) · API: [`docs/api.md`](docs/api.md) · Decisions: [`docs/assumptions.md`](docs/assumptions.md)

## Run it

Requirements: Node.js 22+, npm, Docker (for Postgres) or a local Postgres 16.

```bash
docker compose up -d
```

```bash
cp .env.example .env
```

Fill in `AUTH_SECRET`, `APP_ENCRYPTION_KEY` and `LINK_SIGNING_SECRET` (`openssl rand -base64 32` each), then:

```bash
npm install
```

```bash
npm run db:setup
```

```bash
npm run dev
```

```bash
npm run worker
```

Open http://localhost:3000. The worker (second terminal) delivers queued email and SMS, sends reminders and
daily summaries, purges expired holds and old patient data.

Demo accounts (password `Demo-Passw0rd-2026`) are listed on `/login` while `DEMO_MODE=true`; accounts with 2FA use
the demo authenticator secret shown there. Never enable `DEMO_MODE` in production.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `npm run build && npm start` | Next.js app |
| `npm run worker` | pg-boss worker: message delivery, reminders, daily summaries, hourly maintenance |
| `npm run db:setup` | `prisma migrate deploy`, create the job queue, seed the demo data |
| `npm run db:seed` | Re-seed the demo data (also available from the super admin dashboard in demo mode) |
| `npm run check` | lint + typecheck + vitest (unit and Postgres integration tests; needs `TEST_DATABASE_URL`) |
| `npm run test:unit` | Unit tests only (no database) |
| `npm run test:e2e` | Playwright end-to-end tests against the running app and the seeded database |
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
