import { describe, expect, it } from "vitest";
import type { Appointment, BookingRules, Operatory, Provider, Reason, WeeklyHours } from "@/types";
import {
  availableDays,
  createHold,
  firstAvailable,
  getSlotsForDay,
  groupByDayPart,
  isSlotAvailable,
  SLOT_HOLD_MINUTES,
  type SlotContext,
} from "./slots";
import { fmtTime, fromWall, toWall } from "./time";

// Monday 2026-11-09 is the test day. "now" is the previous Friday so min notice never interferes unless set.
const MONDAY = fromWall("2026-11-09T00:00");
const NOW = fromWall("2026-11-06T09:00");
const NOW_MS = Date.UTC(2026, 10, 6, 14, 0); // epoch used for hold expiry checks

function hours(start = "09:00", end = "12:00", days = [1, 2, 3, 4, 5]): WeeklyHours {
  const h = {} as WeeklyHours;
  for (let d = 0; d < 7; d++) h[d as 0] = { enabled: days.includes(d), start, end };
  return h;
}

const rules = (r: Partial<BookingRules> = {}): BookingRules => ({
  minNoticeHours: 0,
  bookingWindowDays: 60,
  slotInterval: 30,
  bufferMinutes: 0,
  dailyCap: 0,
  cancellationWindowHours: 24,
  acceptingPatients: true,
  pausedMessage: "",
  ...r,
});

function provider(id: string, p: Partial<Provider> = {}): Provider {
  return {
    id,
    clinicId: "c1",
    displayName: id,
    externalId: id,
    role: "Doctor",
    bio: "",
    weeklyHours: hours(),
    breaks: [],
    timeOff: [],
    operatoryIds: ["op1"],
    reasonIds: ["r1"],
    showOnline: true,
    active: true,
    color: "#000",
    ...p,
  };
}

const reason = (r: Partial<Reason> = {}): Reason => ({
  id: "r1",
  clinicId: "c1",
  name: "Exam",
  description: "",
  longDescription: "",
  duration: 30,
  patientType: "both",
  providerIds: ["p1"],
  operatoryIds: [],
  color: "#000",
  estimatedValue: 100,
  visibility: "online",
  active: true,
  order: 0,
  questions: [],
  ...r,
});

const op = (id: string, active = true): Operatory => ({ id, clinicId: "c1", name: id, active, providerIds: [], reasonIds: [] });

function appt(start: string, end: string, p: Partial<Appointment> = {}): Appointment {
  return {
    id: `a_${start}`,
    clinicId: "c1",
    createdAt: "2026-11-01T00:00:00Z",
    start,
    end,
    reasonId: "r1",
    providerId: "p1",
    patientType: "new",
    patient: { firstName: "A", lastName: "B", dob: "", phone: "", email: "" },
    bookingForSomeoneElse: false,
    insurance: { hasInsurance: false },
    answers: {},
    files: [],
    source: "website",
    utm: {},
    status: "confirmed",
    statusHistory: [],
    notes: [],
    smsConsent: { given: false },
    bookedBy: "patient",
    token: "t",
    ...p,
  };
}

function ctx(c: Partial<SlotContext> = {}): SlotContext {
  return {
    reason: reason(),
    providers: [provider("p1")],
    operatories: [op("op1")],
    clinicHours: hours("08:00", "18:00"),
    holidays: [],
    blockouts: [],
    appointments: [],
    holds: [],
    rules: rules(),
    now: NOW,
    ...c,
  };
}

const times = (c: SlotContext, day = MONDAY) => getSlotsForDay(day, c, NOW_MS).map((s) => fmtTime(s.start));

describe("provider hours and clinic hours", () => {
  it("generates slots inside provider hours at the slot interval", () => {
    expect(times(ctx())).toEqual(["9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM"]);
  });

  it("uses the intersection of clinic and provider hours", () => {
    expect(times(ctx({ clinicHours: hours("10:00", "11:00") }))).toEqual(["10:00 AM", "10:30 AM"]);
  });

  it("returns nothing when the clinic is closed or the provider is off that weekday", () => {
    expect(times(ctx({ clinicHours: hours("08:00", "18:00", [2, 3]) }))).toEqual([]);
    expect(times(ctx({ providers: [provider("p1", { weeklyHours: hours("09:00", "12:00", [2]) })] }))).toEqual([]);
  });

  it("does not let a visit run past the end of the day", () => {
    const c = ctx({ reason: reason({ duration: 60 }) });
    expect(times(c).at(-1)).toBe("11:00 AM");
  });

  it("respects the slot interval", () => {
    expect(times(ctx({ rules: rules({ slotInterval: 60 }) }))).toEqual(["9:00 AM", "10:00 AM", "11:00 AM"]);
  });
});

