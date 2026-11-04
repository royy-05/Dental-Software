import { describe, expect, it } from "vitest";
import { buildSeed } from "@/mock";
import { parseBulkNames, removeOperatory, setOperatoryLinks, setProviderReasons } from "./link-sync";

describe("link sync", () => {
  it("provider reasons write into reason.providerIds and mirrors", () => {
    const db = buildSeed(new Date("2026-11-04T15:00:00Z"));
    setProviderReasons(db, "p_lin", ["r_d_cleaning", "r_d_whitening"]);
    expect(db.reasons.find((r) => r.id === "r_d_whitening")!.providerIds).toContain("p_lin");
    expect(db.providers.find((p) => p.id === "p_lin")!.reasonIds.sort()).toEqual(["r_d_cleaning", "r_d_whitening"]);
    setProviderReasons(db, "p_lin", []);
    expect(db.reasons.find((r) => r.id === "r_d_cleaning")!.providerIds).not.toContain("p_lin");
  });

  it("operatory links update providers and reasons", () => {
    const db = buildSeed(new Date("2026-11-04T15:00:00Z"));
    setOperatoryLinks(db, "op_h1", ["p_lin", "p_reyes"], ["r_d_cleaning"]);
    expect(db.providers.find((p) => p.id === "p_reyes")!.operatoryIds).toContain("op_h1");
    expect(db.operatories.find((o) => o.id === "op_h1")!.providerIds.sort()).toEqual(["p_lin", "p_reyes"]);
    expect(db.reasons.find((r) => r.id === "r_d_child")!.operatoryIds).not.toContain("op_h1");
    removeOperatory(db, "op_h1");
    expect(db.providers.some((p) => p.operatoryIds.includes("op_h1"))).toBe(false);
  });

  it("parses comma-separated bulk names", () => {
    expect(parseBulkNames(" Acme Dental, aetna ,, New  Plan,Acme Dental", ["Aetna"])).toEqual(["Acme Dental", "New Plan"]);
  });
});
