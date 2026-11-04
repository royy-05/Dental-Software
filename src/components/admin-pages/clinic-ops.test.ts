import { describe, expect, it } from "vitest";
import { buildSeed } from "@/mock";
import { cloneClinicSettings, createClinic } from "./clinic-ops";
import { parseCsv } from "./metrics";

describe("clinic ops", () => {
  it("creates a clinic with flow v1, templates, owner invite, starter and imported reasons", () => {
    const db = buildSeed(new Date("2026-11-04T15:00:00Z"));
    const users = db.users.length;
    const c = createClinic(
      db,
      {
        name: "Sunny Hills Dental",
        slug: "sunny-hills",
        specialty: "dental",
        timeZone: "America/Chicago",
        phone: "(555) 010-9999",
        email: "hi@sunny.example.com",
        address: "1 Main St",
        planId: "plan_growth",
        trial: true,
        owner: { mode: "invite", name: "Pat Owner", email: "pat@sunny.example.com" },
        starterTemplateId: "st_dental",
        importReasons: parseCsv("name,duration,patient_type\nWhitening,60,both"),
        importProviders: parseCsv("display_name,role\nDr. Test,Doctor"),
      },
      "Admin",
    );
    expect(c.status).toBe("trial");
    expect(db.users.length).toBe(users + 1);
    expect(db.flows.find((f) => f.clinicId === c.id)?.versions).toHaveLength(1);
    expect(db.templates.filter((t) => t.clinicId === c.id)).toHaveLength(26);
    const reasons = db.reasons.filter((r) => r.clinicId === c.id);
    expect(reasons.map((r) => r.name)).toContain("Whitening");
    expect(reasons.length).toBe(4); // 3 starter + 1 imported
    const p = db.providers.find((x) => x.clinicId === c.id)!;
    expect(p.reasonIds).toHaveLength(4);
    expect(new Set(db.templates.map((t) => t.id)).size).toBe(db.templates.length);
  });

  it("clones branding and bumps the destination flow version", () => {
    const db = buildSeed(new Date("2026-11-04T15:00:00Z"));
    cloneClinicSettings(db, "c_motion", "c_clearskin", "Admin");
    const derm = db.clinics.find((c) => c.id === "c_clearskin")!;
    expect(derm.branding.primaryColor).toBe("#1d4ed8");
    expect(derm.settings.notifications.clinicAlertEmail).toBe(derm.email);
    const flow = db.flows.find((f) => f.clinicId === "c_clearskin")!;
    expect(flow.publishedVersion).toBe(2);
    expect(flow.published.order).toBe("provider_first");
  });
});