describe("breaks, time off, holidays and blockouts", () => {
  it("skips slots overlapping a break", () => {
    const p = provider("p1", { breaks: [{ id: "b", weekday: "all", start: "10:00", end: "10:30", label: "Coffee" }] });
    expect(times(ctx({ providers: [p] }))).toEqual(["9:00 AM", "9:30 AM", "10:30 AM", "11:00 AM", "11:30 AM"]);
  });

  it("only applies weekday-specific breaks on that weekday", () => {
    const p = provider("p1", { breaks: [{ id: "b", weekday: 2, start: "09:00", end: "12:00", label: "Tue admin" }] });
    expect(times(ctx({ providers: [p] }))).toHaveLength(6);
  });

  it("skips days covered by provider time off", () => {
    const p = provider("p1", { timeOff: [{ id: "t", start: "2026-11-08", end: "2026-11-10", reason: "Vacation" }] });
    expect(times(ctx({ providers: [p] }))).toEqual([]);
  });

  it("skips clinic holidays", () => {
    expect(times(ctx({ holidays: [{ id: "h", date: "2026-11-09", name: "Holiday" }] }))).toEqual([]);
  });

  it("skips clinic-wide and provider blockouts", () => {
    const clinicWide = ctx({ blockouts: [{ id: "x", label: "Staff meeting", start: "2026-11-09T09:00", end: "2026-11-09T10:00" }] });
    expect(times(clinicWide)[0]).toBe("10:00 AM");
    const otherProvider = ctx({ blockouts: [{ id: "x", label: "", start: "2026-11-09T09:00", end: "2026-11-09T12:00", providerId: "p2" }] });
    expect(times(otherProvider)).toHaveLength(6);
  });
});

describe("existing appointments, buffers and operatories", () => {
  it("does not offer times overlapping the provider's appointments", () => {
    const c = ctx({ appointments: [appt("2026-11-09T09:30", "2026-11-09T10:30")] });
    expect(times(c)).toEqual(["9:00 AM", "10:30 AM", "11:00 AM", "11:30 AM"]);
  });

  it("ignores cancelled and declined appointments", () => {
    const c = ctx({ appointments: [appt("2026-11-09T09:30", "2026-11-09T10:30", { status: "cancelled" }), appt("2026-11-09T11:00", "2026-11-09T11:30", { status: "declined" })] });
    expect(times(c)).toHaveLength(6);
  });

  it("applies the buffer between visits", () => {
    const c = ctx({ rules: rules({ bufferMinutes: 15, slotInterval: 15 }), appointments: [appt("2026-11-09T10:00", "2026-11-09T10:30")] });
    const t = times(c);
    expect(t).not.toContain("9:30 AM"); // would end at 10:00, buffer pushes it to 10:15
    expect(t).toContain("9:15 AM");
    expect(t).not.toContain("10:30 AM");
    expect(t).toContain("10:45 AM");
  });

  it("requires a free, active operatory when the reason uses rooms", () => {
    const r = reason({ operatoryIds: ["op1"] });
    const busyRoom = ctx({
      reason: r,
      providers: [provider("p1"), provider("p2")],
      appointments: [appt("2026-11-09T09:00", "2026-11-09T09:30", { providerId: "p2", operatoryId: "op1" })],
    });
    expect(times(busyRoom)).not.toContain("9:00 AM");
    expect(times(ctx({ reason: r, operatories: [op("op1", false)] }))).toEqual([]);
  });

  it("picks another room when the first one is taken", () => {
    const r = reason({ operatoryIds: ["op1", "op2"] });
    const p = provider("p1", { operatoryIds: ["op1", "op2"] });
    const c = ctx({ reason: r, providers: [p], operatories: [op("op1"), op("op2")], appointments: [appt("2026-11-09T09:00", "2026-11-09T09:30", { providerId: "pX", operatoryId: "op1" })] });
    const first = getSlotsForDay(MONDAY, c, NOW_MS)[0];
    expect(fmtTime(first.start)).toBe("9:00 AM");
    expect(first.operatoryId).toBe("op2");
  });
});

