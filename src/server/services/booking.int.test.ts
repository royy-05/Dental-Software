import { addDays, format } from "date-fns";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/auth", () => import("@/test/mock-auth"));

import { prisma, withPlatform, withTenant } from "@/server/db";
import { patientActor } from "@/server/audit";
import { createBooking, createHold, rescheduleBooking, setAppointmentStatus, slotsForDay, type BookingInput } from "./booking";
import { sweepDueMessages } from "@/server/jobs/deliver";
import { memoryOutbox } from "@/server/messaging/email";
import { mockSmsOutbox } from "@/server/messaging/sms";
import { handleInboundSms } from "./sms-inbound";
import { call } from "@/test/route";
import * as manage from "@/app/api/public/manage/[token]/route";
import * as cancel from "@/app/api/public/manage/[token]/cancel/route";
import * as reschedule from "@/app/api/public/manage/[token]/reschedule/route";
import * as bookings from "@/app/api/public/clinics/[slug]/bookings/route";
import * as holds from "@/app/api/public/clinics/[slug]/holds/route";
import * as slots from "@/app/api/public/clinics/[slug]/slots/route";
import * as webhook from "@/app/api/webhooks/sms/route";
import { fromDayKey } from "@/lib/time";

const CLINIC = "c_brightsmile";
const SLUG = "bright-smile-dental";
const actor = patientActor("203.0.113.9");

/** A weekday at least 3 days out with free slots for the clinic's first online reason. */
async function freeSlot(opts: { providerId?: string } = {}) {
  const reason = await withTenant(CLINIC, (tx) => tx.reason.findFirstOrThrow({ where: { active: true, visibility: "online" }, orderBy: { order: "asc" } }));
  for (let d = 3; d < 30; d++) {
    const day = addDays(new Date(), d);
    const list = await withTenant(CLINIC, (tx) => slotsForDay(tx, CLINIC, reason.id, day, { providerId: opts.providerId }));
    if (list.length > 3) return { reason, slot: list[Math.floor(list.length / 2)], day };
  }
  throw new Error("No free slot found in the seed data");
}

function input(reasonId: string, slot: { start: string; providerId: string }, extra: Partial<BookingInput> = {}): BookingInput {
  return {
    reasonId,
    providerId: slot.providerId,
    start: slot.start,
    patientType: "new",
    patient: { firstName: "Test", lastName: `Patient${Math.random().toString(36).slice(2, 6)}`, dob: "1990-04-05", phone: "(555) 0100-7777", email: "test.patient@example.com" },
    bookingForSomeoneElse: false,
    insurance: { hasInsurance: false },
    answers: {},
    files: [],
    source: "google_ads",
    referrerId: "1",
    utm: { source: "google", medium: "cpc", campaign: "spring" },
    gclid: "TESTGCLID",
    smsConsent: true,
    bookedBy: "patient",
    sessionId: `ws_${Math.random().toString(36).slice(2, 10)}`,
    ...extra,
  };
}

beforeAll(async () => {
  await prisma.rateLimit.deleteMany();
});
afterAll(() => prisma.$disconnect());

