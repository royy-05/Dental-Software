/**
 * Row <-> domain mapping. API responses use the domain types in src/types (spec field names), so the
 * existing UI keeps working unchanged. All conversions between database rows and those types live here.
 */
import type { Prisma } from "@prisma/client";
import type * as Db from "@prisma/client";
import type {
  AdSpend,
  Announcement,
  AppNotification,
  Appointment,
  AppointmentInsurance,
  AuditEntry,
  Blockout,
  Break,
  Clinic,
  ClinicFlow,
  ClinicGroup,
  ClinicInsurance,
  Coupon,
  FeatureKey,
  FlowConfig,
  FlowVersion,
  FormField,
  Holiday,
  Invoice,
  LegalTemplate,
  MessageLog,
  MessageTemplate,
  Operatory,
  OptOut,
  Plan,
  Provider,
  Reason,
  Referrer,
  Role,
  SlotHold,
  StarterTemplate,
  Ticket,
  TimeOff,
  User,
  WeeklyHours,
  Weekday,
  WidgetSession,
} from "@/types";

// ---------- time helpers ----------

/** "YYYY-MM-DDTHH:mm" clinic wall-clock -> Date stored in a `timestamp` column (fields read as UTC). */
export function wallToDb(s: string): Date {
  const t = s.length === 10 ? `${s}T00:00` : s.slice(0, 16);
  return new Date(`${t}:00.000Z`);
}
export function dbToWall(d: Date): string {
  return d.toISOString().slice(0, 16);
}
export function dayToDb(s: string): Date {
  return new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
}
export function dbToDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);
const opt = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);
export const json = (v: unknown) => v as Prisma.InputJsonValue;

// ---------- users ----------

export type UserWithMemberships = Db.User & { memberships: Db.Membership[] };

const CLINIC_ROLE_RANK: Record<string, number> = { clinic_owner: 3, clinic_manager: 2, front_desk: 1 };

/** Highest clinic role across memberships (used for the "role" column in user lists). */
export function primaryRole(u: UserWithMemberships): Role {
  if (u.platformRole) return u.platformRole as Role;
  const best = [...u.memberships].sort((a, b) => (CLINIC_ROLE_RANK[b.role] ?? 0) - (CLINIC_ROLE_RANK[a.role] ?? 0))[0];
  return (best?.role as Role) ?? "front_desk";
}

export function toUser(u: UserWithMemberships): User {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: primaryRole(u),
    clinicIds: u.memberships.map((m) => m.clinicId),
    groupId: opt(u.groupId),
    lastLoginAt: iso(u.lastLoginAt),
    twoFactor: u.twoFactor,
    forceTwoFactor: u.forceTwoFactor,
    active: u.active,
    invitedAt: iso(u.invitedAt),
  };
}

// ---------- clinics ----------

export type ClinicRow = Db.Clinic & { holidays?: Db.Holiday[]; blockouts?: Db.Blockout[]; featureFlags?: Db.FeatureFlag[] };

export function toHoliday(h: Db.Holiday): Holiday {
  return { id: h.id, date: dbToDay(h.date), name: h.name };
}
export function toBlockout(b: Db.Blockout): Blockout {
  return {
    id: b.id,
    label: b.label,
    start: dbToWall(b.start),
    end: dbToWall(b.end),
    providerId: opt(b.providerId),
    operatoryId: opt(b.operatoryId),
  };
}

export function toClinic(c: ClinicRow): Clinic {
  const settings = c.settings as unknown as Clinic["settings"];
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    specialty: c.specialty as Clinic["specialty"],
    status: c.status as Clinic["status"],
    planId: c.planId,
    groupId: opt(c.groupId),
    ownerUserId: c.ownerUserId ?? "",
    timeZone: c.timeZone,
    phone: c.phone,
    email: c.email,
    address: c.address,
    description: c.description,
    branding: c.branding as unknown as Clinic["branding"],
    hours: c.hours as unknown as WeeklyHours,
    holidays: (c.holidays ?? []).map(toHoliday).sort((a, b) => a.date.localeCompare(b.date)),
    blockouts: (c.blockouts ?? []).map(toBlockout).sort((a, b) => a.start.localeCompare(b.start)),
    settings: { ...settings, widget: { ...settings.widget, customSlug: opt(c.customSlug) } },
    insuranceSettings: c.insuranceSettings as unknown as Clinic["insuranceSettings"],
    featureOverrides: Object.fromEntries((c.featureFlags ?? []).map((f) => [f.key, f.enabled])) as Partial<Record<FeatureKey, boolean>>,
    smsRegistration: c.smsRegistration as Clinic["smsRegistration"],
    smsCreditsUsed: c.smsCreditsUsed,
    emailsSent: c.emailsSent,
    rwg: c.rwg as unknown as Clinic["rwg"],
    pms: c.pms as unknown as Clinic["pms"],
    customDomain: opt(c.customDomain),
    createdAt: c.createdAt.toISOString(),
    lastLoginAt: iso(c.lastLoginAt),
    trialEndsAt: iso(c.trialEndsAt),
    deletedAt: iso(c.deletedAt),
    retentionDays: c.retentionDays ?? undefined,
  } as Clinic;
}

