import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { audit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { toCoupon } from "@/server/mappers";
import { zId } from "@/lib/schemas";

export const PATCH = handler({ summary: "Enable or disable a coupon", access: { kind: "platform", permission: "admin:billing" }, params: z.object({ id: zId }), body: z.object({ active: z.boolean() }) }, async ({ params, body, actor }) =>
  withPlatform(async (tx) => {
    const c = await tx.coupon.findUnique({ where: { id: params.id } });
    if (!c) throw notFound("Coupon");
    const row = await tx.coupon.update({ where: { id: c.id }, data: { active: body.active } });
    await audit(tx, actor, { action: `${body.active ? "Enabled" : "Disabled"} coupon`, category: "billing", target: c.code });
    return toCoupon(row);
  }),
);
