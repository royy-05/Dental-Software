import { addDays, format, setHours, setMinutes } from "date-fns";
import type {
  Appointment,
  Channel,
  Clinic,
  DeliveryStatus,
  MessageLog,
  MessageTemplate,
  OptOut,
  Provider,
  Reason,
  TemplateEvent,
} from "@/types";
import { fromWall, nowInZone, toWall } from "./time";

/**
 * Notification simulator (section 7). Pure functions: given a booking event they return the
 * email/SMS entries that a real provider (SendGrid/Twilio) would send. Nothing leaves the browser.
 */

export const BOOKING_BASE_URL = "https://book.kivihealth.example.com";

export type NotifyEvent = "booked" | "cancelled" | "rescheduled" | "declined" | "confirmation_request" | "resend" | "reminders";

export interface NotifyContext {
  clinic: Clinic;
  appointment: Appointment;
  reason?: Reason;
  provider?: Provider;
  templates: MessageTemplate[]; // clinic templates (fallback to global defaults handled by caller)
  optOuts: OptOut[];
  now: Date; // real "now"
  quietHours: { start: number; end: number };
  baseUrl?: string;
}

export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key: string) => (key in vars ? vars[key] : m));
}

export function manageLink(clinic: Clinic, appt: Appointment, baseUrl = BOOKING_BASE_URL): string {
  return `${baseUrl}/book/${clinic.slug}/manage/${appt.token}`;
}

export function templateVars(
  clinic: Clinic,
  appt: Appointment,
  reason: Reason | undefined,
  provider: Provider | undefined,
  baseUrl = BOOKING_BASE_URL,
): Record<string, string> {
  const start = fromWall(appt.start);
  return {
    patient_name: `${appt.patient.firstName} ${appt.patient.lastName}`.trim(),
    practice_name: clinic.name,
    rfv_name: reason?.name ?? "appointment",
    apt_date: format(start, "EEE, MMM d"),
    start_time: format(start, "h:mm a"),
    provider_name: provider?.displayName ?? "our team",
    reschedule_link: manageLink(clinic, appt, baseUrl),
  };
}

/** Deterministic pseudo-random delivery outcome so the demo log looks realistic. */
export function simulateDelivery(id: string, channel: Channel, to: string): { status: DeliveryStatus; error?: string } {
  if (channel === "email" && /invalid|bounce/i.test(to)) return { status: "bounced", error: "Mailbox does not exist" };
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const r = (h % 1000) / 1000;
  if (channel === "sms") return r < 0.04 ? { status: "failed", error: "Carrier rejected (30007)" } : { status: "delivered" };
  if (r < 0.01) return { status: "failed", error: "Provider timeout" };
  if (r < 0.03) return { status: "bounced", error: "Mailbox full" };
  if (r < 0.5) return { status: "opened" };
  return { status: "delivered" };
}

/** Quiet hours: no SMS between `start` (21) and `end` (8) patient local time. Returns the next allowed time or null. */
export function quietHoursDeferral(localNow: Date, quiet: { start: number; end: number }): Date | null {
  const h = localNow.getHours();
  const inQuiet = quiet.start > quiet.end ? h >= quiet.start || h < quiet.end : h >= quiet.start && h < quiet.end;
  if (!inQuiet) return null;
  const base = h >= quiet.start && quiet.start > quiet.end ? addDays(localNow, 1) : localNow;
  return setMinutes(setHours(base, quiet.end), 0);
}

