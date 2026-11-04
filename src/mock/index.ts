import type {
  AdSpend,
  Announcement,
  AppNotification,
  Appointment,
  AuditEntry,
  Clinic,
  ClinicFlow,
  ClinicGroup,
  ClinicInsurance,
  Coupon,
  InsuranceCarrier,
  Invoice,
  LegalTemplate,
  MessageLog,
  MessageTemplate,
  Operatory,
  OptOut,
  Plan,
  PlatformSettings,
  Provider,
  Reason,
  Referrer,
  SlotHold,
  StarterTemplate,
  Ticket,
  User,
  WidgetEvent,
  WidgetSession,
} from "@/types";
import { buildMessages } from "@/lib/notify";
import { fromWall, nowInZone } from "@/lib/time";
import { generateAppointments, generateSessions } from "./appointments";
import {
  CLINIC_INSURANCES,
  COUPONS,
  INSURANCE_CARRIERS,
  PLANS,
  buildAdSpend,
  buildAnnouncements,
  buildInvoices,
  buildPlatformSettings,
  buildReferrers,
  buildStarterTemplates,
  buildTickets,
} from "./catalog";
import { CLINIC_GROUPS, CLINIC_IDS, buildClinics } from "./clinics";
import { LEGAL_TEMPLATES, defaultFlow, defaultTemplates } from "./defaults";
import { OPERATORIES, REASONS, buildProviders, buildUsers, linkStaff } from "./staff";

export interface Db {
  version: number;
  seededAt: string;
  clinics: Clinic[];
  groups: ClinicGroup[];
  users: User[];
  providers: Provider[];
  reasons: Reason[];
  operatories: Operatory[];
  carriers: InsuranceCarrier[];
  clinicInsurances: ClinicInsurance[];
  referrers: Referrer[];
  flows: ClinicFlow[];
  starterTemplates: StarterTemplate[];
  templates: MessageTemplate[];
  appointments: Appointment[];
  holds: SlotHold[];
  widgetEvents: WidgetEvent[];
  widgetSessions: WidgetSession[];
  messages: MessageLog[];
  optOuts: OptOut[];
  tickets: Ticket[];
  announcements: Announcement[];
  plans: Plan[];
  invoices: Invoice[];
  coupons: Coupon[];
  adSpend: AdSpend[];
  audit: AuditEntry[];
  notifications: AppNotification[];
  legalTemplates: LegalTemplate[];
  platform: PlatformSettings;
}

export const DB_VERSION = 1;

