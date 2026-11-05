import type { z } from "zod";
import type { FlowConfig, Operatory, Provider, Reason, Specialty } from "@/types";
import { defaultClinicSettings, defaultFlow, defaultInsuranceSettings, defaultTemplates, weeklyHours } from "@/mock/defaults";
import type { Tx } from "../db";
import { audit, type Actor } from "../audit";
import { badRequest, conflict, notFound } from "../errors";
import { json } from "../mappers";
import { inviteClinicUser } from "../auth/accounts";
import type { zNewClinicBody } from "@/lib/schemas";

/** Super admin clinic operations (6.2): the add-clinic wizard, clone settings, soft delete and restore. */

const COLORS = ["#0f766e", "#1d4ed8", "#7c3aed", "#b45309", "#be123c", "#047857", "#0369a1"];

export async function slugTaken(tx: Tx, slug: string, exceptId?: string) {
  const row = await tx.clinic.findFirst({ where: { OR: [{ slug }, { customSlug: slug }], NOT: exceptId ? { id: exceptId } : undefined }, select: { id: true } });
  return !!row;
}

export async function createClinic(tx: Tx, input: z.infer<typeof zNewClinicBody>, actor: Actor, now = new Date()) {
  if (await slugTaken(tx, input.slug)) throw conflict("That booking slug is already taken.");
  const plan = await tx.plan.findUnique({ where: { id: input.planId } });
  if (!plan) throw badRequest("Unknown plan.");
  const clinic = await tx.clinic.create({
    data: {
      name: input.name, slug: input.slug, specialty: input.specialty, status: input.trial ? "trial" : "active", planId: input.planId, timeZone: input.timeZone,
      phone: input.phone, email: input.email, address: input.address, description: "",
      branding: json({ headerColor: "#0f766e", primaryColor: "#0f766e", secondaryColor: "#e6f4f2", theme: "full_page" }),
      hours: json(weeklyHours()), settings: json(defaultClinicSettings(input.email)), insuranceSettings: json(defaultInsuranceSettings()),
      rwg: json({ enabled: false, websiteUrl: "", feedStatus: "off" }), pms: json({ name: "None", connected: false }),
      createdAt: now, trialEndsAt: input.trial ? new Date(now.getTime() + 14 * 86400000) : null,
    },
  });
  // Owner: existing user or invite.
  let ownerUserId: string;
  if (input.owner.mode === "existing") {
    const u = await tx.user.findUnique({ where: { id: input.owner.userId } });
    if (!u || u.platformRole) throw badRequest("Choose a clinic user as owner.");
    ownerUserId = u.id;
    await tx.membership.upsert({ where: { userId_clinicId: { userId: u.id, clinicId: clinic.id } }, create: { userId: u.id, clinicId: clinic.id, role: "clinic_owner" }, update: { role: "clinic_owner" } });
  } else {
    const r = await inviteClinicUser(tx, actor, { clinicId: clinic.id, clinicName: clinic.name, email: input.owner.email, name: input.owner.name, role: "clinic_owner" });
    ownerUserId = r.userId;
  }
  await tx.clinic.update({ where: { id: clinic.id }, data: { ownerUserId } });
  // Flow v1 from the starter template or the specialty default.
  const starter = input.starterTemplateId ? await tx.starterTemplate.findUnique({ where: { id: input.starterTemplateId } }) : null;
  const flowCfg: FlowConfig = starter ? (structuredClone(starter.flow) as unknown as FlowConfig) : defaultFlow(input.specialty as Specialty);
  await tx.clinicFlow.create({ data: { clinicId: clinic.id, draft: json(flowCfg), publishedVersion: 1 } });
  await tx.flowVersion.create({ data: { clinicId: clinic.id, version: 1, publishedBy: actor.name, note: starter ? `Created from starter template “${starter.name}”` : "Initial setup", config: json(flowCfg) } });
  await tx.messageTemplate.createMany({ data: defaultTemplates(clinic.id).map((t) => ({ clinicId: clinic.id, event: t.event, channel: t.channel, subject: t.subject, body: t.body, enabled: t.enabled })) });
  const room = await tx.operatory.create({ data: { clinicId: clinic.id, name: "Room 1", active: true, order: 0 } });
  // Imported providers (CSV rows) with default hours, linked to the room.
  const providers: { id: string }[] = [];
  for (const [i, r] of input.importProviders.filter((x) => x.name || x.display_name).entries()) {
    const p = await tx.provider.create({
      data: {
        clinicId: clinic.id, displayName: r.display_name || r.name, externalId: r.id || r.external_id || `PMS-${i + 1}`, role: ["Doctor", "Hygienist", "Assistant"].includes(r.role) ? r.role : "Doctor",
        bio: r.bio ?? "", showOnline: true, active: true, color: COLORS[i % COLORS.length], order: i,
        hours: { create: Object.entries(weeklyHours()).map(([wd, h]) => ({ clinicId: clinic.id, weekday: Number(wd), enabled: h.enabled, start: h.start, end: h.end })) },
        operatories: { create: { clinicId: clinic.id, operatoryId: room.id } },
      },
    });
    providers.push(p);
  }
  // Reasons: starter defaults (inactive, no providers) plus imported ones (active, every provider).
  const starterReasons = ((starter?.defaultReasons as unknown as Pick<Reason, "name" | "description" | "duration" | "patientType" | "color" | "estimatedValue">[] | null) ?? []).map((r) => ({ ...r, fromStarter: true }));
  const imported = input.importReasons.filter((r) => r.name).map((r) => ({
    name: r.name, description: r.description ?? "", duration: Number(r.duration) > 0 ? Number(r.duration) : 30,
    patientType: (["new", "existing", "both"].includes(r.patient_type) ? r.patient_type : "both") as Reason["patientType"], estimatedValue: Number(r.estimated_value) || 0, color: COLORS[0], fromStarter: false,
  }));
  let order = 0;
  for (const r of [...starterReasons, ...imported]) {
    await tx.reason.create({
      data: {
        clinicId: clinic.id, name: r.name, description: r.description ?? "", longDescription: r.description ?? "", duration: r.duration ?? 30, patientType: r.patientType ?? "both", color: r.color ?? COLORS[order % COLORS.length],
        estimatedValue: r.estimatedValue ?? 0, visibility: "online", active: !r.fromStarter, order: order++, questions: json([]),
        providers: { create: r.fromStarter ? [] : providers.map((p) => ({ clinicId: clinic.id, providerId: p.id })) },
        operatories: { create: { clinicId: clinic.id, operatoryId: room.id } },
      },
    });
  }
  const names = ["Google Ads", "Google Business Profile", "Reserve with Google", "Website"];
  const types = ["google_ads", "gbp", "rwg", "website"];
  await tx.referrer.createMany({ data: names.map((name, i) => ({ clinicId: clinic.id, publicId: i + 1, name, sourceType: types[i] })) });
  await audit(tx, actor, { action: "Created clinic", category: "clinic", target: clinic.name, clinicId: clinic.id, details: `Plan ${plan.name}, ${imported.length} reasons and ${providers.length} providers imported` });
  return clinic;
}

