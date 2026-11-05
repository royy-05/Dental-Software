import { z } from "zod";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { toAdSpend } from "@/server/mappers";
import { zMonth, zSource } from "@/lib/schemas";
import { SOURCE_LABELS } from "@/types";

export const GET = handler({ summary: "Monthly ad spend per source (Ad ROI)", access: { kind: "clinic", permission: "reports:view", feature: "performance" } }, async ({ clinicId }) =>
  withTenant(clinicId, async (tx) => (await tx.adSpend.findMany({ orderBy: [{ month: "desc" }, { source: "asc" }] })).map(toAdSpend)),
);

export const PUT = handler({ summary: "Set ad spend for a month and source", access: { kind: "clinic", permission: "reports:view", feature: "performance" }, body: z.object({ month: zMonth, source: zSource, amount: z.number().int().min(0).max(10_000_000) }) }, async ({ clinicId, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    const row = await tx.adSpend.upsert({ where: { clinicId_month_source: { clinicId, month: body.month, source: body.source } }, create: { clinicId, ...body }, update: { amount: body.amount } });
    await audit(tx, actor, { action: `Updated ad spend ${body.month}`, category: "settings", target: SOURCE_LABELS[body.source], clinicId });
    return toAdSpend(row);
  }),
);
