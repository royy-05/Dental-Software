# Assumptions and defaults

Where the Scope of Work (docs/spec.txt) was ambiguous, the prototype uses these defaults.

## Data and time
- All data is fake and lives in the browser (Zustand persisted to `localStorage` key `kivi-demo`). Names are invented, phone numbers use the reserved `555-01xx` range and emails use `example.com`.
- "60 days of appointments" = 45 past days + today + 14 future days, generated deterministically relative to the day you seed.
- Besides the 3 demo clinics with bookings (dental, physio, dermatology) there are 2 empty clinics (Riverside Family Dental: paused, part of the Bright Smile group; Northside Orthodontics: churned) so the super admin dashboard, groups and health alerts have something to show.
- Appointment times are stored as clinic wall-clock strings (`YYYY-MM-DDTHH:mm`) in the clinic's time zone. Patient local time is assumed to equal the clinic time zone (used for SMS quiet hours). DST transitions are not modelled.
- Audit and log timestamps are real UTC instants.
