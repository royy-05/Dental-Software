"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { DatabaseBackup } from "lucide-react";
import { toast } from "sonner";
import type { PlatformSettings } from "@/types";
import { featureEnabled } from "@/lib/permissions";
import { useApp } from "@/store/app";
import { PageHeader } from "@/components/shared/page-header";
import { ListState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminGuard, Field, NativeSelect, ResetDemoButton, Section, useAdminCan } from "@/components/admin-pages/common";
import { ReadOnlyNotice } from "@/components/admin/shell";

export default function SystemPage() {
  return (
    <AdminGuard perm="admin:access">
      <div className="space-y-6">
        <PageHeader title="System & white-label" description="Platform branding, custom domains, data retention, backups and maintenance mode." />
        <ReadOnlyNotice perm="admin:system:edit" />
        <Branding />
        <Domains />
        <DataSettings />
        <Section title="Demo data" description="Reset the prototype to its seeded state.">
          <ResetDemoButton />
        </Section>
      </div>
    </AdminGuard>
  );
}

function Branding() {
  const branding = useApp((s) => s.db.platform.branding);
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const canEdit = useAdminCan()("admin:system:edit");
  const [v, setV] = useState<PlatformSettings["branding"]>(branding);
  const hexOk = /^#[0-9a-fA-F]{6}$/.test(v.primaryColor);
  return (
    <Section title="Platform branding and white-label">
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!v.platformName.trim() || !hexOk) return;
            mutate((d) => void (d.platform.branding = v));
            logAudit({ action: "Updated platform branding", category: "settings", target: "White-label" });
            toast.success("Branding saved");
          }}
        >
          <fieldset disabled={!canEdit} className="contents">
            <Field label="Platform name" htmlFor="b-name"><Input id="b-name" value={v.platformName} onChange={(e) => setV({ ...v, platformName: e.target.value })} /></Field>
            <Field label="Logo URL" htmlFor="b-logo"><Input id="b-logo" type="url" placeholder="https://…" value={v.logoUrl ?? ""} onChange={(e) => setV({ ...v, logoUrl: e.target.value || undefined })} /></Field>
            <Field label="Primary color" htmlFor="b-color" hint={hexOk ? undefined : "Use a hex color like #0f766e"}>
              <div className="flex gap-2">
                <input type="color" aria-label="Pick primary color" className="h-10 w-12 rounded border" value={hexOk ? v.primaryColor : "#000000"} onChange={(e) => setV({ ...v, primaryColor: e.target.value })} />
                <Input id="b-color" value={v.primaryColor} aria-invalid={!hexOk} onChange={(e) => setV({ ...v, primaryColor: e.target.value })} />
              </div>
            </Field>
            <Field label="“Powered by” text" htmlFor="b-powered" hint="Shown in the booking widget footer."><Input id="b-powered" value={v.poweredByText} onChange={(e) => setV({ ...v, poweredByText: e.target.value })} /></Field>
            <Field label="Email sender domain" htmlFor="b-domain"><Input id="b-domain" value={v.emailSenderDomain} onChange={(e) => setV({ ...v, emailSenderDomain: e.target.value })} /></Field>
            {canEdit && <Button type="submit" className="self-end justify-self-start">Save branding</Button>}
          </fieldset>
        </form>
        <div aria-label="Branding preview" className="overflow-hidden rounded-lg border">
          <div className="flex items-center gap-2 px-4 py-3 text-white" style={{ background: hexOk ? v.primaryColor : "#0f766e" }}>
            {v.logoUrl ? <img src={v.logoUrl} alt="" className="h-6 w-6 rounded bg-white object-contain" /> : <span className="flex h-6 w-6 items-center justify-center rounded bg-white/20 text-xs font-bold">{v.platformName[0]}</span>}
            <span className="font-semibold">{v.platformName || "Platform"}</span>
          </div>
          <div className="space-y-2 p-4 text-sm">
            <p className="text-muted-foreground">Booking widget footer:</p>
            <p className="text-xs text-muted-foreground">{v.poweredByText}</p>
            <p className="text-xs text-muted-foreground">Emails from bookings@{v.emailSenderDomain}</p>
          </div>
        </div>
      </div>
    </Section>
  );
}