/** Copy branding, hours, settings, insurance settings and the published flow (as a new version). Not reasons, providers or appointments. */
export async function cloneClinicSettings(tx: Tx, fromId: string, toId: string, actor: Actor) {
  const [from, to] = await Promise.all([tx.clinic.findUnique({ where: { id: fromId } }), tx.clinic.findUnique({ where: { id: toId } })]);
  if (!from || !to) throw notFound("Clinic");
  const settings = from.settings as { notifications: Record<string, unknown> };
  await tx.clinic.update({
    where: { id: toId },
    data: { branding: json(from.branding), hours: json(from.hours), insuranceSettings: json(from.insuranceSettings), settings: json({ ...settings, notifications: { ...settings.notifications, clinicAlertEmail: to.email } }) },
  });
  const srcFlow = await tx.clinicFlow.findUnique({ where: { clinicId: fromId } });
  const srcVersion = srcFlow ? await tx.flowVersion.findUnique({ where: { clinicId_version: { clinicId: fromId, version: srcFlow.publishedVersion } } }) : null;
  if (srcVersion) {
    const max = (await tx.flowVersion.aggregate({ where: { clinicId: toId }, _max: { version: true } }))._max.version ?? 0;
    await tx.flowVersion.create({ data: { clinicId: toId, version: max + 1, publishedBy: actor.name, note: `Cloned from ${from.name}`, config: json(srcVersion.config) } });
    await tx.clinicFlow.upsert({ where: { clinicId: toId }, create: { clinicId: toId, draft: json(srcVersion.config), publishedVersion: max + 1 }, update: { draft: json(srcVersion.config), publishedVersion: max + 1, draftUpdatedAt: null } });
  }
  await audit(tx, actor, { action: "Cloned clinic settings", category: "settings", target: to.name, clinicId: toId, details: `From ${from.name}` });
}

export type { Operatory, Provider };
