import { describe, expect, it } from "vitest";
import { buildSeed, CLINIC_IDS } from "@/mock";
import { rangeFor, previousRange } from "@/lib/range";
import { fromWall } from "@/lib/time";
import type { WidgetSession } from "@/types";
import {
  adRoi,
  availableMinutes,
  avgLeadTimeHours,
  byProvider,
  byReason,
  bySource,
  dropOffByReason,
  dropOffByStep,
  fillRate,
  formTotals,
  heatmap,
  overview,
  peaks,
} from "./aggregate";

const NOW = new Date("2026-11-04T15:00:00Z");
const db = buildSeed(NOW);
const cid = CLINIC_IDS.dental;
const appts = db.appointments.filter((a) => a.clinicId === cid);
const sessions = db.widgetSessions.filter((s) => s.clinicId === cid);
const clinic = db.clinics.find((c) => c.id === cid)!;
const providers = db.providers.filter((p) => p.clinicId === cid);
const localNow = fromWall("2026-11-04T10:00");

function sess(p: Partial<WidgetSession>): WidgetSession {
  return { id: Math.random().toString(), clinicId: "c", at: "2026-11-02T10:00:00Z", localHour: 10, localWeekday: 1, source: "website", furthestStep: "reason", booked: false, ...p };
}

describe("form analytics", () => {
  const list = [sess({ booked: true, furthestStep: "review", reasonId: "r1" }), sess({ furthestStep: "reason" }), sess({ furthestStep: "datetime", reasonId: "r1" }), sess({ furthestStep: "details", reasonId: "r2", localHour: 18 })];

  it("computes totals and conversion", () => {
    expect(formTotals(list)).toEqual({ visits: 4, booked: 1, dropOffs: 3, conversion: 25 });
  });

  it("counts drop-off by step", () => {
    const rows = dropOffByStep(list);
    expect(rows.find((r) => r.step === "reason")!.dropped).toBe(1);
    expect(rows.find((r) => r.step === "datetime")!.dropped).toBe(1);
    expect(rows.find((r) => r.step === "details")!.dropped).toBe(1);
    expect(rows.find((r) => r.step === "review")!.reached).toBe(1);
    expect(rows.reduce((s, r) => s + r.dropped, 0)).toBe(3);
  });

  it("counts drop-off by reason", () => {
    const rows = dropOffByReason(list, [{ id: "r1", name: "Exam" }, { id: "r2", name: "Clean" }] as never);
    expect(rows.find((r) => r.reasonId === "r1")).toMatchObject({ visits: 2, booked: 1, dropped: 1, conversion: 50 });
    expect(rows.find((r) => r.reasonId === "__none")!.visits).toBe(1);
  });

  it("builds heatmaps and peaks", () => {
    const g = heatmap(list);
    expect(g[1][10]).toBe(3);
    expect(heatmap(list, true)[1][10]).toBe(1);
    expect(peaks(g)[0]).toEqual({ weekday: 1, hour: 10, count: 3 });
  });
});

describe("performance on seed data", () => {
  const month = rangeFor("last30", localNow);

  it("overview numbers are consistent", () => {
    const o = overview(appts, month);
    expect(o.bookings).toBeGreaterThan(0);
    expect(o.completed + o.cancelled + o.noShows).toBeLessThanOrEqual(o.bookings);
    expect(o.showRate).toBeGreaterThan(50);
    expect(overview(appts, previousRange(month)).bookings).toBeGreaterThan(0);
  });

  it("by source sums to the total created bookings", () => {
    const rows = bySource(appts, sessions, month);
    const total = appts.filter((a) => a.status !== "declined" && new Date(a.createdAt) >= month.from && new Date(a.createdAt) <= month.to).length;
    expect(rows.reduce((s, r) => s + r.bookings, 0)).toBe(total);
  });

  it("ad ROI divides spend by bookings", () => {
    const rows = adRoi(appts, db.adSpend.filter((s) => s.clinicId === cid));
    for (const r of rows) if (r.bookings) expect(r.costPerBooking).toBeCloseTo(r.spend / r.bookings, 1);
  });

  it("reason and provider rows stay within 0-100%", () => {
    for (const r of byReason(appts, db.reasons.filter((x) => x.clinicId === cid), month, localNow)) expect(r.completionRate).toBeLessThanOrEqual(100);
    for (const p of byProvider(appts, providers, clinic, month, localNow)) {
      expect(p.utilization).toBeGreaterThanOrEqual(0);
      expect(p.utilization).toBeLessThanOrEqual(100);
    }
  });

  it("available minutes subtract lunch break", () => {
    const patel = providers.find((p) => p.id === "p_patel")!;
    expect(availableMinutes(patel, clinic, fromWall("2026-11-09T00:00"))).toBe(8 * 60); // 8-17 minus 1h lunch
    expect(availableMinutes(patel, clinic, fromWall("2026-11-08T00:00"))).toBe(0); // Sunday
  });

  it("lead time and fill rate are sensible", () => {
    expect(avgLeadTimeHours(appts, month)).toBeGreaterThan(0);
    const f7 = fillRate(appts, providers, clinic, localNow, 7);
    expect(f7).toBeGreaterThan(0);
    expect(f7).toBeLessThanOrEqual(100);
  });
});