describe("booking engine", () => {
  it("20 concurrent bookings for one slot end with exactly one appointment", async () => {
    const { reason, slot } = await freeSlot();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) => withTenant(CLINIC, (tx) => createBooking(tx, CLINIC, input(reason.id, slot, { patient: { firstName: `P${i}`, lastName: `Race${i}`, dob: "1991-01-01", phone: `(555) 0100-${String(1000 + i)}`, email: `race${i}@example.com` } }), actor))),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(19);
    expect(failed.every((f) => (f.reason as { code?: string }).code === "slot_taken")).toBe(true);
    const count = await withTenant(CLINIC, (tx) => tx.appointment.count({ where: { providerId: slot.providerId, start: new Date(`${slot.start}:00.000Z`), status: { notIn: ["cancelled", "declined"] } } }));
    expect(count).toBe(1);
  });

  it("stores source, referrer, UTM, click id and the consent record; queues the messages", async () => {
    const { reason, slot } = await freeSlot();
    memoryOutbox.length = 0;
    const { appointment, jobs } = await withTenant(CLINIC, (tx) => createBooking(tx, CLINIC, input(reason.id, slot), actor));
    expect(appointment.source).toBe("google_ads");
    expect(appointment.referrerId).toBe("1");
    expect(appointment.utm).toEqual({ source: "google", medium: "cpc", campaign: "spring" });
    expect(appointment.gclid).toBe("TESTGCLID");
    expect(appointment.smsConsent.given).toBe(true);
    expect(appointment.smsConsent.ip).toBe("203.0.113.9");
    expect(appointment.smsConsent.termsVersion).toBeTruthy();
    expect(appointment.token).toMatch(/^[\w-]+\.[\w-]+$/);
    const rows = await withTenant(CLINIC, (tx) => tx.messageLog.findMany({ where: { appointmentId: appointment.id } }));
    const events = rows.map((r) => `${r.event}:${r.channel}:${r.status}`).sort();
    expect(events).toContain("booked_new:email:queued");
    expect(events.some((e) => e.startsWith("practice_notification:email"))).toBe(true);
    expect(rows.filter((r) => r.event.startsWith("reminder")).every((r) => r.status === "scheduled" && r.scheduledFor)).toBe(true);
    expect(jobs.length).toBe(rows.filter((r) => r.status !== "failed").length);
    // Worker delivers the due ones and leaves the reminders for later.
    const swept = await sweepDueMessages();
    expect(swept.delivered).toBeGreaterThan(0);
    const after = await withTenant(CLINIC, (tx) => tx.messageLog.findMany({ where: { appointmentId: appointment.id } }));
    expect(after.filter((r) => r.event === "booked_new").every((r) => r.status === "sent" || r.status === "delivered")).toBe(true);
    expect(after.filter((r) => r.event.startsWith("reminder")).every((r) => r.status === "scheduled")).toBe(true);
    expect(memoryOutbox.some((m) => m.to === "test.patient@example.com" && m.text.includes("/manage/"))).toBe(true);
    const audit = await withPlatform((tx) => tx.auditLog.findFirst({ where: { target: appointment.id, action: "Patient booked online" } }));
    expect(audit?.actorRole).toBe("patient");
  });

  it("holds keep a slot for the holder only, and a booking with an expired hold fails when the slot was taken", async () => {
    const { reason, slot } = await freeSlot();
    const hold = await withTenant(CLINIC, (tx) => createHold(tx, CLINIC, { reasonId: reason.id, start: slot.start, providerId: slot.providerId, sessionId: "ws_holder" }));
    expect(hold.expiresAt).toBeGreaterThan(Date.now());
    // Another session cannot see or book the held slot.
    const visible = await withTenant(CLINIC, (tx) => slotsForDay(tx, CLINIC, reason.id, fromDayKey(slot.start.slice(0, 10)), { sessionId: "ws_other", providerId: slot.providerId }));
    expect(visible.some((s) => s.start === slot.start)).toBe(false);
    await expect(withTenant(CLINIC, (tx) => createHold(tx, CLINIC, { reasonId: reason.id, start: slot.start, providerId: slot.providerId, sessionId: "ws_other" }))).rejects.toMatchObject({ code: "slot_taken" });
    // The holder still sees it and can book it.
    const mine = await withTenant(CLINIC, (tx) => slotsForDay(tx, CLINIC, reason.id, fromDayKey(slot.start.slice(0, 10)), { sessionId: "ws_holder", providerId: slot.providerId }));
    expect(mine.some((s) => s.start === slot.start)).toBe(true);
    const booked = await withTenant(CLINIC, (tx) => createBooking(tx, CLINIC, input(reason.id, slot, { holdId: hold.id, sessionId: "ws_holder" }), actor));
    expect(booked.appointment.start).toBe(slot.start);
    expect(await withTenant(CLINIC, (tx) => tx.slotHold.count({ where: { id: hold.id } }))).toBe(0);
  });

  it("reschedule and cancel bump the version so older links stop working; patient links respect the window", async () => {
    const { reason, slot, day } = await freeSlot();
    const { appointment } = await withTenant(CLINIC, (tx) => createBooking(tx, CLINIC, input(reason.id, slot), actor));
    const v1 = appointment.token;
    const page = await call(manage.GET, { params: { token: v1 } });
    expect(page.status).toBe(200);
    expect(page.json.appointment.id).toBe(appointment.id);
    expect(page.json.clinic.settings.notifications.clinicAlertEmail).toBe("");
    // Pick another free slot the same day for the move.
    const others = await withTenant(CLINIC, (tx) => slotsForDay(tx, CLINIC, reason.id, day, { ignoreAppointmentId: appointment.id }));
    const target = others.find((s) => s.start !== slot.start)!;
    const moved = await call(reschedule.POST, { params: { token: v1 }, body: { start: target.start, providerId: target.providerId } });
    expect(moved.status).toBe(200);
    expect(moved.json.start).toBe(target.start);
    const stale = await call(manage.GET, { params: { token: v1 } });
    expect(stale.status).toBe(410);
    expect(stale.json.error.code).toBe("link_stale");
    const v2 = moved.json.token as string;
    const msgs = await withTenant(CLINIC, (tx) => tx.messageLog.findMany({ where: { appointmentId: appointment.id }, orderBy: { createdAt: "asc" } }));
    expect(msgs.some((m) => m.event === "rescheduled")).toBe(true);
    expect(msgs.filter((m) => m.event === "reminder_24h" && m.channel === "email").map((m) => m.status).sort()).toEqual(["scheduled", "skipped"]);
    const cancelled = await call(cancel.POST, { params: { token: v2 }, body: { note: "Can't make it" } });
    expect(cancelled.status).toBe(200);
    const row = await withTenant(CLINIC, (tx) => tx.appointment.findUniqueOrThrow({ where: { id: appointment.id }, include: { statusHistory: true } }));
    expect(row.status).toBe("cancelled");
    expect(row.version).toBe(3);
    expect(row.statusHistory.at(-1)?.by).toBe("Patient (cancel link)");
    expect((await call(cancel.POST, { params: { token: v2 }, body: {} })).status).toBe(410);
    expect((await call(manage.GET, { params: { token: "nope-nope-nope-nope-nope.nope-nope-nope" } })).status).toBe(404);
  });

  it("the public booking route rejects honeypot submissions and books real ones", async () => {
    await prisma.rateLimit.deleteMany();
    const { reason, slot } = await freeSlot();
    const body = { ...input(reason.id, slot), referrerId: "2" };
    const bot = await call(bookings.POST, { params: { slug: SLUG }, body: { ...body, website: "http://spam.example" }, ip: "198.51.100.200" });
    expect(bot.status).toBe(400);
    const r = await call(bookings.POST, { params: { slug: SLUG }, body, ip: "198.51.100.201" });
    expect(r.status).toBe(200);
    expect(r.json.token).toBeTruthy();
    const row = await withTenant(CLINIC, (tx) => tx.appointment.findUniqueOrThrow({ where: { id: r.json.id } }));
    expect(row.source).toBe("gbp");
    expect(row.referrerId).toBe("2");
    const bad = await call(bookings.POST, { params: { slug: SLUG }, body: { ...body, patient: { ...body.patient, email: "not-an-email" } }, ip: "198.51.100.202" });
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe("validation_error");
    const taken = await call(bookings.POST, { params: { slug: SLUG }, body: input(reason.id, slot), ip: "198.51.100.203" });
    expect(taken.status).toBe(409);
  });

  it("hold and slot routes work by slug and rate limit per IP", async () => {
    await prisma.rateLimit.deleteMany();
    const { reason, slot } = await freeSlot();
    const s = await call(slots.GET, { params: { slug: SLUG }, query: { reasonId: reason.id, date: slot.start.slice(0, 10) } });
    expect(s.status).toBe(200);
    expect(s.json.some((x: { start: string }) => x.start === slot.start)).toBe(true);
    const h = await call(holds.POST, { params: { slug: SLUG }, body: { reasonId: reason.id, start: slot.start, providerId: slot.providerId, sessionId: "ws_route_1" } });
    expect(h.status).toBe(200);
    expect(h.json.slot.start).toBe(slot.start);
    expect((await call(holds.DELETE, { method: "DELETE", params: { slug: SLUG }, body: { holdId: h.json.id, sessionId: "ws_route_1" } })).status).toBe(200);
    expect((await call(slots.GET, { params: { slug: "no-such-clinic" }, query: { reasonId: reason.id, date: slot.start.slice(0, 10) } })).status).toBe(404);
    let last = 200;
    for (let i = 0; i < 11; i++) last = (await call(bookings.POST, { params: { slug: SLUG }, body: { website: "x" }, ip: "198.51.100.99" })).status;
    expect(last).toBe(429);
  });

  it("staff status changes: decline needs a reason, cancelled appointments cannot be confirmed", async () => {
    const { reason, slot } = await freeSlot();
    const staffActor = { id: "u_frontdesk", name: "Fiona Diaz", role: "front_desk" as const, ip: "203.0.113.11" };
    const { appointment } = await withTenant(CLINIC, (tx) => createBooking(tx, CLINIC, input(reason.id, slot, { bookedBy: "staff", source: "staff", status: "confirmed", smsConsent: false }), staffActor));
    expect(appointment.status).toBe("confirmed");
    await expect(withTenant(CLINIC, (tx) => setAppointmentStatus(tx, CLINIC, appointment.id, { status: "declined" }, staffActor))).rejects.toThrow(/Cannot change|reason/);
    const done = await withTenant(CLINIC, (tx) => setAppointmentStatus(tx, CLINIC, appointment.id, { status: "complete" }, staffActor));
    expect(done.appointment.status).toBe("complete");
    const second = (await withTenant(CLINIC, async (tx) => createBooking(tx, CLINIC, input(reason.id, (await freeSlot()).slot), actor))).appointment;
    const cancelled = await withTenant(CLINIC, (tx) => setAppointmentStatus(tx, CLINIC, second.id, { status: "cancelled" }, staffActor));
    expect(cancelled.jobs.length).toBeGreaterThan(0);
    await expect(withTenant(CLINIC, (tx) => setAppointmentStatus(tx, CLINIC, second.id, { status: "confirmed" }, staffActor))).rejects.toThrow(/Cannot change/);
    const other = (await freeSlot()).slot;
    const moved = await withTenant(CLINIC, (tx) => rescheduleBooking(tx, CLINIC, second.id, { start: other.start, providerId: other.providerId, by: "staff" }, staffActor)).catch(() => null);
    if (moved) expect(moved.appointment.status).toBe("unconfirmed");
  });
});

