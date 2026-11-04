import { addDays, differenceInCalendarDays, endOfDay, endOfMonth, endOfWeek, startOfDay, startOfMonth, startOfWeek, subDays } from "date-fns";

export type RangePreset = "today" | "week" | "month" | "last30" | "custom";
export const RANGE_LABELS: Record<RangePreset, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  last30: "Last 30 days",
  custom: "Custom",
};

export interface DateRange {
  from: Date; // inclusive, wall-clock
  to: Date; // inclusive end of day
}

export function rangeFor(preset: RangePreset, now: Date, custom?: { from: Date; to: Date }): DateRange {
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "week":
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    case "month":
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case "last30":
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case "custom":
      return custom ? { from: startOfDay(custom.from), to: endOfDay(custom.to) } : { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
  }
}

/** The period of equal length immediately before `r` (for "% change vs previous period"). */
export function previousRange(r: DateRange): DateRange {
  const days = differenceInCalendarDays(r.to, r.from) + 1;
  return { from: startOfDay(subDays(r.from, days)), to: endOfDay(subDays(r.from, 1)) };
}

export function inRange(d: Date, r: DateRange): boolean {
  return d >= r.from && d <= r.to;
}

export function eachDay(r: DateRange): Date[] {
  const out: Date[] = [];
  for (let d = startOfDay(r.from); d <= r.to; d = addDays(d, 1)) out.push(d);
  return out;
}
