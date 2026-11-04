"use client";

import { useMemo, useState } from "react";
import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Appointment, Weekday } from "@/types";
import { dayKey, fromDayKey, fromWall, hm, minuteOfDay, tzAbbrev } from "@/lib/time";
import { cn } from "@/lib/utils";
import { usePhiText } from "@/components/shared/phi";
import { useDemoState, ErrorState, EmptyState, LoadingState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ClinicData } from "./use-clinic-data";

const PX_PER_MIN = 1.1;

interface Placed {
  appt: Appointment;
  top: number;
  height: number;
  lane: number;
  lanes: number;
}

/** Lay out overlapping events side by side within one column. */
export function layoutColumn(appts: Appointment[], dayStartMin: number): Placed[] {
  const sorted = [...appts].sort((a, b) => a.start.localeCompare(b.start));
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const laneEnds: number[] = [];
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((p) => p.lane + 1));
    cluster.forEach((p) => (p.lanes = lanes));
    out.push(...cluster);
    cluster = [];
    laneEnds.length = 0;
  };
  for (const a of sorted) {
    const s = minuteOfDay(fromWall(a.start));
    const e = Math.max(s + 10, minuteOfDay(fromWall(a.end)) || 24 * 60);
    if (s >= clusterEnd && cluster.length) flush();
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = e;
    clusterEnd = Math.max(clusterEnd, e);
    cluster.push({ appt: a, top: (s - dayStartMin) * PX_PER_MIN, height: (e - s) * PX_PER_MIN, lane, lanes: 1 });
  }
  if (cluster.length) flush();
  return out;
}

