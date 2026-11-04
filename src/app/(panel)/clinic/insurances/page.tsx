"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Trash2 } from "lucide-react";
import type { ClinicInsurance, InsuranceSettings, NetworkStatus } from "@/types";
import { useApp } from "@/store/app";
import { uid } from "@/lib/utils";
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
import { Textarea } from "@/components/ui/textarea";
import { useClinicConfig } from "@/components/config/common";
import { parseBulkNames } from "@/components/config/link-sync";

const STATUS_OPTIONS: { value: NetworkStatus; label: string }[] = [
  { value: "in_network", label: "In network" },
  { value: "out_of_network", label: "Out of network" },
  { value: "not_accepted", label: "Not accepted" },
];
const STATUS_BADGE: Record<NetworkStatus, "success" | "warning" | "danger"> = { in_network: "success", out_of_network: "warning", not_accepted: "danger" };

function CarrierList() {
  const hydrated = useHydrated();
  const { clinicId } = useClinicConfig();
  const all = useApp((s) => s.db.clinicInsurances);
  const carriers = useApp((s) => s.db.carriers);
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const [q, setQ] = useState("");
  const [bulk, setBulk] = useState("");
  const mine = useMemo(() => all.filter((i) => i.clinicId === clinicId).sort((a, b) => a.name.localeCompare(b.name)), [all, clinicId]);
  const available = useMemo(
    () => carriers.filter((c) => !mine.some((m) => m.carrierId === c.id) && c.name.toLowerCase().includes(q.toLowerCase())),
    [carriers, mine, q],
  );

  const add = (items: Omit<ClinicInsurance, "id" | "clinicId">[], what: string) => {
    mutate((db) => {
      for (const it of items) db.clinicInsurances.push({ ...it, id: uid("ci"), clinicId });
    });
    logAudit({ action: `Added insurance ${what}`, category: "settings", target: "Insurances", clinicId });
    toast.success(`Added ${what}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accepted carriers</CardTitle>
        <CardDescription>Patients pick from this list. The status decides which warning they see.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <ListState items={mine} loading={!hydrated} emptyTitle="No carriers yet" emptyDescription="Pick carriers from the master list or add your own below.">
          {(list) => (
            <ul className="divide-y rounded-md border">
              {list.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="flex-1 text-sm font-medium">
                    {i.name} {i.custom && <Badge variant="outline">Custom</Badge>}
                  </span>
                  <Badge variant={STATUS_BADGE[i.status]} className="hidden sm:inline-flex">{STATUS_OPTIONS.find((s) => s.value === i.status)?.label}</Badge>
                  <select
                    aria-label={`${i.name} network status`}
                    className="h-9 rounded-md border border-input bg-card px-2 text-sm"
                    value={i.status}
                    onChange={(e) => {
                      const status = e.target.value as NetworkStatus;
                      mutate((db) => void (db.clinicInsurances.find((x) => x.id === i.id)!.status = status));
                      logAudit({ action: `Set ${i.name} to ${status}`, category: "settings", target: "Insurances", clinicId });
                      toast.success(`${i.name}: ${STATUS_OPTIONS.find((s) => s.value === status)?.label}`);
                    }}
                  >
                    {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${i.name}`}
                    onClick={() => {
                      mutate((db) => void (db.clinicInsurances = db.clinicInsurances.filter((x) => x.id !== i.id)));
                      logAudit({ action: `Removed insurance ${i.name}`, category: "settings", target: "Insurances", clinicId });
                      toast.success(`${i.name} removed`);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ListState>
        <section className="grid gap-2" aria-labelledby="master-h">
          <h3 id="master-h" className="text-sm font-semibold">Add from master list</h3>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input className="pl-9" placeholder="Search carriers" aria-label="Search master carrier list" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {available.length === 0 && <p className="text-xs text-muted-foreground">No more carriers match.</p>}
            {available.map((c) => (
              <Button key={c.id} variant="outline" size="sm" onClick={() => add([{ carrierId: c.id, name: c.name, status: "in_network", custom: false }], c.name)}>
                <Plus /> {c.name}
              </Button>
            ))}
          </div>
        </section>
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const names = parseBulkNames(bulk, mine.map((m) => m.name));
            if (!names.length) return void toast.error("Nothing new to add. Separate names with commas.");
            add(names.map((name) => ({ name, status: "in_network" as const, custom: true })), names.length === 1 ? names[0] : `${names.length} custom carriers`);
            setBulk("");
          }}
        >
          <Label htmlFor="bulk-carriers">Add custom carriers (comma-separated)</Label>
          <div className="flex gap-2">
            <Input id="bulk-carriers" placeholder="Local Health Plan, Union Dental Fund" value={bulk} onChange={(e) => setBulk(e.target.value)} />
            <Button type="submit">Add</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function InsuranceSettingsCard() {
  const { clinic, clinicId } = useClinicConfig();
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const [s, setS] = useState<InsuranceSettings | null>(null);
  const [newQ, setNewQ] = useState("");
  useEffect(() => setS(clinic ? structuredClone(clinic.insuranceSettings) : null), [clinic]);
  if (!clinic || !s) return null;
  const dirty = JSON.stringify(s) !== JSON.stringify(clinic.insuranceSettings);
  const warn = (k: keyof InsuranceSettings["warnings"], label: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`warn-${k}`}>{label}</Label>
      <Textarea id={`warn-${k}`} rows={2} value={s.warnings[k]} onChange={(e) => setS({ ...s, warnings: { ...s.warnings, [k]: e.target.value } })} />
    </div>
  );
  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle>Insurance settings</CardTitle>
        <CardDescription>What the widget asks and the warnings patients see.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <label htmlFor="ins-other" className="flex items-start justify-between gap-3 text-sm">
          <span>Accept other insurance<span className="block text-xs text-muted-foreground">Adds “Other” to the carrier list.</span></span>
          <Switch id="ins-other" checked={s.acceptOtherInsurance} onCheckedChange={(v) => setS({ ...s, acceptOtherInsurance: v })} />
        </label>
        <label htmlFor="ins-optional" className="flex items-start justify-between gap-3 text-sm">
          <span>Optional insurance fields<span className="block text-xs text-muted-foreground">Subscriber name, ID and date of birth become optional.</span></span>
          <Switch id="ins-optional" checked={s.optionalFields} onCheckedChange={(v) => setS({ ...s, optionalFields: v })} />
        </label>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Extra questions</legend>
          {s.extraQuestions.map((q, i) => (
            <div key={i} className="flex gap-2">
              <Input aria-label={`Extra question ${i + 1}`} value={q} onChange={(e) => setS({ ...s, extraQuestions: s.extraQuestions.map((x, j) => (j === i ? e.target.value : x)) })} />
              <Button variant="ghost" size="icon" aria-label={`Remove question ${i + 1}`} onClick={() => setS({ ...s, extraQuestions: s.extraQuestions.filter((_, j) => j !== i) })}><Trash2 /></Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input aria-label="New extra question" placeholder="e.g. Group number" value={newQ} onChange={(e) => setNewQ(e.target.value)} />
            <Button
              variant="outline"
              onClick={() => {
                if (!newQ.trim()) return;
                setS({ ...s, extraQuestions: [...s.extraQuestions, newQ.trim()] });
                setNewQ("");
              }}
            >
              <Plus /> Add
            </Button>
          </div>
        </fieldset>
        {warn("other", "Warning for other insurance")}
        {warn("outOfNetwork", "Warning for out-of-network plans")}
        {warn("notAccepted", "Warning for not-accepted plans")}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={!dirty} onClick={() => setS(structuredClone(clinic.insuranceSettings))}>Discard</Button>
          <Button
            disabled={!dirty}
            onClick={() => {
              mutate((db) => void (db.clinics.find((c) => c.id === clinicId)!.insuranceSettings = { ...s, extraQuestions: s.extraQuestions.filter((q) => q.trim()) }));
              logAudit({ action: "Updated insurance settings", category: "settings", target: "Insurances", clinicId });
              toast.success("Insurance settings saved");
            }}
          >
            Save settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function InsurancesPage() {
  return (
    <RequirePermission perm="insurances:manage">
      <PageHeader title="Insurances" description="Carriers you accept, their network status, and the insurance questions in the booking widget." />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <CarrierList />
        <InsuranceSettingsCard />
      </div>
    </RequirePermission>
  );
}
