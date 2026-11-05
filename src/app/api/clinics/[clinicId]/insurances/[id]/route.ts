import { z } from "zod";
import { handler, idParams } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { toClinicInsurance } from "@/server/mappers";
import { zNetwork } from "@/lib/schemas";

const params = idParams("id");

export const PATCH = handler({ summary: "Set a carrier's network status", access: { kind: "clinic", permission: "insurances:manage" }, params, body: z.object({ status: zNetwork }) }, async ({ clinicId, params, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    const i = await tx.clinicInsurance.findUnique({ where: { id: params.id } });
    if (!i) throw notFound("Carrier");
    const row = await tx.clinicInsurance.update({ where: { id: i.id }, data: { status: body.status } });
    await audit(tx, actor, { action: `Set ${i.name} to ${body.status}`, category: "settings", target: "Insurances", clinicId });
    return toClinicInsurance(row);
  }),
);

export const DELETE = handler({ summary: "Remove a carrier from this clinic", access: { kind: "clinic", permission: "insurances:manage" }, params }, async ({ clinicId, params, actor }) =>
  withTenant(clinicId, async (tx) => {
    const i = await tx.clinicInsurance.findUnique({ where: { id: params.id } });
    if (!i) throw notFound("Carrier");
    await tx.clinicInsurance.delete({ where: { id: i.id } });
    await audit(tx, actor, { action: `Removed insurance ${i.name}`, category: "settings", target: "Insurances", clinicId });
    return { ok: true };
  }),
);
