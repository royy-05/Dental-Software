import { z } from "zod";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { homeReport } from "@/server/services/reports";
import { zDay } from "@/lib/schemas";

const rangeQuery = z.object({ from: zDay, to: zDay }).refine((r) => r.from <= r.to && r.to <= `${Number(r.from.slice(0, 4)) + 2}`, "Range must be in order and at most 2 years");

export const GET = handler({ summary: "Home metrics for a date range: total, change vs previous period, trend, new vs returning (SQL)", access: { kind: "clinic", permission: "clinic:home" }, query: rangeQuery }, async ({ clinicId, query }) =>
  withTenant(clinicId, (tx) => homeReport(tx, clinicId, query)),
);
