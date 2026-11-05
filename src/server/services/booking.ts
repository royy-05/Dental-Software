import { addDays, startOfDay } from "date-fns";
import type { Appointment, AppointmentInsurance, AppointmentStatus, BookingRules, Clinic, FlowConfig, Operatory, Provider, Reason, Source, UtmTags } from "@/types";
import { BLOCKING_STATUSES, SLOT_HOLD_MINUTES, availableDays, firstAvailable, getSlotsForDay, isSlotAvailable, type Slot, type SlotContext } from "@/lib/slots";
import { dayKey, fromWall, nowInZone, toWall } from "@/lib/time";
import { zonedWallToUtc } from "@/lib/tz";
import type { Tx } from "../db";
import { audit, type Actor } from "../audit";
import { ApiError, badRequest, conflict, notFound } from "../errors";
import { appointmentInclude, dbToWall, json, operatoryInclude, providerInclude, reasonInclude, toAppointment, toOperatory, toProvider, toReason, wallToDb } from "../mappers";
import { loadClinic } from "./clinic";
import { cancelPendingMessages, queueNotifications, type QueuedJob } from "./notify";
import { manageTokenFor } from "../links";

/**
 * Server-side booking engine (step 4). The slot rules themselves live in src/lib/slots.ts (pure, unit tested);
 * this module loads the inputs from the database and makes every write transactional:
 *
 * - `withBookingLock(tx, clinicId)` takes a transaction-scoped advisory lock per clinic, so two requests for the
 *   same slot are serialised: the second one re-checks availability after the first has written its row.
 * - The gist exclusion constraints in the `rls` migration are the backstop if anything bypasses the lock.
 * - Holds (slot_holds) keep a slot for 5 minutes while the patient fills in the form.
 */

export const HOLD_MS = SLOT_HOLD_MINUTES * 60_000;

