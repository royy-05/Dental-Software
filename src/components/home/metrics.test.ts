import { describe, expect, it } from "vitest";
import type { Appointment } from "@/types";
import { rangeFor } from "@/lib/range";
import { fromWall } from "@/lib/time";
import { homeMetrics } from "./metrics";

const mk = (start: string, p: Partial<Appointment> = {}) => ({ id: start, start, end: start, status: "confirmed", patientType: "new", ...p }) as Appointment;

describe("home metrics", () => {
  const now = fromWall("2026-11-04T12:00");
  it("counts today vs yesterday and splits patient types", () => {
    const m = homeMetrics(
      [mk("2026-11-04T09:00"), mk("2026-11-04T10:00", { patientType: "existing" }), mk("2026-11-04T11:00", { status: "declined" }), mk("2026-11-03T09:00")],
      rangeFor("today", now),
    );
    expect(m.total).toBe(2);
    expect(m.previous).toBe(1);
    expect(m.changePct).toBe(100);
    expect([m.newCount, m.returningCount]).toEqual([1, 1]);
    expect(m.trend.find((t) => t.label === "9AM")?.current).toBe(1);
  });
  it("builds a daily trend for a week", () => {
    const m = homeMetrics([mk("2026-11-03T09:00")], rangeFor("week", now));
    expect(m.trend).toHaveLength(7);
    expect(m.trend.reduce((s, t) => s + t.current, 0)).toBe(1);
  });
});