/** Build the full demo dataset relative to `now`. Deterministic apart from the date. */
export function buildSeed(now: Date = new Date()): Db {
  const clinics = buildClinics(now);
  const providers = buildProviders(now);
  const operatories = structuredClone(OPERATORIES);
  const reasons = structuredClone(REASONS);
  linkStaff(providers, operatories, reasons);
  const referrers = buildReferrers();
  const clinicInsurances = structuredClone(CLINIC_INSURANCES);

  const appointments: Appointment[] = [];
  const widgetSessions: WidgetSession[] = [];
  const mainClinics = [CLINIC_IDS.dental, CLINIC_IDS.physio, CLINIC_IDS.derm];
  mainClinics.forEach((cid, i) => {
    const clinic = clinics.find((c) => c.id === cid)!;
    const appts = generateAppointments({
      clinic,
      providers: providers.filter((p) => p.clinicId === cid),
      reasons: reasons.filter((r) => r.clinicId === cid),
      operatories: operatories.filter((o) => o.clinicId === cid),
      insurances: clinicInsurances.filter((x) => x.clinicId === cid),
      referrers: referrers.filter((r) => r.clinicId === cid),
      now,
      seed: 101 + i * 1000,
    });
    appointments.push(...appts);
    widgetSessions.push(...generateSessions(clinic, appts, now, 101 + i * 1000));
  });

  const templates = [...defaultTemplates(null), ...clinics.flatMap((c) => defaultTemplates(c.id))];
  const flows: ClinicFlow[] = clinics.map((c) => {
    const cfg = defaultFlow(c.specialty);
    if (c.id === CLINIC_IDS.physio) {
      cfg.steps.find((s) => s.key === "provider")!.enabled = true;
      cfg.order = "provider_first";
    }
    if (c.id === CLINIC_IDS.derm) cfg.rules.minNoticeHours = 24;
    if (c.id === CLINIC_IDS.dental) cfg.otpEnabled = true;
    return {
      clinicId: c.id,
      draft: structuredClone(cfg),
      published: cfg,
      publishedVersion: 1,
      versions: [{ id: `fv_${c.id}_1`, clinicId: c.id, version: 1, publishedAt: c.createdAt, publishedBy: "Kivi onboarding", note: "Initial setup from starter template", config: structuredClone(cfg) }],
    };
  });

  // Seed the delivery log with messages for bookings made in the last 3 days.
  const messages: MessageLog[] = [];
  const platform = buildPlatformSettings(now);
  for (const a of appointments) {
    const created = new Date(a.createdAt);
    if (now.getTime() - created.getTime() > 3 * 86400000 || a.bookedBy !== "patient") continue;
    const clinic = clinics.find((c) => c.id === a.clinicId)!;
    const msgs = buildMessages("booked", {
      clinic,
      appointment: a,
      reason: reasons.find((r) => r.id === a.reasonId),
      provider: providers.find((p) => p.id === a.providerId),
      templates: templates.filter((t) => t.clinicId === a.clinicId),
      optOuts: [],
      now: created,
      quietHours: { start: platform.messaging.quietHoursStart, end: platform.messaging.quietHoursEnd },
    });
    // Older scheduled reminders whose time has passed are shown as delivered.
    for (const m of msgs) {
      if (m.status === "scheduled" && m.scheduledFor && fromWall(m.scheduledFor) <= nowInZone(clinic.timeZone, now)) m.status = "delivered";
      messages.push(m);
    }
  }
  for (const c of clinics) {
    c.smsCreditsUsed = messages.filter((m) => m.clinicId === c.id && m.channel === "sms").length * 9;
    c.emailsSent = messages.filter((m) => m.clinicId === c.id && m.channel === "email").length * 9;
  }

  const notifications: AppNotification[] = appointments
    .filter((a) => a.bookedBy === "patient" && now.getTime() - new Date(a.createdAt).getTime() < 86400000 * 2)
    .slice(-12)
    .map((a, i) => ({
      id: `nt_${i}`,
      clinicId: a.clinicId,
      at: a.createdAt,
      title: "New online booking",
      body: `${reasons.find((r) => r.id === a.reasonId)?.name ?? "Appointment"} on ${a.start.slice(0, 10)}`,
      read: i % 3 === 0,
      href: `/clinic/appointments?open=${a.id}`,
    }));

  const audit: AuditEntry[] = [
    { id: "au_1", at: new Date(now.getTime() - 86400000 * 3).toISOString(), actorId: "u_support", actorName: "Sam Rivera", actorRole: "support_agent", action: "Impersonated clinic", category: "impersonation", target: "Bright Smile Dental", clinicId: CLINIC_IDS.dental, ip: "198.51.100.23", details: "Reason: Ticket t_1001 - help add second location" },
    { id: "au_2", at: new Date(now.getTime() - 86400000 * 2).toISOString(), actorId: "u_owner", actorName: "Olivia Chen", actorRole: "clinic_owner", action: "Published booking flow v1", category: "settings", target: "Booking flow", clinicId: CLINIC_IDS.dental, ip: "203.0.113.10" },
    { id: "au_3", at: new Date(now.getTime() - 3600000 * 5).toISOString(), actorId: "u_frontdesk", actorName: "Fiona Diaz", actorRole: "front_desk", action: "Viewed patient record", category: "phi_access", target: appointments[0]?.id ?? "appointment", clinicId: CLINIC_IDS.dental, ip: "203.0.113.11" },
    { id: "au_4", at: new Date(now.getTime() - 3600000 * 4).toISOString(), actorId: "u_manager", actorName: "Marcus Lee", actorRole: "clinic_manager", action: "Exported appointments CSV", category: "export", target: "Appointments", clinicId: CLINIC_IDS.physio, ip: "203.0.113.12" },
    { id: "au_5", at: new Date(now.getTime() - 3600000).toISOString(), actorId: "u_super", actorName: "Jordan Avery", actorRole: "super_admin", action: "Logged in", category: "login", target: "Super admin panel", ip: "198.51.100.5" },
  ];

  return {
    version: DB_VERSION,
    seededAt: now.toISOString(),
    clinics,
    groups: structuredClone(CLINIC_GROUPS),
    users: buildUsers(now),
    providers,
    reasons,
    operatories,
    carriers: structuredClone(INSURANCE_CARRIERS),
    clinicInsurances,
    referrers,
    flows,
    starterTemplates: buildStarterTemplates(),
    templates,
    appointments,
    holds: [],
    widgetEvents: [],
    widgetSessions,
    messages,
    optOuts: [{ id: "oo_1", clinicId: CLINIC_IDS.dental, phone: "(555) 0199-9999", at: new Date(now.getTime() - 86400000 * 9).toISOString(), kind: "sms_stop" }],
    tickets: buildTickets(now),
    announcements: buildAnnouncements(now),
    plans: structuredClone(PLANS),
    invoices: buildInvoices(now),
    coupons: structuredClone(COUPONS),
    adSpend: buildAdSpend(now),
    audit,
    notifications,
    legalTemplates: structuredClone(LEGAL_TEMPLATES),
    platform,
  };
}

export { CLINIC_IDS };
