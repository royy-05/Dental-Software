"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { Clinic, PlatformSettings } from "@/types";
import { featureEnabled } from "@/lib/permissions";
import { useApp } from "@/store/app";
import { PageHeader } from "@/components/shared/page-header";
import { ListState } from "@/components/shared/states";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminGuard, Field, Section, useAdminCan } from "@/components/admin-pages/common";
import { ReadOnlyNotice } from "@/components/admin/shell";

const FEED_VARIANT: Record<Clinic["rwg"]["feedStatus"], BadgeProps["variant"]> = { healthy: "success", warning: "warning", error: "danger", off: "muted" };

export default function IntegrationsPage() {
  return (
    <AdminGuard perm="admin:access">
      <div className="space-y-6">
        <PageHeader title="Integrations" description="Reserve with Google, PMS connectors and tracking defaults. Live integrations arrive in phases 2 and 3." />
        <ReadOnlyNotice perm="admin:integrations:edit" />
        <RwgFeeds />
        <PmsHealth />
        <Tracking />
      </div>
    </AdminGuard>
  );
}

function RwgFeeds() {
  const clinics = useApp((s) => s.db.clinics);
  const plans = useApp((s) => s.db.plans);
  const appointments = useApp((s) => s.db.appointments);
  const live = useMemo(() => clinics.filter((c) => !c.deletedAt), [clinics]);
  const rwgBookings = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of appointments) if (a.source === "rwg") m.set(a.clinicId, (m.get(a.clinicId) ?? 0) + 1);
    return m;
  }, [appointments]);
  return (
    <Section title="Reserve with Google" description="Feed status per clinic (phase 3: needs Google booking partner approval).">
      <ListState items={live} emptyTitle="No clinics">
        {(list) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clinic</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Feed status</TableHead>
                <TableHead className="text-right">RwG bookings (60d)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((c) => {
                const on = featureEnabled(c, plans, "rwg");
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}<span className="block text-xs text-muted-foreground">{c.rwg.websiteUrl || "No website URL"}</span></TableCell>
                    <TableCell>{on ? <Badge variant="secondary">In plan</Badge> : <Badge variant="muted">Not in plan</Badge>}</TableCell>
                    <TableCell>{c.rwg.enabled ? "Yes" : "No"}</TableCell>
                    <TableCell><Badge variant={FEED_VARIANT[c.rwg.feedStatus]} className="capitalize">{c.rwg.feedStatus}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{rwgBookings.get(c.id) ?? 0}</TableCell>
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

function PmsHealth() {
  const clinics = useApp((s) => s.db.clinics);
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const canEdit = useAdminCan()("admin:integrations:edit");
  const [syncing, setSyncing] = useState<string | null>(null);
  const live = useMemo(() => clinics.filter((c) => !c.deletedAt), [clinics]);
  const retry = (c: Clinic) => {
    setSyncing(c.id);
    window.setTimeout(() => {
      // Simulated: a connected PMS succeeds, an unconnected one stays "not connected".
      mutate((d) => {
        const x = d.clinics.find((y) => y.id === c.id)!;
        if (x.pms.connected) {
          x.pms.syncError = undefined;
          x.pms.lastSyncAt = new Date().toISOString();
        }
      });
      logAudit({ action: "Retried PMS sync", category: "settings", target: c.name, clinicId: c.id });
      setSyncing(null);
      if (c.pms.connected) toast.success(`${c.name}: sync succeeded (simulated)`);
      else toast.error(`${c.name}: no PMS connected`);
    }, 900);
  };
  return (
    <Section title="PMS connectors and sync health" description="OpenDental, Dentrix and Eaglesoft sync is a later phase. Status here is simulated.">
      <ListState items={live} emptyTitle="No clinics">
        {(list) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clinic</TableHead>
                <TableHead>PMS</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Last sync</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.pms.name}</TableCell>
                  <TableCell>
                    {c.pms.syncError ? <Badge variant="danger">{c.pms.syncError}</Badge> : c.pms.connected ? <Badge variant="success">Healthy</Badge> : <Badge variant="muted">Not connected</Badge>}
                  </TableCell>
                  <TableCell className="text-xs">{c.pms.lastSyncAt ? formatDistanceToNow(new Date(c.pms.lastSyncAt), { addSuffix: true }) : "—"}</TableCell>
                  <TableCell className="text-right">
                    {canEdit && (
                      <Button size="xs" variant="outline" disabled={syncing === c.id} onClick={() => retry(c)}>
                        <RefreshCw className={syncing === c.id ? "animate-spin" : ""} /> Retry sync
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ListState>
    </Section>
  );
}

function Tracking() {
  const integrations = useApp((s) => s.db.platform.integrations);
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const canEdit = useAdminCan()("admin:integrations:edit");
  const [v, setV] = useState<PlatformSettings["integrations"]>(integrations);
  return (
    <Section title="Analytics and ad tracking defaults" description="Defaults for new clinics. Clinics can override in their settings.">
      <p className="mb-4 flex items-start gap-2 rounded-md bg-secondary/60 px-3 py-2 text-sm text-secondary-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        No patient health data is ever sent to ad or analytics platforms. Events carry only clinic id, step and reason id (step viewed, reason selected, slot selected, booking completed).
      </p>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          mutate((d) => void (d.platform.integrations = v));
          logAudit({ action: "Updated tracking defaults", category: "settings", target: "Integrations" });
          toast.success("Tracking defaults saved");
        }}
      >
        <fieldset disabled={!canEdit} className="contents">
          <Field label="Google Tag Manager container" htmlFor="i-gtm"><Input id="i-gtm" value={v.gtmContainerId} onChange={(e) => setV({ ...v, gtmContainerId: e.target.value })} /></Field>
          <Field label="GA4 measurement ID" htmlFor="i-ga4"><Input id="i-ga4" value={v.ga4MeasurementId} onChange={(e) => setV({ ...v, ga4MeasurementId: e.target.value })} /></Field>
          <Field label="Google Ads conversion ID" htmlFor="i-ads"><Input id="i-ads" value={v.googleAdsConversionId} onChange={(e) => setV({ ...v, googleAdsConversionId: e.target.value })} /></Field>
          <Field label="Meta Pixel ID" htmlFor="i-meta"><Input id="i-meta" value={v.metaPixelId} onChange={(e) => setV({ ...v, metaPixelId: e.target.value })} /></Field>
          {canEdit && <Button type="submit" className="justify-self-start">Save defaults</Button>}
        </fieldset>
      </form>
    </Section>
  );
}
