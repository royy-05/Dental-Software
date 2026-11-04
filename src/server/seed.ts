/**
 * Loads the Phase 1 demo dataset (src/mock, all fake) into Postgres: 3 demo clinics with 60 days of
 * appointments, 2 empty clinics, platform users, plans, templates and logs.
 * Used by `npm run db:seed`, the integration tests and the demo reset action.
 */
import type { PrismaClient } from "@prisma/client";
import { buildSeed } from "@/mock";
import { withPlatform, type Tx } from "./db";
import { hashPassword } from "./auth/password";
import { encrypt } from "./auth/crypto";
import { clinicData, dayToDb, json, wallToDb } from "./mappers";
import { zonedWallToUtc } from "@/lib/tz";

/** Base32 secret shared by the seeded demo accounts that have 2FA on. Development only. */
export const DEMO_TOTP_SECRET = "KIVIDEMOKIVIDEMOKIVIDEMOKIVIDEMO";
export const DEFAULT_DEMO_PASSWORD = "Demo-Passw0rd-2026";

const TABLES = [
  "audit_logs", "notifications", "opt_outs", "message_logs", "message_templates", "widget_events", "widget_sessions",
  "slot_holds", "consent_records", "appointment_notes", "status_history", "appointments", "patients", "flow_versions",
  "clinic_flows", "referrers", "clinic_insurances", "reason_operatories", "reason_providers", "reasons",
  "provider_operatories", "provider_time_off", "provider_breaks", "provider_hours", "providers", "operatories",
  "blockouts", "holidays", "feature_flags", "memberships", "ticket_messages", "tickets", "invoices", "ad_spend",
  "auth_tokens", "auth_sessions", "rate_limits", "clinics", "users", "clinic_groups", "plans", "coupons",
  "announcements", "legal_templates", "starter_templates", "insurance_carriers", "platform_settings",
];

/** Delete every application row. Requires platform scope (FORCE RLS applies to the owner too). */
export async function wipe(tx: Tx) {
  await tx.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
}

const chunk = <T,>(arr: T[], n = 1000): T[][] => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

export interface SeedOptions {
  now?: Date;
  password?: string;
  client?: PrismaClient;
}

