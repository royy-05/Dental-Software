"use client";

import { useMemo, useState } from "react";
import type { Weekday, WeeklyHours } from "@/types";
import { useApp } from "@/store/app";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const WEEKDAYS: { day: Weekday; short: string; long: string }[] = [
  { day: 1, short: "Mon", long: "Monday" },
  { day: 2, short: "Tue", long: "Tuesday" },
  { day: 3, short: "Wed", long: "Wednesday" },
  { day: 4, short: "Thu", long: "Thursday" },
  { day: 5, short: "Fri", long: "Friday" },
  { day: 6, short: "Sat", long: "Saturday" },
  { day: 0, short: "Sun", long: "Sunday" },
];

/** Current clinic's config slices, derived outside the zustand selector (v5 needs stable refs). */
export function useClinicConfig() {
  const clinicId = useApp((s) => s.session.clinicId);
  const clinics = useApp((s) => s.db.clinics);
  const allReasons = useApp((s) => s.db.reasons);
  const allProviders = useApp((s) => s.db.providers);
  const allOps = useApp((s) => s.db.operatories);
  return useMemo(() => {
    const clinic = clinics.find((c) => c.id === clinicId);
    return {
      clinic,
      clinicId: clinicId ?? "",
      reasons: allReasons.filter((r) => r.clinicId === clinicId).sort((a, b) => a.order - b.order),
      providers: allProviders.filter((p) => p.clinicId === clinicId),
      operatories: allOps.filter((o) => o.clinicId === clinicId),
    };
  }, [clinicId, clinics, allReasons, allProviders, allOps]);
}

export function MultiCheck({
  legend,
  options,
  value,
  onChange,
  idPrefix,
  empty = "None available",
}: {
  legend: string;
  options: { value: string; label: string; hint?: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  idPrefix: string;
  empty?: string;
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {options.length === 0 && <p className="text-xs text-muted-foreground">{empty}</p>}
      <div className="grid gap-1.5 sm:grid-cols-2">
        {options.map((o) => {
          const id = `${idPrefix}-${o.value}`;
          const checked = value.includes(o.value);
          return (
            <label key={o.value} htmlFor={id} className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm", checked && "border-primary bg-secondary/40")}>
              <Checkbox id={id} checked={checked} onCheckedChange={(c) => onChange(c ? [...value, o.value] : value.filter((v) => v !== o.value))} />
              <span>
                {o.label}
                {o.hint && <span className="block text-xs text-muted-foreground">{o.hint}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function WeeklyHoursEditor({ value, onChange, idPrefix }: { value: WeeklyHours; onChange: (v: WeeklyHours) => void; idPrefix: string }) {
  const set = (d: Weekday, patch: Partial<WeeklyHours[Weekday]>) => onChange({ ...value, [d]: { ...value[d], ...patch } });
  return (
    <div className="grid gap-2">
      {WEEKDAYS.map(({ day, long }) => {
        const h = value[day];
        const bad = h.enabled && h.start >= h.end;
        return (
          <div key={day} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2">
            <div className="flex w-32 items-center gap-2">
              <Switch id={`${idPrefix}-${day}`} checked={h.enabled} onCheckedChange={(c) => set(day, { enabled: c })} />
              <label htmlFor={`${idPrefix}-${day}`} className="text-sm font-medium">{long}</label>
            </div>
            {h.enabled ? (
              <div className="flex items-center gap-2">
                <Input type="time" aria-label={`${long} start`} className="h-9 w-32" value={h.start} onChange={(e) => set(day, { start: e.target.value })} aria-invalid={bad} />
                <span className="text-sm text-muted-foreground">to</span>
                <Input type="time" aria-label={`${long} end`} className="h-9 w-32" value={h.end} onChange={(e) => set(day, { end: e.target.value })} aria-invalid={bad} />
                {bad && <span className="text-xs text-destructive">End must be after start</span>}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Closed</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function hoursValid(h: WeeklyHours): boolean {
  return WEEKDAYS.every(({ day }) => !h[day].enabled || h[day].start < h[day].end);
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Hook for a delete-confirmation dialog bound to an item. */
export function useConfirm<T>() {
  const [item, setItem] = useState<T | null>(null);
  return { item, ask: (t: T) => setItem(t), close: () => setItem(null), open: item !== null };
}

export function Avatar({ name, src, color, size = 40 }: { name: string; src?: string; color?: string; size?: number }) {
  const initials = name
    .replace(/^Dr\.?\s+/i, "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  if (src) return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ width: size, height: size, background: color ?? "#0f766e" }}
    >
      {initials}
    </span>
  );
}

export function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-destructive">{msg}</p>;
}