/** Domain clinic -> scalar columns (holidays, blockouts and flags are separate tables). */
export function clinicData(c: Clinic) {
  return {
    name: c.name,
    slug: c.slug,
    customSlug: c.settings.widget.customSlug || null,
    specialty: c.specialty,
    status: c.status,
    planId: c.planId,
    groupId: c.groupId ?? null,
    ownerUserId: c.ownerUserId || null,
    timeZone: c.timeZone,
    phone: c.phone,
    email: c.email,
    address: c.address,
    description: c.description,
    branding: json(c.branding),
    hours: json(c.hours),
    settings: json(c.settings),
    insuranceSettings: json(c.insuranceSettings),
    smsRegistration: c.smsRegistration,
    smsCreditsUsed: c.smsCreditsUsed,
    emailsSent: c.emailsSent,
    rwg: json(c.rwg),
    pms: json(c.pms),
    customDomain: c.customDomain ?? null,
    lastLoginAt: c.lastLoginAt ? new Date(c.lastLoginAt) : null,
    trialEndsAt: c.trialEndsAt ? new Date(c.trialEndsAt) : null,
    deletedAt: c.deletedAt ? new Date(c.deletedAt) : null,
  };
}

export function toGroup(g: Db.ClinicGroup & { clinics: { id: string }[] }): ClinicGroup {
  return { id: g.id, name: g.name, ownerUserId: g.ownerUserId ?? "", clinicIds: g.clinics.map((c) => c.id) };
}

export function toPlan(p: Db.Plan): Plan {
  return { id: p.id, name: p.name, priceMonthly: p.priceMonthly, limits: p.limits as unknown as Plan["limits"] };
}

// ---------- staff configuration ----------

export type ProviderRow = Db.Provider & {
  hours: Db.ProviderHours[];
  breaks: Db.ProviderBreak[];
  timeOff: Db.ProviderTimeOff[];
  operatories: Db.ProviderOperatory[];
  reasons: Db.ReasonProvider[];
};
export const providerInclude = { hours: true, breaks: true, timeOff: true, operatories: true, reasons: true } as const;

export function toProvider(p: ProviderRow): Provider {
  const weeklyHours = {} as WeeklyHours;
  for (let d = 0; d < 7; d++) weeklyHours[d as Weekday] = { enabled: false, start: "09:00", end: "17:00" };
  for (const h of p.hours) weeklyHours[h.weekday as Weekday] = { enabled: h.enabled, start: h.start, end: h.end };
  return {
    id: p.id,
    clinicId: p.clinicId,
    displayName: p.displayName,
    externalId: p.externalId,
    photoUrl: opt(p.photoUrl),
    role: p.role as Provider["role"],
    bio: p.bio,
    weeklyHours,
    breaks: p.breaks.map((b): Break => ({ id: b.id, weekday: b.weekday === null ? "all" : (b.weekday as Weekday), start: b.start, end: b.end, label: b.label })),
    timeOff: p.timeOff.map((t): TimeOff => ({ id: t.id, start: dbToDay(t.start), end: dbToDay(t.end), reason: t.reason })).sort((a, b) => a.start.localeCompare(b.start)),
    operatoryIds: p.operatories.map((o) => o.operatoryId),
    reasonIds: p.reasons.map((r) => r.reasonId),
    showOnline: p.showOnline,
    active: p.active,
    color: p.color,
  };
}

export type ReasonRow = Db.Reason & { providers: Db.ReasonProvider[]; operatories: Db.ReasonOperatory[] };
export const reasonInclude = { providers: true, operatories: true } as const;

export function toReason(r: ReasonRow): Reason {
  return {
    id: r.id,
    clinicId: r.clinicId,
    name: r.name,
    description: r.description,
    longDescription: r.longDescription,
    duration: r.duration,
    patientType: r.patientType as Reason["patientType"],
    providerIds: r.providers.map((p) => p.providerId),
    operatoryIds: r.operatories.map((o) => o.operatoryId),
    color: r.color,
    estimatedValue: r.estimatedValue,
    visibility: r.visibility as Reason["visibility"],
    active: r.active,
    order: r.order,
    questions: r.questions as unknown as FormField[],
    redirectUrl: opt(r.redirectUrl),
    noticeOverrideHours: opt(r.noticeOverrideHours),
  };
}

