import { format, parse } from "date-fns";

/**
 * Clinic wall-clock helpers. Dates on clinic records are "naive" ISO strings
 * ("YYYY-MM-DDTHH:mm") interpreted in the clinic time zone. In memory we hold them
 * as JS Dates whose *local* fields equal the clinic wall-clock, so date-fns
 * arithmetic works without a TZ library. (DST edges are ignored; see docs/assumptions.md.)
 */

export const WALL_FMT = "yyyy-MM-dd'T'HH:mm";
export const DAY_FMT = "yyyy-MM-dd";

export function toWall(d: Date): string {
  return format(d, WALL_FMT);
}

export function fromWall(s: string): Date {
  return parse(s.slice(0, 16), WALL_FMT, new Date(0));
}

export function dayKey(d: Date): string {
  return format(d, DAY_FMT);
}

export function fromDayKey(s: string): Date {
  return parse(s, DAY_FMT, new Date(0));
}

/** "HH:mm" -> minutes since midnight */
export function hm(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function minutesToHm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Minutes since midnight of a wall-clock Date. */
export function minuteOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Current wall-clock time in a time zone, as a naive Date. */
export function nowInZone(timeZone: string, now: Date = new Date()): Date {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return new Date(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  } catch {
    return new Date(now);
  }
}

export function tzAbbrev(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function fmtTime(d: Date | string): string {
  const date = typeof d === "string" ? fromWall(d) : d;
  return format(date, "h:mm a");
}

export function fmtDate(d: Date | string, pattern = "EEE, MMM d, yyyy"): string {
  const date = typeof d === "string" ? (d.length > 16 || d.endsWith("Z") ? new Date(d) : fromWall(d)) : d;
  return format(date, pattern);
}

export type DayPart = "Morning" | "Afternoon" | "Evening";
export function dayPart(d: Date): DayPart {
  const h = d.getHours();
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  return "Evening";
}
