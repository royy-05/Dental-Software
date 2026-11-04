"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, CalendarCheck, Info, PauseCircle, Wrench } from "lucide-react";
import type { Appointment, BuiltInFieldKey, FlowConfig, PatientType, Provider, Reason, StepKey, WidgetTheme } from "@/types";
import { useApp, type NewAppointmentInput } from "@/store/app";
import { bookableReasons, stepSequence, stepConfig, type FlowAnswers } from "@/lib/flow";
import { featureEnabled } from "@/lib/permissions";
import { availableDays, firstAvailable, getSlotsForDay, isSlotAvailable, type Slot, type SlotContext } from "@/lib/slots";
import { nowInZone, toWall, tzAbbrev } from "@/lib/time";
import { cn, uid } from "@/lib/utils";
import { BrandButton, WidgetUiProvider } from "./brand";
import { HoldBanner, Stepper, WidgetFooter, WidgetHeader } from "./chrome";
import { DateTimePicker } from "./date-time-picker";
import { DetailsStep, type FileMap } from "./details-step";
import { K, insQuestionKey, type DetailValues } from "./details-validation";
import { BookingSummary, ProviderStep, ReasonStep } from "./steps";
import { trackWidget } from "./tracking";
import type { Attribution } from "./attribution";

export interface BookingWidgetProps {
  clinicId: string;
  /** Builder preview passes the draft flow. Live mode uses the clinic's published flow. */
  flowOverride?: FlowConfig;
  themeOverride?: WidgetTheme;
  mode: "live" | "preview";
  embedded?: boolean;
  /** Force the phone layout (builder mobile preview). */
  forceMobile?: boolean;
  attribution?: Attribution;
}

interface HoldState {
  id?: string;
  expiresAt: number;
}

