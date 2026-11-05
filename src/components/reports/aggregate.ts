import { addDays, differenceInMinutes, format, startOfDay, startOfWeek } from "date-fns";
import type { AdSpend, Appointment, Clinic, Provider, Reason, Source, StepKey, Weekday, WidgetSession } from "@/types";
import { SOURCE_LABELS } from "@/types";
import { eachDay, inRange, type DateRange } from "@/lib/range";
import { dayKey, fromWall, hm, overlaps } from "@/lib/time";
import { pct } from "@/lib/utils";

/**
 * Pure report aggregations for Form Analytics (5.8) and Performance (5.9).
 * Inputs are already scoped to one clinic. No PHI is read or returned.
 */

export const FUNNEL_STEPS: StepKey[] = ["reason", "provider", "datetime", "details", "review"];
export const STEP_LABELS: Record<StepKey, string> = {
  reason: "Reason for visit",
  provider: "Provider",
  datetime: "Date and time",
  details: "Patient details",
  insurance: "Insurance",
  intake: "Intake questions",
  review: "Review and confirm",
};
export const REPORT_SOURCES: Source[] = ["google_ads", "gbp", "rwg", "website", "custom", "direct", "staff"];
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function sessionDate(s: WidgetSession): Date {
  return new Date(s.at);
}

export function filterSessions(sessions: WidgetSession[], range: DateRange, source: Source | "all"): WidgetSession[] {
  return sessions.filter((s) => inRange(sessionDate(s), range) && (source === "all" || s.source === source));
}

export interface FormTotals {
  visits: number;
  booked: number;
  dropOffs: number;
  conversion: number;
}
export function formTotals(sessions: WidgetSession[]): FormTotals {
  const booked = sessions.filter((s) => s.booked).length;
  return { visits: sessions.length, booked, dropOffs: sessions.length - booked, conversion: pct(booked, sessions.length) };
}

export interface StepDropRow {
  step: StepKey;
  label: string;
  reached: number;
  dropped: number;
  dropPct: number;
}
const RANK: Record<StepKey, number> = { reason: 0, provider: 1, datetime: 2, details: 3, insurance: 3, intake: 3, review: 4 };

/** Drop-off by step: sessions whose furthest step was X and did not book. */
export function dropOffByStep(sessions: WidgetSession[]): StepDropRow[] {
  return FUNNEL_STEPS.map((step) => {
    const reached = sessions.filter((s) => s.booked || RANK[s.furthestStep] >= RANK[step]).length;
    const dropped = sessions.filter((s) => !s.booked && RANK[s.furthestStep] === RANK[step] && (step !== "details" || ["details", "insurance", "intake"].includes(s.furthestStep))).length;
    return { step, label: STEP_LABELS[step], reached, dropped, dropPct: pct(dropped, sessions.length) };
  });
}

export interface ReasonDropRow {
  reasonId: string;
  name: string;
  visits: number;
  booked: number;
  dropped: number;
  dropPct: number;
  conversion: number;
}
export function dropOffByReason(sessions: WidgetSession[], reasons: Reason[]): ReasonDropRow[] {
  const map = new Map<string, { visits: number; booked: number }>();
  for (const s of sessions) {
    const k = s.reasonId ?? "__none";
    const r = map.get(k) ?? { visits: 0, booked: 0 };
    r.visits++;
    if (s.booked) r.booked++;
    map.set(k, r);
  }
  return [...map.entries()]
    .map(([reasonId, v]) => ({
      reasonId,
      name: reasonId === "__none" ? "Left before choosing a reason" : (reasons.find((r) => r.id === reasonId)?.name ?? "Unknown reason"),
      visits: v.visits,
      booked: v.booked,
      dropped: v.visits - v.booked,
      dropPct: pct(v.visits - v.booked, v.visits),
      conversion: pct(v.booked, v.visits),
    }))
    .sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name));
}

export type Heatmap = number[][]; // [weekday][hour]
export function heatmap(sessions: WidgetSession[], bookedOnly = false): Heatmap {
  const grid: Heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const s of sessions) {
    if (bookedOnly && !s.booked) continue;
    grid[s.localWeekday][s.localHour]++;
  }
  return grid;
}

export function peaks(grid: Heatmap, top = 3): { weekday: Weekday; hour: number; count: number }[] {
  const cells: { weekday: Weekday; hour: number; count: number }[] = [];
  grid.forEach((row, d) => row.forEach((count, hour) => count > 0 && cells.push({ weekday: d as Weekday, hour, count })));
  return cells.sort((a, b) => b.count - a.count).slice(0, top);
}

