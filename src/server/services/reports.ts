import { addDays, differenceInCalendarDays, format, startOfDay, startOfWeek } from "date-fns";
import type { AdSpend, Provider, Source, StepKey, Weekday } from "@/types";
import { SOURCE_LABELS } from "@/types";
import { eachDay, previousRange, type DateRange } from "@/lib/range";
import { dayKey, fromWall, nowInZone } from "@/lib/time";
import { zonedWallToUtc } from "@/lib/tz";
import { change, pct } from "@/lib/utils";
import { availableMinutes, FUNNEL_STEPS, REPORT_SOURCES, STEP_LABELS, type Heatmap, type Overview, type PatientPoint, type ProviderRow, type ReasonDropRow, type ReasonRow, type RoiRow, type SourceRow, type StepDropRow } from "@/components/reports/aggregate";
import type { HomeMetrics } from "@/components/home/metrics";
import type { Tx } from "../db";
import { toAdSpend, toProvider, providerInclude, wallToDb } from "../mappers";
import { loadClinic } from "./clinic";

/**
 * Report aggregations in SQL (step 8). Ranges are clinic-local days ("YYYY-MM-DD", inclusive). Appointment
 * times are wall-clock timestamps; booking (created_at) and widget-visit (at) instants are compared against the
 * range converted to UTC with the clinic time zone. Shapes match the Phase 1 aggregators in
 * src/components/reports/aggregate.ts and src/components/home/metrics.ts, which the parity tests compare against.
 */
export interface DayRange {
  from: string;
  to: string;
}

const n = (v: unknown) => Number(v ?? 0);

function wallBounds(r: DayRange) {
  return { start: wallToDb(`${r.from}T00:00`), end: wallToDb(`${addDayKey(r.to, 1)}T00:00`) };
}
function instantBounds(r: DayRange, tz: string) {
  return { start: zonedWallToUtc(`${r.from}T00:00`, tz), end: zonedWallToUtc(`${addDayKey(r.to, 1)}T00:00`, tz) };
}
export function addDayKey(day: string, days: number): string {
  return dayKey(addDays(fromWall(`${day}T00:00`), days));
}
export function toDateRange(r: DayRange): DateRange {
  return { from: fromWall(`${r.from}T00:00`), to: new Date(fromWall(`${r.to}T00:00`).getTime() + 86_399_999) };
}
export function previousDayRange(r: DayRange): DayRange {
  const p = previousRange(toDateRange(r));
  return { from: dayKey(p.from), to: dayKey(p.to) };
}

// ---------------------------------------------------------------- home (5.1)

export async function homeReport(tx: Tx, clinicId: string, r: DayRange): Promise<HomeMetrics> {
  const cur = wallBounds(r);
  const prev = wallBounds(previousDayRange(r));
  const rows = await tx.$queryRaw<{ status: string; patient_type: string; day: string; hour: number; c: bigint }[]>`
    SELECT status, patient_type, to_char(start, 'YYYY-MM-DD') AS day, extract(hour FROM start)::int AS hour, count(*) AS c
    FROM appointments WHERE clinic_id = ${clinicId} AND start >= ${cur.start} AND start < ${cur.end} AND status <> 'declined'
    GROUP BY 1, 2, 3, 4`;
  const [{ c: previous }] = await tx.$queryRaw<{ c: bigint }[]>`
    SELECT count(*) AS c FROM appointments WHERE clinic_id = ${clinicId} AND start >= ${prev.start} AND start < ${prev.end} AND status <> 'declined'`;
  const total = rows.reduce((s, x) => s + n(x.c), 0);
  const singleDay = r.from === r.to;
  let trend: HomeMetrics["trend"];
  if (singleDay) {
    const byHour = new Map<number, number>();
    for (const x of rows) byHour.set(x.hour, (byHour.get(x.hour) ?? 0) + n(x.c));
    trend = Array.from({ length: 13 }, (_, i) => i + 7).map((h) => ({ label: format(new Date(2000, 0, 1, h), "ha"), current: byHour.get(h) ?? 0 }));
  } else {
    const byDay = new Map<string, number>();
    for (const x of rows) byDay.set(x.day, (byDay.get(x.day) ?? 0) + n(x.c));
    trend = eachDay(toDateRange(r)).map((d) => ({ label: format(d, "MMM d"), current: byDay.get(dayKey(d)) ?? 0 }));
  }
  const byStatus: Record<string, number> = {};
  let newCount = 0;
  let returningCount = 0;
  for (const x of rows) {
    byStatus[x.status] = (byStatus[x.status] ?? 0) + n(x.c);
    if (x.patient_type === "new") newCount += n(x.c);
    else returningCount += n(x.c);
  }
  return { total, previous: n(previous), changePct: change(total, n(previous)), trend, newCount, returningCount, byStatus };
}

