# API reference

Generated from the route specs by `npm run docs:api`. Every route runs **authenticate → authorize (role matrix, feature flags) → validate (zod) → act**; see `src/server/http.ts`.

Errors are `{ error: { code, message, details? } }` with HTTP status 400 (validation_error, bad_request), 401 (unauthorized, session_expired), 403 (forbidden, two_factor_setup_required, clinic_unavailable, not_accepting), 404, 409 (conflict, slot_taken, outside_window, not_active), 410 (link_invalid, link_stale), 429 (rate_limited, with Retry-After).

Times on appointments are clinic wall-clock strings (`YYYY-MM-DDTHH:mm`); `createdAt`, `at` and log timestamps are UTC instants.

| Method | Path | Access | Params / query / body | Summary |
| --- | --- | --- | --- | --- |
| GET | `/api/admin/analytics` | Platform role with `admin:analytics` | query: days | Platform analytics: compare clinics (bookings, conversion, show rate, source mix, ad cost per booking) and 12-month growth |
| PATCH | `/api/admin/announcements/:id` | Platform role with `admin:support` | params: id; body: active | Turn an announcement on or off |
| DELETE | `/api/admin/announcements/:id` | Platform role with `admin:support` | params: id | Delete an announcement |
| GET | `/api/admin/announcements` | Platform role with `admin:support` |  | Announcement banners |
| POST | `/api/admin/announcements` | Platform role with `admin:support` | body: message, clinicIds, tone | Post an announcement banner to all or selected clinics |
| GET | `/api/admin/audit` | Platform role with `admin:audit` | query: clinicId, category, q, limit | Audit log across the platform (who did what, when, from which IP), filterable |
| POST | `/api/admin/clinics/:id/clone` | Platform role with `admin:clinics:edit` | params: id; body: fromId | Clone branding, hours, settings and the published booking flow from another clinic |
| POST | `/api/admin/clinics/:id/delete` | Platform role with `admin:clinics:delete` | params: id | Soft delete a clinic (restorable for 30 days; booking page goes offline) |
| POST | `/api/admin/clinics/:id/restore` | Platform role with `admin:clinics:delete` | params: id | Restore a soft-deleted clinic |
| GET | `/api/admin/clinics/:id` | Platform role with `admin:clinics:view` | params: id | Clinic detail for the admin panel: clinic, plan, resolved features, staff, counts |
| PATCH | `/api/admin/clinics/:id` | Platform role with `admin:clinics:edit` | params: id; body: name, slug, specialty, timeZone, phone, email, address, description, status, planId, groupId, ownerUserId, trialEndsAt, featureOverrides, smsRegistration, customDomain, retentionDays, rwg, pms | Edit a clinic from the admin panel (details, status, plan, trial, feature overrides, SMS registration, custom domain, retention, integrations) |
| GET | `/api/admin/clinics` | Platform role with `admin:clinics:view` |  | All clinics (including soft-deleted) with plan, owner, bookings this month and last login |
| POST | `/api/admin/clinics` | Platform role with `admin:clinics:edit` | body: name, slug, specialty, timeZone, phone, email, address, planId, trial, owner, starterTemplateId, importReasons, importProviders | Add clinic wizard: details, slug, time zone, owner (existing or invite), plan, starter template, CSV import of reasons and providers |
| PATCH | `/api/admin/coupons/:id` | Platform role with `admin:billing` | params: id; body: active | Enable or disable a coupon |
| GET | `/api/admin/coupons` | Platform role with `admin:billing` |  | Coupons |
| POST | `/api/admin/coupons` | Platform role with `admin:billing` | body: code, percentOff | Create a coupon |
| POST | `/api/admin/demo/reset` | Platform role with `admin:seed` |  | DEMO_MODE only: wipe and re-seed the demo data |
| PATCH | `/api/admin/groups/:id` | Platform role with `admin:groups:edit` | params: id; body: name, ownerUserId, clinicIds, userIds | Edit a group: name, owner, member clinics, group-level users |
| DELETE | `/api/admin/groups/:id` | Platform role with `admin:groups:edit` | params: id | Delete a group (clinics and users are unlinked, not deleted) |
| GET | `/api/admin/groups` | Platform role with `admin:clinics:view` |  | Clinic groups (multi-location practices) with members |
| POST | `/api/admin/groups` | Platform role with `admin:groups:edit` | body: name, ownerUserId, clinicIds | Create a group |
| POST | `/api/admin/impersonation` | Platform role with `admin:impersonate` | body: clinicId, reason | Start 'Log in as clinic' (reason required, audited) |
| DELETE | `/api/admin/impersonation` | Platform role with `admin:impersonate` |  | End impersonation (audited) |
| POST | `/api/admin/invoices/:id/dunning` | Platform role with `admin:billing` | params: id | Send a dunning email for an overdue invoice (queued, logged) |
| PATCH | `/api/admin/invoices/:id` | Platform role with `admin:billing` | params: id; body: status | Set invoice status (paid, open, overdue, void) |
| GET | `/api/admin/invoices` | Platform role with `admin:billing` |  | Invoices across clinics |
| POST | `/api/admin/invoices` | Platform role with `admin:billing` | body: clinicId, amount, dueInDays | Create a manual invoice (manual billing until Stripe) |
| PATCH | `/api/admin/libraries/carriers/:id` | Platform role with `admin:libraries:edit` | params: id; body: name | Rename a master carrier (clinic copies follow) |
| DELETE | `/api/admin/libraries/carriers/:id` | Platform role with `admin:libraries:edit` | params: id | Remove a master carrier (clinic copies become custom carriers) |
| GET | `/api/admin/libraries/carriers` | Platform role with `admin:access` |  | Master insurance carrier list |
| POST | `/api/admin/libraries/carriers` | Platform role with `admin:libraries:edit` | body: name | Add a master carrier |
| PATCH | `/api/admin/libraries/legal/:id` | Platform role with `admin:libraries:edit` | params: id; body: title, body, version | Edit a legal template (bumps its version) |
| GET | `/api/admin/libraries/legal` | Platform role with `admin:access` |  | Legal page templates (Privacy Policy, Terms) |
| PATCH | `/api/admin/libraries/starters/:id` | Platform role with `admin:libraries:edit` | params: id; body: name, description, published, flow, defaultReasons | Edit or publish a starter template |
| GET | `/api/admin/libraries/starters` | Platform role with `admin:access` |  | Starter booking flows by specialty (published and drafts) |
| PATCH | `/api/admin/libraries/templates/:id` | Platform role with `admin:libraries:edit` | params: id; body: subject, body, enabled | Edit a global default template |
| GET | `/api/admin/libraries/templates` | Platform role with `admin:access` |  | Global default email and SMS templates |
| GET | `/api/admin/messages` | Platform role with `admin:messaging:view` | query: clinicId, channel, status, limit | Delivery logs across clinics (6.8) |
| DELETE | `/api/admin/opt-outs/:id` | Platform role with `admin:messaging:edit` | params: id | Remove an opt-out entry |
| GET | `/api/admin/opt-outs` | Platform role with `admin:messaging:view` |  | Bounce and opt-out lists across clinics |
| GET | `/api/admin/overview` | Platform role with `admin:access` |  | Super admin dashboard: clinic counts, platform bookings/conversion/show rate vs last 30 days, MRR, usage, health alerts (SQL) |
| PATCH | `/api/admin/plans/:id` | Platform role with `admin:plans:edit` | params: id; body: name, priceMonthly, limits | Edit a plan: name, price, limits and modules (feature flags per plan) |
| GET | `/api/admin/plans` | Platform role with `admin:access` |  | Plans with limits and modules |
| GET | `/api/admin/settings` | Platform role with `admin:access` |  | Platform settings: branding/white-label, retention, backups, maintenance mode, messaging providers, analytics defaults |
| PATCH | `/api/admin/settings` | Platform role with `admin:system:edit` | body: branding, dataRetentionDays, backups, maintenanceMode, messaging, integrations | Update platform settings (any top-level section) |
| POST | `/api/admin/tickets/:id/messages` | Platform role with `admin:support` | params: id; body: body, status | Reply to a ticket as the platform team (sets first response time; moves to pending) |
| PATCH | `/api/admin/tickets/:id` | Platform role with `admin:support` | params: id; body: status, priority, assigneeId | Assign, prioritise or change the status of a ticket |
| GET | `/api/admin/tickets` | Platform role with `admin:support` |  | Support desk: every clinic's tickets with replies |
| POST | `/api/admin/users/:id/reset-password` | Platform role with `admin:users:edit` | params: id | Email a password reset link to a user (audited) |
| PATCH | `/api/admin/users/:id` | Platform role with `admin:users:edit` | params: id; body: active, forceTwoFactor, groupId | Deactivate/reactivate, force 2FA, or move a user into a clinic group |
| GET | `/api/admin/users` | Platform role with `admin:users:view` |  | All users across clinics plus the platform team (role, clinics, last login, 2FA) |
| POST | `/api/admin/users` | Platform role with `admin:users:edit` | body: name, email, role | Invite a platform user (Super Admin or Support Agent); 2FA is required at first sign-in |
| POST | `/api/auth/2fa/confirm` | Signed in (allowed before 2FA setup) | body: code | Confirm TOTP enrolment with a current code |
| POST | `/api/auth/2fa/disable` | Signed in | body: password, code | Turn off own 2FA (password + code; refused when 2FA is enforced) |
| POST | `/api/auth/2fa/setup` | Signed in (allowed before 2FA setup) |  | Start TOTP enrolment: returns a new secret and otpauth URL |
| GET | `/api/auth/:nextauth*` | Auth.js | | Auth.js credentials sign-in, sign-out and session endpoints |
| POST | `/api/auth/:nextauth*` | Auth.js | | Auth.js credentials sign-in, sign-out and session endpoints |
| GET | `/api/auth/demo` | Public (rate limit: publicReadPerIp) |  | DEMO_MODE only: seeded demo accounts and the current demo 2FA code |
| GET | `/api/auth/invite/:token` | Public (rate limit: passwordResetPerIp) | params: token | Look up an invite (email and name) before accepting |
| POST | `/api/auth/invite/:token` | Public (rate limit: passwordResetPerIp) | params: token; body: password, name | Accept an invite: set name and password (password rules enforced) |
| POST | `/api/auth/password/change` | Signed in | body: current, next | Change own password (needs current password) |
| POST | `/api/auth/password/forgot` | Public | body: email | Email a password reset link (always 200; no account enumeration) |
| POST | `/api/auth/password/reset` | Public (rate limit: passwordResetPerIp) | body: token, password | Set a new password with a one-time reset token; revokes all sessions |
| GET | `/api/catalog/plans` | Signed in |  | Plan catalogue (names, prices, limits, modules) |
| GET | `/api/clinics/:clinicId/ad-spend` | Clinic role with `reports:view` and feature `performance` |  | Monthly ad spend per source (Ad ROI) |
| PUT | `/api/clinics/:clinicId/ad-spend` | Clinic role with `reports:view` and feature `performance` | body: month, source, amount | Set ad spend for a month and source |
| GET | `/api/clinics/:clinicId/announcements` | Clinic role with `clinic:home` |  | Active platform announcements addressed to this clinic |
| POST | `/api/clinics/:clinicId/appointments/:id/notes` | Clinic role with `appointments:manage` | params: clinicId, id; body: text | Add an internal note |
| POST | `/api/clinics/:clinicId/appointments/:id/notify` | Clinic role with `appointments:manage` | params: clinicId, id; body: event | Resend the confirmation or send a confirmation request |
| POST | `/api/clinics/:clinicId/appointments/:id/reschedule` | Clinic role with `appointments:manage` | params: clinicId, id; body: start, providerId | Reschedule by staff (ignores notice and window; respects hours, rooms and existing bookings) |
| GET | `/api/clinics/:clinicId/appointments/:id` | Clinic role with `patients:view` | params: clinicId, id | Appointment detail (status history, notes, consent); writes a 'Viewed patient record' audit entry |
| POST | `/api/clinics/:clinicId/appointments/:id/status` | Clinic role with `appointments:manage` | params: clinicId, id; body: status, note, declineReason | Confirm, cancel, decline (reason required), mark complete or no-show; patient is notified for cancel/decline |
| GET | `/api/clinics/:clinicId/appointments/export` | Clinic role with `appointments:export` | query: from, to, status, providerId, limit, tab, q, reasonId, source, patientType, hidePhi | CSV export of the filtered appointment list (audited; masks PHI when hidePhi=1) |
| GET | `/api/clinics/:clinicId/appointments` | Clinic role with `appointments:view` | query: from, to, status, providerId, limit | Appointments in a date window (list and calendar); detail rows carry patient, insurance, attribution and consent |
| POST | `/api/clinics/:clinicId/appointments` | Clinic role with `appointments:manage` | body: reasonId, providerId, start, patientType, patient, bookingForSomeoneElse, bookerName, insurance, answers, files, smsConsent, status | Manual (phone-in) booking by staff |
| GET | `/api/clinics/:clinicId/data` | Clinic role with `clinic:home` |  | Clinic configuration bundle: reasons, providers, operatories, referrers, insurances, booking flow (draft, published, versions) |
| POST | `/api/clinics/:clinicId/flow/publish` | Clinic role with `settings:manage` | body: config, note | Publish a config as a new live version |
| POST | `/api/clinics/:clinicId/flow/rollback` | Clinic role with `settings:manage` | body: version | Roll back: re-publish an earlier version as a new version |
| GET | `/api/clinics/:clinicId/flow` | Clinic role with `settings:manage` |  | Booking flow: draft, published config, versions |
| PUT | `/api/clinics/:clinicId/flow` | Clinic role with `settings:manage` | body: steps, order, reasonDisplay, fields, intakeFields, messages, rules, otpEnabled, fileUploadEnabled | Save the builder draft (not live until published) |
| GET | `/api/clinics/:clinicId/flow/template` | Clinic role with `settings:manage` |  | Published starter templates clinics can copy |
| POST | `/api/clinics/:clinicId/flow/template` | Clinic role with `settings:manage` | body: templateId | Replace the draft with a starter template (keeps the accepting-patients setting) |
| PUT | `/api/clinics/:clinicId/insurance-settings` | Clinic role with `insurances:manage` | body: acceptOtherInsurance, optionalFields, extraQuestions, warnings | Insurance settings: other insurance, optional fields, extra questions, warning messages |
| PATCH | `/api/clinics/:clinicId/insurances/:id` | Clinic role with `insurances:manage` | params: clinicId, id; body: status | Set a carrier's network status |
| DELETE | `/api/clinics/:clinicId/insurances/:id` | Clinic role with `insurances:manage` | params: clinicId, id | Remove a carrier from this clinic |
| GET | `/api/clinics/:clinicId/insurances` | Clinic role with `insurances:manage` |  | Carriers this clinic accepts, plus the master carrier list |
| POST | `/api/clinics/:clinicId/insurances` | Clinic role with `insurances:manage` | body: carrierIds, customNames | Add carriers from the master list and/or custom carriers (bulk) |
| GET | `/api/clinics/:clinicId/messages` | Clinic role with `appointments:view` | query: appointmentId, channel, status, to, limit | Delivery log (newest first); filter by appointment, channel, status or recipient |
| GET | `/api/clinics/:clinicId/notifications` | Clinic role with `clinic:home` |  | Latest 30 notifications for the bell |
| POST | `/api/clinics/:clinicId/notifications` | Clinic role with `clinic:home` | body: ids, all | Mark notifications read (ids, or all) |
| PATCH | `/api/clinics/:clinicId/operatories/:id` | Clinic role with `schedule:manage` | params: clinicId, id; body: name, active, providerIds, reasonIds | Edit an operatory and its links |
| DELETE | `/api/clinics/:clinicId/operatories/:id` | Clinic role with `schedule:manage` | params: clinicId, id | Delete an operatory (refused while it has upcoming appointments) |
| GET | `/api/clinics/:clinicId/operatories` | Clinic role with `appointments:view` |  | Operatories (rooms or chairs) with linked providers and reasons |
| POST | `/api/clinics/:clinicId/operatories` | Clinic role with `schedule:manage` | body: name, active, providerIds, reasonIds | Add an operatory |
| GET | `/api/clinics/:clinicId/opt-outs` | Clinic role with `appointments:view` |  | SMS opt-outs and email bounces for this clinic |
| GET | `/api/clinics/:clinicId/patients/:id` | Clinic role with `patients:view` | params: clinicId, id | Export everything stored about one patient (JSON) — audited |
| DELETE | `/api/clinics/:clinicId/patients/:id` | Clinic role with `settings:manage` | params: clinicId, id | Delete a patient and their appointments, consents and messages (irreversible; audited) |
| PATCH | `/api/clinics/:clinicId/profile` | Clinic role with `settings:manage` | body: name, phone, email, address, description, branding, settings, rwg, retentionDays | Update clinic profile and settings (audited with the changed sections) |
| PATCH | `/api/clinics/:clinicId/providers/:id` | Clinic role with `providers:manage` | params: clinicId, id; body: displayName, externalId, photoUrl, role, bio, weeklyHours, breaks, timeOff, operatoryIds, reasonIds, showOnline, active, color | Edit a provider (profile, hours, breaks, time off, rooms, reasons offered, online visibility) |
| GET | `/api/clinics/:clinicId/providers` | Clinic role with `appointments:view` |  | Providers with hours, breaks, time off and links |
| POST | `/api/clinics/:clinicId/providers` | Clinic role with `providers:manage` | body: displayName, externalId, photoUrl, role, bio, weeklyHours, breaks, timeOff, operatoryIds, reasonIds, showOnline, active, color | Add a provider |
| POST | `/api/clinics/:clinicId/reasons/:id/duplicate` | Clinic role with `reasons:manage` | params: clinicId, id | Duplicate a reason as an inactive copy placed right after it |
| PATCH | `/api/clinics/:clinicId/reasons/:id` | Clinic role with `reasons:manage` | params: clinicId, id; body: name, description, longDescription, duration, patientType, providerIds, operatoryIds, color, estimatedValue, visibility, active, questions, redirectUrl, noticeOverrideHours | Edit a reason (any subset of fields; links replace the stored links) |
| DELETE | `/api/clinics/:clinicId/reasons/:id` | Clinic role with `reasons:manage` | params: clinicId, id | Delete a reason (refused while it has upcoming appointments) |
| POST | `/api/clinics/:clinicId/reasons/reorder` | Clinic role with `reasons:manage` | body: ids | Set the display order of every reason |
| GET | `/api/clinics/:clinicId/reasons` | Clinic role with `appointments:view` |  | Reasons for visit in display order |
| POST | `/api/clinics/:clinicId/reasons` | Clinic role with `reasons:manage` | body: name, description, longDescription, duration, patientType, providerIds, operatoryIds, color, estimatedValue, visibility, active, questions, redirectUrl, noticeOverrideHours | Add a reason for visit (needs at least one provider) |
| PATCH | `/api/clinics/:clinicId/referrers/:id` | Clinic role with `settings:manage` | params: clinicId, id; body: name, sourceType, redirectUrl | Edit a referrer |
| DELETE | `/api/clinics/:clinicId/referrers/:id` | Clinic role with `settings:manage` | params: clinicId, id | Delete a referrer (past bookings keep their source) |
| GET | `/api/clinics/:clinicId/referrers` | Clinic role with `appointments:view` |  | Referrers (tracked booking links) |
| POST | `/api/clinics/:clinicId/referrers` | Clinic role with `settings:manage` | body: name, sourceType, redirectUrl | Add a referrer; the server assigns the next numeric id |
| GET | `/api/clinics/:clinicId/reports/form-analytics` | Clinic role with `reports:view` | query: from, to, source | Form Analytics: visits, bookings, drop-off by step and reason, heatmaps (SQL over widget sessions; no PHI) |
| GET | `/api/clinics/:clinicId/reports/home` | Clinic role with `clinic:home` | query: from, to | Home metrics for a date range: total, change vs previous period, trend, new vs returning (SQL) |
| GET | `/api/clinics/:clinicId/reports/performance` | Clinic role with `reports:view` and feature `performance` | query: from, to, export | Performance report (overview, by source, ad ROI, patients, reasons, providers, timing) in SQL; export=csv|pdf audits an export |
| GET | `/api/clinics/:clinicId` | Clinic role with `clinic:home` |  | Clinic profile, settings, plan and resolved feature flags |
| DELETE | `/api/clinics/:clinicId/schedule/blockouts/:id` | Clinic role with `schedule:manage` | params: clinicId, id | Remove a blockout |
| POST | `/api/clinics/:clinicId/schedule/blockouts` | Clinic role with `schedule:manage` | body: label, start, end, providerId, operatoryId | Add a blockout (whole clinic, one provider or one room) |
| DELETE | `/api/clinics/:clinicId/schedule/holidays/:id` | Clinic role with `schedule:manage` | params: clinicId, id | Remove a holiday |
| POST | `/api/clinics/:clinicId/schedule/holidays` | Clinic role with `schedule:manage` | body: date, name | Add a holiday (clinic closed all day) |
| PUT | `/api/clinics/:clinicId/schedule/hours` | Clinic role with `schedule:manage` | body: 0, 1, 2, 3, 4, 5, 6 | Set clinic opening hours |
| GET | `/api/clinics/:clinicId/slots` | Clinic role with `appointments:manage` | query: reasonId, date, providerId, ignoreAppointmentId | Staff slots for a day (staff override rules) |
| POST | `/api/clinics/:clinicId/sms/simulate` | Clinic role with `appointments:manage` | body: from, text | DEMO_MODE only: simulate an inbound patient SMS (C / STOP / HELP / START) |
| POST | `/api/clinics/:clinicId/templates/:id/reset` | Clinic role with `templates:manage` | params: clinicId, id | Reset a template to the global default |
| PATCH | `/api/clinics/:clinicId/templates/:id` | Clinic role with `templates:manage` | params: clinicId, id; body: subject, body, enabled | Edit a template (subject, body, on/off); editing a global default creates the clinic's copy |
| POST | `/api/clinics/:clinicId/templates/:id/test` | Clinic role with `templates:manage` | params: clinicId, id | Send a test of this template with sample data to yourself (email) or the clinic number (SMS) |
| GET | `/api/clinics/:clinicId/templates` | Clinic role with `templates:manage` |  | Message templates for every event and channel (clinic copies, global defaults where none) |
| POST | `/api/clinics/:clinicId/tickets/:id/messages` | Clinic role with `support:raise` | params: clinicId, id; body: body | Reply to a ticket (reopens it) |
| GET | `/api/clinics/:clinicId/tickets` | Clinic role with `support:raise` |  | This clinic's support tickets with replies |
| POST | `/api/clinics/:clinicId/tickets` | Clinic role with `support:raise` | body: subject, category, priority, body, screenshotName | Raise a ticket (goes to the Super Admin support queue) |
| PATCH | `/api/clinics/:clinicId/users/:userId` | Clinic role with `users:manage` | params: clinicId, userId; body: role, active | Change a staff member's role in this clinic or deactivate/reactivate their login |
| DELETE | `/api/clinics/:clinicId/users/:userId` | Clinic role with `users:manage` | params: clinicId, userId | Remove a staff member from this clinic |
| GET | `/api/clinics/:clinicId/users` | Clinic role with `users:manage` |  | Staff with access to this clinic |
| POST | `/api/clinics/:clinicId/users` | Clinic role with `users:manage` | body: name, email, role | Invite staff (email with a 7-day link; existing users are just added) |
| GET | `/api/me` | Signed in (allowed before 2FA setup) |  | Current user, clinic access and effective permissions |
| GET | `/api/public/clinics/:slug/availability` | Public (rate limit: publicReadPerIp) | params: slug; query: reasonId, from, days, providerId, sessionId | Bookable slot counts per day for the month calendar |
| POST | `/api/public/clinics/:slug/bookings` | Public (rate limit: publicBookingPerIp) | params: slug; body: reasonId, providerId, start, patientType, patient, bookingForSomeoneElse, bookerName, insurance, answers, files, smsConsent, holdId, sessionId, referrerId, utm, gclid, fbclid, website | Book an appointment from the widget (rate limited, honeypot, slot re-checked under lock) |
| POST | `/api/public/clinics/:slug/events` | Public (rate limit: publicReadPerIp) | params: slug; body: sessionId, events | Record widget funnel events for Form Analytics (ids and step names only, never PHI) |
| POST | `/api/public/clinics/:slug/holds` | Public (rate limit: publicHoldPerIp) | params: slug; body: reasonId, start, providerId, sessionId | Hold a slot for 5 minutes during checkout (replaces the session's earlier hold) |
| DELETE | `/api/public/clinics/:slug/holds` | Public (rate limit: publicHoldPerIp) | params: slug; body: holdId, sessionId | Release a hold early |
| GET | `/api/public/clinics/:slug` | Public (rate limit: publicReadPerIp) | params: slug | Public booking bundle for a clinic slug: branding, published flow, bookable reasons, online providers, insurances, referrers |
| GET | `/api/public/clinics/:slug/slots` | Public (rate limit: publicReadPerIp) | params: slug; query: reasonId, date, providerId, sessionId | Bookable slots for one day (first available per time unless a provider is given) |
| GET | `/api/public/manage/:token/availability` | Public (rate limit: manageLinkPerIp) | params: token; query: from, days, providerId | Day availability for a patient reschedule |
| POST | `/api/public/manage/:token/cancel` | Public (rate limit: manageLinkPerIp) | params: token; body: note | Patient cancels from a signed link (inside the cancellation window) |
| POST | `/api/public/manage/:token/reschedule` | Public (rate limit: manageLinkPerIp) | params: token; body: start, providerId | Patient reschedules from a signed link (inside the cancellation window; link version is bumped) |
| GET | `/api/public/manage/:token` | Public (rate limit: manageLinkPerIp) | params: token | Patient view of an appointment from a signed link (confirmation and manage pages) |
| GET | `/api/public/manage/:token/slots` | Public (rate limit: manageLinkPerIp) | params: token; query: date, providerId | Slots for a patient reschedule (the appointment's own time does not block) |
| POST | `/api/webhooks/sms` | Public (rate limit: publicReadPerIp) | body: clinicSlug, from, text | Inbound SMS webhook: C confirms, STOP/START opt out or in, HELP answers; auto-reply queued |

147 endpoints.
