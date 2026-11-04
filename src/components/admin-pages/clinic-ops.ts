import type { Clinic, ClinicFlow, Operatory, Provider, Reason, Specialty, User } from "@/types";
import type { Db } from "@/mock";
import { defaultClinicSettings, defaultFlow, defaultInsuranceSettings, defaultTemplates, weeklyHours } from "@/mock/defaults";
import { uid } from "@/lib/utils";

export interface NewClinicInput {
  name: string;
  slug: string;
  specialty: Specialty;
  timeZone: string;
  phone: string;
  email: string;
  address: string;
  planId: string;
  trial: boolean;
  owner: { mode: "existing"; userId: string } | { mode: "invite"; name: string; email: string };
  starterTemplateId?: string;
  importReasons: Record<string, string>[];
  importProviders: Record<string, string>[];
}

const COLORS = ["#0f766e", "#1d4ed8", "#7c3aed", "#b45309", "#be123c", "#047857", "#0369a1"];

/** Create a clinic with defaults, flow v1, templates, starter reasons and imported data. Mutates `db`. */
export function createClinic(db: Db, input: NewClinicInput, actorName: string, now = new Date()): Clinic {
  const id = uid("c");
  let ownerId: string;
  if (input.owner.mode === "existing") {
    ownerId = input.owner.userId;
    const u = db.users.find((x) => x.id === ownerId);
    if (u && !u.clinicIds.includes(id)) u.clinicIds.push(id);
  } else {
    const user: User = {
      id: uid("u"),
      name: input.owner.name,
      email: input.owner.email,
      role: "clinic_owner",
      clinicIds: [id],
      twoFactor: false,
      active: true,
      invitedAt: now.toISOString(),
    };
    db.users.push(user);
    ownerId = user.id;
  }
  const clinic: Clinic = {
    id,
    name: input.name,
    slug: input.slug,
    specialty: input.specialty,
    status: input.trial ? "trial" : "active",
    planId: input.planId,
    ownerUserId: ownerId,
    timeZone: input.timeZone,
    phone: input.phone,
    email: input.email,
    address: input.address,
    description: "",
    branding: { headerColor: "#0f766e", primaryColor: "#0f766e", secondaryColor: "#e6f4f2", theme: "full_page" },
    hours: weeklyHours(),
    holidays: [],
    blockouts: [],
    settings: defaultClinicSettings(input.email),
    insuranceSettings: defaultInsuranceSettings(),
    featureOverrides: {},
    smsRegistration: "not_started",
    smsCreditsUsed: 0,
    emailsSent: 0,
    rwg: { enabled: false, websiteUrl: "", feedStatus: "off" },
    pms: { name: "None", connected: false },
    createdAt: now.toISOString(),
    trialEndsAt: input.trial ? new Date(now.getTime() + 14 * 86400000).toISOString() : undefined,
  };
  db.clinics.push(clinic);

  const starter = db.starterTemplates.find((t) => t.id === input.starterTemplateId);
  const flowCfg = starter ? structuredClone(starter.flow) : defaultFlow(input.specialty);
  const flow: ClinicFlow = {
    clinicId: id,
    draft: structuredClone(flowCfg),
    published: flowCfg,
    publishedVersion: 1,
    versions: [{ id: uid("fv"), clinicId: id, version: 1, publishedAt: now.toISOString(), publishedBy: actorName, note: starter ? `Created from starter template “${starter.name}”` : "Initial setup", config: structuredClone(flowCfg) }],
  };
  db.flows.push(flow);
  db.templates.push(...defaultTemplates(id).map((t) => ({ ...t, id: `${t.id}_${id.slice(-4)}` })));

  // Default room so imported providers and reasons are bookable straight away.
  const room: Operatory = { id: uid("op"), clinicId: id, name: "Room 1", active: true, providerIds: [], reasonIds: [] };
  db.operatories.push(room);

  const providers: Provider[] = input.importProviders
    .filter((r) => r.name || r.display_name)
    .map((r, i) => ({
      id: uid("p"),
      clinicId: id,
      displayName: r.display_name || r.name,
      externalId: r.id || r.external_id || `PMS-${i + 1}`,
      role: (["Doctor", "Hygienist", "Assistant"].includes(r.role) ? r.role : "Doctor") as Provider["role"],
      bio: r.bio ?? "",
      weeklyHours: weeklyHours(),
      breaks: [],
      timeOff: [],
      operatoryIds: [room.id],
      reasonIds: [],
      showOnline: true,
      active: true,
      color: COLORS[i % COLORS.length],
    }));
  db.providers.push(...providers);

  const reasonRows: Partial<Reason>[] = [
    ...(starter?.defaultReasons ?? []),
    ...input.importReasons
      .filter((r) => r.name)
      .map((r) => ({
        name: r.name,
        description: r.description ?? "",
        duration: Number(r.duration) > 0 ? Number(r.duration) : 30,
        patientType: (["new", "existing", "both"].includes(r.patient_type) ? r.patient_type : "both") as Reason["patientType"],
        estimatedValue: Number(r.estimated_value) || 0,
        color: COLORS[0],
      })),
  ];
  reasonRows.forEach((r, i) => {
    const reason: Reason = {
      id: uid("r"),
      clinicId: id,
      name: r.name ?? "Visit",
      description: r.description ?? "",
      longDescription: r.description ?? "",
      duration: r.duration ?? 30,
      patientType: r.patientType ?? "both",
      providerIds: providers.map((p) => p.id),
      operatoryIds: [room.id],
      color: r.color ?? COLORS[i % COLORS.length],
      estimatedValue: r.estimatedValue ?? 0,
      visibility: "online",
      active: true,
      order: i,
      questions: [],
    };
    db.reasons.push(reason);
  });
  // reverse links
  for (const p of providers) p.reasonIds = db.reasons.filter((r) => r.clinicId === id).map((r) => r.id);
  room.providerIds = providers.map((p) => p.id);
  room.reasonIds = db.reasons.filter((r) => r.clinicId === id).map((r) => r.id);
  for (const n of [1, 2, 3, 4]) {
    const types = ["google_ads", "gbp", "rwg", "website"] as const;
    const names = ["Google Ads", "Google Business Profile", "Reserve with Google", "Website"];
    db.referrers.push({ id: String(n), clinicId: id, name: names[n - 1], sourceType: types[n - 1] });
  }
  return clinic;
}

/** Copy branding, settings, insurance settings and booking flow from one clinic to another. */
export function cloneClinicSettings(db: Db, fromId: string, toId: string, actorName: string) {
  const from = db.clinics.find((c) => c.id === fromId);
  const to = db.clinics.find((c) => c.id === toId);
  if (!from || !to) return;
  to.branding = structuredClone(from.branding);
  to.settings = { ...structuredClone(from.settings), notifications: { ...structuredClone(from.settings.notifications), clinicAlertEmail: to.email } };
  to.insuranceSettings = structuredClone(from.insuranceSettings);
  to.hours = structuredClone(from.hours);
  const src = db.flows.find((f) => f.clinicId === fromId);
  const dst = db.flows.find((f) => f.clinicId === toId);
  if (src && dst) {
    const version = dst.publishedVersion + 1;
    dst.published = structuredClone(src.published);
    dst.draft = structuredClone(src.published);
    dst.publishedVersion = version;
    dst.versions.push({ id: uid("fv"), clinicId: toId, version, publishedAt: new Date().toISOString(), publishedBy: actorName, note: `Cloned from ${from.name}`, config: structuredClone(src.published) });
  }
}

export const TIME_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];
