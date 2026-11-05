import { handler, idParams } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { dbToDay } from "@/server/mappers";

export const DELETE = handler({ summary: "Remove a holiday", access: { kind: "clinic", permission: "schedule:manage" }, params: idParams("id") }, async ({ clinicId, params, actor }) =>
  withTenant(clinicId, async (tx) => {
    const h = await tx.holiday.findUnique({ where: { id: params.id } });
    if (!h) throw notFound("Holiday");
    await tx.holiday.delete({ where: { id: h.id } });
    await audit(tx, actor, { action: `Removed holiday ${dbToDay(h.date)}`, category: "settings", target: "Schedule", clinicId });
    return { ok: true };
  }),
);
