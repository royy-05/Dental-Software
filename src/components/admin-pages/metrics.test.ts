import { describe, expect, it } from "vitest";
import { buildSeed } from "@/mock";
import { churnedMrr, conversionRate, daysLeftToRestore, fmtDuration, isSlugTaken, lastDays, mrr, parseCsv, pctChange, showRate, slugify } from "./metrics";

const NOW = new Date("2026-11-04T15:00:00Z");
const db = buildSeed(NOW);

describe("admin metrics", () => {
  it("computes MRR from active clinics only", () => {
    // Bright Smile (Pro 349) + Motion (Growth 199) are active; Clear Skin is on trial ($0).
    expect(mrr(db.clinics, db.plans)).toBe(548);
    expect(churnedMrr(db.clinics, db.plans)).toBe(99);
  });

  it("computes conversion and show rates in percent", () => {
    const p = lastDays(30, NOW);
    const conv = conversionRate(db.appointments, db.widgetSessions, p);
    expect(conv).toBeGreaterThan(10);
    expect(conv).toBeLessThan(80);
    const show = showRate(db.appointments, p);
    expect(show).toBeGreaterThan(70);
    expect(show).toBeLessThanOrEqual(100);
  });

  it("handles percent change edge cases", () => {
    expect(pctChange(0, 0)).toBe(0);
    expect(pctChange(5, 0)).toBe(100);
    expect(pctChange(110, 100)).toBe(10);
  });

  it("slugifies and checks uniqueness", () => {
    expect(slugify("Sunny Hills Dental & Ortho!")).toBe("sunny-hills-dental-and-ortho");
    expect(isSlugTaken("bright-smile-dental", db.clinics)).toBe(true);
    expect(isSlugTaken("bright-smile-dental", db.clinics, "c_brightsmile")).toBe(false);
  });

  it("parses CSV with quotes", () => {
    const rows = parseCsv('name,duration,description\n"Exam, full",30,"Says ""hi"""\nCleaning,45,\n');
    expect(rows).toEqual([
      { name: "Exam, full", duration: "30", description: 'Says "hi"' },
      { name: "Cleaning", duration: "45", description: "" },
    ]);
  });

  it("counts restore days and formats durations", () => {
    expect(daysLeftToRestore(new Date(NOW.getTime() - 3 * 86400000).toISOString(), NOW)).toBe(27);
    expect(daysLeftToRestore(new Date(NOW.getTime() - 40 * 86400000).toISOString(), NOW)).toBe(0);
    expect(fmtDuration(45)).toBe("45m");
    expect(fmtDuration(125)).toBe("2h 5m");
    expect(fmtDuration(null)).toBe("—");
  });
});
