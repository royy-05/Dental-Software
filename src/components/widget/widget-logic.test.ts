import { describe, expect, it } from "vitest";
import { defaultFlow, defaultInsuranceSettings } from "@/mock/defaults";
import { REASONS } from "@/mock/staff";
import { buildReferrers } from "@/mock/catalog";
import { parseAttribution } from "./attribution";
import { buildIcs, googleCalendarUrl } from "./calendar-links";
import { K, validateDetails, visibleSections } from "./details-validation";
import { fromWall } from "@/lib/time";

const ctx = (over: Partial<Parameters<typeof validateDetails>[1]> = {}) => ({
  flow: defaultFlow("dental"),
  reason: REASONS.find((r) => r.id === "r_d_emergency"),
  patientType: "new" as const,
  insuranceSettings: defaultInsuranceSettings(),
  fileUploadsOn: true,
  ...over,
});

const valid = {
  f_first: "Avery",
  f_last: "Quill",
  f_dob: "1990-02-03",
  f_phone: "(555) 010-1234",
  f_email: "avery@example.com",
  rq_tooth: "Upper left",
  [K.hasInsurance]: "no",
};

describe("details validation", () => {
  it("passes a complete form", () => {
    expect(validateDetails(valid, ctx())).toEqual({});
  });

  it("requires built-in fields and validates formats", () => {
    const e = validateDetails({ ...valid, f_first: "", f_email: "nope", f_phone: "abc" }, ctx());
    expect(Object.keys(e).sort()).toEqual(["f_email", "f_first", "f_phone"]);
  });

  it("requires per-reason questions marked required", () => {
    expect(validateDetails({ ...valid, rq_tooth: "" }, ctx())).toHaveProperty("rq_tooth");
  });

  it("requires subscriber fields when insured unless optional", () => {
    const v = { ...valid, [K.hasInsurance]: "yes", [K.carrier]: "ci_x" };
    expect(Object.keys(validateDetails(v, ctx()))).toEqual([K.subName, K.subId, K.subDob]);
    expect(validateDetails(v, ctx({ insuranceSettings: { ...defaultInsuranceSettings(), optionalFields: true } }))).toEqual({});
  });

  it("requires the booker's name when booking for someone else", () => {
    expect(validateDetails({ ...valid, [K.someoneElse]: true }, ctx())).toHaveProperty(K.bookerName);
  });

  it("applies conditional intake fields", () => {
    const s = visibleSections(valid, ctx());
    expect(s.intake.map((f) => f.id)).toContain("q_last_visit");
    const s2 = visibleSections(valid, ctx({ patientType: "existing" }));
    expect(s2.intake.map((f) => f.id)).not.toContain("q_last_visit");
    const s3 = visibleSections(valid, ctx({ fileUploadsOn: false }));
    expect(s3.intake.some((f) => f.type === "file")).toBe(false);
  });
});

describe("attribution", () => {
  const refs = buildReferrers();
  it("maps referrer_id to a source and keeps UTM and click ids", () => {
    const p = new URLSearchParams("referrer_id=1&utm_source=google&utm_medium=cpc&utm_campaign=x&gclid=G1&fbclid=F1");
    const a = parseAttribution(p, "c_brightsmile", refs);
    expect(a).toEqual({ source: "google_ads", referrerId: "1", utm: { source: "google", medium: "cpc", campaign: "x" }, gclid: "G1", fbclid: "F1" });
  });
  it("falls back to direct for unknown referrers", () => {
    expect(parseAttribution(new URLSearchParams("referrer_id=99"), "c_brightsmile", refs).source).toBe("direct");
  });
});

describe("calendar links", () => {
  const e = { title: "Exam, Clinic", start: fromWall("2026-11-09T09:00"), end: fromWall("2026-11-09T09:30"), location: "1 Main St", description: "Hi", uid: "a1" };
  it("builds an ics event", () => {
    const ics = buildIcs(e);
    expect(ics).toContain("DTSTART:20261109T090000");
    expect(ics).toContain("SUMMARY:Exam\\, Clinic");
  });
  it("builds a Google Calendar link", () => {
    expect(googleCalendarUrl(e, "America/New_York")).toContain("dates=20261109T090000%2F20261109T093000");
  });
});
