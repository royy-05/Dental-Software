import { describe, expect, it } from "vitest";
import { defaultFlow } from "@/mock/defaults";
import { conditionsMatch, isFieldVisible, stepSequence } from "./flow";
import type { FormField } from "@/types";

describe("flow conditions", () => {
  const base = { answers: {} };
  it("matches each condition type", () => {
    expect(conditionsMatch([{ type: "patient_type", value: "new" }], { ...base, patientType: "new" })).toBe(true);
    expect(conditionsMatch([{ type: "patient_type", value: "new" }], { ...base, patientType: "existing" })).toBe(false);
    expect(conditionsMatch([{ type: "reason", value: "r1" }], { ...base, reasonId: "r1" })).toBe(true);
    expect(conditionsMatch([{ type: "insurance", value: "no" }], { ...base, hasInsurance: false })).toBe(true);
    expect(conditionsMatch([{ type: "insurance", value: "no" }], base)).toBe(false);
    expect(conditionsMatch([{ type: "answer", fieldId: "q", value: "Yes" }], { answers: { q: "Yes" } })).toBe(true);
    expect(conditionsMatch([{ type: "someone_else", value: true }], { ...base, bookingForSomeoneElse: true })).toBe(true);
  });

  it("requires all conditions on a field", () => {
    const f: FormField = { id: "x", type: "short_text", label: "x", required: false, hidden: false, width: "full", conditions: [{ type: "patient_type", value: "new" }, { type: "someone_else", value: true }] };
    expect(isFieldVisible(f, { answers: {}, patientType: "new", bookingForSomeoneElse: false })).toBe(false);
    expect(isFieldVisible(f, { answers: {}, patientType: "new", bookingForSomeoneElse: true })).toBe(true);
    expect(isFieldVisible({ ...f, hidden: true }, { answers: {}, patientType: "new", bookingForSomeoneElse: true })).toBe(false);
  });

  it("hides file fields when uploads are disabled", () => {
    const f: FormField = { id: "x", type: "file", label: "x", required: false, hidden: false, width: "full", conditions: [] };
    expect(isFieldVisible(f, { answers: {} }, { fileUploadEnabled: false })).toBe(false);
  });
});

describe("step sequence", () => {
  it("follows the configured order and skips disabled optional steps", () => {
    const flow = defaultFlow("dental");
    expect(stepSequence(flow, { answers: {} }).map((s) => s.key)).toEqual(["reason", "datetime", "details", "review"]);
    flow.steps.find((s) => s.key === "provider")!.enabled = true;
    flow.order = "provider_first";
    expect(stepSequence(flow, { answers: {} }).map((s) => s.key)).toEqual(["provider", "reason", "datetime", "details", "review"]);
    flow.order = "date_first";
    flow.steps.find((s) => s.key === "review")!.enabled = false;
    expect(stepSequence(flow, { answers: {} }).map((s) => s.key)).toEqual(["datetime", "reason", "provider", "details"]);
  });
});