export function BookingWidget({ clinicId, flowOverride, themeOverride, mode, embedded, forceMobile = false, attribution }: BookingWidgetProps) {
  const live = mode === "live";
  const router = useRouter();
  const clinic = useApp((s) => s.db.clinics.find((c) => c.id === clinicId));
  const flows = useApp((s) => s.db.flows);
  const allReasons = useApp((s) => s.db.reasons);
  const allProviders = useApp((s) => s.db.providers);
  const appointments = useApp((s) => s.db.appointments);
  const holds = useApp((s) => s.db.holds);
  const allInsurances = useApp((s) => s.db.clinicInsurances);
  const plans = useApp((s) => s.db.plans);
  const platform = useApp((s) => s.db.platform);
  const holdSlot = useApp((s) => s.holdSlot);
  const releaseHold = useApp((s) => s.releaseHold);
  const createAppointment = useApp((s) => s.createAppointment);

  const flow = flowOverride ?? flows.find((f) => f.clinicId === clinicId)?.published;
  const [sessionId] = useState(() => uid("ws"));
  const source = attribution?.source ?? "direct";

  // ---------- booking state ----------
  const [stepIdx, setStepIdx] = useState(0);
  const [patientType, setPatientType] = useState<PatientType | undefined>();
  const [reasonId, setReasonId] = useState<string | undefined>();
  const [providerChoice, setProviderChoice] = useState<string | undefined>(); // provider id or "any"
  const [slot, setSlot] = useState<Slot | undefined>();
  const [pendingStart, setPendingStart] = useState<Date | undefined>(); // date-first: time chosen before reason
  const [values, setValues] = useState<DetailValues>({});
  const [files, setFiles] = useState<FileMap>({});
  const [otpVerified, setOtpVerified] = useState(false);
  const [hold, setHold] = useState<HoldState | undefined>();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [previewDone, setPreviewDone] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const prevStepKey = useRef<StepKey | undefined>(undefined);

  const reasons = useMemo(() => allReasons.filter((r) => r.clinicId === clinicId), [allReasons, clinicId]);
  const providers = useMemo(() => allProviders.filter((p) => p.clinicId === clinicId), [allProviders, clinicId]);
  const insurances = useMemo(() => allInsurances.filter((i) => i.clinicId === clinicId).sort((a, b) => a.name.localeCompare(b.name)), [allInsurances, clinicId]);
  const bookable = useMemo(() => bookableReasons(reasons, providers), [reasons, providers]);
  const reason = reasons.find((r) => r.id === reasonId);
  const chosenProvider = providerChoice && providerChoice !== "any" ? providers.find((p) => p.id === providerChoice) : undefined;

  const answers: FlowAnswers = {
    patientType,
    reasonId,
    hasInsurance: values[K.hasInsurance] === "yes" ? true : values[K.hasInsurance] === "no" ? false : undefined,
    bookingForSomeoneElse: !!values[K.someoneElse],
    answers: values,
  };
  const steps = flow ? stepSequence(flow, answers) : [];
  const step = steps[Math.min(stepIdx, steps.length - 1)];
  const order = flow?.order ?? "reason_first";

  // Tick for the hold countdown.
  useEffect(() => {
    if (!hold) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hold]);

  // Analytics: widget opened + step viewed (live only, no PHI).
  const hasClinic = !!clinic;
  useEffect(() => {
    if (!live || !hasClinic) return;
    trackWidget({ clinicId, sessionId, name: "widget_opened", step: "reason", source });
  }, [live, hasClinic, clinicId, sessionId, source]);
  useEffect(() => {
    if (!step) return;
    if (live) trackWidget({ clinicId, sessionId, name: "step_viewed", step: step.key, reasonId, source });
    // Move focus to the new step heading (not on first render; strict-mode safe).
    if (prevStepKey.current && prevStepKey.current !== step.key) headingRef.current?.focus();
    prevStepKey.current = step.key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.key]);

  // Release the hold when leaving the widget.
  useEffect(() => {
    return () => {
      if (hold?.id) useApp.getState().releaseHold(hold.id);
    };
  }, [hold?.id]);

  // ---------- slots ----------
  const ctxFor = useCallback(
    (rid: string, providerId?: string): SlotContext | null => {
      if (!flow) return null;
      return useApp.getState().slotContext(clinicId, rid, { rules: flow.rules, sessionId, providerId });
    },
    // appointments/holds included so availability refreshes when data changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clinicId, flow, sessionId, appointments, holds],
  );

  const providerFilter = chosenProvider?.id;
  const reasonsForDateFirst = useMemo(() => bookable.filter((r) => !patientType || r.patientType === "both" || r.patientType === patientType), [bookable, patientType]);

  const slotsFor = useCallback(
    (day: Date): Slot[] => {
      if (reasonId) {
        const c = ctxFor(reasonId, providerFilter);
        return c ? firstAvailable(getSlotsForDay(day, c)) : [];
      }
      // date-first: union of every bookable reason
      const all: Slot[] = [];
      for (const r of reasonsForDateFirst) {
        const c = ctxFor(r.id, providerFilter);
        if (c) all.push(...getSlotsForDay(day, c));
      }
      return firstAvailable(all.sort((a, b) => a.start.getTime() - b.start.getTime()));
    },
    [ctxFor, reasonId, providerFilter, reasonsForDateFirst],
  );

  const availability = useCallback(
    (from: Date, days: number): Record<string, number> => {
      if (reasonId) {
        const c = ctxFor(reasonId, providerFilter);
        return c ? availableDays(from, days, c) : {};
      }
      const out: Record<string, number> = {};
      for (const r of reasonsForDateFirst) {
        const c = ctxFor(r.id, providerFilter);
        if (!c) continue;
        const m = availableDays(from, days, c);
        for (const [k, v] of Object.entries(m)) out[k] = (out[k] ?? 0) + v;
      }
      return out;
    },
    [ctxFor, reasonId, providerFilter, reasonsForDateFirst],
  );

  /** For date-first flows: which slot (provider/room) serves this reason at the pending time. */
  const resolveSlot = useCallback(
    (rid: string, start: Date, providerId?: string): Slot | undefined => {
      const c = ctxFor(rid, providerId);
      if (!c) return undefined;
      return getSlotsForDay(start, c).find((s) => s.start.getTime() === start.getTime());
    },
    [ctxFor],
  );

  // ---------- gating ----------
  if (!clinic || !flow) return <p className="p-6 text-sm">This booking page is not available.</p>;
  const theme = themeOverride ?? clinic.branding.theme;
  const ui = { branding: clinic.branding, theme, mobile: forceMobile };
  const fileUploadsOn = featureEnabled(clinic, plans, "file_uploads") && flow.fileUploadEnabled;
  const otpOn = featureEnabled(clinic, plans, "otp") && flow.otpEnabled;
  const now = nowInZone(clinic.timeZone);
  const tzLabel = tzAbbrev(clinic.timeZone);

  let blocked: { icon: React.ReactNode; title: string; body: string } | null = null;
  if (live && platform.maintenanceMode) blocked = { icon: <Wrench className="h-8 w-8" />, title: "Online booking is down for maintenance", body: `Please try again shortly or call us at ${clinic.phone}.` };
  else if (live && (clinic.deletedAt || ["paused", "suspended", "churned"].includes(clinic.status)))
    blocked = { icon: <PauseCircle className="h-8 w-8" />, title: "Online booking is unavailable", body: `${clinic.name} isn't taking online bookings right now. Please call ${clinic.phone}.` };
  else if (!flow.rules.acceptingPatients) blocked = { icon: <PauseCircle className="h-8 w-8" />, title: "We're not taking online bookings right now", body: flow.rules.pausedMessage };

  // ---------- navigation ----------
  const go = (key: StepKey) => {
    const i = steps.findIndex((s) => s.key === key);
    if (i >= 0) setStepIdx(i);
  };
  const next = () => setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  const back = () => setStepIdx((i) => Math.max(0, i - 1));
  const isLast = stepIdx >= steps.length - 1;

  const placeHold = (s: Slot) => {
    if (hold?.id) releaseHold(hold.id);
    if (live) {
      const h = holdSlot(clinicId, s, sessionId);
      setHold({ id: h.id, expiresAt: h.expiresAt });
    } else setHold({ expiresAt: Date.now() + 5 * 60000 });
    setNowMs(Date.now());
  };
  const clearSlot = () => {
    if (hold?.id) releaseHold(hold.id);
    setHold(undefined);
    setSlot(undefined);
  };

  const onReason = (r: Reason, t: PatientType) => {
    setPatientType(t);
    setReasonId(r.id);
    if (live) trackWidget({ clinicId, sessionId, name: "reason_selected", step: "reason", reasonId: r.id, source });
    if (order === "date_first" && pendingStart) {
      const pid = chosenProvider?.id;
      const s = resolveSlot(r.id, pendingStart, pid);
      if (s) {
        setSlot(s);
        placeHold(s);
      } else clearSlot();
    } else if (slot && slot.end.getTime() - slot.start.getTime() !== r.duration * 60000) clearSlot();
    else if (slot && reasonId !== r.id) clearSlot();
    next();
  };

  const onProvider = (id: string) => {
    setProviderChoice(id);
    if (live) trackWidget({ clinicId, sessionId, name: "provider_selected", step: "provider", reasonId, source });
    if (order === "date_first" && pendingStart && reasonId) {
      const s = resolveSlot(reasonId, pendingStart, id === "any" ? undefined : id);
      if (s) {
        setSlot(s);
        placeHold(s);
      }
    } else if (slot && id !== "any" && slot.providerId !== id) clearSlot();
    next();
  };

  const onSlot = (s: Slot) => {
    if (live) trackWidget({ clinicId, sessionId, name: "slot_selected", step: "datetime", reasonId, source });
    if (!reasonId) {
      // date-first: remember the time; the reason step resolves the exact provider/room.
      setPendingStart(s.start);
      clearSlot();
    } else {
      setPendingStart(s.start);
      setSlot(s);
      placeHold(s);
    }
    next();
  };

  const secondsLeft = hold ? Math.max(0, Math.round((hold.expiresAt - nowMs) / 1000)) : 0;
  const holdExpired = !!hold && secondsLeft === 0;
  const recheckHold = () => {
    if (!slot || !reasonId) return;
    const c = ctxFor(reasonId, slot.providerId);
    const still = c && isSlotAvailable(slot, c);
    if (still) placeHold(still);
    else {
      clearSlot();
      setError("Sorry, that time was just taken. Please choose another time.");
      go("datetime");
    }
  };

  const book = (vals: DetailValues, fileMap: FileMap) => {
    setError(null);
    if (!slot || !reason || !patientType) {
      setError("Please choose a reason and a time first.");
      go(!reason ? "reason" : "datetime");
      return;
    }
    if (!live) {
      setPreviewDone(true);
      return;
    }
    setSubmitting(true);
    const custom: Appointment["answers"] = {};
    const builtIns = new Map(flow.fields.filter((f) => f.builtIn).map((f) => [f.builtIn!, f.id]));
    for (const [k, v] of Object.entries(vals)) {
      if (k.startsWith("_") || v === undefined || v === "") continue;
      if ([...builtIns.values()].includes(k)) continue;
      custom[k] = v;
    }
    const get = (b: BuiltInFieldKey) => String(vals[builtIns.get(b) ?? ""] ?? "").trim();
    const carrier = insurances.find((i) => i.id === vals[K.carrier]);
    const hasIns = vals[K.hasInsurance] === "yes";
    const extra: Record<string, string> = {};
    clinic.insuranceSettings.extraQuestions.forEach((q, i) => {
      const a = String(vals[insQuestionKey(i)] ?? "").trim();
      if (a) extra[q] = a;
    });
    const input: NewAppointmentInput = {
      clinicId,
      start: toWall(slot.start),
      end: toWall(slot.end),
      reasonId: reason.id,
      providerId: slot.providerId,
      operatoryId: slot.operatoryId,
      patientType,
      patient: { firstName: get("firstName"), lastName: get("lastName"), dob: get("dob"), phone: get("phone"), email: get("email"), message: get("message") },
      bookingForSomeoneElse: !!vals[K.someoneElse],
      bookerName: vals[K.someoneElse] ? String(vals[K.bookerName] ?? "") : undefined,
      insurance: hasIns
        ? {
            hasInsurance: true,
            carrierName: vals[K.carrier] === "other" ? String(vals[K.otherCarrier] ?? "") : carrier?.name,
            networkStatus: vals[K.carrier] === "other" ? "other" : carrier?.status,
            subscriberName: String(vals[K.subName] ?? ""),
            subscriberId: String(vals[K.subId] ?? ""),
            subscriberDob: String(vals[K.subDob] ?? ""),
            extraAnswers: Object.keys(extra).length ? extra : undefined,
          }
        : { hasInsurance: false },
      answers: custom,
      files: Object.values(fileMap),
      source,
      referrerId: attribution?.referrerId,
      utm: attribution?.utm ?? {},
      gclid: attribution?.gclid,
      fbclid: attribution?.fbclid,
      smsConsent: vals[K.smsConsent]
        ? { given: true, at: new Date().toISOString(), termsVersion: clinic.settings.legal.termsVersion, ip: "198.51.100.77 (demo)" }
        : { given: false },
      bookedBy: "patient",
      holdId: hold?.id,
      sessionId,
    };
    const res = createAppointment(input, vals[K.someoneElse] ? "Patient (online, booked by someone else)" : "Patient (online)");
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      clearSlot();
      go("datetime");
      return;
    }
    setHold(undefined);
    trackWidget({ clinicId, sessionId, name: "booking_completed", step: "review", reasonId: reason.id, source });
    const q = new URLSearchParams();
    if (embedded) q.set("embed", "1");
    if (attribution?.referrerId) q.set("referrer_id", attribution.referrerId);
    const qs = q.toString();
    router.push(`/book/${clinic.slug}/confirmed/${res.appointment.token}${qs ? `?${qs}` : ""}`);
  };

  const onDetails = (vals: DetailValues, fileMap: FileMap) => {
    setValues(vals);
    setFiles(fileMap);
    if (live) trackWidget({ clinicId, sessionId, name: "details_submitted", step: "details", reasonId, source });
    if (isLast) book(vals, fileMap);
    else next();
  };

  // ---------- step bodies ----------
  const reasonList = (() => {
    let list = bookable;
    if (order === "provider_first" && chosenProvider) list = list.filter((r) => r.providerIds.includes(chosenProvider.id));
    if (order === "date_first" && pendingStart) list = list.filter((r) => !!resolveSlot(r.id, pendingStart, chosenProvider?.id));
    return list;
  })();

  const providerList: Provider[] = (() => {
    let list = providers.filter((p) => p.active && p.showOnline && p.reasonIds.some((rid) => bookable.some((r) => r.id === rid)));
    if (reason) list = list.filter((p) => reason.providerIds.includes(p.id));
    if (order === "date_first" && pendingStart && reasonId) list = list.filter((p) => !!resolveSlot(reasonId, pendingStart, p.id));
    return list;
  })();

  const providerName = chosenProvider?.displayName ?? (slot ? providers.find((p) => p.id === slot.providerId)?.displayName : undefined) ?? (providerChoice === "any" ? "First available" : undefined);
  const patientName = [values["f_first"], values["f_last"]].filter(Boolean).join(" ") || undefined;
  const summary = { reason, providerName, start: slot?.start ?? pendingStart, patientName, patientType, timeZoneLabel: tzLabel };
  const editable = steps.slice(0, stepIdx).map((s) => s.key);

  let body: React.ReactNode = null;
  if (step?.key === "reason")
    body = (
      <ReasonStep
        reasons={reasonList}
        display={flow.reasonDisplay}
        patientType={patientType}
        selectedId={reasonId}
        onSelect={onReason}
        emptyText={order === "date_first" && pendingStart ? "No visit types fit that time. Go back and pick another time." : `No visit types are available online. Please call ${clinic.phone}.`}
      />
    );
  else if (step?.key === "provider") body = <ProviderStep providers={providerList} selectedId={providerChoice} onSelect={onProvider} />;
  else if (step?.key === "datetime")
    body = (
      <DateTimePicker
        key={`${reasonId}-${providerFilter}`}
        timeZone={clinic.timeZone}
        now={now}
        maxDays={flow.rules.bookingWindowDays}
        availability={availability}
        slotsFor={slotsFor}
        selectedStart={slot?.start ?? pendingStart}
        onSelect={onSlot}
      />
    );
  else if (step?.key === "details")
    body = (
      <DetailsStep
        clinic={clinic}
        flow={flow}
        reason={reason}
        patientType={patientType}
        values={values}
        files={files}
        insurances={insurances}
        fileUploadsOn={fileUploadsOn}
        otpOn={otpOn}
        otpVerified={otpVerified}
        setOtpVerified={setOtpVerified}
        step={step}
        insuranceStep={stepConfig(flow, "insurance")}
        intakeStep={stepConfig(flow, "intake")}
        onSubmit={onDetails}
        onChange={setValues}
      />
    );
  else if (step?.key === "review")
    body = (
      <div className="grid gap-4">
        <BookingSummary data={summary} editable={editable} onEdit={go} />
        {flow.messages.patientInfo && (
          <p className="flex gap-2 rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-950"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {flow.messages.patientInfo}</p>
        )}
        {flow.messages.paidAppointmentNote && (
          <p className="flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {flow.messages.paidAppointmentNote}</p>
        )}
        <div className="flex justify-end">
          <BrandButton size="lg" className={cn("w-full", !forceMobile && "sm:w-auto")} disabled={submitting || holdExpired} onClick={() => book(values, files)}>
            <CalendarCheck /> {submitting ? "Booking…" : step.buttonText || "Book appointment"}
          </BrandButton>
        </div>
      </div>
    );

  const showHold = !!slot && !!hold && (step?.key === "details" || step?.key === "review");
  const sidebar = theme === "full_page" && !forceMobile;

  const content = previewDone ? (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <CalendarCheck className="h-10 w-10" style={{ color: clinic.branding.primaryColor }} aria-hidden />
      <h2 className="text-xl font-semibold">You&apos;re booked! (preview)</h2>
      <p className="max-w-sm text-sm text-muted-foreground">Preview mode: nothing was saved, no messages were sent and no analytics were logged.</p>
      {slot && <p className="text-sm font-medium">{reason?.name} · {format(slot.start, "EEE, MMM d 'at' h:mm a")} {tzLabel}</p>}
      <BrandButton variant="secondary" onClick={() => { setPreviewDone(false); setStepIdx(0); clearSlot(); setReasonId(undefined); setPendingStart(undefined); }}>Start over</BrandButton>
    </div>
  ) : blocked ? (
    <div className="flex flex-col items-center gap-3 py-12 text-center" role="status">
      <span style={{ color: clinic.branding.primaryColor }} aria-hidden>{blocked.icon}</span>
      <h2 className="text-xl font-semibold">{blocked.title}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{blocked.body}</p>
      <a href={`tel:${clinic.phone}`} className="font-semibold underline" style={{ color: clinic.branding.primaryColor }}>Call {clinic.phone}</a>
    </div>
  ) : (
    <div className={cn(sidebar && "lg:grid lg:grid-cols-[1fr_300px] lg:gap-8")}>
      <div className="min-w-0">
        <Stepper steps={steps} index={stepIdx} onJump={setStepIdx} />
        <div className="mb-5 flex items-start gap-2">
          {stepIdx > 0 && (
            <button type="button" onClick={back} className="mt-0.5 rounded-md p-1.5 hover:bg-slate-200" aria-label="Back to previous step">
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div>
            <h2 ref={headingRef} tabIndex={-1} className={cn("font-bold tracking-tight focus:outline-none", theme === "reason_first" && step?.key === "reason" ? "text-2xl" : "text-xl")}>
              {step?.title}
            </h2>
            {step?.subtitle && <p className="text-sm text-muted-foreground">{step.subtitle}</p>}
          </div>
        </div>
        {error && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>}
        {showHold && <HoldBanner secondsLeft={secondsLeft} expired={holdExpired} label={format(slot!.start, "EEE MMM d, h:mm a")} onRecheck={recheckHold} />}
        {body}
      </div>
      {sidebar && (
        <aside className="mt-8 hidden lg:mt-0 lg:block" aria-label="Your booking">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Your booking</h3>
          <BookingSummary data={summary} editable={[]} />
          <p className="mt-3 text-xs text-muted-foreground">{clinic.address}</p>
        </aside>
      )}
    </div>
  );

  const width = theme === "compact" || forceMobile ? "max-w-xl" : "max-w-5xl";
  return (
    <WidgetUiProvider value={ui}>
      <div
        className={cn("flex flex-col bg-slate-50 text-slate-900", !embedded && mode === "live" && "min-h-screen")}
        data-theme={theme}
        style={{ ["--brand-primary" as string]: clinic.branding.primaryColor, ["--brand-secondary" as string]: clinic.branding.secondaryColor, ["--brand-header" as string]: clinic.branding.headerColor }}
      >
        <WidgetHeader clinic={clinic} compact={embedded} />
        <main id={mode === "live" ? "main" : undefined} className={cn("mx-auto w-full flex-1 px-4", width, theme === "compact" ? "py-5" : "py-8")}>
          <div className={cn(theme !== "full_page" && "rounded-xl border bg-white p-4 shadow-sm", theme !== "full_page" && !forceMobile && "sm:p-6")}>{content}</div>
        </main>
        <WidgetFooter clinic={clinic} poweredBy={platform.branding.poweredByText} termsUrl={flow.messages.termsUrl || undefined} privacyUrl={flow.messages.privacyUrl || undefined} />
      </div>
    </WidgetUiProvider>
  );
}

