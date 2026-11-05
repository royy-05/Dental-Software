"use client";

import { useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import type { Specialty } from "@/types";
import { api } from "@/lib/api/client";
import { qk, useApiMutation } from "@/lib/api/session";
import { useAdminClinics, useAdminPlans, useAdminStarters, useAdminUsers } from "@/lib/api/admin";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field, NativeSelect } from "./common";
import { TIME_ZONES, type NewClinicInput } from "./clinic-ops";
import { isSlugTaken, parseCsv, slugify } from "./metrics";

const STEPS = ["Details", "Booking link", "Owner", "Plan", "Starter template", "Import"] as const;

const REASON_SAMPLE = "name,duration,patient_type,description,estimated_value\nNew Patient Visit,60,new,First visit and assessment,200\nFollow-up,30,existing,Check-in visit,90";
const PROVIDER_SAMPLE = "display_name,role,id\nDr. Riley Quinn,Doctor,PMS-101\nJamie Lane,Hygienist,PMS-102";

export function AddClinicWizard() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const clinics = useAdminClinics().data ?? [];
  const usersData = useAdminUsers().data;
  const plans = useAdminPlans().data ?? [];
  const starters = useAdminStarters().data ?? [];

  const initial = {
    name: "",
    specialty: "dental" as Specialty,
    phone: "",
    email: "",
    address: "",
    slug: "",
    timeZone: "America/New_York",
    ownerMode: "invite" as "invite" | "existing",
    ownerName: "",
    ownerEmail: "",
    ownerId: "",
    planId: "plan_growth",
    trial: true,
    starterTemplateId: "st_dental",
    reasonsCsv: "",
    providersCsv: "",
  };
  const [v, setV] = useState(initial);
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));

  const owners = useMemo(() => (usersData ?? []).filter((u) => u.role === "clinic_owner" && u.active), [usersData]);
  const reasons = useMemo(() => parseCsv(v.reasonsCsv), [v.reasonsCsv]);
  const providers = useMemo(() => parseCsv(v.providersCsv), [v.providersCsv]);
  const slug = v.slug || slugify(v.name);
  const slugTaken = isSlugTaken(slug, clinics);

  const errors: Record<number, string | null> = {
    0: !v.name.trim() ? "Clinic name is required." : !/^\S+@\S+\.\S+$/.test(v.email) ? "Enter a valid clinic email." : null,
    1: !slug ? "Slug is required." : !/^[a-z0-9-]+$/.test(slug) ? "Use lowercase letters, numbers and dashes." : slugTaken ? "This slug is already used by another clinic." : null,
    2: v.ownerMode === "invite" ? (!v.ownerName.trim() || !/^\S+@\S+\.\S+$/.test(v.ownerEmail) ? "Owner name and a valid email are required." : null) : !v.ownerId ? "Pick an owner." : null,
    3: null,
    4: null,
    5: null,
  };

  const next = () => {
    setTouched(true);
    if (errors[step]) return;
    setTouched(false);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const create = useApiMutation((input: NewClinicInput) => api<{ id: string; name: string }>("/api/admin/clinics", { body: input }), {
    invalidate: [qk.admin()],
    success: (_r, input) => (input.owner.mode === "invite" ? `Clinic created. Invite emailed to ${input.owner.email}.` : "Clinic created"),
    onSuccess: () => {
      setOpen(false);
      setStep(0);
      setV(initial);
    },
  });

  const finish = () => {
    const input: NewClinicInput = {
      name: v.name.trim(),
      slug,
      specialty: v.specialty,
      timeZone: v.timeZone,
      phone: v.phone,
      email: v.email,
      address: v.address,
      planId: v.planId,
      trial: v.trial,
      owner: v.ownerMode === "existing" ? { mode: "existing", userId: v.ownerId } : { mode: "invite", name: v.ownerName.trim(), email: v.ownerEmail.trim() },
      starterTemplateId: v.starterTemplateId || undefined,
      importReasons: reasons,
      importProviders: providers,
    };
    create.mutate(input);
  };

  const readFile = (file: File | undefined, key: "reasonsCsv" | "providersCsv") => {
    if (!file) return;
    file.text().then((t) => set(key, t));
  };

  const err = touched ? errors[step] : null;

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> Add clinic
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add clinic</DialogTitle>
            <DialogDescription>
              Step {step + 1} of {STEPS.length}: {STEPS[step]}
            </DialogDescription>
          </DialogHeader>
          <ol className="flex flex-wrap gap-1" aria-label="Wizard progress">
            {STEPS.map((s, i) => (
              <li key={s} aria-current={i === step ? "step" : undefined} className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-xs", i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground")}>
                {i < step && <Check className="h-3 w-3" aria-hidden />} {s}
              </li>
            ))}
          </ol>

          <div className="grid gap-4">
            {step === 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Clinic name" htmlFor="w-name">
                  <Input id="w-name" value={v.name} onChange={(e) => set("name", e.target.value)} />
                </Field>
                <Field label="Specialty" htmlFor="w-spec">
                  <NativeSelect id="w-spec" value={v.specialty} onChange={(e) => { set("specialty", e.target.value as Specialty); set("starterTemplateId", e.target.value === "dental" ? "st_dental" : e.target.value === "physio" ? "st_physio" : "st_derm"); }}>
                    <option value="dental">Dental</option>
                    <option value="physio">Physiotherapy</option>
                    <option value="dermatology">Dermatology</option>
                  </NativeSelect>
                </Field>
                <Field label="Phone" htmlFor="w-phone">
                  <Input id="w-phone" type="tel" value={v.phone} placeholder="(555) 010-0000" onChange={(e) => set("phone", e.target.value)} />
                </Field>
                <Field label="Clinic email" htmlFor="w-email">
                  <Input id="w-email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Address" htmlFor="w-addr">
                    <Input id="w-addr" value={v.address} onChange={(e) => set("address", e.target.value)} />
                  </Field>
                </div>
              </div>
            )}
            {step === 1 && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Booking slug" htmlFor="w-slug" hint={`Link: /book/${slug || "your-clinic"}`}>
                  <Input id="w-slug" value={v.slug || slugify(v.name)} onChange={(e) => set("slug", slugify(e.target.value))} aria-invalid={slugTaken} />
                </Field>
                <Field label="Time zone" htmlFor="w-tz">
                  <NativeSelect id="w-tz" value={v.timeZone} onChange={(e) => set("timeZone", e.target.value)}>
                    {TIME_ZONES.map((t) => <option key={t}>{t}</option>)}
                  </NativeSelect>
                </Field>
              </div>
            )}
            {step === 2 && (
              <div className="grid gap-3">
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2"><input type="radio" name="w-owner" checked={v.ownerMode === "invite"} onChange={() => set("ownerMode", "invite")} /> Invite a new owner</label>
                  <label className="flex items-center gap-2"><input type="radio" name="w-owner" checked={v.ownerMode === "existing"} onChange={() => set("ownerMode", "existing")} /> Existing owner</label>
                </div>
                {v.ownerMode === "invite" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Owner name" htmlFor="w-oname"><Input id="w-oname" value={v.ownerName} onChange={(e) => set("ownerName", e.target.value)} /></Field>
                    <Field label="Owner email" htmlFor="w-oemail" hint="They get an email with a link to set their password."><Input id="w-oemail" type="email" value={v.ownerEmail} onChange={(e) => set("ownerEmail", e.target.value)} /></Field>
                  </div>
                ) : (
                  <Field label="Owner" htmlFor="w-oid">
                    <NativeSelect id="w-oid" value={v.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
                      <option value="">Select…</option>
                      {owners.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.email})</option>)}
                    </NativeSelect>
                  </Field>
                )}
              </div>
            )}
            {step === 3 && (
              <div className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  {plans.map((p) => (
                    <button type="button" key={p.id} onClick={() => set("planId", p.id)} aria-pressed={v.planId === p.id} className={cn("rounded-md border p-3 text-left text-sm", v.planId === p.id && "border-primary bg-secondary/50")}>
                      <span className="block font-semibold">{p.name}</span>
                      <span className="block text-muted-foreground">${p.priceMonthly}/mo</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{p.limits.providers} providers · {p.limits.smsCredits} SMS</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="w-trial" checked={v.trial} onCheckedChange={(c) => set("trial", c)} />
                  <Label htmlFor="w-trial">Start with a 14-day trial</Label>
                </div>
              </div>
            )}
            {step === 4 && (
              <div className="grid gap-2">
                {starters.filter((t) => t.published).map((t) => (
                  <label key={t.id} className={cn("flex cursor-pointer gap-3 rounded-md border p-3 text-sm", v.starterTemplateId === t.id && "border-primary bg-secondary/40")}>
                    <input type="radio" name="w-starter" checked={v.starterTemplateId === t.id} onChange={() => set("starterTemplateId", t.id)} />
                    <span>
                      <span className="block font-medium">{t.name} <span className="font-normal capitalize text-muted-foreground">· {t.specialty}</span></span>
                      <span className="block text-xs text-muted-foreground">{t.description}</span>
                      <span className="block text-xs text-muted-foreground">Reasons: {t.defaultReasons.map((r) => r.name).join(", ")}</span>
                    </span>
                  </label>
                ))}
                <label className={cn("flex cursor-pointer gap-3 rounded-md border p-3 text-sm", !v.starterTemplateId && "border-primary")}>
                  <input type="radio" name="w-starter" checked={!v.starterTemplateId} onChange={() => set("starterTemplateId", "")} /> Blank (default flow, no reasons)
                </label>
              </div>
            )}
            {step === 5 && (
              <div className="grid gap-4">
                {(["reasonsCsv", "providersCsv"] as const).map((key) => {
                  const rows = key === "reasonsCsv" ? reasons : providers;
                  const sample = key === "reasonsCsv" ? REASON_SAMPLE : PROVIDER_SAMPLE;
                  const label = key === "reasonsCsv" ? "Reasons CSV" : "Providers CSV";
                  return (
                    <div key={key} className="grid gap-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor={`w-${key}`}>{label} (optional)</Label>
                        <div className="flex gap-2">
                          <Button type="button" size="xs" variant="outline" onClick={() => set(key, sample)}>Use sample</Button>
                          <Input type="file" accept=".csv,text/csv" aria-label={`Upload ${label}`} className="h-7 w-48 text-xs" onChange={(e) => readFile(e.target.files?.[0], key)} />
                        </div>
                      </div>
                      <Textarea id={`w-${key}`} rows={3} className="font-mono text-xs" placeholder={sample.split("\n")[0]} value={v[key]} onChange={(e) => set(key, e.target.value)} />
                      {rows.length > 0 && (
                        <div className="max-h-40 overflow-auto rounded border">
                          <Table>
                            <TableHeader>
                              <TableRow>{Object.keys(rows[0]).map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow>
                            </TableHeader>
                            <TableBody>
                              {rows.map((r, i) => (
                                <TableRow key={i}>{Object.values(r).map((c, j) => <TableCell key={j} className="py-1 text-xs">{c}</TableCell>)}</TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">{rows.length} rows ready to import.</p>
                    </div>
                  );
                })}
              </div>
            )}
            {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
          </div>

          <DialogFooter>
            {step > 0 && <Button variant="outline" onClick={() => setStep((s) => s - 1)}>Back</Button>}
            {step < STEPS.length - 1 ? <Button onClick={next}>Next</Button> : <Button onClick={finish} disabled={create.isPending}>{create.isPending ? "Creating…" : "Create clinic"}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