let seq = 0;
function msgId() {
  seq += 1;
  return `msg_${Date.now().toString(36)}_${seq.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function findTemplate(templates: MessageTemplate[], event: TemplateEvent, channel: Channel) {
  return templates.find((t) => t.event === event && t.channel === channel);
}

export interface Draft {
  channel: Channel;
  recipientType: "patient" | "clinic";
  to: string;
  event: MessageLog["event"];
  subject?: string;
  body: string;
  scheduledFor?: Date; // clinic wall-clock
}

/**
 * Decide what happens to each draft: blocked by an opt-out, deferred (reminder time or quiet hours) or sent now.
 * Shared by the browser simulator and the server queue so both apply the same rules.
 */
export type Disposition =
  | { kind: "blocked"; error: string }
  | { kind: "deferred"; scheduledFor: Date; note?: string }
  | { kind: "send" };

export function dispositionFor(d: Draft, ctx: Pick<NotifyContext, "clinic" | "optOuts" | "now" | "quietHours">): Disposition {
  const localNow = nowInZone(ctx.clinic.timeZone, ctx.now);
  if (d.channel === "sms" && d.recipientType === "patient" && ctx.optOuts.some((o) => o.clinicId === ctx.clinic.id && o.phone === d.to && o.kind === "sms_stop")) {
    return { kind: "blocked", error: "Recipient opted out (STOP)" };
  }
  if (d.channel === "email" && d.recipientType === "patient" && ctx.optOuts.some((o) => o.clinicId === ctx.clinic.id && o.phone === d.to && (o.kind === "email_bounce" || o.kind === "email_unsubscribe"))) {
    return { kind: "blocked", error: "Address bounced or unsubscribed" };
  }
  if (d.scheduledFor && d.scheduledFor > localNow) {
    if (d.channel === "sms" && d.recipientType === "patient") {
      const next = quietHoursDeferral(d.scheduledFor, ctx.quietHours);
      if (next) return { kind: "deferred", scheduledFor: next, note: "Deferred: quiet hours (9 pm - 8 am)" };
    }
    return { kind: "deferred", scheduledFor: d.scheduledFor };
  }
  if (d.channel === "sms" && d.recipientType === "patient") {
    const next = quietHoursDeferral(localNow, ctx.quietHours);
    if (next) return { kind: "deferred", scheduledFor: next, note: "Deferred: quiet hours (9 pm - 8 am)" };
  }
  return { kind: "send" };
}

export function finalizeMessages(drafts: Draft[], ctx: NotifyContext): MessageLog[] {
  return drafts.map((d) => {
    const id = msgId();
    const base: MessageLog = {
      id,
      clinicId: ctx.clinic.id,
      appointmentId: ctx.appointment.id,
      channel: d.channel,
      direction: "outbound",
      recipientType: d.recipientType,
      to: d.to,
      event: d.event,
      subject: d.subject,
      body: d.body,
      status: "sent",
      createdAt: ctx.now.toISOString(),
    };
    const disp = dispositionFor(d, ctx);
    if (disp.kind === "blocked") return { ...base, status: "failed", error: disp.error };
    if (disp.kind === "deferred") return { ...base, status: "scheduled", scheduledFor: toWall(disp.scheduledFor), error: disp.note };
    const outcome = simulateDelivery(id, d.channel, d.to);
    return { ...base, ...outcome };
  });
}

/** The messages an event produces, before delivery rules. Pure; used by the server queue and the simulator. */
export function draftMessages(event: NotifyEvent, ctx: Omit<NotifyContext, "optOuts" | "quietHours">): Draft[] {
  const { clinic, appointment: appt, reason, provider, templates } = ctx;
  const vars = templateVars(clinic, appt, reason, provider, ctx.baseUrl);
  const smsVars = clinic.settings.notifications.leaveReasonOutOfSms ? { ...vars, rfv_name: "appointment" } : vars;
  const drafts: Draft[] = [];

  const toPatient = (tplEvent: TemplateEvent, scheduledFor?: Date) => {
    for (const channel of ["email", "sms"] as Channel[]) {
      const t = findTemplate(templates, tplEvent, channel);
      if (!t || !t.enabled) continue;
      if (channel === "sms" && !appt.smsConsent.given) continue;
      const to = channel === "email" ? appt.patient.email : appt.patient.phone;
      if (!to) continue;
      const v = channel === "sms" ? smsVars : vars;
      drafts.push({
        channel,
        recipientType: "patient",
        to,
        event: tplEvent,
        subject: channel === "email" ? renderTemplate(t.subject, v) : undefined,
        body: renderTemplate(t.body, v),
        scheduledFor,
      });
    }
  };

  const toClinic = (kind: "new" | "cancel" | "reschedule") => {
    const n = clinic.settings.notifications;
    const label = kind === "new" ? "New booking" : kind === "cancel" ? "Cancellation" : "Rescheduled";
    const tpl = findTemplate(templates, "practice_notification", "email");
    const subject = kind === "new" && tpl ? renderTemplate(tpl.subject, vars) : `${label}: ${vars.rfv_name} on ${vars.apt_date}`;
    const body = kind === "new" && tpl ? renderTemplate(tpl.body, vars) : `${label}\n\nPatient: ${vars.patient_name}\nReason: ${vars.rfv_name}\nWhen: ${vars.apt_date} at ${vars.start_time}`;
    const event: MessageLog["event"] = kind === "cancel" ? "cancellation_alert" : "practice_notification";
    if (!tpl || tpl.enabled) {
      for (const to of [n.clinicAlertEmail, ...n.extraAlertEmails].filter(Boolean)) {
        drafts.push({ channel: "email", recipientType: "clinic", to, event, subject, body });
      }
    }
    const smsTpl = findTemplate(templates, "practice_notification", "sms");
    if (n.smsAlertsToClinic && (!smsTpl || smsTpl.enabled)) {
      const smsBody = kind === "new" && smsTpl ? renderTemplate(smsTpl.body, smsVars) : `${label}: ${smsVars.patient_name}, ${smsVars.apt_date} ${smsVars.start_time}`;
      drafts.push({ channel: "sms", recipientType: "clinic", to: n.alternateSmsNumber || clinic.phone, event, body: smsBody });
    }
  };

  const n = clinic.settings.notifications;
  switch (event) {
    case "booked":
    case "resend": {
      if (n.notifyPatientAfterBooking || event === "resend") toPatient(appt.patientType === "new" ? "booked_new" : "booked_returning");
      if (event === "booked") {
        toClinic("new");
        if (clinic.settings.confirmation.sendConfirmPrompt && appt.status === "unconfirmed") toPatient("confirmation_request");
        if (n.remindersEnabled) {
          const start = fromWall(appt.start);
          toPatient("reminder_24h", new Date(start.getTime() - n.reminderFirstHours * 3600000));
          toPatient("reminder_2h", new Date(start.getTime() - n.reminderSecondHours * 3600000));
        }
      }
      break;
    }
    case "confirmation_request":
      toPatient("confirmation_request");
      break;
    case "reminders": {
      // Re-issued after a reschedule: only the two reminders, at the new times.
      if (n.remindersEnabled) {
        const start = fromWall(appt.start);
        toPatient("reminder_24h", new Date(start.getTime() - n.reminderFirstHours * 3600000));
        toPatient("reminder_2h", new Date(start.getTime() - n.reminderSecondHours * 3600000));
      }
      break;
    }
    case "cancelled":
      toPatient("cancelled");
      toClinic("cancel");
      break;
    case "rescheduled":
      toPatient("rescheduled");
      toClinic("reschedule");
      break;
    case "declined":
      toPatient("declined");
      break;
  }
  // Drop reminders that would be in the past.
  const localNow = nowInZone(clinic.timeZone, ctx.now);
  return drafts.filter((d) => !(d.event === "reminder_24h" || d.event === "reminder_2h") || (d.scheduledFor && d.scheduledFor > localNow));
}

export function buildMessages(event: NotifyEvent, ctx: NotifyContext): MessageLog[] {
  return finalizeMessages(draftMessages(event, ctx), ctx);
}

export type SmsIntent = "confirm" | "stop" | "help" | "start" | "unknown";
export function interpretSmsReply(text: string): SmsIntent {
  const t = text.trim().toUpperCase();
  if (["C", "CONFIRM", "YES", "Y"].includes(t)) return "confirm";
  if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(t)) return "stop";
  if (["HELP", "INFO"].includes(t)) return "help";
  if (["START", "UNSTOP"].includes(t)) return "start";
  return "unknown";
}

export function smsAutoReply(intent: SmsIntent, clinic: Clinic, apptLabel?: string): string {
  switch (intent) {
    case "confirm":
      return apptLabel
        ? `${clinic.name}: Thanks! Your appointment on ${apptLabel} is confirmed.`
        : `${clinic.name}: We couldn't find an upcoming appointment to confirm. Call ${clinic.phone}.`;
    case "stop":
      return `${clinic.name}: You're unsubscribed and will get no more texts. Reply START to resubscribe.`;
    case "help":
      return `${clinic.name}: Appointment texts. Call ${clinic.phone} for help. Msg & data rates may apply. Reply STOP to opt out.`;
    case "start":
      return `${clinic.name}: You're resubscribed to appointment texts. Reply STOP to opt out.`;
    default:
      return `${clinic.name}: Sorry, we didn't understand. Reply C to confirm, HELP for help or STOP to opt out.`;
  }
}

export function smsSegments(body: string): { chars: number; segments: number } {
  const chars = body.length;
  // GSM-7 approximation: 160 chars single, 153 per segment when concatenated.
  const segments = chars <= 160 ? 1 : Math.ceil(chars / 153);
  return { chars, segments };
}