// ---------------------------------------------------------------- performance (5.9)

export async function overviewReport(tx: Tx, clinicId: string, r: DayRange): Promise<Overview> {
  const b = wallBounds(r);
  const rows = await tx.$queryRaw<{ status: string; c: bigint }[]>`
    SELECT status, count(*) AS c FROM appointments WHERE clinic_id = ${clinicId} AND start >= ${b.start} AND start < ${b.end} AND status <> 'declined' GROUP BY 1`;
  const get = (s: string) => n(rows.find((x) => x.status === s)?.c);
  const completed = get("complete");
  const noShows = get("no_show");
  return { bookings: rows.reduce((s, x) => s + n(x.c), 0), completed, cancelled: get("cancelled"), noShows, showRate: pct(completed, completed + noShows) };
}

export async function bySourceReport(tx: Tx, clinicId: string, tz: string, r: DayRange): Promise<SourceRow[]> {
  const b = instantBounds(r, tz);
  const [visits, bookings] = await Promise.all([
    tx.$queryRaw<{ source: string; c: bigint }[]>`SELECT source, count(*) AS c FROM widget_sessions WHERE clinic_id = ${clinicId} AND at >= ${b.start} AND at < ${b.end} GROUP BY 1`,
    tx.$queryRaw<{ source: string; c: bigint; done: bigint }[]>`
      SELECT source, count(*) AS c, count(*) FILTER (WHERE status = 'complete') AS done FROM appointments
      WHERE clinic_id = ${clinicId} AND created_at >= ${b.start} AND created_at < ${b.end} AND status <> 'declined' GROUP BY 1`,
  ]);
  return REPORT_SOURCES.map((source) => {
    const v = n(visits.find((x) => x.source === source)?.c);
    const bk = bookings.find((x) => x.source === source);
    return { source, label: SOURCE_LABELS[source], visits: v, bookings: n(bk?.c), conversion: source === "staff" ? 0 : pct(n(bk?.c), v), completed: n(bk?.done) };
  });
}

export async function adRoiReport(tx: Tx, clinicId: string, tz: string): Promise<RoiRow[]> {
  const spend: AdSpend[] = (await tx.adSpend.findMany()).map(toAdSpend);
  if (!spend.length) return [];
  const rows = await tx.$queryRaw<{ month: string; source: string; c: bigint; done: bigint }[]>`
    SELECT to_char(created_at AT TIME ZONE ${tz}, 'YYYY-MM') AS month, source, count(*) AS c, count(*) FILTER (WHERE status = 'complete') AS done
    FROM appointments WHERE clinic_id = ${clinicId} AND status <> 'declined' GROUP BY 1, 2`;
  return spend
    .map((s) => {
      const m = rows.find((x) => x.month === s.month && x.source === s.source);
      const bookings = n(m?.c);
      const completed = n(m?.done);
      return { month: s.month, source: s.source, spend: s.amount, bookings, completed, costPerBooking: bookings ? Math.round((s.amount / bookings) * 100) / 100 : null, costPerCompleted: completed ? Math.round((s.amount / completed) * 100) / 100 : null };
    })
    .sort((a, b) => b.month.localeCompare(a.month) || a.source.localeCompare(b.source));
}

