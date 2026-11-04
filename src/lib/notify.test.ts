import { describe, expect, it } from "vitest";
import { buildSeed } from "@/mock";
import type { Appointment } from "@/types";
import { buildMessages, interpretSmsReply, quietHoursDeferral, renderTemplate, smsSegments, type NotifyContext } from "./notify";
import { fromWall } from "./time";

const db = buildSeed(new Date("2026-11-04T15:00:00Z"));
const clinic = structuredClone(db.clinics[0]);
clinic.timeZone = "UTC"; // makes "now" easy to control in tests
const appt: Appointment = {
  ...structuredClone(db.appointments.find((a) => a.clinicId === clinic.id)!),
  start: "2026-11-20T10:00",
  end: "2026-11-20T10:30",
  status: "unconfirmed",
  patientType: "new",
  smsConsent: { given: true },
};

function ctx(now: string, over: Partial<NotifyContext> = {}): NotifyContext {
  return {
    clinic,
    appointment: appt,
    reason: db.reasons.find((r) => r.id === appt.reasonId),
    provider: db.providers.find((p) => p.id === appt.providerId),
    templates: db.templates.filter((t) => t.clinicId === clinic.id),
    optOuts: [],
    now: new Date(now),
    quietHours: { start: 21, end: 8 },
    ...over,
  };
}

describe("notification simulator", () => {
  it("renders placeholders", () => {
    expect(renderTemplate("Hi {{patient_name}} at {{ practice_name }} {{unknown}}", { patient_name: "Avery", practice_name: "Clinic" })).toBe("Hi Avery at Clinic {{unknown}}");
  });

  it("writes patient email + SMS and clinic alerts for a booking", () => {
    const msgs = buildMessages("booked", ctx("2026-11-10T14:00:00Z"));
    const patient = msgs.filter((m) => m.recipientType === "patient");
    expect(patient.some((m) => m.channel === "email" && m.event === "booked_new")).toBe(true);
    expect(patient.some((m) => m.channel === "sms" && m.event === "booked_new")).toBe(true);
    expect(patient.some((m) => m.event === "confirmation_request")).toBe(true);
    expect(msgs.some((m) => m.recipientType === "clinic" && m.channel === "email")).toBe(true);
    const reminders = msgs.filter((m) => m.event === "reminder_24h" || m.event === "reminder_2h");
    expect(reminders.length).toBe(4);
    expect(reminders.every((m) => m.status === "scheduled")).toBe(true);
  });

  it("includes reschedule links and the clinic name", () => {
    const sms = buildMessages("rescheduled", ctx("2026-11-10T14:00:00Z")).find((m) => m.channel === "sms" && m.recipientType === "patient")!;
    expect(sms.body).toContain(clinic.name);
    expect(sms.body).toContain(`/book/${clinic.slug}/manage/${appt.token}`);
  });

  it("defers patient SMS during quiet hours (9 pm - 8 am) but not email", () => {
    const msgs = buildMessages("cancelled", ctx("2026-11-10T22:30:00Z"));
    const sms = msgs.find((m) => m.channel === "sms" && m.recipientType === "patient")!;
    expect(sms.status).toBe("scheduled");
    expect(sms.scheduledFor).toBe("2026-11-11T08:00");
    const email = msgs.find((m) => m.channel === "email" && m.recipientType === "patient")!;
    expect(email.status).not.toBe("scheduled");
    const clinicSms = msgs.find((m) => m.channel === "sms" && m.recipientType === "clinic");
    expect(clinicSms?.status).not.toBe("scheduled");
  });

  it("computes the next allowed send time", () => {
    expect(quietHoursDeferral(fromWall("2026-11-10T23:00"), { start: 21, end: 8 })?.getHours()).toBe(8);
    expect(quietHoursDeferral(fromWall("2026-11-10T06:00"), { start: 21, end: 8 })?.getDate()).toBe(10);
    expect(quietHoursDeferral(fromWall("2026-11-10T12:00"), { start: 21, end: 8 })).toBeNull();
  });

  it("skips SMS without consent and fails SMS to opted-out numbers", () => {
    const noConsent = buildMessages("cancelled", ctx("2026-11-10T14:00:00Z", { appointment: { ...appt, smsConsent: { given: false } } }));
    expect(noConsent.some((m) => m.channel === "sms" && m.recipientType === "patient")).toBe(false);
    const optedOut = buildMessages("cancelled", ctx("2026-11-10T14:00:00Z", { optOuts: [{ id: "o", clinicId: clinic.id, phone: appt.patient.phone, at: "", kind: "sms_stop" }] }));
    const sms = optedOut.find((m) => m.channel === "sms" && m.recipientType === "patient")!;
    expect(sms.status).toBe("failed");
  });

  it("honours per-event on/off and leave-reason-out-of-SMS", () => {
    const templates = db.templates.filter((t) => t.clinicId === clinic.id).map((t) => (t.event === "cancelled" && t.channel === "email" ? { ...t, enabled: false } : t));
    const msgs = buildMessages("cancelled", ctx("2026-11-10T14:00:00Z", { templates }));
    expect(msgs.some((m) => m.event === "cancelled" && m.channel === "email")).toBe(false);
    const c2 = structuredClone(clinic);
    c2.settings.notifications.leaveReasonOutOfSms = true;
    const reason = db.reasons.find((r) => r.id === appt.reasonId)!;
    const booked = buildMessages("booked", ctx("2026-11-10T14:00:00Z", { clinic: c2 }));
    const sms = booked.find((m) => m.channel === "sms" && m.event === "booked_new")!;
    expect(sms.body).not.toContain(reason.name);
  });

  it("parses two-way SMS replies", () => {
    expect(interpretSmsReply(" c ")).toBe("confirm");
    expect(interpretSmsReply("STOP")).toBe("stop");
    expect(interpretSmsReply("help")).toBe("help");
    expect(interpretSmsReply("START")).toBe("start");
    expect(interpretSmsReply("maybe")).toBe("unknown");
  });

  it("counts SMS segments", () => {
    expect(smsSegments("x".repeat(160)).segments).toBe(1);
    expect(smsSegments("x".repeat(161)).segments).toBe(2);
  });
});
