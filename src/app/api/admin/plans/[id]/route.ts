import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { audit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { json, toPlan } from "@/server/mappers";
import { zId, zPlanPatch } from "@/lib/schemas";

export const PATCH = handler({ summary: "Edit a plan: name, price, limits and modules (feature flags per plan)", access: { kind: "platform", permission: "admin:plans:edit" }, params: z.object({ id: zId }), body: zPlanPatch }, async ({ params, body, actor }) =>
  withPlatform(async (tx) => {
    const p = await tx.plan.findUnique({ where: { id: params.id } });
    if (!p) throw notFound("Plan");
    const limits = body.limits ? json({ ...(p.limits as object), ...body.limits }) : undefined;
    const row = await tx.plan.update({ where: { id: p.id }, data: { name: body.name, priceMonthly: body.priceMonthly, limits } });
    await audit(tx, actor, { action: body.limits?.modules ? "Changed plan modules" : "Edited plan", category: body.limits?.modules ? "settings" : "billing", target: row.name });
    return toPlan(row);
  }),
);
