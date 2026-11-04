import { addDays, addMinutes, differenceInCalendarDays, startOfDay } from "date-fns";
import type {
  Appointment,
  BookingRules,
  Blockout,
  Holiday,
  Operatory,
  Provider,
  Reason,
  SlotHold,
  Weekday,
  WeeklyHours,
} from "@/types";
import { dayKey, dayPart, fromWall, hm, minuteOfDay, overlaps, toWall, type DayPart } from "./time";

/**
 * Slot engine. Pure functions over clinic wall-clock Dates.
 *
 * A slot is bookable when ALL of these hold:
 *  - clinic is accepting patients, the day is inside the booking window and not a holiday
 *  - clinic open that weekday and the provider works that weekday (intersection of both)
 *  - provider is not on time off that day, slot does not touch a break
 *  - start >= now + min notice (reason.noticeOverrideHours wins over rules.minNoticeHours)
 *  - no blockout (clinic-wide, provider or operatory) overlaps
 *  - provider has no appointment or active hold overlapping [start - buffer, end + buffer]
 *  - if the reason needs a room: some operatory allowed for both reason and provider is active and free
 *  - the clinic's daily booking cap is not reached
 */

export const SLOT_HOLD_MINUTES = 5;
export const BLOCKING_STATUSES: Appointment["status"][] = ["unconfirmed", "confirmed", "complete", "no_show"];

export interface Slot {
  start: Date;
  end: Date;
  providerId: string;
  operatoryId?: string;
}

export interface SlotContext {
  reason: Reason;
  providers: Provider[]; // candidate providers (already filtered to the clinic)
  operatories: Operatory[];
  clinicHours: WeeklyHours;
  holidays: Holiday[];
  blockouts: Blockout[];
  appointments: Appointment[]; // clinic appointments (any status; non-blocking statuses ignored)
  holds: SlotHold[];
  rules: BookingRules;
  now: Date; // clinic wall-clock now
  /** Hold owned by the current session, ignored when checking conflicts. */
  sessionId?: string;
  /** Restrict to one provider ("First available" when undefined). */
  providerId?: string;
  /** Staff booking: ignore min notice, booking window, daily cap and online visibility. */
  staffOverride?: boolean;
  /** Appointment being rescheduled; it does not block itself. */
  ignoreAppointmentId?: string;
}

interface Busy {
  start: number; // epoch ms
  end: number;
}

function busyFor(ctx: SlotContext, nowMs: number) {
  const byProvider = new Map<string, Busy[]>();
  const byOperatory = new Map<string, Busy[]>();
  const add = (map: Map<string, Busy[]>, key: string | undefined, b: Busy) => {
    if (!key) return;
    const list = map.get(key);
    if (list) list.push(b);
    else map.set(key, [b]);
  };
  for (const a of ctx.appointments) {
    if (!BLOCKING_STATUSES.includes(a.status) || a.id === ctx.ignoreAppointmentId) continue;
    const b = { start: fromWall(a.start).getTime(), end: fromWall(a.end).getTime() };
    add(byProvider, a.providerId, b);
    add(byOperatory, a.operatoryId, b);
  }
  for (const h of ctx.holds) {
    if (h.expiresAt <= nowMs || (ctx.sessionId && h.sessionId === ctx.sessionId)) continue;
    const b = { start: fromWall(h.start).getTime(), end: fromWall(h.end).getTime() };
    add(byProvider, h.providerId, b);
    add(byOperatory, h.operatoryId, b);
  }
  return { byProvider, byOperatory };
}

function conflicts(list: Busy[] | undefined, start: number, end: number, bufferMs: number): boolean {
  if (!list) return false;
  return list.some((b) => overlaps(start - bufferMs, end + bufferMs, b.start, b.end));
}

export function countBookingsOnDay(appointments: Appointment[], day: Date, ignoreId?: string): number {
  const key = dayKey(day);
  return appointments.filter((a) => a.id !== ignoreId && a.start.slice(0, 10) === key && BLOCKING_STATUSES.includes(a.status)).length;
}

export function isDayInWindow(day: Date, ctx: Pick<SlotContext, "now" | "rules" | "staffOverride">): boolean {
  const diff = differenceInCalendarDays(startOfDay(day), startOfDay(ctx.now));
  if (diff < 0) return false;
  if (ctx.staffOverride) return true;
  return diff <= ctx.rules.bookingWindowDays;
}

/** Bookable providers for a reason: active, offer the reason, and (online) shown online. */
export function eligibleProviders(reason: Reason, providers: Provider[], staffOverride = false): Provider[] {
  return providers.filter(
    (p) => p.active && reason.providerIds.includes(p.id) && (staffOverride || p.showOnline),
  );
}