export async function patientTrendReport(tx: Tx, clinicId: string, r: DayRange): Promise<{ trend: PatientPoint[]; newPatients: number }> {
  const b = wallBounds(r);
  const rows = await tx.$queryRaw<{ day: string; patient_type: string; c: bigint }[]>`
    SELECT to_char(start, 'YYYY-MM-DD') AS day, patient_type, count(*) AS c FROM appointments
    WHERE clinic_id = ${clinicId} AND start >= ${b.start} AND start < ${b.end} AND status <> 'declined' GROUP BY 1, 2`;
  const days = eachDay(toDateRange(r));
  const weekly = days.length > 31;
  const buckets = new Map<string, PatientPoint>();
  const keyOf = (d: Date) => (weekly ? dayKey(startOfWeek(d, { weekStartsOn: 1 })) : dayKey(d));
  for (const d of days) {
    const key = keyOf(d);
    if (!buckets.has(key)) buckets.set(key, { label: format(weekly ? startOfWeek(d, { weekStartsOn: 1 }) : d, "MMM d"), newPatients: 0, returning: 0 });
  }
  let newPatients = 0;
  for (const x of rows) {
    const bkt = buckets.get(keyOf(fromWall(`${x.day}T00:00`)));
    if (!bkt) continue;
    if (x.patient_type === "new") {
      bkt.newPatients += n(x.c);
      newPatients += n(x.c);
    } else bkt.returning += n(x.c);
  }
  return { trend: [...buckets.values()], newPatients };
}

export async function byReasonReport(tx: Tx, clinicId: string, r: DayRange, now: Date): Promise<ReasonRow[]> {
  const b = wallBounds(r);
  const nowWall = wallToDb(format(now, "yyyy-MM-dd'T'HH:mm"));
  const rows = await tx.$queryRaw<{ id: string; name: string; estimated_value: number; bookings: bigint; completed: bigint; resolved: bigint; valued: bigint }[]>`
    SELECT r.id, r.name, r.estimated_value,
      count(a.id) AS bookings,
      count(a.id) FILTER (WHERE a.start < ${nowWall} AND a.status = 'complete') AS completed,
      count(a.id) FILTER (WHERE a.start < ${nowWall} AND a.status IN ('complete', 'no_show', 'cancelled')) AS resolved,
      count(a.id) FILTER (WHERE a.status NOT IN ('cancelled', 'no_show')) AS valued
    FROM reasons r LEFT JOIN appointments a ON a.reason_id = r.id AND a.clinic_id = r.clinic_id AND a.start >= ${b.start} AND a.start < ${b.end} AND a.status <> 'declined'
    WHERE r.clinic_id = ${clinicId} GROUP BY r.id, r.name, r.estimated_value, r.order ORDER BY r.order`;
  return rows
    .map((x) => ({ reasonId: x.id, name: x.name, bookings: n(x.bookings), completed: n(x.completed), completionRate: pct(n(x.completed), n(x.resolved)), estimatedValue: n(x.valued) * x.estimated_value }))
    .sort((a, b2) => b2.bookings - a.bookings);
}

export async function byProviderReport(tx: Tx, clinicId: string, r: DayRange, now: Date, providers: Provider[], clinic: { hours: Provider["weeklyHours"]; holidays: { date: string }[] }): Promise<ProviderRow[]> {
  const b = wallBounds(r);
  const nowWall = wallToDb(format(now, "yyyy-MM-dd'T'HH:mm"));
  const rows = await tx.$queryRaw<{ provider_id: string; bookings: bigint; booked_min: number | null; completed: bigint; resolved: bigint }[]>`
    SELECT provider_id, count(*) AS bookings,
      sum(extract(epoch FROM ("end" - start)) / 60) FILTER (WHERE status IN ('unconfirmed', 'confirmed', 'complete', 'no_show')) AS booked_min,
      count(*) FILTER (WHERE start < ${nowWall} AND status = 'complete') AS completed,
      count(*) FILTER (WHERE start < ${nowWall} AND status IN ('complete', 'no_show', 'cancelled')) AS resolved
    FROM appointments WHERE clinic_id = ${clinicId} AND start >= ${b.start} AND start < ${b.end} AND status <> 'declined' GROUP BY 1`;
  const days = eachDay(toDateRange(r));
  return providers
    .filter((p) => p.active)
    .map((p) => {
      const x = rows.find((y) => y.provider_id === p.id);
      const booked = n(x?.booked_min);
      const available = days.reduce((s, d) => s + availableMinutes(p, clinic as never, d), 0);
      return { providerId: p.id, name: p.displayName, bookings: n(x?.bookings), bookedHours: Math.round((booked / 60) * 10) / 10, availableHours: Math.round((available / 60) * 10) / 10, utilization: pct(booked, available), completionRate: pct(n(x?.completed), n(x?.resolved)) };
    })
    .sort((a, b2) => b2.bookings - a.bookings);
}

