import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { audit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { zId } from "@/lib/schemas";

export const DELETE = handler({ summary: "Remove an opt-out entry", access: { kind: "platform", permission: "admin:messaging:edit" }, params: z.object({ id: zId }) }, async ({ params, actor }) =>
  withPlatform(async (tx) => {
    const o = await tx.optOut.findUnique({ where: { id: params.id } });
    if (!o) throw notFound("Opt-out");
    await tx.optOut.delete({ where: { id: o.id } });
    await audit(tx, actor, { action: "Removed opt-out", category: "settings", target: "SMS opt-out list", clinicId: o.clinicId });
    return { ok: true };
  }),
);