export function getSlotsForDay(day: Date, ctx: SlotContext, nowMs: number = Date.now()): Slot[] {
  const { reason, rules } = ctx;
  if (!rules.acceptingPatients && !ctx.staffOverride) return [];
  if (!reason.active) return [];
  if (!ctx.staffOverride && reason.visibility !== "online") return [];
  const d0 = startOfDay(day);
  if (!isDayInWindow(d0, ctx)) return [];
  const dk = dayKey(d0);
  if (ctx.holidays.some((h) => h.date === dk)) return [];
  const wd = d0.getDay() as Weekday;
  const clinicDay = ctx.clinicHours[wd];
  if (!clinicDay?.enabled) return [];
  if (!ctx.staffOverride && rules.dailyCap > 0 && countBookingsOnDay(ctx.appointments, d0, ctx.ignoreAppointmentId) >= rules.dailyCap) return [];

  const noticeHours = reason.noticeOverrideHours ?? rules.minNoticeHours;
  const earliest = ctx.staffOverride ? ctx.now.getTime() : ctx.now.getTime() + noticeHours * 3600000;
  const bufferMs = rules.bufferMinutes * 60000;
  const interval = Math.max(5, rules.slotInterval);
  const { byProvider, byOperatory } = busyFor(ctx, nowMs);

  let providers = eligibleProviders(reason, ctx.providers, ctx.staffOverride);
  if (ctx.providerId) providers = providers.filter((p) => p.id === ctx.providerId);

  const out: Slot[] = [];
  for (const p of providers) {
    const ph = p.weeklyHours[wd];
    if (!ph?.enabled) continue;
    if (p.timeOff.some((t) => dk >= t.start && dk <= t.end)) continue;
    const winStart = Math.max(hm(ph.start), hm(clinicDay.start));
    const winEnd = Math.min(hm(ph.end), hm(clinicDay.end));
    const breaks = p.breaks.filter((b) => b.weekday === "all" || b.weekday === wd);
    const rooms = reason.operatoryIds.length
      ? ctx.operatories.filter((o) => o.active && reason.operatoryIds.includes(o.id) && p.operatoryIds.includes(o.id))
      : [];
    if (reason.operatoryIds.length && rooms.length === 0) continue;

    for (let m = winStart; m + reason.duration <= winEnd; m += interval) {
      const start = addMinutes(d0, m);
      const end = addMinutes(start, reason.duration);
      const s = start.getTime();
      const e = end.getTime();
      if (s < earliest) continue;
      if (breaks.some((b) => overlaps(m, m + reason.duration, hm(b.start), hm(b.end)))) continue;
      if (
        ctx.blockouts.some((b) => {
          if (b.providerId && b.providerId !== p.id) return false;
          if (b.operatoryId && !rooms.some((r) => r.id === b.operatoryId)) return false;
          return overlaps(s, e, fromWall(b.start).getTime(), fromWall(b.end).getTime());
        })
      )
        continue;
      if (conflicts(byProvider.get(p.id), s, e, bufferMs)) continue;
      let operatoryId: string | undefined;
      if (rooms.length) {
        const free = rooms.find(
          (r) =>
            !conflicts(byOperatory.get(r.id), s, e, bufferMs) &&
            // an operatory-only blockout covering every room was handled above; check this room specifically
            !ctx.blockouts.some((b) => b.operatoryId === r.id && overlaps(s, e, fromWall(b.start).getTime(), fromWall(b.end).getTime())),
        );
        if (!free) continue;
        operatoryId = free.id;
      }
      out.push({ start, end, providerId: p.id, operatoryId });
    }
  }
  out.sort((a, b) => a.start.getTime() - b.start.getTime());
  return out;
}

/** "First available": one slot per start time, keeping the first provider in list order. */
export function firstAvailable(slots: Slot[]): Slot[] {
  const seen = new Set<number>();
  const out: Slot[] = [];
  for (const s of slots) {
    const t = s.start.getTime();
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(s);
  }
  return out;
}

export function groupByDayPart(slots: Slot[]): Record<DayPart, Slot[]> {
  const g: Record<DayPart, Slot[]> = { Morning: [], Afternoon: [], Evening: [] };
  for (const s of slots) g[dayPart(s.start)].push(s);
  return g;
}

/** Availability map for a range of days (for the month calendar). */
export function availableDays(from: Date, days: number, ctx: SlotContext, nowMs: number = Date.now()): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < days; i++) {
    const d = addDays(startOfDay(from), i);
    out[dayKey(d)] = firstAvailable(getSlotsForDay(d, ctx, nowMs)).length;
  }
  return out;
}

/** Is one specific slot still bookable (used at confirm time and for date-first flows)? */
export function isSlotAvailable(slot: { start: Date; providerId: string }, ctx: SlotContext, nowMs: number = Date.now()): Slot | null {
  const slots = getSlotsForDay(slot.start, { ...ctx, providerId: slot.providerId }, nowMs);
  return slots.find((s) => s.start.getTime() === slot.start.getTime()) ?? null;
}

export function createHold(slot: Slot, clinicId: string, sessionId: string, nowMs: number = Date.now()): SlotHold {
  return {
    id: `hold_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    clinicId,
    providerId: slot.providerId,
    operatoryId: slot.operatoryId,
    start: toWall(slot.start),
    end: toWall(slot.end),
    expiresAt: nowMs + SLOT_HOLD_MINUTES * 60000,
    sessionId,
  };
}

export function activeHolds(holds: SlotHold[], nowMs: number = Date.now()): SlotHold[] {
  return holds.filter((h) => h.expiresAt > nowMs);
}

export { minuteOfDay };
