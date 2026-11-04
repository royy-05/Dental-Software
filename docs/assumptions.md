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
