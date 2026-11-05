import { z } from "zod";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { performanceReport } from "@/server/services/reports";
import { zDay } from "@/lib/schemas";

const query = z.object({ from: zDay, to: zDay, export: z.enum(["csv", "pdf"]).optional() });

export const GET = handler({ summary: "Performance report (overview, by source, ad ROI, patients, reasons, providers, timing) in SQL; export=csv|pdf audits an export", access: { kind: "clinic", permission: "reports:view", feature: "performance" }, query }, async ({ clinicId, query, actor }) =>
  withTenant(clinicId, async (tx) => {
    const r = await performanceReport(tx, clinicId, { from: query.from, to: query.to });
    if (query.export) await audit(tx, actor, { action: `Exported Performance ${query.export.toUpperCase()}`, category: "export", target: "Performance", clinicId });
    return r;
  }),
);