export async function withBookingLock(tx: Tx, clinicId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"booking:" + clinicId}))`;
}

export async function publishedFlow(tx: Tx, clinicId: string): Promise<FlowConfig | null> {
  const flow = await tx.clinicFlow.findUnique({ where: { clinicId } });
  if (!flow) return null;
  const v = await tx.flowVersion.findUnique({ where: { clinicId_version: { clinicId, version: flow.publishedVersion } } });
  return (v?.config ?? flow.draft) as unknown as FlowConfig;
}

export interface LoadedContext {
  clinic: Clinic;
  reason: Reason;
  providers: Provider[];
  operatories: Operatory[];
  rules: BookingRules;
  ctx: SlotContext;
}

export interface ContextOptions {
  /** Wall-clock day range to load appointments and holds for (inclusive from, exclusive to). */
  from: Date;
  to: Date;
  sessionId?: string;
  providerId?: string;
  staffOverride?: boolean;
  ignoreAppointmentId?: string;
  now?: Date;
}

/** Load everything the slot engine needs for one reason, scoped by RLS to the clinic. */
export async function loadSlotContext(tx: Tx, clinicId: string, reasonId: string, o: ContextOptions): Promise<LoadedContext | null> {
  const [clinic, reasonRow, providerRows, operatoryRows, rules] = await Promise.all([
    loadClinic(tx, clinicId),
    tx.reason.findUnique({ where: { id: reasonId }, include: reasonInclude }),
    tx.provider.findMany({ include: providerInclude, orderBy: { order: "asc" } }),
    tx.operatory.findMany({ include: operatoryInclude, orderBy: { order: "asc" } }),
    publishedFlow(tx, clinicId).then((f) => f?.rules ?? null),
  ]);
  if (!reasonRow || reasonRow.clinicId !== clinicId || !rules) return null;
  const now = o.now ?? new Date();
  const fromDb = wallToDb(toWall(addDays(startOfDay(o.from), -1)));
  const toDb = wallToDb(toWall(addDays(startOfDay(o.to), 2)));
  const [appointments, holds] = await Promise.all([
    tx.appointment.findMany({
      where: { start: { gte: fromDb, lt: toDb }, status: { in: BLOCKING_STATUSES } },
      select: { id: true, start: true, end: true, providerId: true, operatoryId: true, status: true },
    }),
    tx.slotHold.findMany({ where: { expiresAt: { gt: now }, start: { gte: fromDb, lt: toDb } } }),
  ]);
  const reason = toReason(reasonRow);
  const providers = providerRows.map(toProvider);
  const operatories = operatoryRows.map(toOperatory);
  const ctx: SlotContext = {
    reason,
    providers,
    operatories,
    clinicHours: clinic.hours,
    holidays: clinic.holidays,
    blockouts: clinic.blockouts.filter((b) => !clinic.settings.scheduling.blockoutsToSkip.includes(b.id)),
    appointments: appointments.map((a) => ({ id: a.id, start: dbToWall(a.start), end: dbToWall(a.end), providerId: a.providerId, operatoryId: a.operatoryId ?? undefined, status: a.status as AppointmentStatus })),
    holds: holds.map((h) => ({ id: h.id, start: dbToWall(h.start), end: dbToWall(h.end), providerId: h.providerId, operatoryId: h.operatoryId ?? undefined, expiresAt: h.expiresAt.getTime(), sessionId: h.sessionId })),
    rules,
    now: nowInZone(clinic.timeZone, now),
    sessionId: o.sessionId,
    providerId: o.providerId,
    staffOverride: o.staffOverride,
    ignoreAppointmentId: o.ignoreAppointmentId,
  };
  return { clinic, reason, providers, operatories, rules, ctx };
}

export const slotOut = (s: Slot) => ({ start: toWall(s.start), end: toWall(s.end), providerId: s.providerId, operatoryId: s.operatoryId });

/** Slots for one day (first-available collapsed unless a provider was chosen). */
export async function slotsForDay(tx: Tx, clinicId: string, reasonId: string, day: Date, o: Omit<ContextOptions, "from" | "to">) {
  const loaded = await loadSlotContext(tx, clinicId, reasonId, { ...o, from: day, to: day });
  if (!loaded) return [];
  const all = getSlotsForDay(day, loaded.ctx, (o.now ?? new Date()).getTime());
  return (o.providerId ? all : firstAvailable(all)).map(slotOut);
}

export async function availabilityMap(tx: Tx, clinicId: string, reasonId: string, from: Date, days: number, o: Omit<ContextOptions, "from" | "to">) {
  const loaded = await loadSlotContext(tx, clinicId, reasonId, { ...o, from, to: addDays(from, days) });
  if (!loaded) return {};
  return availableDays(from, days, loaded.ctx, (o.now ?? new Date()).getTime());
}

// ---------------------------------------------------------------- holds

export interface HoldInput {
  reasonId: string;
  start: string; // wall-clock
  providerId: string;
  sessionId: string;
  now?: Date;
}

/** Hold a slot for 5 minutes. Replaces any earlier hold of the same session. Fails if the slot is not free. */
export async function createHold(tx: Tx, clinicId: string, input: HoldInput) {
  await withBookingLock(tx, clinicId);
  const now = input.now ?? new Date();
  const start = fromWall(input.start);
  await tx.slotHold.deleteMany({ where: { OR: [{ sessionId: input.sessionId }, { expiresAt: { lt: now } }] } });
  const loaded = await loadSlotContext(tx, clinicId, input.reasonId, { from: start, to: start, sessionId: input.sessionId, now });
  if (!loaded) throw notFound("Reason");
  const slot = isSlotAvailable({ start, providerId: input.providerId }, loaded.ctx, now.getTime());
  if (!slot) throw conflict("That time is no longer available. Please pick another time.", "slot_taken");
  const expiresAt = new Date(now.getTime() + HOLD_MS);
  const row = await tx.slotHold.create({
    data: { clinicId, providerId: slot.providerId, operatoryId: slot.operatoryId ?? null, start: wallToDb(toWall(slot.start)), end: wallToDb(toWall(slot.end)), expiresAt, sessionId: input.sessionId },
  });
  return { id: row.id, expiresAt: expiresAt.getTime(), slot: slotOut(slot) };
}

export async function releaseHold(tx: Tx, holdId: string, sessionId: string) {
  await tx.slotHold.deleteMany({ where: { id: holdId, sessionId } });
}

export async function purgeExpiredHolds(tx: Tx, now = new Date()) {
  const r = await tx.slotHold.deleteMany({ where: { expiresAt: { lt: now } } });
  return r.count;
}

// ---------------------------------------------------------------- bookings

export interface BookingInput {
  reasonId: string;
  providerId: string;
  start: string; // wall-clock
  patientType: "new" | "existing";
  patient: { firstName: string; lastName: string; dob: string; phone: string; email: string; message?: string };
  bookingForSomeoneElse: boolean;
  bookerName?: string;
  insurance: AppointmentInsurance;
  answers: Record<string, string | boolean>;
  files: { name: string; size: number }[];
  source: Source;
  referrerId?: string;
  utm: UtmTags;
  gclid?: string;
  fbclid?: string;
  smsConsent: boolean;
  consent?: { ip?: string; userAgent?: string };
  bookedBy: "patient" | "staff";
  status?: AppointmentStatus;
  holdId?: string;
  sessionId?: string;
  now?: Date;
}

export interface BookingResult {
  appointment: Appointment;
  jobs: QueuedJob[];
}

async function upsertPatient(tx: Tx, clinicId: string, p: BookingInput["patient"], unarchive: boolean, now: Date) {
  const email = p.email.trim().toLowerCase();
  const lastName = p.lastName.trim();
  const existing = await tx.patient.findFirst({
    where: {
      clinicId,
      dob: p.dob,
      lastName: { equals: lastName, mode: "insensitive" },
      OR: [...(email ? [{ email }] : []), ...(p.phone ? [{ phone: p.phone.trim() }] : [])],
    },
  });
  if (existing) {
    const data: Record<string, unknown> = { firstName: p.firstName.trim(), phone: p.phone.trim() || existing.phone, email: email || existing.email };
    if (existing.archivedAt && unarchive) data.archivedAt = null;
    return tx.patient.update({ where: { id: existing.id }, data });
  }
  return tx.patient.create({ data: { clinicId, firstName: p.firstName.trim(), lastName, dob: p.dob, phone: p.phone.trim(), email, createdAt: now } });
}

/**
 * Create an appointment. Runs under the clinic booking lock: the slot is re-validated against every appointment and
 * every other session's hold after the lock is taken, so concurrent requests for one slot end with one booking.
 */
export async function createBooking(tx: Tx, clinicId: string, input: BookingInput, actor: Actor): Promise<BookingResult> {
  await withBookingLock(tx, clinicId);
  const now = input.now ?? new Date();
  const staff = input.bookedBy === "staff";
  const start = fromWall(input.start);
  const loaded = await loadSlotContext(tx, clinicId, input.reasonId, { from: start, to: start, sessionId: input.sessionId, staffOverride: staff, now });
  if (!loaded) throw notFound("Reason");
  const { clinic, reason, providers } = loaded;
  if (!staff && (clinic.deletedAt || ["paused", "suspended", "churned"].includes(clinic.status))) throw new ApiError(403, "clinic_unavailable", "Online booking is unavailable for this clinic.");
  if (!staff && !loaded.rules.acceptingPatients) throw new ApiError(403, "not_accepting", loaded.rules.pausedMessage || "Online booking is paused.");
  const slot = isSlotAvailable({ start, providerId: input.providerId }, loaded.ctx, now.getTime());
  if (!slot) {
    const holdExpired = input.holdId && !loaded.ctx.holds.some((h) => h.id === input.holdId);
    throw conflict(holdExpired ? "Your 5 minute hold expired and this time was taken. Please pick another time." : "That time is no longer available. Please pick another time.", "slot_taken");
  }
  const patient = await upsertPatient(tx, clinicId, input.patient, clinic.settings.scheduling.unarchivePatientOnBooking, now);
  const status: AppointmentStatus = input.status ?? "unconfirmed";
  const by = staff ? actor.name : input.bookingForSomeoneElse ? "Patient (online, booked by someone else)" : "Patient (online)";
  const appt = await tx.appointment.create({
    data: {
      clinicId,
      patientId: patient.id,
      createdAt: now,
      start: wallToDb(toWall(slot.start)),
      end: wallToDb(toWall(slot.end)),
      reasonId: reason.id,
      providerId: slot.providerId,
      operatoryId: slot.operatoryId ?? null,
      patientType: input.patientType,
      message: input.patient.message?.trim() || null,
      bookingForSomeoneElse: input.bookingForSomeoneElse,
      bookerName: input.bookerName?.trim() || null,
      insurance: json(input.insurance),
      answers: json(input.answers),
      files: json(input.files),
      source: input.source,
      referrerId: input.referrerId ?? null,
      utmSource: input.utm.source ?? null,
      utmMedium: input.utm.medium ?? null,
      utmCampaign: input.utm.campaign ?? null,
      utmTerm: input.utm.term ?? null,
      utmContent: input.utm.content ?? null,
      gclid: input.gclid ?? null,
      fbclid: input.fbclid ?? null,
      status,
      bookedBy: input.bookedBy,
      statusHistory: { create: { clinicId, status, at: now, by } },
      consents: {
        create: { clinicId, patientId: patient.id, kind: "sms", given: input.smsConsent, at: now, ip: input.consent?.ip ?? actor.ip, userAgent: input.consent?.userAgent ?? null, termsVersion: clinic.settings.legal.termsVersion },
      },
    },
    include: appointmentInclude,
  });
  if (input.holdId) await tx.slotHold.deleteMany({ where: { id: input.holdId } });
  else if (input.sessionId) await tx.slotHold.deleteMany({ where: { sessionId: input.sessionId } });
  await tx.notification.create({
    data: {
      clinicId,
      at: now,
      title: staff ? "Staff booking added" : "New online booking",
      body: `${reason.name} on ${toWall(slot.start).replace("T", " at ")}`,
      href: `/clinic/appointments?open=${appt.id}`,
    },
  });
  await audit(tx, actor, { action: staff ? "Created manual booking" : "Patient booked online", category: "booking", target: appt.id, clinicId });
  const appointment = toAppointment(appt, manageTokenFor({ id: appt.id, version: appt.version, startUtc: zonedWallToUtc(dbToWall(appt.start), clinic.timeZone) }));
  const jobs = await queueNotifications(tx, "booked", { clinic, appointment, reason, provider: providers.find((p) => p.id === slot.providerId), now });
  return { appointment, jobs };
}

async function loadAppointmentWithContext(tx: Tx, clinicId: string, appointmentId: string) {
  const row = await tx.appointment.findUnique({ where: { id: appointmentId }, include: appointmentInclude });
  if (!row || row.clinicId !== clinicId) throw notFound("Appointment");
  const [clinic, reasonRow, providerRow] = await Promise.all([
    loadClinic(tx, clinicId),
    tx.reason.findUnique({ where: { id: row.reasonId }, include: reasonInclude }),
    tx.provider.findUnique({ where: { id: row.providerId }, include: providerInclude }),
  ]);
  return { row, clinic, reason: reasonRow ? toReason(reasonRow) : undefined, provider: providerRow ? toProvider(providerRow) : undefined };
}

export function tokenFor(clinic: Clinic, row: { id: string; version: number; start: Date }) {
  return manageTokenFor({ id: row.id, version: row.version, startUtc: zonedWallToUtc(dbToWall(row.start), clinic.timeZone) });
}

export interface RescheduleInput {
  start: string;
  providerId: string;
  by: "patient" | "staff";
  now?: Date;
}

export async function rescheduleBooking(tx: Tx, clinicId: string, appointmentId: string, input: RescheduleInput, actor: Actor): Promise<BookingResult> {
  await withBookingLock(tx, clinicId);
  const now = input.now ?? new Date();
  const { row, clinic, reason } = await loadAppointmentWithContext(tx, clinicId, appointmentId);
  if (!reason) throw notFound("Reason");
  const start = fromWall(input.start);
  const staff = input.by === "staff";
  const loaded = await loadSlotContext(tx, clinicId, reason.id, { from: start, to: start, staffOverride: staff, ignoreAppointmentId: appointmentId, now });
  if (!loaded) throw notFound("Reason");
  const slot = isSlotAvailable({ start, providerId: input.providerId }, loaded.ctx, now.getTime());
  if (!slot) throw conflict("That time is no longer available. Please pick another time.", "slot_taken");
  const prev = dbToWall(row.start);
  const nextStatus: AppointmentStatus = row.status === "cancelled" || row.status === "declined" ? "unconfirmed" : (row.status as AppointmentStatus);
  const by = staff ? actor.name : "Patient (reschedule link)";
  const updated = await tx.appointment.update({
    where: { id: appointmentId },
    data: {
      start: wallToDb(toWall(slot.start)),
      end: wallToDb(toWall(slot.end)),
      providerId: slot.providerId,
      operatoryId: slot.operatoryId ?? null,
      status: nextStatus,
      version: { increment: 1 },
      statusHistory: { create: { clinicId, status: nextStatus, at: now, by, note: `Rescheduled from ${prev.replace("T", " ")}` } },
    },
    include: appointmentInclude,
  });
  await cancelPendingMessages(tx, appointmentId, "Appointment was rescheduled");
  await audit(tx, actor, { action: "Rescheduled appointment", category: "booking", target: appointmentId, clinicId });
  const appointment = toAppointment(updated, tokenFor(clinic, updated));
  const provider = loaded.providers.find((p) => p.id === slot.providerId);
  const jobs = await queueNotifications(tx, "rescheduled", { clinic, appointment, reason, provider, now });
  // New reminders for the new time.
  if (clinic.settings.notifications.remindersEnabled && (nextStatus === "unconfirmed" || nextStatus === "confirmed")) {
    jobs.push(...(await queueNotifications(tx, "reminders", { clinic, appointment, reason, provider, now })));
  }
  return { appointment, jobs };
}

export interface StatusInput {
  status: AppointmentStatus;
  note?: string;
  declineReason?: string;
  by?: string;
  /** Skip patient messages (used by the SMS "C" confirmation and silent updates). */
  silent?: boolean;
  now?: Date;
}

const ALLOWED: Record<AppointmentStatus, AppointmentStatus[]> = {
  unconfirmed: ["confirmed", "cancelled", "declined", "complete", "no_show"],
  confirmed: ["cancelled", "complete", "no_show", "unconfirmed"],
  complete: ["no_show"],
  no_show: ["complete"],
  cancelled: [],
  declined: [],
};

export async function setAppointmentStatus(tx: Tx, clinicId: string, appointmentId: string, input: StatusInput, actor: Actor): Promise<BookingResult> {
  const now = input.now ?? new Date();
  const { row, clinic, reason, provider } = await loadAppointmentWithContext(tx, clinicId, appointmentId);
  const from = row.status as AppointmentStatus;
  if (from === input.status) return { appointment: toAppointment(row, tokenFor(clinic, row)), jobs: [] };
  if (!ALLOWED[from].includes(input.status)) throw badRequest(`Cannot change a ${from} appointment to ${input.status}.`);
  if (input.status === "declined" && !input.declineReason?.trim()) throw badRequest("Give a reason for declining.");
  const ending = input.status === "cancelled" || input.status === "declined";
  const updated = await tx.appointment.update({
    where: { id: appointmentId },
    data: {
      status: input.status,
      declineReason: input.declineReason?.trim() || row.declineReason,
      ...(ending ? { version: { increment: 1 } } : {}),
      statusHistory: { create: { clinicId, status: input.status, at: now, by: input.by ?? actor.name, note: input.note?.trim() || input.declineReason?.trim() || null } },
    },
    include: appointmentInclude,
  });
  if (ending) {
    await cancelPendingMessages(tx, appointmentId, `Appointment was ${input.status}`);
    if (input.status === "cancelled") {
      await tx.notification.create({ data: { clinicId, at: now, title: "Appointment cancelled", body: `${dbToWall(row.start).replace("T", " at ")}`, href: `/clinic/appointments?open=${appointmentId}` } });
    }
  }
  await audit(tx, actor, { action: `Set status to ${input.status}`, category: "booking", target: appointmentId, clinicId, details: input.declineReason ? "Declined with reason" : undefined });
  const appointment = toAppointment(updated, tokenFor(clinic, updated));
  let jobs: QueuedJob[] = [];
  if (!input.silent && (input.status === "cancelled" || input.status === "declined")) {
    jobs = await queueNotifications(tx, input.status, { clinic, appointment, reason, provider, now });
  }
  return { appointment, jobs };
}

export async function addNote(tx: Tx, clinicId: string, appointmentId: string, text: string, actor: Actor) {
  const row = await tx.appointment.findUnique({ where: { id: appointmentId }, select: { id: true } });
  if (!row) throw notFound("Appointment");
  await tx.appointmentNote.create({ data: { clinicId, appointmentId, by: actor.name, authorUserId: actor.id === "patient" ? null : actor.id, text: text.trim() } });
}

/** "Resend confirmation" and "Ask to confirm" buttons. */
export async function resendMessages(tx: Tx, clinicId: string, appointmentId: string, event: "resend" | "confirmation_request", actor: Actor): Promise<BookingResult> {
  const { row, clinic, reason, provider } = await loadAppointmentWithContext(tx, clinicId, appointmentId);
  const appointment = toAppointment(row, tokenFor(clinic, row));
  const jobs = await queueNotifications(tx, event, { clinic, appointment, reason, provider });
  await audit(tx, actor, { action: event === "resend" ? "Resent confirmation" : "Sent confirmation request", category: "booking", target: appointmentId, clinicId });
  return { appointment, jobs };
}

export { dayKey };