export type OperatoryRow = Db.Operatory & { providers: Db.ProviderOperatory[]; reasons: Db.ReasonOperatory[] };
export const operatoryInclude = { providers: true, reasons: true } as const;

export function toOperatory(o: OperatoryRow): Operatory {
  return { id: o.id, clinicId: o.clinicId, name: o.name, active: o.active, providerIds: o.providers.map((p) => p.providerId), reasonIds: o.reasons.map((r) => r.reasonId) };
}

export function toClinicInsurance(i: Db.ClinicInsurance): ClinicInsurance {
  return { id: i.id, clinicId: i.clinicId, carrierId: opt(i.carrierId), name: i.name, status: i.status as ClinicInsurance["status"], custom: i.custom };
}

export function toReferrer(r: Db.Referrer): Referrer {
  return { id: String(r.publicId), clinicId: r.clinicId, name: r.name, sourceType: r.sourceType as Referrer["sourceType"], redirectUrl: opt(r.redirectUrl) };
}

// ---------- flows ----------

export function toFlowVersion(v: Db.FlowVersion): FlowVersion {
  return { id: v.id, clinicId: v.clinicId, version: v.version, publishedAt: v.publishedAt.toISOString(), publishedBy: v.publishedBy, note: v.note, config: v.config as unknown as FlowConfig };
}

export function toClinicFlow(f: Db.ClinicFlow, versions: Db.FlowVersion[]): ClinicFlow {
  const sorted = [...versions].sort((a, b) => a.version - b.version);
  const published = sorted.find((v) => v.version === f.publishedVersion) ?? sorted[sorted.length - 1];
  return {
    clinicId: f.clinicId,
    draft: f.draft as unknown as FlowConfig,
    published: (published?.config ?? f.draft) as unknown as FlowConfig,
    publishedVersion: f.publishedVersion,
    draftUpdatedAt: iso(f.draftUpdatedAt),
    versions: sorted.map(toFlowVersion),
  };
}

export function toStarterTemplate(t: Db.StarterTemplate): StarterTemplate {
  return {
    id: t.id,
    specialty: t.specialty as StarterTemplate["specialty"],
    name: t.name,
    description: t.description,
    published: t.published,
    flow: t.flow as unknown as FlowConfig,
    defaultReasons: t.defaultReasons as unknown as StarterTemplate["defaultReasons"],
  };
}

export function toLegalTemplate(t: Db.LegalTemplate): LegalTemplate {
  return { id: t.id, kind: t.kind as LegalTemplate["kind"], title: t.title, body: t.body, version: t.version };
}

// ---------- appointments ----------

export type AppointmentRow = Db.Appointment & {
  patient: Db.Patient;
  statusHistory?: Db.StatusHistory[];
  notes?: Db.AppointmentNote[];
  consents?: Db.ConsentRecord[];
};
export const appointmentInclude = { patient: true, statusHistory: { orderBy: { at: "asc" } }, notes: { orderBy: { at: "asc" } }, consents: { orderBy: { at: "desc" } } } as const;
export const appointmentListInclude = { patient: true, consents: { orderBy: { at: "desc" }, take: 1 } } as const;

export function toAppointment(a: AppointmentRow, token = ""): Appointment {
  const consent = a.consents?.find((c) => c.kind === "sms");
  const utm = { source: opt(a.utmSource), medium: opt(a.utmMedium), campaign: opt(a.utmCampaign), term: opt(a.utmTerm), content: opt(a.utmContent) };
  return {
    id: a.id,
    clinicId: a.clinicId,
    patientId: a.patientId,
    createdAt: a.createdAt.toISOString(),
    start: dbToWall(a.start),
    end: dbToWall(a.end),
    reasonId: a.reasonId,
    providerId: a.providerId,
    operatoryId: opt(a.operatoryId),
    patientType: a.patientType as Appointment["patientType"],
    patient: { firstName: a.patient.firstName, lastName: a.patient.lastName, dob: a.patient.dob, phone: a.patient.phone, email: a.patient.email, message: opt(a.message) },
    bookingForSomeoneElse: a.bookingForSomeoneElse,
    bookerName: opt(a.bookerName),
    insurance: a.insurance as unknown as AppointmentInsurance,
    answers: a.answers as Appointment["answers"],
    files: a.files as Appointment["files"],
    source: a.source as Appointment["source"],
    referrerId: opt(a.referrerId),
    utm: Object.fromEntries(Object.entries(utm).filter(([, v]) => v !== undefined)),
    gclid: opt(a.gclid),
    fbclid: opt(a.fbclid),
    status: a.status as Appointment["status"],
    declineReason: opt(a.declineReason),
    statusHistory: (a.statusHistory ?? []).map((h) => ({ status: h.status as Appointment["status"], at: h.at.toISOString(), by: h.by, note: opt(h.note) })),
    notes: (a.notes ?? []).map((n) => ({ id: n.id, at: n.at.toISOString(), by: n.by, text: n.text })),
    smsConsent: consent ? { given: consent.given, at: consent.at.toISOString(), termsVersion: consent.termsVersion, ip: opt(consent.ip) } : { given: false },
    bookedBy: a.bookedBy as Appointment["bookedBy"],
    token,
  } as Appointment;
}

