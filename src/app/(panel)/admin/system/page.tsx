"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { DatabaseBackup } from "lucide-react";
import type { PlatformSettings } from "@/types";
import { featureEnabled } from "@/lib/permissions";
import { api } from "@/lib/api/client";
import { qk, useApiMutation } from "@/lib/api/session";
import { useAdminClinics, useAdminPlans, useAdminSettings } from "@/lib/api/admin";
import { PageHeader } from "@/components/shared/page-header";
import { ListState, LoadingState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminGuard, Field, NativeSelect, ResetDemoButton, Section, useAdminCan } from "@/components/admin-pages/common";
import { ReadOnlyNotice } from "@/components/admin/shell";

const ADMIN_KEYS = [qk.admin()];

function useSaveSettings(success: string | ((v: Partial<PlatformSettings>) => string)) {
  return useApiMutation((body: Partial<PlatformSettings>) => api("/api/admin/settings", { method: "PATCH", body }), { invalidate: ADMIN_KEYS, success: typeof success === "string" ? success : (_r, v) => success(v) });
}

export default function SystemPage() {
  return (
    <AdminGuard perm="admin:access">
      <div className="space-y-6">
        <PageHeader title="System & white-label" description="Platform branding, custom domains, data retention, backups and maintenance mode." />
        <ReadOnlyNotice perm="admin:system:edit" />
        <Branding />
        <Domains />
        <DataSettings />
        <Section title="Demo data" description="Reset the database to its seeded state (DEMO_MODE only).">
          <ResetDemoButton />
        </Section>
      </div>
    </AdminGuard>
  );
}

function Branding() {
  const settings = useAdminSettings();
  if (!settings.data) return <LoadingState />;
  return <BrandingForm key={JSON.stringify(settings.data.branding)} branding={settings.data.branding} />;
}

function BrandingForm({ branding }: { branding: PlatformSettings["branding"] }) {
  const canEdit = useAdminCan()("admin:system:edit");
  const [v, setV] = useState<PlatformSettings["branding"]>(branding);
  const hexOk = /^#[0-9a-fA-F]{6}$/.test(v.primaryColor);
  const saveM = useSaveSettings("Branding saved");
  return (
    <Section title="Platform branding and white-label">
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!v.platformName.trim() || !hexOk) return;
            saveM.mutate({ branding: v });
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
            {canEdit && <Button type="submit" className="self-end justify-self-start" disabled={saveM.isPending}>Save branding</Button>}
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
  const clinicsQ = useAdminClinics();
  const plans = useAdminPlans().data ?? [];
  const canEdit = useAdminCan()("admin:system:edit");
  const live = useMemo(() => (clinicsQ.data ?? []).filter((c) => !c.deletedAt), [clinicsQ.data]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const saveM = useApiMutation((v: { id: string; value: string }) => api(`/api/admin/clinics/${v.id}`, { method: "PATCH", body: { customDomain: v.value || null } }), {
    invalidate: ADMIN_KEYS,
    success: (_r, v) => (v.value ? `${v.value} saved. DNS is not verified yet (phase 3).` : "Custom domain removed"),
    onSuccess: (_r, v) => setDrafts((d) => ({ ...d, [v.id]: v.value })),
  });
  return (
    <Section title="Custom domains per clinic" description="Needs the Custom domain module (Feature flags). The domain is stored only; DNS verification and routing are phase 3.">
      <ListState items={live} loading={clinicsQ.isLoading} emptyTitle="No clinics">
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
                          disabled={!valid || value === (c.customDomain ?? "") || saveM.isPending}
                          onClick={() => saveM.mutate({ id: c.id, value })}
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
  const settings = useAdminSettings();
  const canEdit = useAdminCan()("admin:system:edit");
  const saveM = useSaveSettings((v) => (v.maintenanceMode !== undefined ? `Maintenance mode ${v.maintenanceMode ? "on" : "off"}` : v.dataRetentionDays !== undefined ? "Updated data retention period" : v.backups ? "Backup settings saved" : "Settings saved"));
  const running = saveM.isPending && !!saveM.variables?.backups?.lastBackupAt;
  if (!settings.data) return <LoadingState />;
  const platform = settings.data;
  const save = (patch: Partial<PlatformSettings>) => saveM.mutate(patch);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Section title="Data retention">
        <Field label="Keep patient data for" htmlFor="ret">
          <NativeSelect id="ret" disabled={!canEdit} value={platform.dataRetentionDays} onChange={(e) => save({ dataRetentionDays: Number(e.target.value) })}>
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
            <Switch id="bk-on" disabled={!canEdit} checked={platform.backups.enabled} onCheckedChange={(on) => save({ backups: { ...platform.backups, enabled: on } })} />
            <Label htmlFor="bk-on">Daily backups (kept {platform.backups.retentionDays} days)</Label>
          </div>
          <p className="text-muted-foreground">Last backup {formatDistanceToNow(new Date(platform.backups.lastBackupAt), { addSuffix: true })}. Real backups are a hosting concern (phase 2B); this only records a timestamp.</p>
          {canEdit && (
            <Button
              variant="outline"
              className="justify-self-start"
              disabled={running}
              onClick={() => save({ backups: { ...platform.backups, lastBackupAt: new Date().toISOString() } })}
            >
              <DatabaseBackup className={running ? "animate-pulse" : ""} /> {running ? "Recording…" : "Record backup now (simulated)"}
            </Button>
          )}
        </div>
      </Section>
      <Section title="Maintenance mode">
        <div className="flex items-center gap-2">
          <Switch id="maint" disabled={!canEdit} checked={platform.maintenanceMode} onCheckedChange={(on) => save({ maintenanceMode: on })} />
          <Label htmlFor="maint">{platform.maintenanceMode ? "On" : "Off"}</Label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">While on, booking widgets show a maintenance notice instead of taking bookings.</p>
      </Section>
    </div>
  );
}
