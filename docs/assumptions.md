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
