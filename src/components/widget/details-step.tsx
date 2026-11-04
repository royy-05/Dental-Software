"use client";

import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, Info, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { Clinic, ClinicInsurance, FlowConfig, FormField, PatientType, Reason, StepConfig } from "@/types";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { BrandButton, useWidgetUi } from "./brand";
import { FieldInput } from "./field-input";
import { LegalLink } from "./chrome";
import { K, insQuestionKey, validateDetails, visibleSections, type DetailValues, type DetailsContext } from "./details-validation";

export type FileMap = Record<string, { name: string; size: number }>;

export interface DetailsStepProps {
  clinic: Clinic;
  flow: FlowConfig;
  reason?: Reason;
  patientType?: PatientType;
  values: DetailValues;
  files: FileMap;
  insurances: ClinicInsurance[];
  fileUploadsOn: boolean;
  otpOn: boolean;
  otpVerified: boolean;
  setOtpVerified: (v: boolean) => void;
  step: StepConfig;
  insuranceStep?: StepConfig;
  intakeStep?: StepConfig;
  onSubmit: (values: DetailValues, files: FileMap) => void;
  onChange?: (values: DetailValues) => void;
}

function Err({ id, msg }: { id: string; msg?: string }) {
  return msg ? <p id={`${id}-err`} className="text-xs font-medium text-destructive">{msg}</p> : null;
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 rounded-lg border bg-white p-4" aria-label={title}>
      <div>
        <h3 className="font-semibold">{title}</h3>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export function initialDetailValues(flow: FlowConfig, reason?: Reason): DetailValues {
  const v: DetailValues = {};
  for (const f of [...flow.fields, ...flow.intakeFields, ...(reason?.questions ?? [])]) {
    if (f.defaultValue === undefined || f.defaultValue === "") continue;
    v[f.id] = f.type === "checkbox" || f.type === "consent" ? f.defaultValue === "true" : f.defaultValue;
  }
  return v;
}

export function DetailsStep(p: DetailsStepProps) {
  const { branding, mobile } = useWidgetUi();
  const ctx: DetailsContext = { flow: p.flow, reason: p.reason, patientType: p.patientType, insuranceSettings: p.clinic.insuranceSettings, fileUploadsOn: p.fileUploadsOn };
  const today = format(new Date(), "yyyy-MM-dd");
  const resolver: Resolver<DetailValues> = async (values) => {
    const errs = validateDetails(values, ctx, { dobMax: today });
    if (!Object.keys(errs).length) return { values, errors: {} };
    return { values: {}, errors: Object.fromEntries(Object.entries(errs).map(([k, m]) => [k, { type: "validate", message: m }])) };
  };
  const form = useForm<DetailValues>({ defaultValues: { ...initialDetailValues(p.flow, p.reason), ...p.values }, resolver });
  const values = form.watch();
  const errors = form.formState.errors;
  const err = (k: string) => (errors[k]?.message as string | undefined) ?? undefined;
  const [files, setFiles] = useState<FileMap>(p.files);
  const [otpSent, setOtpSent] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);

  const sections = visibleSections(values, ctx);
  const set = (k: string, v: string | boolean) => {
    form.setValue(k, v, { shouldValidate: form.formState.isSubmitted, shouldDirty: true });
    p.onChange?.(form.getValues());
  };

  const carrier = p.insurances.find((i) => i.id === values[K.carrier]);
  const carrierStatus = values[K.carrier] === "other" ? "other" : carrier?.status;
  const w = p.clinic.insuranceSettings.warnings;
  const warning = carrierStatus === "out_of_network" ? w.outOfNetwork : carrierStatus === "not_accepted" ? w.notAccepted : carrierStatus === "other" ? w.other : null;

  const renderField = (f: FormField) => (
    <div key={f.id} className={cn(f.width === "full" || mobile ? "col-span-2" : "col-span-2 sm:col-span-1")}>
      <FieldInput
        field={f}
        value={values[f.id]}
        error={err(f.id)}
        onChange={(v) => set(f.id, v)}
        onFile={(file) =>
          setFiles((cur) => {
            const next = { ...cur };
            if (file) next[f.id] = file;
            else delete next[f.id];
            return next;
          })
        }
      />
    </div>
  );

  const submit = form.handleSubmit(
    (v) => {
      if (p.otpOn && !p.otpVerified) {
        setOtpError("Please verify your mobile number to continue.");
        document.getElementById("otp-code")?.focus();
        return;
      }
      p.onSubmit(v, files);
    },
    (errs) => {
      const first = Object.keys(errs)[0];
      const el = document.getElementById(`w-${first}`) ?? document.querySelector<HTMLElement>(`[name="w-${first}"]`);
      el?.focus();
    },
  );

  const errorCount = Object.keys(errors).length;
  const sendOtp = () => {
    const phoneId = p.flow.fields.find((f) => f.builtIn === "phone")?.id ?? "f_phone";
    const phone = String(values[phoneId] ?? "");
    if (!phone) {
      setOtpError("Enter your mobile number first.");
      return;
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setOtpSent(code);
    setOtpError(null);
    toast.info(`Demo verification code: ${code}`, { description: "Prototype: no text is actually sent." });
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      {errorCount > 0 && (
        <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          <AlertTriangle className="h-4 w-4" aria-hidden /> Please fix {errorCount} {errorCount === 1 ? "field" : "fields"} below.
        </div>
      )}
      <div className="flex items-start gap-3 rounded-lg border bg-white p-4">
        <Checkbox id={`w-${K.someoneElse}`} checked={!!values[K.someoneElse]} onCheckedChange={(c) => set(K.someoneElse, c === true)} className="mt-0.5" />
        <label htmlFor={`w-${K.someoneElse}`} className="text-sm">
          <span className="font-medium">I&apos;m booking for someone else</span>
          <span className="block text-muted-foreground">For example a child or family member. Enter their details below.</span>
        </label>
      </div>
      {values[K.someoneElse] && (
        <div className="grid gap-1.5">
          <label htmlFor={`w-${K.bookerName}`} className="text-sm font-medium">Your full name <span aria-hidden className="text-destructive">*</span></label>
          <Input id={`w-${K.bookerName}`} className="h-11" autoComplete="name" value={String(values[K.bookerName] ?? "")} onChange={(e) => set(K.bookerName, e.target.value)} aria-invalid={!!err(K.bookerName)} aria-describedby={err(K.bookerName) ? `w-${K.bookerName}-err` : undefined} />
          <Err id={`w-${K.bookerName}`} msg={err(K.bookerName)} />
        </div>
      )}

      <Section title={values[K.someoneElse] ? "Patient details" : "Your details"}>
        <div className="grid grid-cols-2 gap-4">{sections.details.map(renderField)}</div>
      </Section>

      {sections.insurance && (
        <Section title={p.insuranceStep?.title ?? "Insurance"} subtitle={p.insuranceStep?.subtitle}>
          <fieldset className="grid gap-2" aria-describedby={err(K.hasInsurance) ? `w-${K.hasInsurance}-err` : undefined}>
            <legend className="mb-1 text-sm font-medium">Do you have insurance? <span aria-hidden className="text-destructive">*</span></legend>
            <div className="flex gap-2">
              {(["yes", "no"] as const).map((o, i) => (
                <label key={o} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-4 text-sm has-[:checked]:font-semibold" style={values[K.hasInsurance] === o ? { borderColor: branding.primaryColor } : undefined}>
                  <input type="radio" id={i === 0 ? `w-${K.hasInsurance}` : undefined} name={`w-${K.hasInsurance}`} value={o} checked={values[K.hasInsurance] === o} onChange={() => set(K.hasInsurance, o)} className="h-4 w-4" />
                  {o === "yes" ? "Yes" : "No"}
                </label>
              ))}
            </div>
            <Err id={`w-${K.hasInsurance}`} msg={err(K.hasInsurance)} />
          </fieldset>
          {values[K.hasInsurance] === "no" && p.flow.messages.noInsuranceMessage && (
            <p className="flex gap-2 rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-950"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {p.flow.messages.noInsuranceMessage}</p>
          )}
          {values[K.hasInsurance] === "yes" && (
            <div className="grid grid-cols-2 gap-4">
              <div className={cn("col-span-2 grid gap-1.5", !mobile && "sm:col-span-1")}>
                <label htmlFor={`w-${K.carrier}`} className="text-sm font-medium">Insurance carrier <span aria-hidden className="text-destructive">*</span></label>
                <select id={`w-${K.carrier}`} className="h-11 rounded-md border border-input bg-card px-3 text-sm aria-[invalid=true]:border-destructive" value={String(values[K.carrier] ?? "")} onChange={(e) => set(K.carrier, e.target.value)} aria-invalid={!!err(K.carrier)} aria-describedby={err(K.carrier) ? `w-${K.carrier}-err` : undefined}>
                  <option value="">Choose your carrier…</option>
                  {p.insurances.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  {p.clinic.insuranceSettings.acceptOtherInsurance && <option value="other">Other / not listed</option>}
                </select>
                <Err id={`w-${K.carrier}`} msg={err(K.carrier)} />
              </div>
              {values[K.carrier] === "other" && (
                <div className={cn("col-span-2 grid gap-1.5", !mobile && "sm:col-span-1")}>
                  <label htmlFor={`w-${K.otherCarrier}`} className="text-sm font-medium">Carrier name <span aria-hidden className="text-destructive">*</span></label>
                  <Input id={`w-${K.otherCarrier}`} className="h-11" value={String(values[K.otherCarrier] ?? "")} onChange={(e) => set(K.otherCarrier, e.target.value)} aria-invalid={!!err(K.otherCarrier)} aria-describedby={err(K.otherCarrier) ? `w-${K.otherCarrier}-err` : undefined} />
                  <Err id={`w-${K.otherCarrier}`} msg={err(K.otherCarrier)} />
                </div>
              )}
              {carrierStatus === "in_network" && (
                <p className="col-span-2 flex gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-950"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Great, we&apos;re in network with {carrier?.name}.</p>
              )}
              {warning && (
                <p role="status" className="col-span-2 flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {warning}</p>
              )}
              {([
                [K.subName, "Subscriber full name", "text", "name"],
                [K.subId, "Subscriber ID", "text", "off"],
                [K.subDob, "Subscriber date of birth", "date", "off"],
              ] as const).map(([k, label, type, ac]) => {
                const req = !p.clinic.insuranceSettings.optionalFields;
                return (
                  <div key={k} className={cn("col-span-2 grid gap-1.5", !mobile && "sm:col-span-1")}>
                    <label htmlFor={`w-${k}`} className="text-sm font-medium">
                      {label} {req ? <span aria-hidden className="text-destructive">*</span> : <span className="font-normal text-muted-foreground">(optional)</span>}
                    </label>
                    <Input id={`w-${k}`} type={type} autoComplete={ac} className="h-11" value={String(values[k] ?? "")} onChange={(e) => set(k, e.target.value)} aria-invalid={!!err(k)} aria-describedby={err(k) ? `w-${k}-err` : undefined} />
                    <Err id={`w-${k}`} msg={err(k)} />
                  </div>
                );
              })}
              {p.clinic.insuranceSettings.extraQuestions.map((q, i) => (
                <div key={q} className="col-span-2 grid gap-1.5">
                  <label htmlFor={`w-${insQuestionKey(i)}`} className="text-sm font-medium">{q} <span className="font-normal text-muted-foreground">(optional)</span></label>
                  <Input id={`w-${insQuestionKey(i)}`} className="h-11" value={String(values[insQuestionKey(i)] ?? "")} onChange={(e) => set(insQuestionKey(i), e.target.value)} />
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {(sections.reasonQs.length > 0 || sections.intake.length > 0) && (
        <Section title={p.intakeStep?.enabled ? p.intakeStep.title : "About your visit"} subtitle={p.intakeStep?.enabled ? p.intakeStep.subtitle : undefined}>
          <div className="grid grid-cols-2 gap-4">
            {sections.reasonQs.map(renderField)}
            {sections.intake.map(renderField)}
          </div>
        </Section>
      )}

      <div className="flex items-start gap-3 rounded-lg border bg-white p-4">
        <Checkbox id={`w-${K.smsConsent}`} checked={!!values[K.smsConsent]} onCheckedChange={(c) => set(K.smsConsent, c === true)} className="mt-0.5" />
        <label htmlFor={`w-${K.smsConsent}`} className="text-sm leading-snug">
          {p.flow.messages.consentText}{" "}
          <span className="text-muted-foreground">
            See our <LegalLink kind="terms" clinic={p.clinic} url={p.flow.messages.termsUrl}>Terms</LegalLink> and{" "}
            <LegalLink kind="privacy" clinic={p.clinic} url={p.flow.messages.privacyUrl}>Privacy Policy</LegalLink>.
          </span>
        </label>
      </div>

      {p.otpOn && (
        <Section title="Verify your mobile number" subtitle="We'll text you a 6-digit code (demo: shown on screen).">
          {p.otpVerified ? (
            <p className="flex items-center gap-2 text-sm font-medium text-green-800"><ShieldCheck className="h-4 w-4" aria-hidden /> Mobile number verified</p>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <BrandButton type="button" variant="secondary" size="sm" onClick={sendOtp}>{otpSent ? "Resend code" : "Send code"}</BrandButton>
              {otpSent && (
                <>
                  <div className="grid gap-1">
                    <label htmlFor="otp-code" className="text-sm font-medium">Code</label>
                    <Input id="otp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="h-9 w-32" value={otpInput} onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ""))} aria-describedby={otpError ? "otp-err" : undefined} />
                  </div>
                  <BrandButton
                    type="button"
                    size="sm"
                    onClick={() => {
                      if (otpInput === otpSent) {
                        p.setOtpVerified(true);
                        setOtpError(null);
                      } else setOtpError("That code doesn't match. Try again.");
                    }}
                  >
                    Verify
                  </BrandButton>
                </>
              )}
              {otpError && <p id="otp-err" role="alert" className="w-full text-xs font-medium text-destructive">{otpError}</p>}
            </div>
          )}
        </Section>
      )}

      <div className="flex justify-end">
        <BrandButton type="submit" size="lg" className={cn("w-full", !mobile && "sm:w-auto")}>{p.step.buttonText || "Continue"}</BrandButton>
      </div>
    </form>
  );
}
