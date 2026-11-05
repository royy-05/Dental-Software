# Assumptions and defaults

Where the Scope of Work (docs/spec.txt) was ambiguous, the prototype uses these defaults.

## Data and time
- All data is fake and lives in the browser (Zustand persisted to `localStorage` key `kivi-demo`). Names are invented, phone numbers use the reserved `555-01xx` range and emails use `example.com`.
- "60 days of appointments" = 45 past days + today + 14 future days, generated deterministically relative to the day you seed.
- Besides the 3 demo clinics with bookings (dental, physio, dermatology) there are 2 empty clinics (Riverside Family Dental: paused, part of the Bright Smile group; Northside Orthodontics: churned) so the super admin dashboard, groups and health alerts have something to show.
- Appointment times are stored as clinic wall-clock strings (`YYYY-MM-DDTHH:mm`) in the clinic's time zone. Patient local time is assumed to equal the clinic time zone (used for SMS quiet hours). DST transitions are not modelled.
- Audit and log timestamps are real UTC instants.

## Clinic panel: Home and Appointments
- Home counts appointments by appointment date and leaves declined requests out; "% change" compares against the period of equal length just before.
- The Appointments tab shows every status except Declined; the Declined tab shows only declined requests.
- Staff bookings and staff reschedules ignore minimum notice, the booking window, the daily cap and online visibility, but still respect hours, breaks, time off, blockouts, operatories and existing bookings.
- Only unconfirmed requests can be declined. Cancel is offered for unconfirmed and confirmed appointments.
- Every time the appointment drawer opens, a "Viewed patient record" (phi_access) audit entry is written.
- When Hide PHI is on, CSV exports mask patient name, phone and email.
- The calendar's hours run from the clinic's earliest opening to its latest closing across the week. Week view colour-codes providers in each day column rather than giving each provider a lane.
- Uploaded files show only name and size (no file storage in the prototype).

## Clinic panel: Reasons, Providers, Schedule, Insurances, Templates
- The links stored on reasons (providers and rooms) and on providers (rooms) are the source of truth. The reverse lists on providers and rooms are rebuilt on every save so they never drift.
- Duplicating a reason creates an inactive copy right after the original, so it doesn't appear online until someone turns it on.
- A reason must have at least one provider to be saved.
- Template "rich text" is limited to `**bold**`, `_italic_` and `[text](url)`, shown as HTML in the email preview and stripped to plain text for SMS.
- Template test sends go to the signed-in user's email (email) or the clinic's alternate SMS number, falling back to the clinic phone (SMS), and use the simulated delivery outcome.
- Template previews use a fake sample patient ("Alex Sample") with the clinic's first reason and provider.
- Provider photos are kept in browser storage only when under 150 KB; otherwise initials are shown.
- Custom insurance carriers start as "In network".

## Clinic panel: Form Analytics, Performance, Settings, Support
- Performance "bookings" count appointments whose visit date falls in the range, excluding declined requests. "By source" and "Ad ROI" count bookings by the date they were made.
- Show rate = completed ÷ (completed + no-show). Completion rate = completed ÷ (completed + no-show + cancelled) among visits already past.
- A reason's estimated value = the reason's value × bookings that weren't cancelled and weren't no-shows.
- Provider utilization = booked minutes ÷ available minutes. Available = provider hours ∩ clinic hours, minus breaks, time off and holidays. Fill rate uses the same formula for the next 7 or 14 days.
- Form Analytics drop-off by step uses each visit's furthest step. Insurance and intake count as part of the Patient details step.
- Heatmaps use the clinic-local hour and weekday of each widget visit.
- Bookings from "Staff (manual)" have no widget visits, so their conversion shows as "—".
- Ad spend is entered per month for the current and previous 2 months.
- The custom booking slug is validated for uniqueness and used in embed code, but the hosted page still resolves by the default slug.
- Editing the Terms text bumps `termsVersion` to today's date.
- Only a clinic owner can invite or assign the Clinic Owner role. Inviting an email that already exists adds that user to the clinic instead of creating a new user.
- When a clinic replies to a pending, resolved or closed ticket, it goes back to "open".
- PDF export uses the browser print dialog with a print stylesheet. The monthly report email is a setting only. Stripe connect is a disabled "later phase" button. Custom-domain DNS is not checked. Logo uploads are stored as a data URL, capped at 200 KB.

## Super admin panel
- MRR counts only active clinics at plan price; trials are $0 and paused or suspended clinics are not billed. Churned MRR is the plan price of churned clinics.
- Platform conversion rate = booked widget sessions ÷ all widget sessions. Show rate = completed ÷ (completed + no-show) for visits in the period. The dashboard compares the last 30 days with the 30 days before.
- "Zero bookings in 7 days" alerts cover every clinic that is not churned, including paused ones.
- Ad cost per booking pro-rates monthly ad spend to the selected window and divides by bookings from paid sources (Google Ads + custom campaigns).
- Retention in Platform analytics treats a churned clinic as lost from its last-login month (logo retention).
- New clinics get a default "Room 1" operatory, referrers 1–4 (Google Ads, Google Business Profile, Reserve with Google, Website), copies of the global default templates, and flow v1 from the chosen starter template. Imported providers get default weekday 08:00–17:00 hours and are linked to every reason.
- Clone settings copies branding, clinic hours, settings, insurance settings and the published booking flow (as a new version), but not reasons, providers or appointments.
- Platform users invited from admin must set up 2FA at first login. Dunning emails are logged in the delivery log as clinic-bound emails using the "test" event type.
- Super Admins can edit everything. Support Agents can view clinics, groups, users, libraries, messaging logs, integrations, analytics and audit, can impersonate (reason required) and reset demo data, but cannot edit or delete anything.
- Owner invites, password-reset emails, DNS verification, PMS retry sync and backups are simulated with toasts or timestamps. The flow part of starter templates comes from the specialty default; clinics edit their copy in the builder.

