"use client";

import { useMemo, useState } from "react";
import type { Source } from "@/types";
import { SOURCE_LABELS } from "@/types";
import { useApp, useCurrentClinic } from "@/store/app";
import { nowInZone } from "@/lib/time";
import { rangeFor, type DateRange } from "@/lib/range";
import type { RangeValue } from "@/components/shared/range-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WEEKDAYS, hourLabel, REPORT_SOURCES, type Heatmap } from "./aggregate";

/** Current clinic's report inputs, derived with stable memoization. */
export function useReportScope() {
  const clinic = useCurrentClinic();
  const allAppts = useApp((s) => s.db.appointments);
  const allSessions = useApp((s) => s.db.widgetSessions);
  const allReasons = useApp((s) => s.db.reasons);
  const allProviders = useApp((s) => s.db.providers);
  const allSpend = useApp((s) => s.db.adSpend);
  const allReferrers = useApp((s) => s.db.referrers);
  const id = clinic?.id;
  return useMemo(
    () => ({
      clinic,
      appts: allAppts.filter((a) => a.clinicId === id),
      sessions: allSessions.filter((s) => s.clinicId === id),
      reasons: allReasons.filter((r) => r.clinicId === id),
      providers: allProviders.filter((p) => p.clinicId === id),
      spend: allSpend.filter((s) => s.clinicId === id),
      referrers: allReferrers.filter((r) => r.clinicId === id),
      now: clinic ? nowInZone(clinic.timeZone) : new Date(),
    }),
    [clinic, id, allAppts, allSessions, allReasons, allProviders, allSpend, allReferrers],
  );
}

export function useRange(initial: RangeValue["preset"] = "month") {
  const [value, setValue] = useState<RangeValue>({ preset: initial });
  const clinic = useCurrentClinic();
  const range: DateRange = useMemo(() => {
    const now = clinic ? nowInZone(clinic.timeZone) : new Date();
    return rangeFor(value.preset, now, value.from && value.to ? { from: value.from, to: value.to } : undefined);
  }, [value, clinic]);
  return { value, setValue, range };
}

export function SourceFilter({ value, onChange, includeStaff = false }: { value: Source | "all"; onChange: (v: Source | "all") => void; includeStaff?: boolean }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Source | "all")}>
      <SelectTrigger className="h-9 w-56" aria-label="Source">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All sources</SelectItem>
        {REPORT_SOURCES.filter((s) => includeStaff || s !== "staff").map((s) => (
          <SelectItem key={s} value={s}>
            {SOURCE_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Accessible heatmap: a real table with counts in each cell; color intensity is decorative. */
export function HeatmapTable({ grid, caption, hours = [6, 23] }: { grid: Heatmap; caption: string; hours?: [number, number] }) {
  const max = Math.max(1, ...grid.flat());
  const hrs = Array.from({ length: hours[1] - hours[0] + 1 }, (_, i) => hours[0] + i);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-[11px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="w-10 text-left font-medium text-muted-foreground">
              <span className="sr-only">Day</span>
            </th>
            {hrs.map((h) => (
              <th key={h} scope="col" className="min-w-[28px] font-normal text-muted-foreground">
                {hourLabel(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, d) => (
            <tr key={d}>
              <th scope="row" className="pr-1 text-left font-medium">
                {WEEKDAYS[d]}
              </th>
              {hrs.map((h) => {
                const v = row[h];
                const a = v / max;
                return (
                  <td
                    key={h}
                    title={`${WEEKDAYS[d]} ${hourLabel(h)}: ${v}`}
                    className="h-7 rounded text-center tabular-nums"
                    style={{ backgroundColor: v ? `rgba(15, 118, 110, ${0.08 + a * 0.85})` : "hsl(var(--muted))", color: a > 0.5 ? "white" : "inherit" }}
                  >
                    {v || ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Bar({ value, className = "bg-primary" }: { value: number; className?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className={`h-full rounded-full ${className}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
