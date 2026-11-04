"use client";

import { format } from "date-fns";
import { RANGE_LABELS, type RangePreset } from "@/lib/range";
import { fromDayKey } from "@/lib/time";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface RangeValue {
  preset: RangePreset;
  from?: Date;
  to?: Date;
}

/** Date range control: Today, This week, This month, Last 30 days, Custom. */
export function RangePicker({ value, onChange, presets = ["today", "week", "month", "last30", "custom"] }: { value: RangeValue; onChange: (v: RangeValue) => void; presets?: RangePreset[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value.preset} onValueChange={(p) => onChange({ ...value, preset: p as RangePreset })}>
        <SelectTrigger className="h-9 w-40" aria-label="Date range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {presets.map((p) => (
            <SelectItem key={p} value={p}>
              {RANGE_LABELS[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.preset === "custom" && (
        <>
          <Input
            type="date"
            aria-label="From date"
            className="h-9 w-40"
            value={value.from ? format(value.from, "yyyy-MM-dd") : ""}
            onChange={(e) => e.target.value && onChange({ ...value, from: fromDayKey(e.target.value) })}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="To date"
            className="h-9 w-40"
            value={value.to ? format(value.to, "yyyy-MM-dd") : ""}
            onChange={(e) => e.target.value && onChange({ ...value, to: fromDayKey(e.target.value) })}
          />
        </>
      )}
    </div>
  );
}
