import { describe, expect, it } from "vitest";
import { buildSeed } from "@/mock";
import { buildStarterTemplates } from "@/mock/catalog";
import { applyPublish, applyRollback, draftFromTemplate, sameConfig } from "./versioning";

describe("flow versioning", () => {
  const rec = () => structuredClone(buildSeed(new Date("2026-11-04T15:00:00Z")).flows[0]);

  it("publishes a new version and syncs the draft", () => {
    const r = rec();
    const cfg = structuredClone(r.draft);
    cfg.rules.minNoticeHours = 12;
    expect(applyPublish(r, cfg, "Olivia", "Longer notice", "2026-11-04T16:00:00Z")).toBe(2);
    expect(r.published.rules.minNoticeHours).toBe(12);
    expect(r.versions[0]).toMatchObject({ version: 2, publishedBy: "Olivia", note: "Longer notice" });
    expect(sameConfig(r.draft, r.published)).toBe(true);
  });

  it("rolls back by publishing the old config as a new version", () => {
    const r = rec();
    const cfg = structuredClone(r.draft);
    cfg.rules.minNoticeHours = 12;
    applyPublish(r, cfg, "A", "", "t1");
    expect(applyRollback(r, 1, "A", "t2")).toBe(3);
    expect(r.published.rules.minNoticeHours).toBe(r.versions.find((v) => v.version === 1)!.config.rules.minNoticeHours);
    expect(r.versions[0].note).toBe("Rolled back to v1");
    expect(applyRollback(r, 99, "A", "t3")).toBeNull();
  });

  it("copies a starter template but keeps the accepting-patients switch", () => {
    const r = rec();
    r.draft.rules.acceptingPatients = false;
    const next = draftFromTemplate(buildStarterTemplates()[2], r.draft);
    expect(next.rules.acceptingPatients).toBe(false);
    expect(next.intakeFields.some((f) => f.id === "q_photo")).toBe(true);
  });
});