describe("booking rules", () => {
  it("enforces minimum notice", () => {
    const c = ctx({ now: fromWall("2026-11-09T08:00"), rules: rules({ minNoticeHours: 2 }) });
    expect(times(c)[0]).toBe("10:00 AM");
  });

  it("reason notice override beats the clinic rule", () => {
    const c = ctx({ now: fromWall("2026-11-09T08:00"), rules: rules({ minNoticeHours: 24 }), reason: reason({ noticeOverrideHours: 0 }) });
    expect(times(c)[0]).toBe("9:00 AM");
  });

  it("enforces the booking window", () => {
    expect(times(ctx({ rules: rules({ bookingWindowDays: 2 }) }))).toEqual([]);
    expect(times(ctx({ rules: rules({ bookingWindowDays: 3 }) }))).toHaveLength(6);
  });

  it("never offers past days", () => {
    expect(times(ctx({ now: fromWall("2026-11-10T08:00") }))).toEqual([]);
  });

  it("enforces the daily booking cap", () => {
    const appts = [appt("2026-11-09T14:00", "2026-11-09T14:30", { providerId: "p9" }), appt("2026-11-09T15:00", "2026-11-09T15:30", { providerId: "p9" })];
    expect(times(ctx({ appointments: appts, rules: rules({ dailyCap: 2 }) }))).toEqual([]);
    expect(times(ctx({ appointments: appts, rules: rules({ dailyCap: 3 }) }))).toHaveLength(6);
  });

  it("returns nothing while the clinic is not accepting patients", () => {
    expect(times(ctx({ rules: rules({ acceptingPatients: false }) }))).toEqual([]);
  });

  it("staff override ignores notice, window and cap", () => {
    const c = ctx({ now: fromWall("2026-11-09T08:00"), rules: rules({ minNoticeHours: 48, bookingWindowDays: 0, dailyCap: 1 }), appointments: [appt("2026-11-09T16:00", "2026-11-09T16:30", { providerId: "p9" })], staffOverride: true });
    expect(times(c)).toHaveLength(6);
  });

  it("hides staff-only reasons and providers not shown online", () => {
    expect(times(ctx({ reason: reason({ visibility: "staff_only" }) }))).toEqual([]);
    expect(times(ctx({ providers: [provider("p1", { showOnline: false })] }))).toEqual([]);
    expect(times(ctx({ providers: [provider("p1", { showOnline: false })], staffOverride: true }))).toHaveLength(6);
  });
});

describe("5 minute slot hold", () => {
  const slot = { start: fromWall("2026-11-09T09:00"), end: fromWall("2026-11-09T09:30"), providerId: "p1" };

  it("blocks the slot for other sessions until it expires", () => {
    const hold = createHold(slot, "c1", "session-A", NOW_MS);
    expect(hold.expiresAt - NOW_MS).toBe(SLOT_HOLD_MINUTES * 60000);
    const other = ctx({ holds: [hold], sessionId: "session-B" });
    expect(times(other)).not.toContain("9:00 AM");
    const owner = ctx({ holds: [hold], sessionId: "session-A" });
    expect(times(owner)).toContain("9:00 AM");
    const later = getSlotsForDay(MONDAY, other, NOW_MS + 5 * 60000 + 1).map((s) => fmtTime(s.start));
    expect(later).toContain("9:00 AM");
  });

  it("isSlotAvailable re-checks a specific slot", () => {
    expect(isSlotAvailable(slot, ctx(), NOW_MS)).not.toBeNull();
    expect(isSlotAvailable(slot, ctx({ appointments: [appt("2026-11-09T09:00", "2026-11-09T09:30")] }), NOW_MS)).toBeNull();
  });
});

describe("first available, grouping and calendar", () => {
  it("merges providers into one slot per time", () => {
    const c = ctx({ reason: reason({ providerIds: ["p1", "p2"] }), providers: [provider("p1"), provider("p2", { weeklyHours: hours("11:00", "14:00") })], clinicHours: hours("08:00", "18:00") });
    const all = getSlotsForDay(MONDAY, c, NOW_MS);
    const merged = firstAvailable(all);
    expect(all.length).toBeGreaterThan(merged.length);
    expect(new Set(merged.map((s) => s.start.getTime())).size).toBe(merged.length);
  });

  it("groups slots by morning, afternoon and evening", () => {
    const c = ctx({ providers: [provider("p1", { weeklyHours: hours("08:00", "20:00") })], clinicHours: hours("08:00", "20:00"), rules: rules({ slotInterval: 60 }) });
    const g = groupByDayPart(getSlotsForDay(MONDAY, c, NOW_MS));
    expect(g.Morning.map((s) => toWall(s.start).slice(11))).toEqual(["08:00", "09:00", "10:00", "11:00"]);
    expect(g.Afternoon).toHaveLength(5);
    expect(g.Evening.map((s) => toWall(s.start).slice(11))).toEqual(["17:00", "18:00", "19:00"]);
  });

  it("builds a per-day availability map", () => {
    const map = availableDays(fromWall("2026-11-08T00:00"), 3, ctx(), NOW_MS);
    expect(map).toEqual({ "2026-11-08": 0, "2026-11-09": 6, "2026-11-10": 6 });
  });
});
