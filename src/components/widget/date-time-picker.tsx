"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, Globe } from "lucide-react";
import type { Slot } from "@/lib/slots";
import { groupByDayPart } from "@/lib/slots";
import { dayKey, tzAbbrev } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useWidgetUi } from "./brand";

export interface DateTimePickerProps {
  timeZone: string;
  now: Date; // clinic wall-clock
  maxDays: number;
  availability: (from: Date, days: number) => Record<string, number>;
  slotsFor: (day: Date) => Slot[];
  selectedStart?: Date;
  onSelect: (slot: Slot) => void;
  /** Availability or slots are still loading from the server. */
  loading?: boolean;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Month calendar (available / selected / unavailable days) + slots grouped Morning / Afternoon / Evening. */
export function DateTimePicker({ timeZone, now, maxDays, availability, slotsFor, selectedStart, onSelect, loading = false }: DateTimePickerProps) {
  const { branding, mobile } = useWidgetUi();
  const today = startOfDay(now);
  const lastDay = addDays(today, maxDays);
  const [month, setMonth] = useState(() => startOfMonth(selectedStart ?? today));
  const [day, setDay] = useState<Date | undefined>(selectedStart ? startOfDay(selectedStart) : undefined);
  const [focusDay, setFocusDay] = useState<Date>(selectedStart ? startOfDay(selectedStart) : today);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const focusPending = useRef(false);

  const gridStart = startOfWeek(startOfMonth(month));
  const gridDays = useMemo(() => {
    const out: Date[] = [];
    for (let d = gridStart; d <= endOfMonth(month) || out.length % 7 !== 0; d = addDays(d, 1)) out.push(d);
    return out;
  }, [gridStart, month]);
  const avail = useMemo(() => availability(gridStart, gridDays.length), [availability, gridStart, gridDays.length]);

  // Auto-select first available day in view if nothing is selected.
  useEffect(() => {
    if (day) return;
    const first = gridDays.find((d) => isSameMonth(d, month) && (avail[dayKey(d)] ?? 0) > 0);
    if (first) {
      setDay(first);
      setFocusDay(first);
    }
  }, [avail, day, gridDays, month]);

  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    refs.current.get(dayKey(focusDay))?.focus();
  }, [focusDay, month]);

  const slots = useMemo(() => (day ? slotsFor(day) : []), [day, slotsFor]);
  const groups = groupByDayPart(slots);
  const canPrev = startOfMonth(month) > startOfMonth(today);
  const canNext = startOfMonth(addMonths(month, 1)) <= lastDay;

  const moveFocus = (d: Date) => {
    if (d < today || d > lastDay) return;
    focusPending.current = true;
    if (!isSameMonth(d, month)) setMonth(startOfMonth(d));
    setFocusDay(d);
  };
  const onKey = (e: React.KeyboardEvent, d: Date) => {
    const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in map) {
      e.preventDefault();
      moveFocus(addDays(d, map[e.key]));
    } else if (e.key === "Home") {
      e.preventDefault();
      moveFocus(addDays(d, -d.getDay()));
    } else if (e.key === "End") {
      e.preventDefault();
      moveFocus(addDays(d, 6 - d.getDay()));
    }
  };

  return (
    <div className={cn("grid gap-6", !mobile && "md:grid-cols-[minmax(0,320px)_1fr]")}>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <button type="button" className="rounded-md p-2 hover:bg-muted disabled:opacity-30" onClick={() => setMonth(subMonths(month, 1))} disabled={!canPrev} aria-label="Previous month">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <p className="font-semibold" aria-live="polite">{format(month, "MMMM yyyy")}</p>
          <button type="button" className="rounded-md p-2 hover:bg-muted disabled:opacity-30" onClick={() => setMonth(addMonths(month, 1))} disabled={!canNext} aria-label="Next month">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div role="grid" aria-label={`Available days in ${format(month, "MMMM yyyy")}`} className="grid grid-cols-7 gap-1 text-center">
          <div role="row" className="contents">
            {WEEKDAYS.map((w) => (
              <div role="columnheader" key={w} className="py-1 text-xs font-medium text-muted-foreground">
                <abbr title={w} className="no-underline">{w.slice(0, 2)}</abbr>
              </div>
            ))}
          </div>
          {Array.from({ length: gridDays.length / 7 }, (_, row) => (
            <div role="row" key={row} className="contents">
              {gridDays.slice(row * 7, row * 7 + 7).map((d) => {
                const k = dayKey(d);
                const inMonth = isSameMonth(d, month);
                const count = avail[k] ?? 0;
                const available = inMonth && count > 0;
                const selected = !!day && isSameDay(d, day);
                const isFocus = isSameDay(d, focusDay);
                return (
                  <div role="gridcell" key={k} aria-selected={selected}>
                    {inMonth ? (
                      <button
                        type="button"
                        ref={(el) => {
                          if (el) refs.current.set(k, el);
                          else refs.current.delete(k);
                        }}
                        tabIndex={isFocus ? 0 : -1}
                        aria-disabled={!available}
                        aria-label={`${format(d, "EEEE, MMMM d")}${available ? `, ${count} times available` : ", unavailable"}`}
                        onKeyDown={(e) => onKey(e, d)}
                        onClick={() => {
                          setFocusDay(d);
                          if (available) setDay(d);
                        }}
                        style={selected ? { backgroundColor: branding.primaryColor, color: "#fff" } : available ? { backgroundColor: branding.secondaryColor, color: branding.primaryColor } : undefined}
                        className={cn(
                          "flex h-10 w-full items-center justify-center rounded-md text-sm tabular-nums",
                          available ? "font-semibold hover:brightness-95" : "cursor-not-allowed text-slate-400 line-through decoration-slate-300",
                          isSameDay(d, today) && !selected && "ring-1 ring-slate-400",
                        )}
                      >
                        {format(d, "d")}
                      </button>
                    ) : (
                      <span className="block h-10" aria-hidden />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded" style={{ backgroundColor: branding.secondaryColor, outline: `1px solid ${branding.primaryColor}` }} /> Available</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded" style={{ backgroundColor: branding.primaryColor }} /> Selected</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-slate-100 ring-1 ring-slate-300" /> Unavailable</span>
        </div>
      </div>
      <div>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">{day ? format(day, "EEEE, MMMM d") : "Pick a day"}</h3>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Globe className="h-3.5 w-3.5" aria-hidden /> Times in {timeZone.replace(/_/g, " ")} ({tzAbbrev(timeZone)})
          </p>
        </div>
        {loading && <p role="status" className="mb-2 text-xs text-muted-foreground">Checking availability…</p>}
        {day && slots.length === 0 && !loading && <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">No times left on this day. Please choose another day.</p>}
        {!day && !loading && <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">No available days this month. Try the next month.</p>}
        <div className="grid gap-4">
          {(["Morning", "Afternoon", "Evening"] as const).map((part) =>
            groups[part].length ? (
              <section key={part} aria-label={`${part} times`}>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{part}</h4>
                <div className={cn("grid grid-cols-3 gap-2", !mobile && "sm:grid-cols-4")}>
                  {groups[part].map((s) => {
                    const sel = selectedStart && s.start.getTime() === selectedStart.getTime();
                    return (
                      <button
                        type="button"
                        key={s.start.getTime()}
                        aria-pressed={!!sel}
                        onClick={() => onSelect(s)}
                        style={sel ? { backgroundColor: branding.primaryColor, color: "#fff", borderColor: branding.primaryColor } : { borderColor: branding.primaryColor, color: branding.primaryColor }}
                        className="h-11 rounded-md border bg-white text-sm font-semibold tabular-nums hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {format(s.start, "h:mm a")}
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}
