"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import type { Break, Operatory, Provider, Reason, TimeOff, WeeklyHours } from "@/types";
import { uid } from "@/lib/utils";
import { weeklyHours } from "@/mock/defaults";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, FieldError, MultiCheck, WEEKDAYS, WeeklyHoursEditor, hoursValid } from "./common";

const MAX_PHOTO_BYTES = 150 * 1024;

const schema = z.object({
  displayName: z.string().trim().min(2, "Display name is required"),
  externalId: z.string().trim().min(1, "ID is required"),
  role: z.enum(["Doctor", "Hygienist", "Assistant"]),
  bio: z.string().trim().max(500, "Keep the bio under 500 characters"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color"),
});
type Values = z.infer<typeof schema>;

export type ProviderSave = Omit<Provider, "id" | "clinicId" | "reasonIds"> & { reasonIds: string[] };

export function ProviderEditor({
  open,
  onOpenChange,
  provider,
  reasons,
  operatories,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  provider: Provider | null;
  reasons: Reason[];
  operatories: Operatory[];
  onSave: (p: ProviderSave) => void;
}) {
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  const { errors } = form.formState;
  const [hours, setHours] = useState<WeeklyHours>(weeklyHours());
  const [breaks, setBreaks] = useState<Break[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [opIds, setOpIds] = useState<string[]>([]);
  const [reasonIds, setReasonIds] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();
  const [active, setActive] = useState(true);
  const [showOnline, setShowOnline] = useState(true);
  const [tab, setTab] = useState("profile");
  const [scheduleError, setScheduleError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    form.reset({
      displayName: provider?.displayName ?? "",
      externalId: provider?.externalId ?? `PMS-${Math.floor(100 + Math.random() * 900)}`,
      role: provider?.role ?? "Doctor",
      bio: provider?.bio ?? "",
      color: provider?.color ?? "#0f766e",
    });
    setHours(structuredClone(provider?.weeklyHours ?? weeklyHours()));
    setBreaks(structuredClone(provider?.breaks ?? [{ id: uid("brk"), weekday: "all", start: "12:00", end: "13:00", label: "Lunch" }]));
    setTimeOff(structuredClone(provider?.timeOff ?? []));
    setOpIds(provider?.operatoryIds ?? []);
    setReasonIds(provider ? reasons.filter((r) => r.providerIds.includes(provider.id)).map((r) => r.id) : []);
    setPhotoUrl(provider?.photoUrl);
    setActive(provider?.active ?? true);
    setShowOnline(provider?.showOnline ?? true);
    setTab("profile");
    setScheduleError(undefined);
  }, [open, provider, reasons, form]);

  const onPhoto = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error("Photo is larger than 150 KB, keeping initials. (Prototype stores photos in the browser.)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotoUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const submit = (v: Values) => {
    if (!hoursValid(hours)) return void (setTab("schedule"), setScheduleError("Fix the weekly hours: end must be after start."));
    if (breaks.some((b) => b.start >= b.end)) return void (setTab("schedule"), setScheduleError("Each break must end after it starts."));
    if (timeOff.some((t) => !t.start || !t.end || t.end < t.start)) return void (setTab("schedule"), setScheduleError("Each time off needs a start and an end on or after it."));
    onSave({ ...v, weeklyHours: hours, breaks, timeOff, operatoryIds: opIds, reasonIds, photoUrl, active, showOnline });
  };

  const name = form.watch("displayName") || "New provider";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold">{provider ? `Edit ${provider.displayName}` : "Add provider"}</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">Profile, working hours and what they can be booked for.</SheetDescription>
        </SheetHeader>
        <form onSubmit={form.handleSubmit(submit, () => setTab("profile"))} className="grid gap-4" noValidate>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="schedule">Hours & time off</TabsTrigger>
              <TabsTrigger value="links">Rooms & reasons</TabsTrigger>
            </TabsList>
            <TabsContent value="profile" className="grid gap-4">
              <div className="flex items-center gap-4">
                <Avatar name={name} src={photoUrl} color={form.watch("color")} size={64} />
                <div className="grid gap-1.5">
                  <Label htmlFor="pv-photo">Photo</Label>
                  <Input id="pv-photo" type="file" accept="image/*" onChange={(e) => onPhoto(e.target.files?.[0])} />
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">Up to 150 KB. Initials are used if empty.</p>
                    {photoUrl && <Button type="button" variant="link" size="xs" onClick={() => setPhotoUrl(undefined)}>Remove photo</Button>}
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="pv-name">Display name</Label>
                  <Input id="pv-name" aria-invalid={!!errors.displayName} {...form.register("displayName")} />
                  <FieldError msg={errors.displayName?.message} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pv-id">ID (PMS)</Label>
                  <Input id="pv-id" aria-invalid={!!errors.externalId} {...form.register("externalId")} />
                  <FieldError msg={errors.externalId?.message} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pv-role">Role</Label>
                  <select id="pv-role" className="h-10 rounded-md border border-input bg-card px-2 text-sm" {...form.register("role")}>
                    <option>Doctor</option>
                    <option>Hygienist</option>
                    <option>Assistant</option>
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pv-color">Calendar color</Label>
                  <div className="flex gap-2">
                    <input type="color" aria-label="Pick calendar color" className="h-10 w-12 rounded border" value={form.watch("color") ?? "#0f766e"} onChange={(e) => form.setValue("color", e.target.value)} />
                    <Input id="pv-color" {...form.register("color")} />
                  </div>
                  <FieldError msg={errors.color?.message} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pv-bio">Bio</Label>
                <Textarea id="pv-bio" rows={3} {...form.register("bio")} />
                <FieldError msg={errors.bio?.message} />
              </div>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm" htmlFor="pv-active"><Switch id="pv-active" checked={active} onCheckedChange={setActive} /> Active</label>
                <label className="flex items-center gap-2 text-sm" htmlFor="pv-online"><Switch id="pv-online" checked={showOnline} onCheckedChange={setShowOnline} /> Show online</label>
              </div>
            </TabsContent>
            <TabsContent value="schedule" className="grid gap-5">
              {scheduleError && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">{scheduleError}</p>}
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold">Weekly hours</h3>
                <p className="text-xs text-muted-foreground">Patients only see times inside both these hours and the clinic hours.</p>
                <WeeklyHoursEditor value={hours} onChange={setHours} idPrefix="pv-h" />
              </section>
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold">Breaks</h3>
                {breaks.map((b) => (
                  <div key={b.id} className="flex flex-wrap items-end gap-2 rounded-md border p-2">
                    <div className="grid gap-1">
                      <Label htmlFor={`brk-l-${b.id}`} className="text-xs">Label</Label>
                      <Input id={`brk-l-${b.id}`} className="h-9 w-32" value={b.label} onChange={(e) => setBreaks(breaks.map((x) => (x.id === b.id ? { ...x, label: e.target.value } : x)))} />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`brk-d-${b.id}`} className="text-xs">Day</Label>
                      <select id={`brk-d-${b.id}`} className="h-9 rounded-md border border-input bg-card px-2 text-sm" value={String(b.weekday)} onChange={(e) => setBreaks(breaks.map((x) => (x.id === b.id ? { ...x, weekday: e.target.value === "all" ? "all" : (Number(e.target.value) as Break["weekday"]) } : x)))}>
                        <option value="all">Every day</option>
                        {WEEKDAYS.map((d) => <option key={d.day} value={d.day}>{d.long}</option>)}
                      </select>
                    </div>
                    <Input type="time" aria-label="Break start" className="h-9 w-28" value={b.start} onChange={(e) => setBreaks(breaks.map((x) => (x.id === b.id ? { ...x, start: e.target.value } : x)))} />
                    <Input type="time" aria-label="Break end" className="h-9 w-28" value={b.end} onChange={(e) => setBreaks(breaks.map((x) => (x.id === b.id ? { ...x, end: e.target.value } : x)))} />
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove break ${b.label}`} onClick={() => setBreaks(breaks.filter((x) => x.id !== b.id))}><Trash2 /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setBreaks([...breaks, { id: uid("brk"), weekday: "all", start: "12:00", end: "12:30", label: "Break" }])}><Plus /> Add break</Button>
              </section>
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold">Time off</h3>
                {timeOff.length === 0 && <p className="text-xs text-muted-foreground">No time off planned.</p>}
                {timeOff.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-end gap-2 rounded-md border p-2">
                    <div className="grid gap-1">
                      <Label htmlFor={`to-s-${t.id}`} className="text-xs">From</Label>
                      <Input id={`to-s-${t.id}`} type="date" className="h-9 w-40" value={t.start} onChange={(e) => setTimeOff(timeOff.map((x) => (x.id === t.id ? { ...x, start: e.target.value } : x)))} />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`to-e-${t.id}`} className="text-xs">To (inclusive)</Label>
                      <Input id={`to-e-${t.id}`} type="date" className="h-9 w-40" value={t.end} onChange={(e) => setTimeOff(timeOff.map((x) => (x.id === t.id ? { ...x, end: e.target.value } : x)))} />
                    </div>
                    <div className="grid flex-1 gap-1">
                      <Label htmlFor={`to-r-${t.id}`} className="text-xs">Reason</Label>
                      <Input id={`to-r-${t.id}`} className="h-9" value={t.reason} onChange={(e) => setTimeOff(timeOff.map((x) => (x.id === t.id ? { ...x, reason: e.target.value } : x)))} />
                    </div>
                    <Button type="button" variant="ghost" size="icon" aria-label="Remove time off" onClick={() => setTimeOff(timeOff.filter((x) => x.id !== t.id))}><Trash2 /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setTimeOff([...timeOff, { id: uid("to"), start: "", end: "", reason: "Vacation" }])}><Plus /> Add time off</Button>
              </section>
            </TabsContent>
            <TabsContent value="links" className="grid gap-5">
              <MultiCheck legend="Operatories" idPrefix="pv-op" options={operatories.map((o) => ({ value: o.id, label: o.name, hint: o.active ? undefined : "inactive" }))} value={opIds} onChange={setOpIds} empty="No operatories yet." />
              <MultiCheck legend="Reasons offered" idPrefix="pv-r" options={reasons.map((r) => ({ value: r.id, label: r.name, hint: `${r.duration} min` }))} value={reasonIds} onChange={setReasonIds} empty="No reasons yet." />
            </TabsContent>
          </Tabs>
          <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-card pt-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">Save provider</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
