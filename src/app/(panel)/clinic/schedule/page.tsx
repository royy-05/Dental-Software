"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Blockout, Operatory, WeeklyHours } from "@/types";
import { useApp } from "@/store/app";
import { uid } from "@/lib/utils";
import { dayKey, fmtTime, fromWall, hm, nowInZone } from "@/lib/time";
import { RequirePermission } from "@/components/shared/guards";
import { PageHeader } from "@/components/shared/page-header";
import { ListState } from "@/components/shared/states";
import { useHydrated } from "@/components/shared/hydration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog, MultiCheck, WeeklyHoursEditor, hoursValid, useClinicConfig, useConfirm } from "@/components/config/common";
import { removeOperatory, setOperatoryLinks } from "@/components/config/link-sync";

function ClinicHours() {
  const { clinic, clinicId } = useClinicConfig();
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const [hours, setHours] = useState<WeeklyHours | null>(null);
  useEffect(() => setHours(clinic ? structuredClone(clinic.hours) : null), [clinic]);
  if (!clinic || !hours) return null;
  const dirty = JSON.stringify(hours) !== JSON.stringify(clinic.hours);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Clinic hours</CardTitle>
        <CardDescription>Times are in {clinic.timeZone}. Provider hours are trimmed to these.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <WeeklyHoursEditor value={hours} onChange={setHours} idPrefix="clinic-h" />
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={!dirty} onClick={() => setHours(structuredClone(clinic.hours))}>Discard</Button>
          <Button
            disabled={!dirty}
            onClick={() => {
              if (!hoursValid(hours)) return void toast.error("End time must be after start time.");
              mutate((db) => void (db.clinics.find((c) => c.id === clinicId)!.hours = hours));
              logAudit({ action: "Updated clinic hours", category: "settings", target: "Schedule", clinicId });
              toast.success("Clinic hours saved");
            }}
          >
            Save hours
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Holidays() {
  const { clinic, clinicId } = useClinicConfig();
  const hydrated = useHydrated();
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const list = useMemo(() => [...(clinic?.holidays ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [clinic]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Holidays</CardTitle>
        <CardDescription>No online bookings on these dates.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!date || !name.trim()) return void toast.error("Pick a date and enter a name.");
            if (clinic?.holidays.some((h) => h.date === date)) return void toast.error("That date is already a holiday.");
            mutate((db) => void db.clinics.find((c) => c.id === clinicId)!.holidays.push({ id: uid("hol"), date, name: name.trim() }));
            logAudit({ action: `Added holiday ${date}`, category: "settings", target: "Schedule", clinicId });
            toast.success("Holiday added");
            setDate("");
            setName("");
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="hol-date">Date</Label>
            <Input id="hol-date" type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid flex-1 gap-1">
            <Label htmlFor="hol-name">Name</Label>
            <Input id="hol-name" placeholder="e.g. Thanksgiving" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit"><Plus /> Add holiday</Button>
        </form>
        <ListState items={list} loading={!hydrated} emptyTitle="No holidays" emptyDescription="Add days the clinic is closed.">
          {(items) => (
            <ul className="divide-y rounded-md border">
              {items.map((h) => (
                <li key={h.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span><strong>{format(fromWall(`${h.date}T00:00`), "EEE, MMM d, yyyy")}</strong> · {h.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${h.name}`}
                    onClick={() => {
                      mutate((db) => {
                        const c = db.clinics.find((x) => x.id === clinicId)!;
                        c.holidays = c.holidays.filter((x) => x.id !== h.id);
                      });
                      logAudit({ action: `Removed holiday ${h.date}`, category: "settings", target: "Schedule", clinicId });
                      toast.success("Holiday removed");
                    }}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ListState>
      </CardContent>
    </Card>
  );
}

function Blockouts() {
  const { clinic, clinicId, providers, operatories } = useClinicConfig();
  const hydrated = useHydrated();
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const [form, setForm] = useState({ label: "", start: "", end: "", target: "clinic" });
  const list = useMemo(() => [...(clinic?.blockouts ?? [])].sort((a, b) => a.start.localeCompare(b.start)), [clinic]);
  const targetLabel = (b: Blockout) =>
    b.providerId ? providers.find((p) => p.id === b.providerId)?.displayName : b.operatoryId ? operatories.find((o) => o.id === b.operatoryId)?.name : "Whole clinic";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Blockouts</CardTitle>
        <CardDescription>Block time for meetings, training or a room being out of action.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.label.trim() || !form.start || !form.end) return void toast.error("Enter a label, start and end.");
            if (form.end <= form.start) return void toast.error("End must be after start.");
            const b: Blockout = {
              id: uid("blk"),
              label: form.label.trim(),
              start: form.start,
              end: form.end,
              providerId: form.target.startsWith("p:") ? form.target.slice(2) : undefined,
              operatoryId: form.target.startsWith("o:") ? form.target.slice(2) : undefined,
            };
            mutate((db) => void db.clinics.find((c) => c.id === clinicId)!.blockouts.push(b));
            logAudit({ action: `Added blockout “${b.label}”`, category: "settings", target: "Schedule", clinicId });
            toast.success("Blockout added");
            setForm({ label: "", start: "", end: "", target: "clinic" });
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="blk-label">Label</Label>
            <Input id="blk-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Staff meeting" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="blk-start">Start</Label>
            <Input id="blk-start" type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="blk-end">End</Label>
            <Input id="blk-end" type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="blk-target">Applies to</Label>
            <select id="blk-target" className="h-10 rounded-md border border-input bg-card px-2 text-sm" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}>
              <option value="clinic">Whole clinic</option>
              <optgroup label="Provider">
                {providers.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.displayName}</option>)}
              </optgroup>
              <optgroup label="Operatory">
                {operatories.map((o) => <option key={o.id} value={`o:${o.id}`}>{o.name}</option>)}
              </optgroup>
            </select>
          </div>
          <Button type="submit"><Plus /> Add</Button>
        </form>
        <ListState items={list} loading={!hydrated} emptyTitle="No blockouts" emptyDescription="Blocked time is hidden from the booking widget.">
          {(items) => (
            <ul className="divide-y rounded-md border">
              {items.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    <strong>{b.label}</strong> · {format(fromWall(b.start), "MMM d, h:mm a")} – {format(fromWall(b.end), b.start.slice(0, 10) === b.end.slice(0, 10) ? "h:mm a" : "MMM d, h:mm a")}
                    <Badge variant="outline" className="ml-2">{targetLabel(b)}</Badge>
                    {clinic?.settings.scheduling.blockoutsToSkip.includes(b.id) && <Badge variant="muted" className="ml-1">Skipped</Badge>}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove blockout ${b.label}`}
                    onClick={() => {
                      mutate((db) => {
                        const c = db.clinics.find((x) => x.id === clinicId)!;
                        c.blockouts = c.blockouts.filter((x) => x.id !== b.id);
                      });
                      logAudit({ action: `Removed blockout “${b.label}”`, category: "settings", target: "Schedule", clinicId });
                      toast.success("Blockout removed");
                    }}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ListState>
      </CardContent>
    </Card>
  );
}

function OperatoryDialog({ op, onClose }: { op: Operatory | "new" | null; onClose: () => void }) {
  const { clinicId, providers, reasons } = useClinicConfig();
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [providerIds, setProviderIds] = useState<string[]>([]);
  const [reasonIds, setReasonIds] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!op) return;
    const o = op === "new" ? null : op;
    setName(o?.name ?? "");
    setActive(o?.active ?? true);
    setProviderIds(o ? providers.filter((p) => p.operatoryIds.includes(o.id)).map((p) => p.id) : []);
    setReasonIds(o ? reasons.filter((r) => r.operatoryIds.includes(o.id)).map((r) => r.id) : []);
    setError(undefined);
  }, [op, providers, reasons]);

  return (
    <Dialog open={!!op} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{op === "new" ? "Add operatory" : `Edit ${op?.name ?? ""}`}</DialogTitle>
          <DialogDescription>A room or chair. One visit at a time, so it can never be double booked.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length < 2) return setError("Enter a name");
            const id = op === "new" || !op ? uid("op") : op.id;
            mutate((db) => {
              const existing = db.operatories.find((o) => o.id === id);
              if (existing) Object.assign(existing, { name: name.trim(), active });
              else db.operatories.push({ id, clinicId, name: name.trim(), active, providerIds: [], reasonIds: [] });
              setOperatoryLinks(db, id, providerIds, reasonIds);
            });
            logAudit({ action: `${op === "new" ? "Added" : "Edited"} operatory ${name.trim()}`, category: "settings", target: "Operatories", clinicId });
            toast.success("Operatory saved");
            onClose();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="op-name">Name</Label>
            <Input id="op-name" value={name} aria-invalid={!!error} onChange={(e) => setName(e.target.value)} />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <label htmlFor="op-active" className="flex items-center gap-2 text-sm"><Switch id="op-active" checked={active} onCheckedChange={setActive} /> Active</label>
          <MultiCheck legend="Linked providers" idPrefix="op-p" options={providers.map((p) => ({ value: p.id, label: p.displayName }))} value={providerIds} onChange={setProviderIds} />
          <MultiCheck legend="Linked reasons" idPrefix="op-r" options={reasons.map((r) => ({ value: r.id, label: r.name }))} value={reasonIds} onChange={setReasonIds} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RoomUsageToday() {
  const { clinic, clinicId, operatories, reasons } = useClinicConfig();
  const appts = useApp((s) => s.db.appointments);
  if (!clinic) return null;
  const today = dayKey(nowInZone(clinic.timeZone));
  const wd = nowInZone(clinic.timeZone).getDay() as keyof typeof clinic.hours;
  const h = clinic.hours[wd];
  const open = h.enabled ? hm(h.start) : 8 * 60;
  const close = h.enabled ? hm(h.end) : 18 * 60;
  const span = Math.max(60, close - open);
  const todays = appts.filter((a) => a.clinicId === clinicId && a.start.startsWith(today) && a.operatoryId && !["cancelled", "declined"].includes(a.status));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Today&apos;s room usage</CardTitle>
        <CardDescription>{h.enabled ? `${h.start} – ${h.end}` : "Closed today"} · read-only</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {operatories.filter((o) => o.active).map((o) => (
          <div key={o.id} className="grid grid-cols-[110px_1fr] items-center gap-2">
            <span className="truncate text-xs font-medium">{o.name}</span>
            <div className="relative h-6 rounded bg-muted" role="img" aria-label={`${o.name}: ${todays.filter((a) => a.operatoryId === o.id).length} visits today`}>
              {todays
                .filter((a) => a.operatoryId === o.id)
                .map((a) => {
                  const s = hm(a.start.slice(11, 16)) - open;
                  const e = hm(a.end.slice(11, 16)) - open;
                  const r = reasons.find((x) => x.id === a.reasonId);
                  return (
                    <span
                      key={a.id}
                      title={`${fmtTime(a.start)}–${fmtTime(a.end)} ${r?.name ?? ""}`}
                      className="absolute top-0.5 h-5 rounded-sm"
                      style={{ left: `${(Math.max(0, s) / span) * 100}%`, width: `${(Math.max(5, e - s) / span) * 100}%`, background: r?.color ?? "#0f766e" }}
                    />
                  );
                })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Operatories() {
  const hydrated = useHydrated();
  const { clinicId, operatories, providers, reasons } = useClinicConfig();
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const [editing, setEditing] = useState<Operatory | "new" | null>(null);
  const del = useConfirm<Operatory>();
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>Operatories</CardTitle>
            <CardDescription>Rooms or chairs. The slot engine only offers a time if a linked room is free, so a room is never double booked.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setEditing("new")}><Plus /> Add</Button>
        </CardHeader>
        <CardContent>
          <ListState items={operatories} loading={!hydrated} emptyTitle="No operatories" emptyDescription="Add rooms or chairs to prevent double booking." emptyAction={<Button size="sm" onClick={() => setEditing("new")}><Plus /> Add operatory</Button>}>
            {(list) => (
              <ul className="divide-y rounded-md border">
                {list.map((o) => (
                  <li key={o.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
                    <div className="flex-1">
                      <p className="font-medium">{o.name} {!o.active && <Badge variant="muted">Inactive</Badge>}</p>
                      <p className="text-xs text-muted-foreground">
                        Providers: {providers.filter((p) => p.operatoryIds.includes(o.id)).map((p) => p.displayName).join(", ") || "none"}
                        <br />
                        Reasons: {reasons.filter((r) => r.operatoryIds.includes(o.id)).map((r) => r.name).join(", ") || "none"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch
                        aria-label={`${o.name} active`}
                        checked={o.active}
                        onCheckedChange={(v) => {
                          mutate((db) => void (db.operatories.find((x) => x.id === o.id)!.active = v));
                          logAudit({ action: `${v ? "Activated" : "Deactivated"} operatory ${o.name}`, category: "settings", target: "Operatories", clinicId });
                          toast.success(`${o.name} ${v ? "active" : "inactive"}`);
                        }}
                      />
                      <Button variant="ghost" size="icon" aria-label={`Edit ${o.name}`} onClick={() => setEditing(o)}><Pencil /></Button>
                      <Button variant="ghost" size="icon" aria-label={`Delete ${o.name}`} onClick={() => del.ask(o)}><Trash2 /></Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ListState>
        </CardContent>
      </Card>
      <RoomUsageToday />
      <OperatoryDialog op={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={del.open}
        onOpenChange={(o) => !o && del.close()}
        title={`Delete ${del.item?.name}?`}
        description="It is unlinked from all providers and reasons."
        onConfirm={() => {
          const o = del.item!;
          mutate((db) => removeOperatory(db, o.id));
          logAudit({ action: `Deleted operatory ${o.name}`, category: "settings", target: "Operatories", clinicId });
          toast.success("Operatory deleted");
        }}
      />
    </div>
  );
}

export default function SchedulePage() {
  return (
    <RequirePermission perm="schedule:manage">
      <PageHeader title="Schedule & operatories" description="Opening hours, holidays, blockouts and rooms used by the slot engine." />
      <Tabs defaultValue="hours">
        <TabsList>
          <TabsTrigger value="hours">Clinic hours</TabsTrigger>
          <TabsTrigger value="holidays">Holidays</TabsTrigger>
          <TabsTrigger value="blockouts">Blockouts</TabsTrigger>
          <TabsTrigger value="operatories">Operatories</TabsTrigger>
        </TabsList>
        <TabsContent value="hours"><ClinicHours /></TabsContent>
        <TabsContent value="holidays"><Holidays /></TabsContent>
        <TabsContent value="blockouts"><Blockouts /></TabsContent>
        <TabsContent value="operatories"><Operatories /></TabsContent>
      </Tabs>
    </RequirePermission>
  );
}
