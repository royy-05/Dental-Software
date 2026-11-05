"use client";

import { useState } from "react";
import { addDays, format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useStaffSlots } from "@/lib/api/clinic";
import { useClinicConfig } from "@/lib/api/clinic";
import { useClinicBundle } from "@/lib/api/session";
import { groupByDayPart, type Slot } from "@/lib/slots";
import { dayKey, fromDayKey, nowInZone, tzAbbrev } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/shared/states";

/**
 * Staff slot picker: the server runs the same slot engine as the widget with staffOverride
 * (ignores min notice, booking window, daily cap and online visibility).
 */
export function SlotPicker({
  reasonId,
  providerId,
  ignoreAppointmentId,
  value,
  onChange,
  initialDate,
}: {
  clinicId?: string;
  reasonId?: string;
  providerId?: string; // undefined / "any" = first available
  ignoreAppointmentId?: string;
  value?: Slot | null;
  onChange: (s: Slot | null) => void;
  initialDate?: string;
}) {
  const clinic = useClinicBundle().data?.clinic;
  const providers = useClinicConfig().config.providers;
  const today = clinic ? dayKey(nowInZone(clinic.timeZone)) : dayKey(new Date());
  const [day, setDay] = useState(initialDate && initialDate >= today ? initialDate : today);
  const pid = providerId && providerId !== "any" ? providerId : undefined;
  const slotsQuery = useStaffSlots({ reasonId, date: day, providerId: pid, ignoreAppointmentId });
  const slots = slotsQuery.data ?? [];

  const groups = groupByDayPart(slots);
  const shift = (n: number) => {
    const next = dayKey(addDays(fromDayKey(day), n));
    if (next >= today) {
      setDay(next);
      onChange(null);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="slot-day">Date</Label>
          <Input
            id="slot-day"
            type="date"
            min={today}
            className="h-9 w-44"
            value={day}
            onChange={(e) => {
              if (e.target.value) {
                setDay(e.target.value);
                onChange(null);
              }
            }}
          />
        </div>
        <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label="Previous day" onClick={() => shift(-1)} disabled={day <= today}>
          <ChevronLeft />
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label="Next day" onClick={() => shift(1)}>
          <ChevronRight />
        </Button>
        <p className="pb-2 text-xs text-muted-foreground">
          {format(fromDayKey(day), "EEEE, MMM d")} · times in {clinic ? tzAbbrev(clinic.timeZone) : ""}
        </p>
      </div>
      {!reasonId ? (
        <p className="text-sm text-muted-foreground">Choose a reason first.</p>
      ) : slotsQuery.isLoading ? (
        <LoadingState label="Loading times…" className="p-0" />
      ) : slotsQuery.isError ? (
        <p className="rounded-md bg-red-50 px-3 py-4 text-center text-sm text-red-900">Couldn&apos;t load times. Try again.</p>
      ) : slots.length === 0 ? (
        <p className="rounded-md bg-muted px-3 py-4 text-center text-sm text-muted-foreground">No open times on this day. Try another date.</p>
      ) : (
        <div className="grid max-h-64 gap-3 overflow-y-auto pr-1" role="radiogroup" aria-label="Available times">
          {(Object.keys(groups) as (keyof typeof groups)[]).map((part) =>
            groups[part].length ? (
              <div key={part}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{part}</p>
                <div className="flex flex-wrap gap-1.5">
                  {groups[part].map((s) => {
                    const selected = !!value && value.start.getTime() === s.start.getTime() && value.providerId === s.providerId;
                    return (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        key={`${s.providerId}-${s.start.getTime()}`}
                        onClick={() => onChange(s)}
                        className={cn(
                          "rounded-md border px-2.5 py-1.5 text-sm hover:border-primary focus-visible:ring-2 focus-visible:ring-ring",
                          selected && "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        {format(s.start, "h:mm a")}
                        {(!providerId || providerId === "any") && (
                          <span className={cn("block text-[10px]", selected ? "text-white/85" : "text-muted-foreground")}>
                            {providers.find((p) => p.id === s.providerId)?.displayName}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
