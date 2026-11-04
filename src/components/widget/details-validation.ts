import { z } from "zod";
import type { FlowConfig, FormField, InsuranceSettings, PatientType, Reason } from "@/types";
import { isFieldVisible, isSectionEnabled, type FlowAnswers } from "@/lib/flow";

/** Flat form values: field ids for built-in/custom/intake/reason fields, `_`-prefixed keys for fixed controls. */
export type DetailValues = Record<string, string | boolean | undefined>;

export const K = {
  someoneElse: "_someoneElse",
  bookerName: "_bookerName",
  hasInsurance: "_hasInsurance", // "yes" | "no" | ""
  carrier: "_carrier", // clinicInsurance id or "other"
  otherCarrier: "_otherCarrier",
  subName: "_subName",
  subId: "_subId",
  subDob: "_subDob",
  smsConsent: "_smsConsent",
} as const;

export const insQuestionKey = (i: number) => `_insq_${i}`;

export interface DetailsContext {
  flow: FlowConfig;
  reason?: Reason;
  patientType?: PatientType;
  insuranceSettings: InsuranceSettings;
  fileUploadsOn: boolean;
}

export function flowAnswersFrom(values: DetailValues, reasonId: string | undefined, patientType: PatientType | undefined): FlowAnswers {
  const hi = values[K.hasInsurance];
  return {
    patientType,
    reasonId,
    hasInsurance: hi === "yes" ? true : hi === "no" ? false : undefined,
    bookingForSomeoneElse: !!values[K.someoneElse],
    answers: values,
  };
}

/** All fields shown on the details screen, by section, after conditions. */
export function visibleSections(values: DetailValues, ctx: DetailsContext) {
  const a = flowAnswersFrom(values, ctx.reason?.id, ctx.patientType);
  const opts = { fileUploadEnabled: ctx.fileUploadsOn };
  const details = ctx.flow.fields.filter((f) => isFieldVisible(f, a, opts));
  const insurance = isSectionEnabled(ctx.flow, "insurance", a);
  const intakeOn = isSectionEnabled(ctx.flow, "intake", a);
  const intake = intakeOn ? ctx.flow.intakeFields.filter((f) => isFieldVisible(f, a, opts)) : [];
  // Per-reason questions always show: they are tied to the reason, not the intake step.
  const reasonQs = (ctx.reason?.questions ?? []).filter((f) => isFieldVisible(f, a, opts));
  return { details, insurance, intake, reasonQs, answers: a };
}

const PHONE = /^[+()\-\s.\d]{7,20}$/;

export function fieldSchema(f: FormField): z.ZodType<unknown> {
  const req = f.required;
  const str = (s: z.ZodString) => (req ? s.min(1, `${f.label} is required`) : s.optional().or(z.literal("")));
  switch (f.type) {
    case "email":
      return req ? z.string().min(1, `${f.label} is required`).pipe(z.email("Enter a valid email address")) : z.union([z.literal(""), z.email("Enter a valid email address")]).optional();
    case "phone":
      return req
        ? z.string().min(1, `${f.label} is required`).regex(PHONE, "Enter a valid phone number")
        : z.union([z.literal(""), z.string().regex(PHONE, "Enter a valid phone number")]).optional();
    case "number":
      return req
        ? z.string().min(1, `${f.label} is required`).regex(/^-?\d+(\.\d+)?$/, "Enter a number")
        : z.union([z.literal(""), z.string().regex(/^-?\d+(\.\d+)?$/, "Enter a number")]).optional();
    case "date":
      return req
        ? z.string().min(1, `${f.label} is required`).regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
        : z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")]).optional();
    case "checkbox":
    case "consent":
      return req ? z.literal(true, { error: f.type === "consent" ? "Please agree to continue" : `${f.label} is required` }) : z.boolean().optional();
    case "file":
      return req ? z.string().min(1, `Please upload ${f.label.toLowerCase()}`) : z.string().optional();
    default:
      return str(z.string());
  }
}

/** Validate the details screen. Returns a map of key -> error message. */
export function validateDetails(values: DetailValues, ctx: DetailsContext, extra: { dobMax?: string } = {}): Record<string, string> {
  const errors: Record<string, string> = {};
  const { details, insurance, intake, reasonQs } = visibleSections(values, ctx);
  for (const f of [...details, ...intake, ...reasonQs]) {
    const raw = values[f.id];
    const v = f.type === "checkbox" || f.type === "consent" ? !!raw : raw === undefined ? "" : raw;
    const r = fieldSchema(f).safeParse(v);
    if (!r.success) errors[f.id] = r.error.issues[0]?.message ?? "Invalid value";
    if (f.builtIn === "dob" && typeof v === "string" && v && extra.dobMax && v > extra.dobMax) errors[f.id] = "Date of birth can't be in the future";
  }
  if (values[K.someoneElse] && !String(values[K.bookerName] ?? "").trim()) errors[K.bookerName] = "Your name is required";
  if (insurance) {
    const hi = values[K.hasInsurance];
    if (hi !== "yes" && hi !== "no") errors[K.hasInsurance] = "Please choose Yes or No";
    if (hi === "yes") {
      if (!values[K.carrier]) errors[K.carrier] = "Choose your insurance carrier";
      if (values[K.carrier] === "other" && !String(values[K.otherCarrier] ?? "").trim()) errors[K.otherCarrier] = "Enter your carrier name";
      if (!ctx.insuranceSettings.optionalFields) {
        if (!String(values[K.subName] ?? "").trim()) errors[K.subName] = "Subscriber full name is required";
        if (!String(values[K.subId] ?? "").trim()) errors[K.subId] = "Subscriber ID is required";
        if (!String(values[K.subDob] ?? "").trim()) errors[K.subDob] = "Subscriber date of birth is required";
      }
    }
  }
  return errors;
}
