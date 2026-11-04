import { describe, expect, it } from "vitest";
import { buildSeed } from "./index";
import { BLOCKING_STATUSES } from "@/lib/slots";
import { fromWall } from "@/lib/time";

describe("demo seed", () => {
  const db = buildSeed(new Date("2026-11-04T15:00:00Z"));

  it("has 3 demo clinics with appointments across 60 days", () => {
    const withAppts = new Set(db.appointments.map((a) => a.clinicId));
    expect(withAppts.size).toBe(3);
    const days = new Set(db.appointments.map((a) => a.start.slice(0, 10)));
    expect(days.size).toBeGreaterThan(35);
    expect(db.appointments.length).toBeGreaterThan(500);
  });

  it("never double-books a provider or operatory", () => {
    const active = db.appointments.filter((a) => BLOCKING_STATUSES.includes(a.status) || a.status === "cancelled" || a.status === "declined");
    for (const key of ["providerId", "operatoryId"] as const) {
      const groups = new Map<string, typeof active>();
      for (const a of active) {
        const k = `${a[key]}|${a.start.slice(0, 10)}`;
        if (!a[key]) continue;
        groups.set(k, [...(groups.get(k) ?? []), a]);
      }
      for (const list of groups.values()) {
        const sorted = [...list].sort((x, y) => x.start.localeCompare(y.start));
        for (let i = 1; i < sorted.length; i++) {
          expect(fromWall(sorted[i].start).getTime()).toBeGreaterThanOrEqual(fromWall(sorted[i - 1].end).getTime());
        }
      }
    }
  });

  it("uses only fake contact details", () => {
    for (const a of db.appointments) {
      expect(a.patient.email.endsWith("@example.com")).toBe(true);
      expect(a.patient.phone.startsWith("(555)")).toBe(true);
    }
  });

  it("links every reason to at least one provider of the same clinic", () => {
    for (const r of db.reasons) {
      const ps = db.providers.filter((p) => r.providerIds.includes(p.id));
      expect(ps.length).toBeGreaterThan(0);
      expect(ps.every((p) => p.clinicId === r.clinicId)).toBe(true);
    }
  });

  it("keeps widget analytics free of PHI", () => {
    const keys = new Set(db.widgetSessions.flatMap((s) => Object.keys(s)));
    for (const k of ["patient", "email", "phone", "firstName", "lastName", "dob"]) expect(keys.has(k)).toBe(false);
  });
});
