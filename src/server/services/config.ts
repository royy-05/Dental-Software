import type { z } from "zod";
import type { Clinic, Operatory, Provider, Reason, Referrer } from "@/types";
import type { zOperatoryBody, zProviderBody, zReasonBody } from "@/lib/schemas";
import type { Tx } from "../db";
import { badRequest, conflict, notFound } from "../errors";
import { dayToDb, json, operatoryInclude, providerInclude, reasonInclude, toOperatory, toProvider, toReason, toReferrer, wallToDb } from "../mappers";

/**
 * Clinic configuration (5.3 - 5.7). The many-to-many links are stored once (reason_providers, reason_operatories,
 * provider_operatories); the "mirror" lists the UI shows are derived by the mappers, so they can never drift.
 */

async function assertOwned(tx: Tx, clinicId: string, table: "provider" | "operatory" | "reason", ids: string[], what: string) {
  if (!ids.length) return;
  const uniq = [...new Set(ids)];
  const count = table === "provider" ? await tx.provider.count({ where: { id: { in: uniq }, clinicId } }) : table === "operatory" ? await tx.operatory.count({ where: { id: { in: uniq }, clinicId } }) : await tx.reason.count({ where: { id: { in: uniq }, clinicId } });
  if (count !== uniq.length) throw badRequest(`Unknown ${what}.`);
}

// ---------- reasons ----------

export async function listReasons(tx: Tx): Promise<Reason[]> {
  return (await tx.reason.findMany({ include: reasonInclude, orderBy: { order: "asc" } })).map(toReason);
}

function reasonData(b: z.infer<typeof zReasonBody>) {
  return {
    name: b.name, description: b.description, longDescription: b.longDescription, duration: b.duration, patientType: b.patientType, color: b.color,
    estimatedValue: b.estimatedValue, visibility: b.visibility, active: b.active, questions: json(b.questions), redirectUrl: b.redirectUrl ?? null, noticeOverrideHours: b.noticeOverrideHours ?? null,
  };
}

export async function createReason(tx: Tx, clinicId: string, b: z.infer<typeof zReasonBody>): Promise<Reason> {
  if (!b.providerIds.length) throw badRequest("A reason needs at least one provider.");
  await assertOwned(tx, clinicId, "provider", b.providerIds, "provider");
  await assertOwned(tx, clinicId, "operatory", b.operatoryIds, "operatory");
  const order = (await tx.reason.aggregate({ _max: { order: true } }))._max.order ?? -1;
  const row = await tx.reason.create({
    data: {
      clinicId, ...reasonData(b), order: order + 1,
      providers: { create: [...new Set(b.providerIds)].map((providerId) => ({ clinicId, providerId })) },
      operatories: { create: [...new Set(b.operatoryIds)].map((operatoryId) => ({ clinicId, operatoryId })) },
    },
    include: reasonInclude,
  });
  return toReason(row);
}

export async function updateReason(tx: Tx, clinicId: string, id: string, b: Partial<z.infer<typeof zReasonBody>>): Promise<Reason> {
  const current = await tx.reason.findUnique({ where: { id }, include: reasonInclude });
  if (!current) throw notFound("Reason");
  const merged = { ...toReason(current), ...b } as z.infer<typeof zReasonBody>;
  if (!merged.providerIds.length) throw badRequest("A reason needs at least one provider.");
  await assertOwned(tx, clinicId, "provider", merged.providerIds, "provider");
  await assertOwned(tx, clinicId, "operatory", merged.operatoryIds, "operatory");
  if (b.providerIds) {
    await tx.reasonProvider.deleteMany({ where: { reasonId: id } });
    await tx.reasonProvider.createMany({ data: [...new Set(b.providerIds)].map((providerId) => ({ clinicId, reasonId: id, providerId })) });
  }
  if (b.operatoryIds) {
    await tx.reasonOperatory.deleteMany({ where: { reasonId: id } });
    await tx.reasonOperatory.createMany({ data: [...new Set(b.operatoryIds)].map((operatoryId) => ({ clinicId, reasonId: id, operatoryId })) });
  }
  const row = await tx.reason.update({ where: { id }, data: reasonData(merged), include: reasonInclude });
  return toReason(row);
}

export async function duplicateReason(tx: Tx, clinicId: string, id: string): Promise<Reason> {
  const src = await tx.reason.findUnique({ where: { id }, include: reasonInclude });
  if (!src) throw notFound("Reason");
  // Inactive copy right after the original (docs/assumptions.md).
  await tx.reason.updateMany({ where: { order: { gt: src.order } }, data: { order: { increment: 1 } } });
  const r = toReason(src);
  const row = await tx.reason.create({
    data: {
      clinicId, ...reasonData({ ...r, name: `${r.name} (copy)`, active: false, redirectUrl: r.redirectUrl ?? "" }), order: src.order + 1,
      providers: { create: r.providerIds.map((providerId) => ({ clinicId, providerId })) },
      operatories: { create: r.operatoryIds.map((operatoryId) => ({ clinicId, operatoryId })) },
    },
    include: reasonInclude,
  });
  return toReason(row);
}