export async function avgLeadTimeReport(tx: Tx, clinicId: string, tz: string, r: DayRange): Promise<number> {
  const b = instantBounds(r, tz);
  const [row] = await tx.$queryRaw<{ avg_h: number | null }[]>`
    SELECT avg(greatest(0, extract(epoch FROM ((start AT TIME ZONE ${tz}) - created_at)) / 3600)) AS avg_h
    FROM appointments WHERE clinic_id = ${clinicId} AND created_at >= ${b.start} AND created_at < ${b.end} AND status <> 'declined'`;
  return Math.round(n(row?.avg_h) * 10) / 10;
}

export async function fillRateReport(tx: Tx, clinicId: string, now: Date, days: number, providers: Provider[], clinic: { hours: Provider["weeklyHours"]; holidays: { date: string }[] }): Promise<number> {
  const from = startOfDay(now);
  const to = addDays(from, days);
  const [row] = await tx.$queryRaw<{ booked_min: number | null }[]>`
    SELECT sum(extract(epoch FROM ("end" - start)) / 60) AS booked_min FROM appointments
    WHERE clinic_id = ${clinicId} AND start >= ${wallToDb(format(from, "yyyy-MM-dd'T'HH:mm"))} AND start < ${wallToDb(format(to, "yyyy-MM-dd'T'HH:mm"))} AND status IN ('unconfirmed', 'confirmed', 'complete', 'no_show')`;
  let available = 0;
  for (let i = 0; i < days; i++) for (const p of providers) available += availableMinutes(p, clinic as never, addDays(from, i));
  return pct(n(row?.booked_min), available);
}

export async function performanceReport(tx: Tx, clinicId: string, r: DayRange) {
  const clinic = await loadClinic(tx, clinicId);
  const providers = (await tx.provider.findMany({ include: providerInclude, orderBy: { order: "asc" } })).map(toProvider);
  const now = nowInZone(clinic.timeZone);
  const prev = previousDayRange(r);
  const [overview, previous, bySource, adRoi, patients, previousPatients, byReason, byProvider, avgLeadTimeHours, fill7, fill14] = await Promise.all([
    overviewReport(tx, clinicId, r),
    overviewReport(tx, clinicId, prev),
    bySourceReport(tx, clinicId, clinic.timeZone, r),
    adRoiReport(tx, clinicId, clinic.timeZone),
    patientTrendReport(tx, clinicId, r),
    patientTrendReport(tx, clinicId, prev),
    byReasonReport(tx, clinicId, r, now),
    byProviderReport(tx, clinicId, r, now, providers, clinic),
    avgLeadTimeReport(tx, clinicId, clinic.timeZone, r),
    fillRateReport(tx, clinicId, now, 7, providers, clinic),
    fillRateReport(tx, clinicId, now, 14, providers, clinic),
  ]);
  return { range: r, overview, previous, bySource, adRoi, patientTrend: patients.trend, newPatients: patients.newPatients, previousNewPatients: previousPatients.newPatients, byReason, byProvider, avgLeadTimeHours, fillRate7: fill7, fillRate14: fill14 };
}

// ---------------------------------------------------------------- form analytics (5.8)

const RANK: Record<StepKey, number> = { reason: 0, provider: 1, datetime: 2, details: 3, insurance: 3, intake: 3, review: 4 };

