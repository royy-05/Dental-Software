import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { audit } from "@/server/audit";
import { toCoupon } from "@/server/mappers";

export const GET = handler({ summary: "Coupons", access: { kind: "platform", permission: "admin:billing" } }, async () => withPlatform(async (tx) => (await tx.coupon.findMany({ orderBy: { code: "asc" } })).map(toCoupon)));

export const POST = handler({ summary: "Create a coupon", access: { kind: "platform", permission: "admin:billing" }, body: z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,30}$/), percentOff: z.number().int().min(1).max(100) }) }, async ({ body, actor }) =>
  withPlatform(async (tx) => {
    const c = await tx.coupon.create({ data: { id: `cp_${body.code.toLowerCase()}`, code: body.code, percentOff: body.percentOff } });
    await audit(tx, actor, { action: "Created coupon", category: "billing", target: c.code });
    return toCoupon(c);
  }),
);
