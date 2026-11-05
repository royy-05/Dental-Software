import { handler, idParams } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { notFound } from "@/server/errors";

export const DELETE = handler({ summary: "Remove a blockout", access: { kind: "clinic", permission: "schedule:manage" }, params: idParams("id") }, async ({ clinicId, params, actor }) =>
  withTenant(clinicId, async (tx) => {
    const b = await tx.blockout.findUnique({ where: { id: params.id } });
    if (!b) throw notFound("Blockout");
    await tx.blockout.delete({ where: { id: b.id } });
    await audit(tx, actor, { action: `Removed blockout “${b.label}”`, category: "settings", target: "Schedule", clinicId });
    return { ok: true };
  }),
);
