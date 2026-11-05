import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { audit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { zId, zName } from "@/lib/schemas";

const params = z.object({ id: zId });

/** Renaming cascades to clinics that picked the carrier from the master list. */
export const PATCH = handler({ summary: "Rename a master carrier (clinic copies follow)", access: { kind: "platform", permission: "admin:libraries:edit" }, params, body: z.object({ name: zName(120) }) }, async ({ params, body, actor }) =>
  withPlatform(async (tx) => {
    const c = await tx.insuranceCarrier.findUnique({ where: { id: params.id } });
    if (!c) throw notFound("Carrier");
    const row = await tx.insuranceCarrier.update({ where: { id: c.id }, data: { name: body.name } });
    await tx.clinicInsurance.updateMany({ where: { carrierId: c.id }, data: { name: body.name } });
    await audit(tx, actor, { action: "Renamed insurance carrier", category: "settings", target: c.name });
    return row;
  }),
);

export const DELETE = handler({ summary: "Remove a master carrier (clinic copies become custom carriers)", access: { kind: "platform", permission: "admin:libraries:edit" }, params }, async ({ params, actor }) =>
  withPlatform(async (tx) => {
    const c = await tx.insuranceCarrier.findUnique({ where: { id: params.id } });
    if (!c) throw notFound("Carrier");
    await tx.clinicInsurance.updateMany({ where: { carrierId: c.id }, data: { carrierId: null, custom: true } });
    await tx.insuranceCarrier.delete({ where: { id: c.id } });
    await audit(tx, actor, { action: "Removed insurance carrier", category: "settings", target: c.name });
    return { ok: true };
  }),
);