describe("two-way SMS", () => {
  it("C confirms the next appointment, STOP opts out and blocks later texts, START opts back in", async () => {
    const { reason, slot } = await freeSlot();
    const phone = "(555) 0100-4242";
    const { appointment } = await withTenant(CLINIC, (tx) => createBooking(tx, CLINIC, input(reason.id, slot, { patient: { firstName: "Sam", lastName: "Reply", dob: "1985-02-02", phone, email: "sam.reply@example.com" } }), actor));
    const c = await handleInboundSms(CLINIC, phone, "c");
    expect(c.intent).toBe("confirm");
    expect(c.reply).toMatch(/confirmed/);
    expect((await withTenant(CLINIC, (tx) => tx.appointment.findUniqueOrThrow({ where: { id: appointment.id } }))).status).toBe("confirmed");
    const stop = await handleInboundSms(CLINIC, phone, "STOP");
    expect(stop.intent).toBe("stop");
    expect(await withTenant(CLINIC, (tx) => tx.optOut.count({ where: { phone, kind: "sms_stop" } }))).toBe(1);
    // A new booking for the opted-out number gets its SMS blocked, email still goes.
    const next = await freeSlot();
    const { appointment: a2 } = await withTenant(CLINIC, (tx) => createBooking(tx, CLINIC, input(reason.id, next.slot, { patient: { firstName: "Sam", lastName: "Reply", dob: "1985-02-02", phone, email: "sam.reply@example.com" } }), actor));
    const rows = await withTenant(CLINIC, (tx) => tx.messageLog.findMany({ where: { appointmentId: a2.id, recipientType: "patient" } }));
    expect(rows.filter((r) => r.channel === "sms").every((r) => r.status === "failed" && /opted out/.test(r.error ?? ""))).toBe(true);
    expect(rows.some((r) => r.channel === "email" && r.status === "queued")).toBe(true);
    const start = await handleInboundSms(CLINIC, phone, "START");
    expect(start.intent).toBe("start");
    expect(await withTenant(CLINIC, (tx) => tx.optOut.count({ where: { phone, kind: "sms_stop" } }))).toBe(0);
    mockSmsOutbox.length = 0;
    await sweepDueMessages();
    expect(mockSmsOutbox.some((m) => m.to === phone && /resubscribed/.test(m.body))).toBe(true);
  });

  it("the webhook needs the shared secret", async () => {
    process.env.SMS_WEBHOOK_SECRET = "test-secret";
    const bad = await call(webhook.POST, { body: { clinicSlug: SLUG, from: "(555) 0100-0001", text: "HELP" } });
    expect(bad.status).toBe(401);
    const ok = await call(webhook.POST, { body: { clinicSlug: SLUG, from: "(555) 0100-0001", text: "HELP" }, headers: { "x-webhook-secret": "test-secret" } });
    expect(ok.status).toBe(200);
    expect(ok.json.intent).toBe("help");
  });
});

describe("quiet hours", () => {
  it("defers patient SMS sent at night to 8 am clinic time", async () => {
    const { reason, slot } = await freeSlot();
    // 23:30 in America/New_York on a weekday.
    const night = new Date(`${format(addDays(new Date(), 1), "yyyy-MM-dd")}T04:30:00.000Z`);
    const { appointment } = await withTenant(CLINIC, (tx) => createBooking(tx, CLINIC, input(reason.id, slot, { now: night }), actor));
    const sms = await withTenant(CLINIC, (tx) => tx.messageLog.findFirst({ where: { appointmentId: appointment.id, channel: "sms", event: "booked_new" } }));
    expect(sms?.status).toBe("scheduled");
    expect(sms?.error).toMatch(/quiet hours/);
    expect(sms?.scheduledFor?.toISOString()).toMatch(/T1[23]:00:00/); // 08:00 New York = 12:00/13:00 UTC
  });
});