export async function formAnalyticsReport(tx: Tx, clinicId: string, r: DayRange, source: Source | "all") {
  const clinic = await tx.clinic.findUniqueOrThrow({ where: { id: clinicId }, select: { timeZone: true } });
  const b = instantBounds(r, clinic.timeZone);
  const rows = await tx.$queryRaw<{ furthest_step: string; booked: boolean; reason_id: string | null; local_weekday: number; local_hour: number; c: bigint }[]>`
    SELECT furthest_step, booked, reason_id, local_weekday, local_hour, count(*) AS c FROM widget_sessions
    WHERE clinic_id = ${clinicId} AND at >= ${b.start} AND at < ${b.end} ${source === "all" ? Prisma_empty : Prisma_source(source)}
    GROUP BY 1, 2, 3, 4, 5`;
  const reasons = await tx.reason.findMany({ select: { id: true, name: true } });
  const visits = rows.reduce((s, x) => s + n(x.c), 0);
  const booked = rows.filter((x) => x.booked).reduce((s, x) => s + n(x.c), 0);
  const totals = { visits, booked, dropOffs: visits - booked, conversion: pct(booked, visits) };
  const dropOffByStep: StepDropRow[] = FUNNEL_STEPS.map((step) => {
    const reached = rows.filter((x) => x.booked || RANK[x.furthest_step as StepKey] >= RANK[step]).reduce((s, x) => s + n(x.c), 0);
    const dropped = rows.filter((x) => !x.booked && RANK[x.furthest_step as StepKey] === RANK[step] && (step !== "details" || ["details", "insurance", "intake"].includes(x.furthest_step))).reduce((s, x) => s + n(x.c), 0);
    return { step, label: STEP_LABELS[step], reached, dropped, dropPct: pct(dropped, visits) };
  });
  const byReasonMap = new Map<string, { visits: number; booked: number }>();
  for (const x of rows) {
    const k = x.reason_id ?? "__none";
    const cur = byReasonMap.get(k) ?? { visits: 0, booked: 0 };
    cur.visits += n(x.c);
    if (x.booked) cur.booked += n(x.c);
    byReasonMap.set(k, cur);
  }
  const dropOffByReason: ReasonDropRow[] = [...byReasonMap.entries()]
    .map(([reasonId, v]) => ({ reasonId, name: reasonId === "__none" ? "Left before choosing a reason" : (reasons.find((x) => x.id === reasonId)?.name ?? "Unknown reason"), visits: v.visits, booked: v.booked, dropped: v.visits - v.booked, dropPct: pct(v.visits - v.booked, v.visits), conversion: pct(v.booked, v.visits) }))
    .sort((a, b2) => b2.visits - a.visits || a.name.localeCompare(b2.name));
  const grid = (bookedOnly: boolean): Heatmap => {
    const g: Heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const x of rows) if (!bookedOnly || x.booked) g[x.local_weekday as Weekday][x.local_hour] += n(x.c);
    return g;
  };
  return { range: r, source, totals, dropOffByStep, dropOffByReason, visitHeatmap: grid(false), bookingHeatmap: grid(true) };
}

// Small helpers so the optional source filter composes inside the tagged template above.
import { Prisma } from "@prisma/client";
const Prisma_empty = Prisma.empty;
const Prisma_source = (source: string) => Prisma.sql`AND source = ${source}`;

// ---------------------------------------------------------------- super admin (6.1, 6.11)

export interface AdminOverview {
  clinics: Record<"active" | "trial" | "paused" | "suspended" | "churned", number>;
  bookings: { current: number; previous: number; changePct: number };
  conversion: { current: number; previous: number };
  showRate: { current: number; previous: number };
  revenue: { mrr: number; newMrr: number; churnedMrr: number; overdueInvoices: number; overdueAmount: number };
  usage: { smsUsed: number; smsCredits: number; emailsSent: number };
  alerts: { failedMessages: number; syncErrors: { clinicId: string; name: string; error: string }[]; zeroBookings: { clinicId: string; name: string }[] };
}