export function toHold(h: Db.SlotHold): SlotHold {
  return { id: h.id, clinicId: h.clinicId, providerId: h.providerId, operatoryId: opt(h.operatoryId), start: dbToWall(h.start), end: dbToWall(h.end), expiresAt: h.expiresAt.getTime(), sessionId: h.sessionId };
}

export function toWidgetSession(w: Db.WidgetSession): WidgetSession {
  return { id: w.id, clinicId: w.clinicId, at: w.at.toISOString(), localHour: w.localHour, localWeekday: w.localWeekday as Weekday, source: w.source as WidgetSession["source"], reasonId: opt(w.reasonId), furthestStep: w.furthestStep as WidgetSession["furthestStep"], booked: w.booked };
}

// ---------- messaging ----------

export function toTemplate(t: Db.MessageTemplate): MessageTemplate {
  return { id: t.id, clinicId: t.clinicId, event: t.event as MessageTemplate["event"], channel: t.channel as MessageTemplate["channel"], subject: t.subject, body: t.body, enabled: t.enabled };
}

export function toMessageLog(m: Db.MessageLog): MessageLog {
  return {
    id: m.id,
    clinicId: m.clinicId,
    appointmentId: opt(m.appointmentId),
    channel: m.channel as MessageLog["channel"],
    direction: m.direction as MessageLog["direction"],
    recipientType: m.recipientType as MessageLog["recipientType"],
    to: m.to,
    event: m.event as MessageLog["event"],
    subject: opt(m.subject),
    body: m.body,
    status: m.status as MessageLog["status"],
    createdAt: m.createdAt.toISOString(),
    scheduledFor: iso(m.scheduledFor),
    error: opt(m.error),
  };
}

export function toOptOut(o: Db.OptOut): OptOut {
  return { id: o.id, clinicId: o.clinicId, phone: o.phone, at: o.at.toISOString(), kind: o.kind as OptOut["kind"] };
}

export function toNotification(n: Db.Notification): AppNotification {
  return { id: n.id, clinicId: n.clinicId, at: n.at.toISOString(), title: n.title, body: n.body, read: n.read, href: opt(n.href) };
}

// ---------- support, billing, audit ----------

export function toTicket(t: Db.Ticket & { messages: Db.TicketMessage[] }): Ticket {
  return {
    id: t.id,
    clinicId: t.clinicId,
    subject: t.subject,
    category: t.category as Ticket["category"],
    priority: t.priority as Ticket["priority"],
    status: t.status as Ticket["status"],
    createdAt: t.createdAt.toISOString(),
    createdBy: t.createdBy,
    assigneeId: opt(t.assigneeId),
    screenshotName: opt(t.screenshotName),
    firstResponseAt: iso(t.firstResponseAt),
    messages: [...t.messages].sort((a, b) => a.at.getTime() - b.at.getTime()).map((m) => ({ id: m.id, at: m.at.toISOString(), authorName: m.authorName, authorRole: m.authorRole as Role, body: m.body })),
  };
}

export function toInvoice(i: Db.Invoice): Invoice {
  return { id: i.id, clinicId: i.clinicId, number: i.number, amount: i.amount, issuedAt: i.issuedAt.toISOString(), dueAt: i.dueAt.toISOString(), status: i.status as Invoice["status"], dunningEmailsSent: i.dunningEmailsSent };
}

export function toCoupon(c: Db.Coupon): Coupon {
  return { id: c.id, code: c.code, percentOff: c.percentOff, active: c.active, redemptions: c.redemptions };
}

export function toAnnouncement(a: Db.Announcement): Announcement {
  return { id: a.id, message: a.message, clinicIds: a.clinicIds as Announcement["clinicIds"], active: a.active, createdAt: a.createdAt.toISOString(), tone: a.tone as Announcement["tone"] };
}

export function toAdSpend(a: Db.AdSpend): AdSpend {
  return { id: a.id, clinicId: a.clinicId, month: a.month, source: a.source as AdSpend["source"], amount: a.amount };
}

export function toAudit(a: Db.AuditLog): AuditEntry {
  return {
    id: a.id,
    at: a.at.toISOString(),
    actorId: a.actorId,
    actorName: a.actorName,
    actorRole: a.actorRole as AuditEntry["actorRole"],
    action: a.action,
    category: a.category as AuditEntry["category"],
    target: a.target,
    clinicId: opt(a.clinicId),
    ip: a.ip,
    details: opt(a.details),
  };
}
