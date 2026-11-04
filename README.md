# Kivi Health Booking Platform — Phase 1 clickable prototype

A multi-clinic healthcare appointment booking SaaS prototype built from
[`docs/Kivi_Health_Booking_Platform_Scope_of_Work.docx`](docs/Kivi_Health_Booking_Platform_Scope_of_Work.docx)
(plain-text copy: [`docs/spec.txt`](docs/spec.txt)).

There is **no backend**. Everything runs in the browser on fake demo data that is saved to `localStorage`.
No real patient data is used and nothing is sent to analytics or ad platforms.

## Run it

Requirements: Node.js 20+ and npm.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000.

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build && npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Vitest unit tests (slot engine, flow rules, notifications, reports, seed) |
| `npm run check` | lint + typecheck + tests |

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS · shadcn/ui-style components (Radix) · Zustand (persisted to
`localStorage`) · Recharts · date-fns · react-hook-form + zod · dnd-kit · Vitest.

## Where things are

| Path | What |
| --- | --- |
| `/` | Start page with links into every area |
| `/login` | Fake login with a role switcher (Super Admin, Support Agent, Clinic Owner, Clinic Manager, Front Desk) and the permission matrix |
| `/book/[clinicSlug]` | Patient booking widget (themes: Compact, Full Page, Reason First). Accepts `referrer_id`, `utm_*`, `gclid`, `fbclid`, `theme`, `embed=1` |
| `/book/[clinicSlug]/confirmed/[token]` | Confirmation page (add to calendar, directions, call) or timed redirect |
| `/book/[clinicSlug]/manage/[token]` | Patient reschedule / cancel link used in every email and SMS |
| `/embed-demo` | Inline, popup and floating “Book Online” embed modes |
| `/clinic/...` | Clinic panel: 11 modules (section 5) |
| `/clinic/settings/booking-flow` | Step and form builder (section 4) |
| `/admin/...` | Super admin panel (section 6) |

Code layout:

```
src/
  app/(auth)/login            fake login
  app/(patient)/book, embed-demo   patient-facing pages
  app/(panel)/clinic, admin   clinic panel and super admin panel
  components/ui               shadcn/ui primitives (hand-written)
  components/shared           states (loading/empty/error), guards, PHI mask, range picker
  components/widget, builder  booking widget and step/form builder
  components/messaging        delivery log + two-way SMS simulator
  lib/slots.ts                slot engine (+ slots.test.ts)
  lib/flow.ts                 conditional rules and step order
  lib/notify.ts               email/SMS notification simulator, quiet hours, two-way SMS
  lib/permissions.ts          role permission matrix + feature flags
  mock/                       typed mock data and generators (3 demo clinics, 60 days of appointments)
  store/app.ts                Zustand store and actions
  types/index.ts              shared domain types (spec field names)
```

## Demo data and reset

The first visit seeds 3 demo clinics with bookings — **Bright Smile Dental** (dental, Full Page theme),
**Motion Physio & Rehab** (physio, Compact theme, provider step on) and **Clear Skin Dermatology** (dermatology,
Reason First theme, Starter plan so Performance is hidden) — plus 2 empty clinics (one paused, one churned) for the
admin views. Appointments cover 45 past days, today and 14 future days.

To start over: **Super admin → Dashboard → Reset demo data** (also on System & white-label), or clear the
`kivi-demo` key in your browser's localStorage.

Every list screen supports `?demo=loading`, `?demo=empty` and `?demo=error` in the URL so reviewers can see the
loading, empty and error states.

## Demo script (about 15 minutes)

1. **Log in as Clinic Owner** at `/login` (Olivia Chen). Note the clinic selector (4 clinics), Hide PHI switch,
   notifications bell and Raise a Ticket in the top bar.
2. **Home**: switch the range between Today / This week / This month and see the trend and % change.
3. **Book as a patient**: open `/book/bright-smile-dental?referrer_id=1&utm_source=google&utm_medium=cpc&utm_campaign=demo&gclid=TEST123`
   in a new tab. Pick *Emergency Exam* (note the per-reason “Which tooth is hurting?” question), a time, tick
   “I'm booking for someone else”, answer insurance *Yes → Guardian* (out-of-network warning), give SMS consent and book.
   The review step shows the 5-minute slot hold. Use *Add to calendar* on the confirmation page.
4. **Back in the clinic panel**: the bell shows the new booking. Open it in **Appointments**: the drawer shows
   source *Google Ads*, referrer 1, the UTM tags and gclid, the simulated email/SMS message log and the status history.
   Confirm it, add an internal note, reschedule it, then try *Decline with reason* on another booking.
5. **Two-way SMS**: Settings → Notifications → Two-way SMS simulator. Reply **C** for an unconfirmed booking and watch
   its status change to Confirmed; reply **STOP** and see the number appear in the opt-out list.
6. **Calendar**: Appointments → Calendar, day and week views per provider.
7. **Builder**: Settings → Booking flow & scheduling → *Open step and form builder*. Turn on the Provider step,
   add a dropdown field shown only when *Patient type is New*, drag it above *Email*, watch the live mobile preview,
   *Publish*, then *Roll back* to version 1.
8. **Hide PHI**: flip the switch and see names, phones and emails masked everywhere.
9. **Switch to Front Desk** (Fiona Diaz): only Home, Appointments and Support remain. Settings URLs show “no access”.
10. **Log in as Super Admin**: Dashboard (clinic counts, MRR, usage, health alerts), Clinics → *Add clinic* wizard,
    *Log in as clinic* (reason required, written to the audit log), Feature flags → turn **Performance** on for
    Clear Skin Dermatology and see the module appear in its clinic panel, Support desk → reply to a ticket,
    Messaging → delivery logs, Audit log.
11. **Switch to Support Agent**: billing is hidden and plan/feature/delete actions are read-only.
12. **Reset demo data** from the admin dashboard.

## What is real vs simulated

See the pull request description and [`docs/assumptions.md`](docs/assumptions.md). In short: booking rules, slot
engine, conditional forms, permissions, feature flags, analytics aggregation and the notification rules (templates,
per-event on/off, consent, opt-outs, quiet hours, reminders, two-way replies) all run for real in the browser;
email/SMS delivery, Stripe, PMS sync, Reserve with Google, OTP codes, file storage and logins are simulated.