function Domains() {
  const clinics = useApp((s) => s.db.clinics);
  const plans = useApp((s) => s.db.plans);
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const canEdit = useAdminCan()("admin:system:edit");
  const live = useMemo(() => clinics.filter((c) => !c.deletedAt), [clinics]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  return (
    <Section title="Custom domains per clinic" description="Needs the Custom domain module (Feature flags). DNS verification is simulated.">
      <ListState items={live} emptyTitle="No clinics">
        {(list) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clinic</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((c) => {
                const on = featureEnabled(c, plans, "custom_domain");
                const value = drafts[c.id] ?? c.customDomain ?? "";
                const valid = !value || /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(value);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{on ? <Badge variant="success">Enabled</Badge> : <Badge variant="muted">Not enabled</Badge>}</TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Custom domain for ${c.name}`}
                        className="h-9 max-w-xs"
                        placeholder={on ? "book.yourclinic.com" : "Turn on Custom domain first"}
                        disabled={!on || !canEdit}
                        aria-invalid={!valid}
                        value={value}
                        onChange={(e) => setDrafts({ ...drafts, [c.id]: e.target.value.trim() })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {on && canEdit && (
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={!valid || value === (c.customDomain ?? "")}
                          onClick={() => {
                            mutate((d) => void (d.clinics.find((x) => x.id === c.id)!.customDomain = value || undefined));
                            logAudit({ action: value ? `Set custom domain ${value}` : "Removed custom domain", category: "settings", target: c.name, clinicId: c.id });
                            toast.success(value ? `${value} saved. DNS verified (simulated).` : "Custom domain removed");
                          }}
                        >
                          Save
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </ListState>
    </Section>
  );
}

function DataSettings() {
  const platform = useApp((s) => s.db.platform);
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const canEdit = useAdminCan()("admin:system:edit");
  const [running, setRunning] = useState(false);

  const save = (fn: (p: PlatformSettings) => void, action: string) => {
    mutate((d) => fn(d.platform));
    logAudit({ action, category: "settings", target: "System settings" });
    toast.success(action);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Section title="Data retention">
        <Field label="Keep patient data for" htmlFor="ret">
          <NativeSelect id="ret" disabled={!canEdit} value={platform.dataRetentionDays} onChange={(e) => save((p) => void (p.dataRetentionDays = Number(e.target.value)), "Updated data retention period")}>
            <option value={365}>1 year</option>
            <option value={1095}>3 years</option>
            <option value={2555}>7 years</option>
            <option value={3650}>10 years</option>
          </NativeSelect>
        </Field>
        <p className="mt-2 text-xs text-muted-foreground">Clinics can set a shorter period. Patients can request export or deletion.</p>
      </Section>
      <Section title="Backups">
        <div className="grid gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Switch id="bk-on" disabled={!canEdit} checked={platform.backups.enabled} onCheckedChange={(on) => save((p) => void (p.backups.enabled = on), on ? "Enabled daily backups" : "Disabled daily backups")} />
            <Label htmlFor="bk-on">Daily backups (kept {platform.backups.retentionDays} days)</Label>
          </div>
          <p className="text-muted-foreground">Last backup {formatDistanceToNow(new Date(platform.backups.lastBackupAt), { addSuffix: true })}. Point-in-time restore available.</p>
          {canEdit && (
            <Button
              variant="outline"
              className="justify-self-start"
              disabled={running}
              onClick={() => {
                setRunning(true);
                window.setTimeout(() => {
                  save((p) => void (p.backups.lastBackupAt = new Date().toISOString()), "Ran backup now");
                  setRunning(false);
                }, 800);
              }}
            >
              <DatabaseBackup className={running ? "animate-pulse" : ""} /> {running ? "Backing up…" : "Run backup now"}
            </Button>
          )}
        </div>
      </Section>
      <Section title="Maintenance mode">
        <div className="flex items-center gap-2">
          <Switch id="maint" disabled={!canEdit} checked={platform.maintenanceMode} onCheckedChange={(on) => save((p) => void (p.maintenanceMode = on), on ? "Turned maintenance mode on" : "Turned maintenance mode off")} />
          <Label htmlFor="maint">{platform.maintenanceMode ? "On" : "Off"}</Label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">While on, booking widgets show a maintenance notice instead of taking bookings.</p>
      </Section>
    </div>
  );
}
