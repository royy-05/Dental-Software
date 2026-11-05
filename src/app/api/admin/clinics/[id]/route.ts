import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { audit } from "@/server/audit";
import { conflict, notFound } from "@/server/errors";
import { json, toClinic, toPlan, toUser } from "@/server/mappers";
import { resolveFeatures } from "@/server/services/clinic";
import { slugTaken } from "@/server/services/admin";
import { zClinicAdminPatch, zId } from "@/lib/schemas";

const params = z.object({ id: zId });
const include = { holidays: true, blockouts: true, featureFlags: true, plan: true } as const;

export const GET = handler({ summary: "Clinic detail for the admin panel: clinic, plan, resolved features, staff, counts", access: { kind: "platform", permission: "admin:clinics:view" }, params }, async ({ params }) =>
  withPlatform(async (tx) => {
    const row = await tx.clinic.findUnique({ where: { id: params.id }, include });
    if (!row) throw notFound("Clinic");
    const clinic = toClinic(row);
    const plan = toPlan(row.plan);
    const [members, counts, lastBooking] = await Promise.all([
      tx.membership.findMany({ where: { clinicId: row.id }, include: { user: { include: { memberships: true } } } }),
      tx.$queryRaw<{ appointments: bigint; providers: bigint; reasons: bigint; failed: bigint }[]>`
        SELECT (SELECT count(*) FROM appointments WHERE clinic_id = ${row.id}) AS appointments, (SELECT count(*) FROM providers WHERE clinic_id = ${row.id}) AS providers,
               (SELECT count(*) FROM reasons WHERE clinic_id = ${row.id}) AS reasons, (SELECT count(*) FROM message_logs WHERE clinic_id = ${row.id} AND status IN ('failed','bounced')) AS failed`,
      tx.appointment.findFirst({ where: { clinicId: row.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);
    const c = counts[0];
    return {
      clinic, plan, features: resolveFeatures(clinic, plan),
      users: members.map((m) => ({ ...toUser(m.user), role: m.role })),
      counts: { appointments: Number(c?.appointments ?? 0), providers: Number(c?.providers ?? 0), reasons: Number(c?.reasons ?? 0), failedMessages: Number(c?.failed ?? 0), lastBookingAt: lastBooking?.createdAt ?? null },
    };
  }),
);

/** Status, plan, trial, feature overrides, 10DLC status, custom domain, retention, RwG/PMS simulated state, details. */
export const PATCH = handler({ summary: "Edit a clinic from the admin panel (details, status, plan, trial, feature overrides, SMS registration, custom domain, retention, integrations)", access: { kind: "platform", permission: "admin:clinics:edit" }, params, body: zClinicAdminPatch }, async ({ params, body, actor, role }) =>
  withPlatform(async (tx) => {
    const current = await tx.clinic.findUnique({ where: { id: params.id }, include });
    if (!current) throw notFound("Clinic");
    const data: Record<string, unknown> = {};
    const changed: string[] = [];
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (k === "featureOverrides") {
        if (role !== "super_admin") continue;
        for (const [key, enabled] of Object.entries(v as Record<string, boolean | null>)) {
          if (enabled === null) await tx.featureFlag.deleteMany({ where: { clinicId: current.id, key } });
          else await tx.featureFlag.upsert({ where: { clinicId_key: { clinicId: current.id, key } }, create: { clinicId: current.id, key, enabled }, update: { enabled } });
          await audit(tx, actor, { action: `Feature override ${key}: ${enabled === null ? "plan default" : enabled}`, category: "settings", target: current.name, clinicId: current.id });
        }
        continue;
      }
      if (k === "slug" && v !== current.slug && (await slugTaken(tx, v as string, current.id))) throw conflict("That booking slug is already taken.");
      if (k === "rwg" || k === "pms") data[k] = json(Object.fromEntries(Object.entries({ ...(current[k] as object), ...(v as object) }).filter(([, x]) => x !== null)));
      else if (k === "trialEndsAt") data.trialEndsAt = v ? new Date(v as string) : null;
      else data[k] = v;
      changed.push(k);
    }
    if (changed.length) {
      await tx.clinic.update({ where: { id: current.id }, data });
      const label = changed.length === 1 && changed[0] === "status" ? `Set clinic status: ${body.status}` : changed.length === 1 && changed[0] === "planId" ? "Changed clinic plan" : changed.length === 1 && changed[0] === "smsRegistration" ? `Set 10DLC status: ${body.smsRegistration}` : `Edited clinic ${changed.join(", ")}`;
      await audit(tx, actor, { action: label, category: changed.includes("planId") || changed.includes("trialEndsAt") ? "billing" : "clinic", target: current.name, clinicId: current.id });
    }
    return toClinic(await tx.clinic.findUniqueOrThrow({ where: { id: current.id }, include }));
  }),
);
