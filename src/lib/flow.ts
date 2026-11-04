import type { Condition, FlowConfig, FormField, PatientType, Reason, StepConfig, StepKey } from "@/types";

/**
 * Booking flow evaluation shared by the patient widget and the builder's live preview.
 */

export interface FlowAnswers {
  patientType?: PatientType;
  reasonId?: string;
  hasInsurance?: boolean;
  bookingForSomeoneElse?: boolean;
  answers: Record<string, string | boolean | undefined>;
}

export function conditionMatches(c: Condition, a: FlowAnswers): boolean {
  switch (c.type) {
    case "patient_type":
      return a.patientType === c.value;
    case "reason":
      return a.reasonId === c.value;
    case "insurance":
      return a.hasInsurance === undefined ? false : (c.value === "yes") === a.hasInsurance;
    case "answer": {
      const v = a.answers[c.fieldId];
      if (typeof v === "boolean") return String(v) === c.value || (v && c.value.toLowerCase() === "yes") || (!v && c.value.toLowerCase() === "no");
      return (v ?? "") === c.value;
    }
    case "someone_else":
      return !!a.bookingForSomeoneElse === c.value;
  }
}

export function conditionsMatch(conds: Condition[], a: FlowAnswers): boolean {
  return conds.every((c) => conditionMatches(c, a));
}

export function isFieldVisible(f: FormField, a: FlowAnswers, opts: { fileUploadEnabled?: boolean } = {}): boolean {
  if (f.hidden) return false;
  if (f.type === "file" && opts.fileUploadEnabled === false) return false;
  return conditionsMatch(f.conditions, a);
}

export function describeCondition(c: Condition, reasons: Reason[] = [], fields: FormField[] = []): string {
  switch (c.type) {
    case "patient_type":
      return `Patient type is ${c.value === "new" ? "New" : "Existing"}`;
    case "reason":
      return `Reason is “${reasons.find((r) => r.id === c.value)?.name ?? c.value}”`;
    case "insurance":
      return `Insurance answer is ${c.value === "yes" ? "Yes" : "No"}`;
    case "answer":
      return `“${fields.find((f) => f.id === c.fieldId)?.label ?? c.fieldId}” equals “${c.value}”`;
    case "someone_else":
      return c.value ? "Booking is for someone else" : "Booking is for themselves";
  }
}

/** The ordered list of top-level widget screens for a flow config. */
export function stepSequence(flow: FlowConfig, a: FlowAnswers): StepConfig[] {
  const byKey = new Map(flow.steps.map((s) => [s.key, s]));
  const first: StepKey[] =
    flow.order === "provider_first"
      ? ["provider", "reason", "datetime"]
      : flow.order === "date_first"
        ? ["datetime", "reason", "provider"]
        : ["reason", "provider", "datetime"];
  // Insurance and intake are sections of the details screen (section 3); they are not separate screens.
  const keys: StepKey[] = [...first, "details", "review"];
  return keys
    .map((k) => byKey.get(k))
    .filter((s): s is StepConfig => !!s && (s.enabled || s.key === "reason" || s.key === "datetime" || s.key === "details") && conditionsMatch(s.conditions, a));
}

export function stepConfig(flow: FlowConfig, key: StepKey): StepConfig | undefined {
  return flow.steps.find((s) => s.key === key);
}

export function isSectionEnabled(flow: FlowConfig, key: "insurance" | "intake", a: FlowAnswers): boolean {
  const s = stepConfig(flow, key);
  return !!s && s.enabled && conditionsMatch(s.conditions, a);
}

/** Reasons a patient can pick: active, online, matching patient type, with at least one bookable provider. */
export function bookableReasons(reasons: Reason[], providers: { id: string; active: boolean; showOnline: boolean }[]): Reason[] {
  return reasons
    .filter((r) => r.active && r.visibility === "online" && r.providerIds.some((pid) => providers.some((p) => p.id === pid && p.active && p.showOnline)))
    .sort((a, b) => a.order - b.order);
}

export function reasonMatchesPatientType(r: Reason, t: PatientType | undefined): boolean {
  if (!t) return true;
  return r.patientType === "both" || r.patientType === t;
}