export async function reorderReasons(tx: Tx, ids: string[]) {
  const existing = await tx.reason.findMany({ select: { id: true } });
  const known = new Set(existing.map((r) => r.id));
  if (ids.length !== known.size || ids.some((id) => !known.has(id))) throw badRequest("The order must list every reason once.");
  for (let i = 0; i < ids.length; i++) await tx.reason.update({ where: { id: ids[i] }, data: { order: i } });
}

export async function deleteReason(tx: Tx, id: string) {
  const r = await tx.reason.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!r) throw notFound("Reason");
  const future = await tx.appointment.count({ where: { reasonId: id, status: { in: ["unconfirmed", "confirmed"] }, start: { gte: new Date() } } });
  if (future) throw conflict(`“${r.name}” has ${future} upcoming appointment${future > 1 ? "s" : ""}. Deactivate it instead.`);
  await tx.reason.delete({ where: { id } });
  return r;
}

// ---------- providers ----------

export async function listProviders(tx: Tx): Promise<Provider[]> {
  return (await tx.provider.findMany({ include: providerInclude, orderBy: { order: "asc" } })).map(toProvider);
}

function providerScalars(b: z.infer<typeof zProviderBody>) {
  return { displayName: b.displayName, externalId: b.externalId, photoUrl: b.photoUrl ?? null, role: b.role, bio: b.bio, showOnline: b.showOnline, active: b.active, color: b.color };
}

async function writeProviderDetails(tx: Tx, clinicId: string, providerId: string, b: z.infer<typeof zProviderBody>) {
  await tx.providerHours.deleteMany({ where: { providerId } });
  await tx.providerHours.createMany({ data: Object.entries(b.weeklyHours).map(([wd, h]) => ({ clinicId, providerId, weekday: Number(wd), enabled: h.enabled, start: h.start, end: h.end })) });
  await tx.providerBreak.deleteMany({ where: { providerId } });
  await tx.providerBreak.createMany({ data: b.breaks.map((x) => ({ clinicId, providerId, weekday: x.weekday === "all" ? null : x.weekday, start: x.start, end: x.end, label: x.label })) });
  await tx.providerTimeOff.deleteMany({ where: { providerId } });
  await tx.providerTimeOff.createMany({ data: b.timeOff.map((t) => ({ clinicId, providerId, start: dayToDb(t.start), end: dayToDb(t.end), reason: t.reason })) });
  await tx.providerOperatory.deleteMany({ where: { providerId } });
  await tx.providerOperatory.createMany({ data: [...new Set(b.operatoryIds)].map((operatoryId) => ({ clinicId, providerId, operatoryId })) });
  await tx.reasonProvider.deleteMany({ where: { providerId } });
  await tx.reasonProvider.createMany({ data: [...new Set(b.reasonIds)].map((reasonId) => ({ clinicId, providerId, reasonId })) });
}

function validateHours(b: Pick<z.infer<typeof zProviderBody>, "weeklyHours" | "breaks" | "timeOff">) {
  for (const h of Object.values(b.weeklyHours)) if (h.enabled && h.start >= h.end) throw badRequest("Working hours must end after they start.");
  for (const x of b.breaks) if (x.start >= x.end) throw badRequest("Breaks must end after they start.");
  for (const t of b.timeOff) if (t.start > t.end) throw badRequest("Time off must end on or after its start day.");
}

export async function createProvider(tx: Tx, clinicId: string, b: z.infer<typeof zProviderBody>): Promise<Provider> {
  validateHours(b);
  await assertOwned(tx, clinicId, "operatory", b.operatoryIds, "operatory");
  await assertOwned(tx, clinicId, "reason", b.reasonIds, "reason");
  const order = (await tx.provider.aggregate({ _max: { order: true } }))._max.order ?? -1;
  const row = await tx.provider.create({ data: { clinicId, ...providerScalars(b), order: order + 1 } });
  await writeProviderDetails(tx, clinicId, row.id, b);
  return toProvider(await tx.provider.findUniqueOrThrow({ where: { id: row.id }, include: providerInclude }));
}

export async function updateProvider(tx: Tx, clinicId: string, id: string, b: Partial<z.infer<typeof zProviderBody>>): Promise<Provider> {
  const current = await tx.provider.findUnique({ where: { id }, include: providerInclude });
  if (!current) throw notFound("Provider");
  const merged = { ...toProvider(current), ...b } as z.infer<typeof zProviderBody>;
  validateHours(merged);
  await assertOwned(tx, clinicId, "operatory", merged.operatoryIds, "operatory");
  await assertOwned(tx, clinicId, "reason", merged.reasonIds, "reason");
  await tx.provider.update({ where: { id }, data: providerScalars(merged) });
  await writeProviderDetails(tx, clinicId, id, merged);
  return toProvider(await tx.provider.findUniqueOrThrow({ where: { id }, include: providerInclude }));
}

// ---------- operatories ----------

export async function listOperatories(tx: Tx): Promise<Operatory[]> {
  return (await tx.operatory.findMany({ include: operatoryInclude, orderBy: { order: "asc" } })).map(toOperatory);
}