export async function adminOverview(tx: Tx, now = new Date()): Promise<AdminOverview> {
  const d30 = new Date(now.getTime() - 30 * 86400000);
  const d60 = new Date(now.getTime() - 60 * 86400000);
  const d7 = new Date(now.getTime() - 7 * 86400000);
  const clinics = await tx.clinic.findMany({ where: { deletedAt: null }, include: { plan: true } });
  const counts = { active: 0, trial: 0, paused: 0, suspended: 0, churned: 0 } as AdminOverview["clinics"];
  for (const c of clinics) counts[c.status as keyof typeof counts] = (counts[c.status as keyof typeof counts] ?? 0) + 1;
  const [bk] = await tx.$queryRaw<{ cur: bigint; prev: bigint }[]>`
    SELECT count(*) FILTER (WHERE created_at >= ${d30}) AS cur, count(*) FILTER (WHERE created_at >= ${d60} AND created_at < ${d30}) AS prev FROM appointments WHERE status <> 'declined'`;
  const [ws] = await tx.$queryRaw<{ cur: bigint; cur_b: bigint; prev: bigint; prev_b: bigint }[]>`
    SELECT count(*) FILTER (WHERE at >= ${d30}) AS cur, count(*) FILTER (WHERE at >= ${d30} AND booked) AS cur_b,
           count(*) FILTER (WHERE at >= ${d60} AND at < ${d30}) AS prev, count(*) FILTER (WHERE at >= ${d60} AND at < ${d30} AND booked) AS prev_b FROM widget_sessions`;
  const nowWall = wallToDb(format(now, "yyyy-MM-dd'T'HH:mm"));
  const w30 = wallToDb(format(d30, "yyyy-MM-dd'T'HH:mm"));
  const w60 = wallToDb(format(d60, "yyyy-MM-dd'T'HH:mm"));
  const [sr] = await tx.$queryRaw<{ cd: bigint; cn: bigint; pd: bigint; pn: bigint }[]>`
    SELECT count(*) FILTER (WHERE start >= ${w30} AND start < ${nowWall} AND status = 'complete') AS cd, count(*) FILTER (WHERE start >= ${w30} AND start < ${nowWall} AND status = 'no_show') AS cn,
           count(*) FILTER (WHERE start >= ${w60} AND start < ${w30} AND status = 'complete') AS pd, count(*) FILTER (WHERE start >= ${w60} AND start < ${w30} AND status = 'no_show') AS pn FROM appointments`;
  const price = (c: (typeof clinics)[number]) => c.plan.priceMonthly;
  const overdue = await tx.invoice.findMany({ where: { status: "overdue" }, select: { amount: true } });
  const failed = await tx.messageLog.count({ where: { status: { in: ["failed", "bounced"] }, createdAt: { gte: d7 } } });
  const recent = await tx.$queryRaw<{ clinic_id: string }[]>`SELECT DISTINCT clinic_id FROM appointments WHERE created_at >= ${d7} AND status <> 'declined'`;
  const recentSet = new Set(recent.map((x) => x.clinic_id));
  const plans = await tx.plan.findMany();
  return {
    clinics: counts,
    bookings: { current: n(bk?.cur), previous: n(bk?.prev), changePct: change(n(bk?.cur), n(bk?.prev)) },
    conversion: { current: pct(n(ws?.cur_b), n(ws?.cur)), previous: pct(n(ws?.prev_b), n(ws?.prev)) },
    showRate: { current: pct(n(sr?.cd), n(sr?.cd) + n(sr?.cn)), previous: pct(n(sr?.pd), n(sr?.pd) + n(sr?.pn)) },
    revenue: {
      mrr: clinics.filter((c) => c.status === "active").reduce((s, c) => s + price(c), 0),
      newMrr: clinics.filter((c) => c.status === "active" && c.createdAt >= d30).reduce((s, c) => s + price(c), 0),
      churnedMrr: clinics.filter((c) => c.status === "churned").reduce((s, c) => s + price(c), 0),
      overdueInvoices: overdue.length,
      overdueAmount: overdue.reduce((s, i) => s + i.amount, 0),
    },
    usage: {
      smsUsed: clinics.reduce((s, c) => s + c.smsCreditsUsed, 0),
      smsCredits: clinics.reduce((s, c) => s + n((plans.find((p) => p.id === c.planId)?.limits as { smsCredits?: number })?.smsCredits), 0),
      emailsSent: clinics.reduce((s, c) => s + c.emailsSent, 0),
    },
    alerts: {
      failedMessages: failed,
      syncErrors: clinics.filter((c) => (c.pms as { syncError?: string }).syncError).map((c) => ({ clinicId: c.id, name: c.name, error: (c.pms as { syncError?: string }).syncError! })),
      zeroBookings: clinics.filter((c) => c.status !== "churned" && !recentSet.has(c.id)).map((c) => ({ clinicId: c.id, name: c.name })),
    },
  };
}

export interface ClinicCompareRow {
  clinicId: string;
  name: string;
  status: string;
  bookings: number;
  visits: number;
  conversion: number;
  showRate: number;
  sourceMix: Partial<Record<Source, number>>;
  adSpend: number;
  paidBookings: number;
  adCostPerBooking: number | null;
}