export function AppointmentsCalendar({ data, onOpen, loading }: { data: ClinicData; onOpen: (id: string) => void; loading?: boolean }) {
  const demo = useDemoState();
  const phi = usePhiText();
  const [view, setView] = useState<"day" | "week">("day");
  const [anchor, setAnchor] = useState(() => dayKey(data.clinicNow()));
  const [providerId, setProviderId] = useState<string>("all");
  const [showCancelled, setShowCancelled] = useState(false);
  const clinic = data.clinic;

  const { startMin, endMin } = useMemo(() => {
    let s = 24 * 60;
    let e = 0;
    if (clinic) {
      for (let d = 0; d < 7; d++) {
        const h = clinic.hours[d as Weekday];
        if (!h.enabled) continue;
        s = Math.min(s, hm(h.start));
        e = Math.max(e, hm(h.end));
      }
    }
    if (s >= e) return { startMin: 7 * 60, endMin: 19 * 60 };
    return { startMin: Math.floor(s / 60) * 60, endMin: Math.ceil(e / 60) * 60 };
  }, [clinic]);

  const anchorDate = fromDayKey(anchor);
  const days = view === "day" ? [anchorDate] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchorDate, { weekStartsOn: 1 }), i));
  const providers = data.providers.filter((p) => p.active && (providerId === "all" || p.id === providerId));

  const visibleAppts = useMemo(
    () => data.appointments.filter((a) => a.status !== "declined" && (showCancelled || a.status !== "cancelled") && (providerId === "all" || a.providerId === providerId)),
    [data.appointments, showCancelled, providerId],
  );

  // Columns: day view = one column per provider; week view = one column per day.
  const columns =
    view === "day"
      ? providers.map((p) => ({ key: p.id, title: p.displayName, sub: p.role, appts: visibleAppts.filter((a) => a.providerId === p.id && a.start.slice(0, 10) === anchor) }))
      : days.map((d) => ({ key: dayKey(d), title: format(d, "EEE d"), sub: format(d, "MMM"), appts: visibleAppts.filter((a) => a.start.slice(0, 10) === dayKey(d)) }));

  const step = (n: number) => setAnchor(dayKey(addDays(anchorDate, view === "day" ? n : n * 7)));
  const hours = Array.from({ length: (endMin - startMin) / 60 + 1 }, (_, i) => startMin + i * 60);
  const height = (endMin - startMin) * PX_PER_MIN;
  const color = (id: string) => data.providers.find((p) => p.id === id)?.color ?? "#0f766e";
  const now = data.clinicNow();
  const nowMin = minuteOfDay(now);

  let body: React.ReactNode;
  if (loading || demo === "loading") body = <LoadingState label="Loading calendar…" />;
  else if (demo === "error") body = <ErrorState onRetry={() => window.location.assign(window.location.pathname)} />;
  else if (columns.length === 0 || demo === "empty") body = <EmptyState title="No providers to show" description="Add a provider or change the provider filter." />;
  else
    body = (
      <div className="overflow-x-auto rounded-lg border bg-card">
        <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `3.5rem repeat(${columns.length}, minmax(120px, 1fr))` }}>
          <div className="sticky left-0 z-10 border-b bg-card" />
          {columns.map((c) => (
            <div key={c.key} className="border-b border-l px-2 py-2 text-center">
              <p className="truncate text-sm font-medium">{c.title}</p>
              <p className="text-xs text-muted-foreground">{c.sub} · {c.appts.length} appt{c.appts.length === 1 ? "" : "s"}</p>
            </div>
          ))}
          <div className="relative sticky left-0 z-10 bg-card" style={{ height }}>
            {hours.map((h) => (
              <span key={h} className="absolute right-1 -translate-y-1/2 text-[11px] text-muted-foreground" style={{ top: (h - startMin) * PX_PER_MIN }}>
                {format(new Date(2000, 0, 1, Math.floor(h / 60)), "h a")}
              </span>
            ))}
          </div>
          {columns.map((c, ci) => {
            const colDay = view === "day" ? anchorDate : days[ci];
            return (
              <div key={c.key} className="relative border-l" style={{ height }}>
                {hours.map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-dashed border-slate-200" style={{ top: (h - startMin) * PX_PER_MIN }} />
                ))}
                {isSameDay(colDay, now) && nowMin >= startMin && nowMin <= endMin && (
                  <div className="absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: (nowMin - startMin) * PX_PER_MIN }} aria-hidden />
                )}
                {layoutColumn(c.appts, startMin).map((p) => {
                  const a = p.appt;
                  const name = phi(`${a.patient.firstName} ${a.patient.lastName}`);
                  return (
                    <button
                      key={a.id}
                      onClick={() => onOpen(a.id)}
                      className={cn(
                        "absolute overflow-hidden rounded border-l-4 bg-white px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm ring-1 ring-slate-200 hover:z-20 hover:ring-primary focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring",
                        a.status === "cancelled" && "opacity-50 line-through",
                        a.status === "unconfirmed" && "bg-amber-50",
                      )}
                      style={{
                        top: p.top,
                        height: Math.max(p.height - 2, 18),
                        left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`,
                        width: `calc(${100 / p.lanes}% - 4px)`,
                        borderLeftColor: color(a.providerId),
                      }}
                      aria-label={`${format(fromWall(a.start), "h:mm a")} ${data.reasonName(a.reasonId)} with ${data.providerName(a.providerId)}, ${a.status}`}
                    >
                      <span className="block font-semibold">{format(fromWall(a.start), "h:mm")} {name}</span>
                      <span className="block truncate text-muted-foreground">{data.reasonName(a.reasonId)}</span>
                      {view === "week" && <span className="block truncate text-muted-foreground">{data.providerName(a.providerId)}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Calendar view">
          {(["day", "week"] as const).map((v) => (
            <Button key={v} size="sm" variant={view === v ? "default" : "ghost"} className="h-8 capitalize" aria-pressed={view === v} onClick={() => setView(v)}>
              {v}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="icon" className="h-9 w-9" aria-label={`Previous ${view}`} onClick={() => step(-1)}><ChevronLeft /></Button>
        <Button variant="outline" size="sm" className="h-9" onClick={() => setAnchor(dayKey(data.clinicNow()))}>Today</Button>
        <Button variant="outline" size="icon" className="h-9 w-9" aria-label={`Next ${view}`} onClick={() => step(1)}><ChevronRight /></Button>
        <Input type="date" aria-label="Go to date" className="h-9 w-40" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} />
        <div className="w-48">
          <Select value={providerId} onValueChange={setProviderId}>
            <SelectTrigger className="h-9" aria-label="Provider"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              {data.providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.displayName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <Checkbox checked={showCancelled} onCheckedChange={(c) => setShowCancelled(c === true)} />
          <Label className="cursor-pointer">Show cancelled</Label>
        </label>
        <p className="ml-auto pb-2 text-sm font-medium">
          {view === "day" ? format(anchorDate, "EEEE, MMMM d, yyyy") : `${format(days[0], "MMM d")} – ${format(days[6], "MMM d, yyyy")}`}
          {clinic && <span className="ml-1 text-xs font-normal text-muted-foreground">({tzAbbrev(clinic.timeZone)})</span>}
        </p>
      </div>
      {body}
    </div>
  );
}