async function writeOperatoryLinks(tx: Tx, clinicId: string, operatoryId: string, b: z.infer<typeof zOperatoryBody>) {
  await assertOwned(tx, clinicId, "provider", b.providerIds, "provider");
  await assertOwned(tx, clinicId, "reason", b.reasonIds, "reason");
  await tx.providerOperatory.deleteMany({ where: { operatoryId } });
  await tx.providerOperatory.createMany({ data: [...new Set(b.providerIds)].map((providerId) => ({ clinicId, providerId, operatoryId })) });
  await tx.reasonOperatory.deleteMany({ where: { operatoryId } });
  await tx.reasonOperatory.createMany({ data: [...new Set(b.reasonIds)].map((reasonId) => ({ clinicId, reasonId, operatoryId })) });
}

export async function createOperatory(tx: Tx, clinicId: string, b: z.infer<typeof zOperatoryBody>): Promise<Operatory> {
  const order = (await tx.operatory.aggregate({ _max: { order: true } }))._max.order ?? -1;
  const row = await tx.operatory.create({ data: { clinicId, name: b.name, active: b.active, order: order + 1 } });
  await writeOperatoryLinks(tx, clinicId, row.id, b);
  return toOperatory(await tx.operatory.findUniqueOrThrow({ where: { id: row.id }, include: operatoryInclude }));
}

export async function updateOperatory(tx: Tx, clinicId: string, id: string, b: Partial<z.infer<typeof zOperatoryBody>>): Promise<Operatory> {
  const current = await tx.operatory.findUnique({ where: { id }, include: operatoryInclude });
  if (!current) throw notFound("Operatory");
  const merged = { ...toOperatory(current), ...b };
  await tx.operatory.update({ where: { id }, data: { name: merged.name, active: merged.active } });
  await writeOperatoryLinks(tx, clinicId, id, merged);
  return toOperatory(await tx.operatory.findUniqueOrThrow({ where: { id }, include: operatoryInclude }));
}

export async function deleteOperatory(tx: Tx, id: string) {
  const o = await tx.operatory.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!o) throw notFound("Operatory");
  await tx.appointment.updateMany({ where: { operatoryId: id, start: { lt: new Date() } }, data: { operatoryId: null } });
  const future = await tx.appointment.count({ where: { operatoryId: id, status: { in: ["unconfirmed", "confirmed"] } } });
  if (future) throw conflict(`${o.name} has ${future} upcoming appointment${future > 1 ? "s" : ""}. Move them first or deactivate the room.`);
  await tx.operatory.delete({ where: { id } });
  return o;
}

// ---------- schedule ----------

export async function addHoliday(tx: Tx, clinicId: string, h: { date: string; name: string }) {
  return tx.holiday.create({ data: { clinicId, date: dayToDb(h.date), name: h.name } });
}

export async function addBlockout(tx: Tx, clinicId: string, b: { label: string; start: string; end: string; providerId?: string; operatoryId?: string }) {
  if (b.start >= b.end) throw badRequest("A blockout must end after it starts.");
  if (b.providerId) await assertOwned(tx, clinicId, "provider", [b.providerId], "provider");
  if (b.operatoryId) await assertOwned(tx, clinicId, "operatory", [b.operatoryId], "operatory");
  return tx.blockout.create({ data: { clinicId, label: b.label, start: wallToDb(b.start), end: wallToDb(b.end), providerId: b.providerId ?? null, operatoryId: b.operatoryId ?? null } });
}

// ---------- referrers ----------

export async function listReferrers(tx: Tx): Promise<Referrer[]> {
  return (await tx.referrer.findMany({ orderBy: { publicId: "asc" } })).map(toReferrer);
}

export async function createReferrer(tx: Tx, clinicId: string, b: { name: string; sourceType: Referrer["sourceType"]; redirectUrl?: string }): Promise<Referrer> {
  const max = (await tx.referrer.aggregate({ _max: { publicId: true } }))._max.publicId ?? 0;
  return toReferrer(await tx.referrer.create({ data: { clinicId, publicId: max + 1, name: b.name, sourceType: b.sourceType, redirectUrl: b.redirectUrl ?? null } }));
}

export async function updateReferrer(tx: Tx, clinicId: string, publicId: number, b: Partial<{ name: string; sourceType: Referrer["sourceType"]; redirectUrl?: string }>): Promise<Referrer> {
  const row = await tx.referrer.findUnique({ where: { clinicId_publicId: { clinicId, publicId } } });
  if (!row) throw notFound("Referrer");
  return toReferrer(await tx.referrer.update({ where: { id: row.id }, data: { name: b.name ?? row.name, sourceType: b.sourceType ?? row.sourceType, redirectUrl: b.redirectUrl === undefined ? row.redirectUrl : (b.redirectUrl ?? null) } }));
}

export async function deleteReferrer(tx: Tx, clinicId: string, publicId: number) {
  const row = await tx.referrer.findUnique({ where: { clinicId_publicId: { clinicId, publicId } } });
  if (!row) throw notFound("Referrer");
  await tx.referrer.delete({ where: { id: row.id } });
  return row;
}

export type { Clinic };