export async function adminAnalytics(tx: Tx, days: number, now = new Date()) {
  const from = new Date(now.getTime() - days * 86400000);
  const wFrom = wallToDb(format(from, "yyyy-MM-dd'T'HH:mm"));
  const wNow = wallToDb(format(now, "yyyy-MM-dd'T'HH:mm"));
  const clinics = await tx.clinic.findMany({ where: { deletedAt: null }, select: { id: true, name: true, status: true, createdAt: true, lastLoginAt: true }, orderBy: { name: "asc" } });
  const bookings = await tx.$queryRaw<{ clinic_id: string; source: string; c: bigint }[]>`SELECT clinic_id, source, count(*) AS c FROM appointments WHERE created_at >= ${from} AND status <> 'declined' GROUP BY 1, 2`;
  const visits = await tx.$queryRaw<{ clinic_id: string; c: bigint; b: bigint }[]>`SELECT clinic_id, count(*) AS c, count(*) FILTER (WHERE booked) AS b FROM widget_sessions WHERE at >= ${from} GROUP BY 1`;
  const shows = await tx.$queryRaw<{ clinic_id: string; d: bigint; ns: bigint }[]>`SELECT clinic_id, count(*) FILTER (WHERE status = 'complete') AS d, count(*) FILTER (WHERE status = 'no_show') AS ns FROM appointments WHERE start >= ${wFrom} AND start < ${wNow} GROUP BY 1`;
  const months = new Set<string>();
  for (let d = new Date(from); d <= now; d = addDays(d, 1)) months.add(format(d, "yyyy-MM"));
  const spend = await tx.adSpend.findMany({ where: { month: { in: [...months] } } });
  const monthShare = (m: string) => {
    const [y, mo] = m.split("-").map(Number);
    const start = new Date(y, mo - 1, 1);
    const end = new Date(y, mo, 1);
    const overlap = Math.max(0, Math.min(end.getTime(), now.getTime()) - Math.max(start.getTime(), from.getTime()));
    return overlap / (end.getTime() - start.getTime());
  };
  const compare: ClinicCompareRow[] = clinics.map((c) => {
    const bk = bookings.filter((b) => b.clinic_id === c.id);
    const total = bk.reduce((s, b) => s + n(b.c), 0);
    const v = visits.find((x) => x.clinic_id === c.id);
    const s = shows.find((x) => x.clinic_id === c.id);
    const sourceMix: Partial<Record<Source, number>> = {};
    for (const b of bk) sourceMix[b.source as Source] = n(b.c);
    const adSpend = Math.round(spend.filter((x) => x.clinicId === c.id).reduce((sum, x) => sum + x.amount * monthShare(x.month), 0));
    const paid = bk.filter((b) => b.source === "google_ads" || b.source === "custom").reduce((sum, b) => sum + n(b.c), 0);
    return { clinicId: c.id, name: c.name, status: c.status, bookings: total, visits: n(v?.c), conversion: pct(n(v?.b), n(v?.c)), showRate: pct(n(s?.d), n(s?.d) + n(s?.ns)), sourceMix, adSpend, paidBookings: paid, adCostPerBooking: paid ? Math.round((adSpend / paid) * 100) / 100 : null };
  });
  // Growth: last 12 months.
  const growth: { month: string; newClinics: number; bookings: number; bookingsPerClinic: number; retention: number }[] = [];
  const perMonth = await tx.$queryRaw<{ month: string; c: bigint; clinics: bigint }[]>`SELECT to_char(created_at, 'YYYY-MM') AS month, count(*) AS c, count(DISTINCT clinic_id) AS clinics FROM appointments WHERE status <> 'declined' AND created_at >= ${new Date(now.getFullYear(), now.getMonth() - 11, 1)} GROUP BY 1`;
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = format(d, "yyyy-MM");
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const existing = clinics.filter((c) => c.createdAt < d);
    const retained = existing.filter((c) => !(c.status === "churned" && c.lastLoginAt && c.lastLoginAt < end));
    const pm = perMonth.find((x) => x.month === key);
    growth.push({ month: key, newClinics: clinics.filter((c) => c.createdAt >= d && c.createdAt < end).length, bookings: n(pm?.c), bookingsPerClinic: n(pm?.clinics) ? Math.round((n(pm?.c) / n(pm?.clinics)) * 10) / 10 : 0, retention: existing.length ? pct(retained.length, existing.length) : 100 });
  }
  return { days, compare, growth };
}

export { differenceInCalendarDays };
