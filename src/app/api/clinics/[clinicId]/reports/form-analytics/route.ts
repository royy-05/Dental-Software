import { z } from "zod";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { formAnalyticsReport } from "@/server/services/reports";
import { zDay, zSource } from "@/lib/schemas";

const query = z.object({ from: zDay, to: zDay, source: zSource.or(z.literal("all")).default("all") });

export const GET = handler({ summary: "Form Analytics: visits, bookings, drop-off by step and reason, heatmaps (SQL over widget sessions; no PHI)", access: { kind: "clinic", permission: "reports:view" }, query }, async ({ clinicId, query }) =>
  withTenant(clinicId, (tx) => formAnalyticsReport(tx, clinicId, { from: query.from, to: query.to }, query.source)),
);