export async function seedDatabase(opts: SeedOptions = {}) {
  const now = opts.now ?? new Date();
  const db = buildSeed(now);
  const passwordHash = await hashPassword(opts.password ?? process.env.SEED_DEMO_PASSWORD ?? DEFAULT_DEMO_PASSWORD);
  const totpEnc = encrypt(DEMO_TOTP_SECRET);

  await withPlatform(
    async (tx) => {
      await wipe(tx);

      // ---- platform catalogue
      await tx.plan.createMany({ data: db.plans.map((p) => ({ id: p.id, name: p.name, priceMonthly: p.priceMonthly, limits: json(p.limits) })) });
      await tx.platformSetting.create({ data: { id: "platform", value: json(db.platform) } });
      await tx.insuranceCarrier.createMany({ data: db.carriers });
      await tx.starterTemplate.createMany({ data: db.starterTemplates.map((t) => ({ ...t, flow: json(t.flow), defaultReasons: json(t.defaultReasons) })) });
      await tx.legalTemplate.createMany({ data: db.legalTemplates });
      await tx.coupon.createMany({ data: db.coupons });
      await tx.announcement.createMany({ data: db.announcements.map((a) => ({ ...a, clinicIds: json(a.clinicIds), createdAt: new Date(a.createdAt) })) });

      // ---- groups, clinics, users
      await tx.clinicGroup.createMany({ data: db.groups.map((g) => ({ id: g.id, name: g.name, ownerUserId: g.ownerUserId })) });
      for (const c of db.clinics) {
        await tx.clinic.create({ data: { id: c.id, ...clinicData(c), createdAt: new Date(c.createdAt) } });
        if (c.holidays.length) await tx.holiday.createMany({ data: c.holidays.map((h) => ({ id: h.id, clinicId: c.id, date: dayToDb(h.date), name: h.name })) });
        if (c.blockouts.length)
          await tx.blockout.createMany({ data: c.blockouts.map((b) => ({ id: b.id, clinicId: c.id, label: b.label, start: wallToDb(b.start), end: wallToDb(b.end), providerId: b.providerId ?? null, operatoryId: b.operatoryId ?? null })) });
        const flags = Object.entries(c.featureOverrides).filter(([, v]) => v !== undefined);
        if (flags.length) await tx.featureFlag.createMany({ data: flags.map(([key, enabled]) => ({ clinicId: c.id, key, enabled: !!enabled })) });
      }
      for (const u of db.users) {
        const platformRole = u.role === "super_admin" || u.role === "support_agent" ? u.role : null;
        await tx.user.create({
          data: {
            id: u.id,
            name: u.name,
            email: u.email.toLowerCase(),
            passwordHash,
            platformRole,
            groupId: u.groupId ?? null,
            twoFactor: u.twoFactor,
            totpSecretEnc: u.twoFactor ? totpEnc : null,
            forceTwoFactor: !!u.forceTwoFactor,
            active: u.active,
            lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt) : null,
            invitedAt: u.invitedAt ? new Date(u.invitedAt) : null,
            passwordChangedAt: now,
          },
        });
        if (!platformRole) await tx.membership.createMany({ data: u.clinicIds.map((clinicId) => ({ clinicId, userId: u.id, role: u.role })) });
      }

      // ---- clinic configuration
      await tx.operatory.createMany({ data: db.operatories.map((o, i) => ({ id: o.id, clinicId: o.clinicId, name: o.name, active: o.active, order: i })) });
      await tx.provider.createMany({
        data: db.providers.map((p, i) => ({ id: p.id, clinicId: p.clinicId, displayName: p.displayName, externalId: p.externalId, photoUrl: p.photoUrl ?? null, role: p.role, bio: p.bio, showOnline: p.showOnline, active: p.active, color: p.color, order: i })),
      });
      await tx.providerHours.createMany({
        data: db.providers.flatMap((p) => Object.entries(p.weeklyHours).map(([wd, h]) => ({ clinicId: p.clinicId, providerId: p.id, weekday: Number(wd), enabled: h.enabled, start: h.start, end: h.end }))),
      });
      await tx.providerBreak.createMany({
        data: db.providers.flatMap((p) => p.breaks.map((b) => ({ id: b.id, clinicId: p.clinicId, providerId: p.id, weekday: b.weekday === "all" ? null : b.weekday, start: b.start, end: b.end, label: b.label }))),
      });
      await tx.providerTimeOff.createMany({
        data: db.providers.flatMap((p) => p.timeOff.map((t) => ({ id: t.id, clinicId: p.clinicId, providerId: p.id, start: dayToDb(t.start), end: dayToDb(t.end), reason: t.reason }))),
      });
      await tx.providerOperatory.createMany({ data: db.providers.flatMap((p) => p.operatoryIds.map((operatoryId) => ({ clinicId: p.clinicId, providerId: p.id, operatoryId }))) });
      await tx.reason.createMany({
        data: db.reasons.map((r) => ({
          id: r.id, clinicId: r.clinicId, name: r.name, description: r.description, longDescription: r.longDescription, duration: r.duration,
          patientType: r.patientType, color: r.color, estimatedValue: r.estimatedValue, visibility: r.visibility, active: r.active, order: r.order,
          questions: json(r.questions), redirectUrl: r.redirectUrl ?? null, noticeOverrideHours: r.noticeOverrideHours ?? null,
        })),
      });
      await tx.reasonProvider.createMany({ data: db.reasons.flatMap((r) => r.providerIds.map((providerId) => ({ clinicId: r.clinicId, reasonId: r.id, providerId }))) });
      await tx.reasonOperatory.createMany({ data: db.reasons.flatMap((r) => r.operatoryIds.map((operatoryId) => ({ clinicId: r.clinicId, reasonId: r.id, operatoryId }))) });
      await tx.clinicInsurance.createMany({ data: db.clinicInsurances.map((i) => ({ id: i.id, clinicId: i.clinicId, carrierId: i.carrierId ?? null, name: i.name, status: i.status, custom: i.custom })) });
      await tx.referrer.createMany({ data: db.referrers.map((r) => ({ clinicId: r.clinicId, publicId: Number(r.id), name: r.name, sourceType: r.sourceType, redirectUrl: r.redirectUrl ?? null })) });
      for (const f of db.flows) {
        await tx.clinicFlow.create({ data: { clinicId: f.clinicId, draft: json(f.draft), publishedVersion: f.publishedVersion } });
        await tx.flowVersion.createMany({ data: f.versions.map((v) => ({ id: v.id, clinicId: v.clinicId, version: v.version, publishedAt: new Date(v.publishedAt), publishedBy: v.publishedBy, note: v.note, config: json(v.config) })) });
      }
      await tx.messageTemplate.createMany({ data: db.templates.map((t) => ({ id: t.id, clinicId: t.clinicId, event: t.event, channel: t.channel, subject: t.subject, body: t.body, enabled: t.enabled })) });

      // ---- patients and appointments (fake people only)
      const patientKey = (clinicId: string, p: { email: string; dob: string; lastName: string }) => `${clinicId}|${p.email.toLowerCase()}|${p.dob}|${p.lastName.toLowerCase()}`;
      const patients = new Map<string, { id: string; clinicId: string; firstName: string; lastName: string; dob: string; phone: string; email: string; createdAt: Date }>();
      for (const a of db.appointments) {
        const k = patientKey(a.clinicId, a.patient);
        if (!patients.has(k)) patients.set(k, { id: `pt_${patients.size + 1}`, clinicId: a.clinicId, firstName: a.patient.firstName, lastName: a.patient.lastName, dob: a.patient.dob, phone: a.patient.phone, email: a.patient.email.toLowerCase(), createdAt: new Date(a.createdAt) });
      }
      for (const part of chunk([...patients.values()])) await tx.patient.createMany({ data: part });
      for (const part of chunk(db.appointments)) {
        await tx.appointment.createMany({
          data: part.map((a) => ({
            id: a.id, clinicId: a.clinicId, patientId: patients.get(patientKey(a.clinicId, a.patient))!.id, createdAt: new Date(a.createdAt),
            start: wallToDb(a.start), end: wallToDb(a.end), reasonId: a.reasonId, providerId: a.providerId, operatoryId: a.operatoryId ?? null,
            patientType: a.patientType, message: a.patient.message ?? null, bookingForSomeoneElse: a.bookingForSomeoneElse, bookerName: a.bookerName ?? null,
            insurance: json(a.insurance), answers: json(a.answers), files: json(a.files), source: a.source, referrerId: a.referrerId ?? null,
            utmSource: a.utm.source ?? null, utmMedium: a.utm.medium ?? null, utmCampaign: a.utm.campaign ?? null, utmTerm: a.utm.term ?? null, utmContent: a.utm.content ?? null,
            gclid: a.gclid ?? null, fbclid: a.fbclid ?? null, status: a.status, declineReason: a.declineReason ?? null, bookedBy: a.bookedBy,
          })),
        });
        await tx.statusHistory.createMany({ data: part.flatMap((a) => a.statusHistory.map((h) => ({ clinicId: a.clinicId, appointmentId: a.id, status: h.status, at: new Date(h.at), by: h.by, note: h.note ?? null }))) });
        await tx.appointmentNote.createMany({ data: part.flatMap((a) => a.notes.map((n) => ({ clinicId: a.clinicId, appointmentId: a.id, at: new Date(n.at), by: n.by, text: n.text }))) });
        await tx.consentRecord.createMany({
          data: part
            .filter((a) => a.smsConsent.at)
            .map((a) => ({ clinicId: a.clinicId, patientId: patients.get(patientKey(a.clinicId, a.patient))!.id, appointmentId: a.id, kind: "sms", given: a.smsConsent.given, at: new Date(a.smsConsent.at!), ip: a.smsConsent.ip ?? null, termsVersion: a.smsConsent.termsVersion ?? "unknown" })),
        });
      }
      for (const part of chunk(db.widgetSessions)) await tx.widgetSession.createMany({ data: part.map((w) => ({ ...w, at: new Date(w.at), reasonId: w.reasonId ?? null })) });

      // ---- messaging, support, billing, audit
      const tzOf = (clinicId: string) => db.clinics.find((c) => c.id === clinicId)?.timeZone ?? "UTC";
      for (const part of chunk(db.messages))
        await tx.messageLog.createMany({
          data: part.map((m) => ({
            id: m.id, clinicId: m.clinicId, appointmentId: m.appointmentId ?? null, channel: m.channel, direction: m.direction, recipientType: m.recipientType,
            to: m.to, event: m.event, subject: m.subject ?? null, body: m.body, status: m.status, createdAt: new Date(m.createdAt),
            scheduledFor: m.scheduledFor ? zonedWallToUtc(m.scheduledFor, tzOf(m.clinicId)) : null, error: m.error ?? null, provider: "seed",
          })),
        });
      await tx.optOut.createMany({ data: db.optOuts.map((o) => ({ id: o.id, clinicId: o.clinicId, phone: o.phone, kind: o.kind, at: new Date(o.at) })) });
      await tx.notification.createMany({ data: db.notifications.map((n) => ({ id: n.id, clinicId: n.clinicId, at: new Date(n.at), title: n.title, body: n.body, read: n.read, href: n.href ?? null })) });
      for (const t of db.tickets) {
        await tx.ticket.create({
          data: {
            id: t.id, clinicId: t.clinicId, subject: t.subject, category: t.category, priority: t.priority, status: t.status, createdAt: new Date(t.createdAt),
            createdBy: t.createdBy, assigneeId: t.assigneeId ?? null, screenshotName: t.screenshotName ?? null, firstResponseAt: t.firstResponseAt ? new Date(t.firstResponseAt) : null,
            messages: { create: t.messages.map((m) => ({ id: m.id, clinicId: t.clinicId, at: new Date(m.at), authorName: m.authorName, authorRole: m.authorRole, body: m.body })) },
          },
        });
      }
      await tx.invoice.createMany({ data: db.invoices.map((i) => ({ ...i, issuedAt: new Date(i.issuedAt), dueAt: new Date(i.dueAt) })) });
      await tx.adSpend.createMany({ data: db.adSpend.map((a) => ({ id: a.id, clinicId: a.clinicId, month: a.month, source: a.source, amount: a.amount })) });
      await tx.auditLog.createMany({ data: db.audit.map((a) => ({ ...a, at: new Date(a.at), clinicId: a.clinicId ?? null, details: a.details ?? null })) });
    },
    { timeoutMs: 180_000, client: opts.client },
  );
  return { clinics: db.clinics.length, appointments: db.appointments.length, users: db.users.length };
}
