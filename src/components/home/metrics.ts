import { differenceInCalendarDays, format } from "date-fns";
import type { Appointment } from "@/types";
import { eachDay, inRange, previousRange, type DateRange } from "@/lib/range";
import { change } from "@/lib/utils";
import { dayKey, fromWall } from "@/lib/time";

export interface HomeMetrics {
  total: number;
  previous: number;
  changePct: number;
  trend: { label: string; current: number }[];
  newCount: number;
  returningCount: number;
  byStatus: Record<string, number>;
}

/** Appointments counted by appointment date; declined requests are excluded. */
export function homeMetrics(appts: Appointment[], range: DateRange): HomeMetrics {
  const counted = appts.filter((a) => a.status !== "declined");
  const cur = counted.filter((a) => inRange(fromWall(a.start), range));
  const prev = counted.filter((a) => inRange(fromWall(a.start), previousRange(range)));
  const singleDay = differenceInCalendarDays(range.to, range.from) === 0;
  let trend: HomeMetrics["trend"];
  if (singleDay) {
    const byHour = new Map<number, number>();
    for (const a of cur) {
      const h = fromWall(a.start).getHours();
      byHour.set(h, (byHour.get(h) ?? 0) + 1);
    }
    trend = Array.from({ length: 13 }, (_, i) => i + 7).map((h) => ({ label: format(new Date(2000, 0, 1, h), "ha"), current: byHour.get(h) ?? 0 }));
  } else {
    const byDay = new Map<string, number>();
    for (const a of cur) byDay.set(a.start.slice(0, 10), (byDay.get(a.start.slice(0, 10)) ?? 0) + 1);
    trend = eachDay(range).map((d) => ({ label: format(d, "MMM d"), current: byDay.get(dayKey(d)) ?? 0 }));
  }
  const byStatus: Record<string, number> = {};
  for (const a of cur) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
  return {
    total: cur.length,
    previous: prev.length,
    changePct: change(cur.length, prev.length),
    trend,
    newCount: cur.filter((a) => a.patientType === "new").length,
    returningCount: cur.filter((a) => a.patientType === "existing").length,
    byStatus,
  };
}
