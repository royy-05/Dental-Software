"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { Clinic, PlatformSettings } from "@/types";
import { featureEnabled } from "@/lib/permissions";
import { api } from "@/lib/api/client";
import { qk, useApiMutation } from "@/lib/api/session";
import { useAdminAnalytics, useAdminClinics, useAdminPlans, useAdminSettings } from "@/lib/api/admin";
import { PageHeader } from "@/components/shared/page-header";
import { ListState, LoadingState } from "@/components/shared/states";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminGuard, Field, Section, useAdminCan } from "@/components/admin-pages/common";
import { ReadOnlyNotice } from "@/components/admin/shell";

const ADMIN_KEYS = [qk.admin()];
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
  const clinicsQ = useAdminClinics();
  const plans = useAdminPlans().data ?? [];
  const analytics = useAdminAnalytics(60);
  const live = useMemo(() => (clinicsQ.data ?? []).filter((c) => !c.deletedAt), [clinicsQ.data]);
  const rwgBookings = (id: string) => analytics.data?.compare.find((c) => c.clinicId === id)?.sourceMix.rwg ?? 0;
  return (
    <Section title="Reserve with Google" description="Feed status per clinic (phase 3: needs Google booking partner approval). Status is a stored flag, not a live feed check.">
      <ListState items={live} loading={clinicsQ.isLoading} emptyTitle="No clinics">
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
                    <TableCell className="text-right tabular-nums">{rwgBookings(c.id)}</TableCell>
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
  const clinicsQ = useAdminClinics();
  const canEdit = useAdminCan()("admin:integrations:edit");
  const live = useMemo(() => (clinicsQ.data ?? []).filter((c) => !c.deletedAt), [clinicsQ.data]);
  // Simulated: no PMS connector exists yet (phase 3). A "retry" just clears the stored error and stamps the sync time.
  const retryM = useApiMutation((c: Clinic) => api(`/api/admin/clinics/${c.id}`, { method: "PATCH", body: { pms: { syncError: undefined, lastSyncAt: new Date().toISOString() } } }), {
    invalidate: ADMIN_KEYS,
    success: (_r, c) => `${c.name}: sync marked healthy (simulated, no PMS connector yet)`,
  });
  const syncing = retryM.isPending ? retryM.variables?.id : null;
  const retry = (c: Clinic) => {
    if (!c.pms.connected) return toast.error(`${c.name}: no PMS connected`);
    retryM.mutate(c);
  };
  return (
    <Section title="PMS connectors and sync health" description="OpenDental, Dentrix and Eaglesoft sync is a later phase. Status here is a stored flag; “Retry sync” is simulated.">
      <ListState items={live} loading={clinicsQ.isLoading} emptyTitle="No clinics">
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
  const settings = useAdminSettings();
  if (!settings.data) return <LoadingState />;
  return <TrackingForm key={JSON.stringify(settings.data.integrations)} integrations={settings.data.integrations} />;
}

function TrackingForm({ integrations }: { integrations: PlatformSettings["integrations"] }) {
  const canEdit = useAdminCan()("admin:integrations:edit");
  const [v, setV] = useState<PlatformSettings["integrations"]>(integrations);
  const saveM = useApiMutation((body: PlatformSettings["integrations"]) => api("/api/admin/settings", { method: "PATCH", body: { integrations: body } }), { invalidate: ADMIN_KEYS, success: "Tracking defaults saved" });
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
          saveM.mutate(v);
        }}
      >
        <fieldset disabled={!canEdit} className="contents">
          <Field label="Google Tag Manager container" htmlFor="i-gtm"><Input id="i-gtm" value={v.gtmContainerId} onChange={(e) => setV({ ...v, gtmContainerId: e.target.value })} /></Field>
          <Field label="GA4 measurement ID" htmlFor="i-ga4"><Input id="i-ga4" value={v.ga4MeasurementId} onChange={(e) => setV({ ...v, ga4MeasurementId: e.target.value })} /></Field>
          <Field label="Google Ads conversion ID" htmlFor="i-ads"><Input id="i-ads" value={v.googleAdsConversionId} onChange={(e) => setV({ ...v, googleAdsConversionId: e.target.value })} /></Field>
          <Field label="Meta Pixel ID" htmlFor="i-meta"><Input id="i-meta" value={v.metaPixelId} onChange={(e) => setV({ ...v, metaPixelId: e.target.value })} /></Field>
          {canEdit && <Button type="submit" className="justify-self-start" disabled={saveM.isPending}>Save defaults</Button>}
        </fieldset>
      </form>
    </Section>
  );
}
