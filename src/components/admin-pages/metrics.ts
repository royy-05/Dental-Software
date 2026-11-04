import type { Appointment, Clinic, Plan, Source, WidgetSession } from "@/types";
import { fromWall } from "@/lib/time";

/** Pure helpers for super admin dashboards and analytics. */

export interface Period {
  from: Date;
  to: Date;
}

export function lastDays(days: number, now: Date = new Date(), offsetPeriods = 0): Period {
  const to = new Date(now.getTime() - offsetPeriods * days * 86400000);
  return { from: new Date(to.getTime() - days * 86400000), to };
}

const within = (d: Date, p: Period) => d >= p.from && d < p.to;

export function bookingsIn(appts: Appointment[], p: Period, clinicId?: string): Appointment[] {
  return appts.filter((a) => (!clinicId || a.clinicId === clinicId) && within(new Date(a.createdAt), p));
}

export function sessionsIn(sessions: WidgetSession[], p: Period, clinicId?: string): WidgetSession[] {
  return sessions.filter((s) => (!clinicId || s.clinicId === clinicId) && within(new Date(s.at), p));
}

export function conversionRate(appts: Appointment[], sessions: WidgetSession[], p: Period, clinicId?: string): number {
  const visits = sessionsIn(sessions, p, clinicId);
  if (!visits.length) return 0;
  return round1((visits.filter((v) => v.booked).length / visits.length) * 100);
}

/** Show rate = completed / (completed + no-show) for visits whose start falls in the period. */
export function showRate(appts: Appointment[], p: Period, clinicId?: string): number {
  let done = 0;
  let missed = 0;
  for (const a of appts) {
    if (clinicId && a.clinicId !== clinicId) continue;
    if (!within(fromWall(a.start), p)) continue;
    if (a.status === "complete") done++;
    else if (a.status === "no_show") missed++;
  }
  return done + missed === 0 ? 0 : round1((done / (done + missed)) * 100);
}

export function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function planPrice(plans: Plan[], planId: string): number {
  return plans.find((p) => p.id === planId)?.priceMonthly ?? 0;
}

/** MRR counts active clinics only; trials are $0 until they convert; paused clinics are not billed. */
export function mrr(clinics: Clinic[], plans: Plan[]): number {
  return clinics.filter((c) => c.status === "active" && !c.deletedAt).reduce((s, c) => s + planPrice(plans, c.planId), 0);
}

export function newMrr(clinics: Clinic[], plans: Plan[], now: Date = new Date()): number {
  const cutoff = now.getTime() - 30 * 86400000;
  return clinics.filter((c) => c.status === "active" && new Date(c.createdAt).getTime() >= cutoff).reduce((s, c) => s + planPrice(plans, c.planId), 0);
}

export function churnedMrr(clinics: Clinic[], plans: Plan[]): number {
  return clinics.filter((c) => c.status === "churned").reduce((s, c) => s + planPrice(plans, c.planId), 0);
}

export function sourceMix(appts: Appointment[]): Partial<Record<Source, number>> {
  const out: Partial<Record<Source, number>> = {};
  for (const a of appts) out[a.source] = (out[a.source] ?? 0) + 1;
  return out;
}

export function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return round1(((curr - prev) / prev) * 100);
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function isSlugTaken(slug: string, clinics: Clinic[], exceptId?: string): boolean {
  return clinics.some((c) => c.id !== exceptId && (c.slug === slug || c.settings.widget.customSlug === slug));
}

/** Minimal CSV parser (quoted fields, commas, newlines) for the reasons/providers import. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const clean = rows.filter((r) => r.some((c) => c.trim()));
  if (clean.length < 2) return [];
  const headers = clean[0].map((h) => h.trim().toLowerCase());
  return clean.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

export function daysLeftToRestore(deletedAt: string, now: Date = new Date()): number {
  return Math.max(0, 30 - Math.floor((now.getTime() - new Date(deletedAt).getTime()) / 86400000));
}

export function responseMinutes(createdAt: string, firstResponseAt?: string): number | null {
  if (!firstResponseAt) return null;
  return Math.round((new Date(firstResponseAt).getTime() - new Date(createdAt).getTime()) / 60000);
}

export function fmtDuration(min: number | null): string {
  if (min === null) return "—";
  if (min < 60) return `${min}m`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}h ${min % 60}m`;
  return `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`;
}