export function peakDay(grid: Heatmap): { weekday: Weekday; count: number } | null {
  let best: { weekday: Weekday; count: number } | null = null;
  grid.forEach((row, d) => {
    const c = row.reduce((s, x) => s + x, 0);
    if (c > 0 && (!best || c > best.count)) best = { weekday: d as Weekday, count: c };
  });
  return best;
}

export function hourLabel(h: number): string {
  const ampm = h < 12 ? "am" : "pm";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${ampm}`;
}

// ---------------- Performance ----------------

export const apptStart = (a: Appointment) => fromWall(a.start);
export const apptCreated = (a: Appointment) => new Date(a.createdAt);

export interface Overview {
  bookings: number;
  completed: number;
  cancelled: number;
  noShows: number;
  showRate: number;
}
/** Overview by appointment date in range. Declined requests are not bookings. */
export function overview(appts: Appointment[], range: DateRange): Overview {
  const list = appts.filter((a) => inRange(apptStart(a), range) && a.status !== "declined");
  const completed = list.filter((a) => a.status === "complete").length;
  const noShows = list.filter((a) => a.status === "no_show").length;
  return {
    bookings: list.length,
    completed,
    cancelled: list.filter((a) => a.status === "cancelled").length,
    noShows,
    showRate: pct(completed, completed + noShows),
  };
}

export interface SourceRow {
  source: Source;
  label: string;
  visits: number;
  bookings: number;
  conversion: number;
  completed: number;
}
/** By source: widget visits and bookings created in the range. */
export function bySource(appts: Appointment[], sessions: WidgetSession[], range: DateRange): SourceRow[] {
  return REPORT_SOURCES.map((source) => {
    const visits = sessions.filter((s) => s.source === source && inRange(sessionDate(s), range)).length;
    const booked = appts.filter((a) => a.source === source && inRange(apptCreated(a), range) && a.status !== "declined");
    return {
      source,
      label: SOURCE_LABELS[source],
      visits,
      bookings: booked.length,
      conversion: source === "staff" ? 0 : pct(booked.length, visits),
      completed: booked.filter((a) => a.status === "complete").length,
    };
  });
}

export interface RoiRow {
  month: string;
  source: Source;
  spend: number;
  bookings: number;
  completed: number;
  costPerBooking: number | null;
  costPerCompleted: number | null;
}
export function adRoi(appts: Appointment[], spend: AdSpend[]): RoiRow[] {
  return spend
    .map((s) => {
      const list = appts.filter((a) => a.source === s.source && format(apptCreated(a), "yyyy-MM") === s.month && a.status !== "declined");
      const completed = list.filter((a) => a.status === "complete").length;
      return {
        month: s.month,
        source: s.source,
        spend: s.amount,
        bookings: list.length,
        completed,
        costPerBooking: list.length ? Math.round((s.amount / list.length) * 100) / 100 : null,
        costPerCompleted: completed ? Math.round((s.amount / completed) * 100) / 100 : null,
      };
    })
    .sort((a, b) => b.month.localeCompare(a.month) || a.source.localeCompare(b.source));
}

export interface PatientPoint {
  label: string;
  newPatients: number;
  returning: number;
}
/** New vs returning trend by appointment date, bucketed by day (<=31 days) or week. */
export function patientTrend(appts: Appointment[], range: DateRange): PatientPoint[] {
  const days = eachDay(range);
  const weekly = days.length > 31;
  const buckets = new Map<string, PatientPoint>();
  for (const d of days) {
    const key = weekly ? dayKey(startOfWeek(d, { weekStartsOn: 1 })) : dayKey(d);
    if (!buckets.has(key)) buckets.set(key, { label: format(weekly ? startOfWeek(d, { weekStartsOn: 1 }) : d, "MMM d"), newPatients: 0, returning: 0 });
  }
  for (const a of appts) {
    const d = apptStart(a);
    if (!inRange(d, range) || a.status === "declined") continue;
    const key = weekly ? dayKey(startOfWeek(d, { weekStartsOn: 1 })) : dayKey(d);
    const b = buckets.get(key);
    if (!b) continue;
    if (a.patientType === "new") b.newPatients++;
    else b.returning++;
  }
  return [...buckets.values()];
}

export function newPatientCount(appts: Appointment[], range: DateRange): number {
  return appts.filter((a) => a.patientType === "new" && a.status !== "declined" && inRange(apptStart(a), range)).length;
}

export interface ReasonRow {
  reasonId: string;
  name: string;
  bookings: number;
  completed: number;
  completionRate: number;
  estimatedValue: number;
}
/** Completion rate = complete / (complete + no-show + cancelled) among visits already past. */
export function byReason(appts: Appointment[], reasons: Reason[], range: DateRange, now: Date): ReasonRow[] {
  return reasons
    .map((r) => {
      const list = appts.filter((a) => a.reasonId === r.id && a.status !== "declined" && inRange(apptStart(a), range));
      const past = list.filter((a) => apptStart(a) < now);
      const completed = past.filter((a) => a.status === "complete").length;
      const resolved = past.filter((a) => ["complete", "no_show", "cancelled"].includes(a.status)).length;
      return {
        reasonId: r.id,
        name: r.name,
        bookings: list.length,
        completed,
        completionRate: pct(completed, resolved),
        estimatedValue: list.filter((a) => a.status !== "cancelled" && a.status !== "no_show").length * r.estimatedValue,
      };
    })
    .sort((a, b) => b.bookings - a.bookings);
}

/** Available minutes for a provider on a day (provider hours ∩ clinic hours, minus breaks, time off and holidays). */
export function availableMinutes(p: Provider, clinic: Pick<Clinic, "hours" | "holidays">, day: Date): number {
  const wd = day.getDay() as Weekday;
  const ph = p.weeklyHours[wd];
  const ch = clinic.hours[wd];
  if (!p.active || !ph?.enabled || !ch?.enabled) return 0;
  const dk = dayKey(day);
  if (clinic.holidays.some((h) => h.date === dk)) return 0;
  if (p.timeOff.some((t) => dk >= t.start && dk <= t.end)) return 0;
  const s = Math.max(hm(ph.start), hm(ch.start));
  const e = Math.min(hm(ph.end), hm(ch.end));
  if (e <= s) return 0;
  let mins = e - s;
  for (const b of p.breaks) {
    if (b.weekday !== "all" && b.weekday !== wd) continue;
    const bs = Math.max(s, hm(b.start));
    const be = Math.min(e, hm(b.end));
    if (overlaps(s, e, bs, be)) mins -= be - bs;
  }
  return Math.max(0, mins);
}

const BOOKED_STATUSES: Appointment["status"][] = ["unconfirmed", "confirmed", "complete", "no_show"];
function bookedMinutes(list: Appointment[]): number {
  return list.reduce((s, a) => s + Math.max(0, differenceInMinutes(fromWall(a.end), fromWall(a.start))), 0);
}

export interface ProviderRow {
  providerId: string;
  name: string;
  bookings: number;
  bookedHours: number;
  availableHours: number;
  utilization: number;
  completionRate: number;
}
export function byProvider(appts: Appointment[], providers: Provider[], clinic: Pick<Clinic, "hours" | "holidays">, range: DateRange, now: Date): ProviderRow[] {
  const days = eachDay(range);
  return providers
    .filter((p) => p.active)
    .map((p) => {
      const list = appts.filter((a) => a.providerId === p.id && a.status !== "declined" && inRange(apptStart(a), range));
      const booked = bookedMinutes(list.filter((a) => BOOKED_STATUSES.includes(a.status)));
      const available = days.reduce((s, d) => s + availableMinutes(p, clinic, d), 0);
      const past = list.filter((a) => apptStart(a) < now);
      const completed = past.filter((a) => a.status === "complete").length;
      const resolved = past.filter((a) => ["complete", "no_show", "cancelled"].includes(a.status)).length;
      return {
        providerId: p.id,
        name: p.displayName,
        bookings: list.length,
        bookedHours: Math.round((booked / 60) * 10) / 10,
        availableHours: Math.round((available / 60) * 10) / 10,
        utilization: pct(booked, available),
        completionRate: pct(completed, resolved),
      };
    })
    .sort((a, b) => b.bookings - a.bookings);
}

/** Average hours between booking and visit for bookings created in range. */
export function avgLeadTimeHours(appts: Appointment[], range: DateRange): number {
  const list = appts.filter((a) => inRange(apptCreated(a), range) && a.status !== "declined");
  if (!list.length) return 0;
  const total = list.reduce((s, a) => s + Math.max(0, apptStart(a).getTime() - apptCreated(a).getTime()), 0);
  return Math.round((total / list.length / 3600000) * 10) / 10;
}

/** Fill rate for the next `days` days from `now`: booked minutes / available minutes across providers. */
export function fillRate(appts: Appointment[], providers: Provider[], clinic: Pick<Clinic, "hours" | "holidays">, now: Date, days: number): number {
  const from = startOfDay(now);
  const to = addDays(from, days);
  const list = appts.filter((a) => BOOKED_STATUSES.includes(a.status) && apptStart(a) >= from && apptStart(a) < to);
  let available = 0;
  for (let i = 0; i < days; i++) for (const p of providers) available += availableMinutes(p, clinic, addDays(from, i));
  return pct(bookedMinutes(list), available);
}
