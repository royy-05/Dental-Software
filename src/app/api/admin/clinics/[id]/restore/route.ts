import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { audit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { zId } from "@/lib/schemas";

export const POST = handler({ summary: "Restore a soft-deleted clinic", access: { kind: "platform", permission: "admin:clinics:delete" }, params: z.object({ id: zId }) }, async ({ params, actor }) =>
  withPlatform(async (tx) => {
    const c = await tx.clinic.findUnique({ where: { id: params.id } });
    if (!c) throw notFound("Clinic");
    await tx.clinic.update({ where: { id: c.id }, data: { deletedAt: null } });
    await audit(tx, actor, { action: "Restored clinic", category: "clinic", target: c.name, clinicId: c.id });
    return { ok: true };
  }),
);
