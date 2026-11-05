import { addDays, format } from "date-fns";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, withPlatform, withTenant } from "@/server/db";
import { appointmentListInclude, providerInclude, toAppointment, toAdSpend, toProvider, toReason, toWidgetSession, reasonInclude } from "@/server/mappers";
import { loadClinic } from "./clinic";
import { adRoiReport, adminAnalytics, adminOverview, formAnalyticsReport, homeReport, performanceReport, toDateRange } from "./reports";
import { homeMetrics } from "@/components/home/metrics";
import { adRoi, avgLeadTimeHours, byProvider, byReason, bySource, dropOffByReason, dropOffByStep, fillRate, filterSessions, formTotals, heatmap, newPatientCount, overview, patientTrend } from "@/components/reports/aggregate";
import { nowInZone } from "@/lib/time";

/**
 * Parity: the SQL reports must equal the Phase 1 in-browser aggregators over the same data. The JS versions assume
 * the browser runs in the clinic's time zone, so the test runs with the clinic set to UTC (vitest pins TZ=UTC).
 */
const CLINIC = "c_brightsmile";
let originalTz = "";

beforeAll(async () => {
  originalTz = (await withPlatform((tx) => tx.clinic.findUniqueOrThrow({ where: { id: CLINIC }, select: { timeZone: true } }))).timeZone;
  await withPlatform((tx) => tx.clinic.update({ where: { id: CLINIC }, data: { timeZone: "UTC" } }));
});
afterAll(async () => {
  await withPlatform((tx) => tx.clinic.update({ where: { id: CLINIC }, data: { timeZone: originalTz } }));
  await prisma.$disconnect();
});

async function loadAll() {
  return withTenant(CLINIC, async (tx) => ({
    clinic: await loadClinic(tx, CLINIC),
    appts: (await tx.appointment.findMany({ include: appointmentListInclude })).map((a) => toAppointment(a)),
    sessions: (await tx.widgetSession.findMany()).map(toWidgetSession),
    reasons: (await tx.reason.findMany({ include: reasonInclude, orderBy: { order: "asc" } })).map(toReason),
    providers: (await tx.provider.findMany({ include: providerInclude, orderBy: { order: "asc" } })).map(toProvider),
    spend: (await tx.adSpend.findMany()).map(toAdSpend),
  }));
}

const today = format(new Date(), "yyyy-MM-dd");
const ranges = [
  { from: format(addDays(new Date(), -29), "yyyy-MM-dd"), to: today },
  { from: format(addDays(new Date(), -6), "yyyy-MM-dd"), to: today },
  { from: today, to: today },
  { from: format(addDays(new Date(), -44), "yyyy-MM-dd"), to: format(addDays(new Date(), 14), "yyyy-MM-dd") },
];

describe("SQL reports match the Phase 1 aggregators", () => {
  it("home metrics", async () => {
    const { appts } = await loadAll();
    for (const r of ranges) {
      const sql = await withTenant(CLINIC, (tx) => homeReport(tx, CLINIC, r));
      expect(sql).toEqual(homeMetrics(appts, toDateRange(r)));
    }
  });

  it("performance: overview, by source, patients, reasons, providers, lead time, fill rate, ad ROI", async () => {
    const { appts, sessions, reasons, providers, spend, clinic } = await loadAll();
    const now = nowInZone("UTC");
    for (const r of ranges) {
      const sql = await withTenant(CLINIC, (tx) => performanceReport(tx, CLINIC, r));
      const range = toDateRange(r);
      expect(sql.overview).toEqual(overview(appts, range));
      expect(sql.bySource).toEqual(bySource(appts, sessions, range));
      expect(sql.patientTrend).toEqual(patientTrend(appts, range));
      expect(sql.newPatients).toBe(newPatientCount(appts, range));
      expect(sql.byReason).toEqual(byReason(appts, reasons, range, now));
      expect(sql.byProvider).toEqual(byProvider(appts, providers, clinic, range, now));
      expect(sql.avgLeadTimeHours).toBeCloseTo(avgLeadTimeHours(appts, range), 0);
      expect(sql.fillRate7).toBe(fillRate(appts, providers, clinic, now, 7));
      expect(sql.fillRate14).toBe(fillRate(appts, providers, clinic, now, 14));
    }
    const roi = await withTenant(CLINIC, (tx) => adRoiReport(tx, CLINIC, "UTC"));
    expect(roi).toEqual(adRoi(appts, spend));
  });

  it("form analytics: totals, drop-off by step and reason, heatmaps, source filter", async () => {
    const { sessions, reasons } = await loadAll();
    for (const r of ranges) {
      for (const source of ["all", "google_ads", "website"] as const) {
        const sql = await withTenant(CLINIC, (tx) => formAnalyticsReport(tx, CLINIC, r, source));
        const list = filterSessions(sessions, toDateRange(r), source);
        expect(sql.totals).toEqual(formTotals(list));
        expect(sql.dropOffByStep).toEqual(dropOffByStep(list));
        expect(sql.dropOffByReason).toEqual(dropOffByReason(list, reasons));
        expect(sql.visitHeatmap).toEqual(heatmap(list));
        expect(sql.bookingHeatmap).toEqual(heatmap(list, true));
      }
    }
  });

  it("admin overview and analytics return consistent platform-wide numbers", async () => {
    const o = await withPlatform((tx) => adminOverview(tx));
    expect(Object.values(o.clinics).reduce((s, x) => s + x, 0)).toBe(5);
    expect(o.bookings.current).toBeGreaterThan(0);
    expect(o.revenue.mrr).toBeGreaterThan(0);
    const a = await withPlatform((tx) => adminAnalytics(tx, 30));
    expect(a.compare.length).toBe(5);
    expect(a.compare.reduce((s, c) => s + c.bookings, 0)).toBe(o.bookings.current);
    expect(a.growth).toHaveLength(12);
  });
});