## Patient widget and step/form builder
- Insurance and intake questions are sections of the Patient details screen (as in section 3), not separate screens. The builder still turns them on and off and sets their titles like steps.
- Per-reason questions always show for their reason, even with the Intake step off. They save immediately in the builder (not versioned) and apply to the live widget.
- With "Date first", the calendar shows times open for any bookable reason. The next step then lists only reasons that fit the chosen time.
- The 5-minute hold starts when a time slot is selected. When it expires the patient is asked to re-check the time; if it's gone they go back to the calendar.
- Thank-you redirect order is referrer redirect URL, then reason redirect URL, then the clinic's after-booking URL. The delay is capped at 0–20 s, and 0 redirects immediately.
- Booking source comes from the `referrer_id` referrer's source type; with no valid referrer it is "Direct link".
- The Terms and Privacy links use custom URLs when set, otherwise they open the clinic's built-in legal text in a dialog.
- OTP and file uploads appear only when both the plan feature flag and the builder toggle are on. OTP codes are shown in a toast; no text is sent.
- Applying a starter template replaces the draft but keeps the accepting-patients setting. Template default reasons are added inactive with no providers, so they aren't bookable until providers are assigned.
- Rolling back publishes the old version as a new version number, so history is never lost.
- `?theme=compact|full_page|reason_first` on the booking URL overrides the theme for demos, and `?embed=1` shows a compact header for iframe use.
- In /embed-demo the iframe and the parent page each hold their own copy of the store in memory (shared localStorage). Reload the clinic panel after booking inside an iframe.

## Phase 2A (production backend)

### Branch and process
- Work continues on `build/phase2a` as asked, with a commit and push after each finished step; the PR targets `main`.

### Database and isolation
- One Postgres database for all clinics with row-level security (not a schema per clinic). Every request runs in a transaction that sets `app.scope`/`app.clinic_id`; without a scope every clinic table returns no rows.
- Appointment, blockout and hold times stay clinic wall-clock values (`timestamp` without time zone), matching the Phase 1 convention; instants (`created_at`, log times) are `timestamptz`. Report ranges are clinic-local days; instants are converted with the clinic's time zone.
- Patients are matched within a clinic by last name + date of birth plus email or phone; a second booking by the same person updates that record.

### Auth
- Auth.js (credentials provider, JWT cookie) carries only a session id; the session row in Postgres is the source of truth (idle timeout, revocation). The browser also signs out after 30 idle minutes.
- Support agents never get direct clinic access; they impersonate (reason logged) and act as a Clinic Manager. Super admins act as the Clinic Owner.
- Deactivating a user revokes all of their sessions. Only a clinic owner can grant or remove the owner role.

### Booking engine
- Correctness under concurrency comes from a per-clinic transaction-scoped advisory lock plus re-validation; the gist exclusion constraints on provider and operatory are a last line of defence. Staff and patient bookings share one code path (staff ignore notice, window, cap and online visibility).
- Holds belong to a widget session id generated in the browser; a session can hold one slot at a time; holds last 5 minutes and are swept hourly.
- A cancelled or declined appointment cannot be re-confirmed; rescheduling it makes it unconfirmed again.
- Deleting a reason or operatory is refused while it has upcoming appointments.

### Patient links
- Links are HMAC-signed tokens over (appointment id, version, expiry); no database row per token. Reschedule and cancel bump the version so earlier links stop working and the newest message always carries a working link. Links expire 7 days after the visit start.
- Patient-initiated changes respect the cancellation window; staff changes do not.

### Notifications
- Delivery-log rows are written inside the booking transaction and delivered by the worker afterwards; a sweep every minute (and in the hourly tick) catches rows whose queue job was lost. Message bodies are rendered at queue time.
- Reminders and confirmation prompts are skipped at send time if the appointment is no longer unconfirmed/confirmed. Rescheduling marks the old reminders `skipped` and queues new ones.
- Quiet hours use the platform setting (21:00-08:00) in the clinic's time zone; patient local time is assumed to equal the clinic time zone.
- The mock SMS driver marks messages delivered immediately; numbers ending in 0000 fail (for demos). Email is `sent` until a provider webhook exists.
- The daily summary goes to the clinic alert email (and extra alert emails) at 17:00 clinic time, once per day.
- Dunning emails and template test sends are logged as clinic-bound `test` events.

### Reports
- SQL reports return exactly the shapes of the Phase 1 aggregators so the report screens did not change; ties in "drop-off by reason" are broken by name so the order is deterministic.
- Provider availability (hours ∩ clinic hours minus breaks, time off, holidays) is computed in code from the provider records; booked minutes come from SQL.

### Retention and patient rights
- The retention job deletes patients created before the cutoff who have no appointment on or after it; the deletion cascades to appointments, consents and messages and is audited with a system actor.
- Patient export returns the patient, appointments, consents and messages as JSON; deletion is immediate and irreversible.

### Queue and jobs
- pg-boss lives in the `pgboss` schema, created once by `npm run db:setup` with the owner role; the app and worker connect as `kivi_app` with `migrate: false`.
- The hourly tick is scheduled at minute 5 every hour and also runs on worker start.

### Not built in Phase 2A
- Twilio/MSG91 drivers, email delivery webhooks, object storage for uploads, OTP delivery, Reserve with Google, PMS, Stripe, calendar sync, custom domains, backups, custom roles.
