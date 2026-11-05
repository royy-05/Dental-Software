"use client";

import { useMemo } from "react";
import type { FeatureKey } from "@/types";
import { FEATURE_LABELS } from "@/types";
import { featureEnabled } from "@/lib/permissions";
import { api } from "@/lib/api/client";
import { qk, useApiMutation } from "@/lib/api/session";
import { useAdminClinics, useAdminPlans } from "@/lib/api/admin";
import { PageHeader } from "@/components/shared/page-header";
import { ListState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminGuard, NativeSelect, Section, useAdminCan } from "@/components/admin-pages/common";
import { ReadOnlyNotice } from "@/components/admin/shell";

const KEYS = Object.keys(FEATURE_LABELS) as FeatureKey[];

export default function FeaturesPage() {
  return (
    <AdminGuard perm="admin:clinics:view">
      <Features />
    </AdminGuard>
  );
}

function Features() {
  const plansQ = useAdminPlans();
  const clinicsQ = useAdminClinics();
  const plans = useMemo(() => plansQ.data ?? [], [plansQ.data]);
  const clinics = useMemo(() => clinicsQ.data ?? [], [clinicsQ.data]);
  const canEdit = useAdminCan()("admin:features:edit");
  const live = useMemo(() => clinics.filter((c) => !c.deletedAt), [clinics]);

  const planM = useApiMutation((v: { planId: string; modules: FeatureKey[]; msg: string }) => api(`/api/admin/plans/${v.planId}`, { method: "PATCH", body: { limits: { modules: v.modules } } }), {
    invalidate: [qk.admin(), ["catalog"], ["clinic"]],
    success: (_r, v) => v.msg,
  });
  const overrideM = useApiMutation((v: { clinicId: string; key: FeatureKey; value: boolean | null; msg: string }) => api(`/api/admin/clinics/${v.clinicId}`, { method: "PATCH", body: { featureOverrides: { [v.key]: v.value } } }), {
    invalidate: [qk.admin(), ["clinic"]],
    success: (_r, v) => v.msg,
  });

  const setPlanModule = (planId: string, key: FeatureKey, on: boolean) => {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    const modules = on ? [...new Set([...plan.limits.modules, key])] : plan.limits.modules.filter((m) => m !== key);
    planM.mutate({ planId, modules, msg: `${FEATURE_LABELS[key]} ${on ? "on" : "off"} for ${plan.name}` });
  };

  const setOverride = (clinicId: string, key: FeatureKey, value: "inherit" | "on" | "off") => {
    const c = clinics.find((x) => x.id === clinicId);
    overrideM.mutate({ clinicId, key, value: value === "inherit" ? null : value === "on", msg: `${c?.name}: ${FEATURE_LABELS[key]} ${value === "inherit" ? "follows plan" : value}` });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feature flags"
        description="Turn modules on or off per plan or per clinic. Clinic overrides win over the plan. Turning Performance off hides it from the clinic panel immediately."
      />
      <ReadOnlyNotice perm="admin:features:edit" />
      <Section title="By plan">
        <ListState items={plans} loading={plansQ.isLoading} emptyTitle="No plans">
          {(list) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Module</TableHead>
                  {list.map((p) => <TableHead key={p.id} className="text-center">{p.name}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {KEYS.map((k) => (
                  <TableRow key={k}>
                    <TableCell>{FEATURE_LABELS[k]}</TableCell>
                    {list.map((p) => (
                      <TableCell key={p.id} className="text-center">
                        <Checkbox
                          aria-label={`${FEATURE_LABELS[k]} in ${p.name}`}
                          checked={p.limits.modules.includes(k)}
                          disabled={!canEdit}
                          onCheckedChange={(c) => setPlanModule(p.id, k, c === true)}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ListState>
      </Section>
      <Section title="Per-clinic overrides" description="“Plan” inherits the clinic's plan. The badge shows the effective value.">
        <ListState items={live} loading={clinicsQ.isLoading} emptyTitle="No clinics">
          {(list) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clinic</TableHead>
                  {KEYS.map((k) => <TableHead key={k} className="min-w-[130px]">{FEATURE_LABELS[k]}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {c.name}
                      <span className="block text-xs text-muted-foreground">{plans.find((p) => p.id === c.planId)?.name}</span>
                    </TableCell>
                    {KEYS.map((k) => {
                      const ov = c.featureOverrides[k];
                      const on = featureEnabled(c, plans, k);
                      return (
                        <TableCell key={k}>
                          <div className="flex items-center gap-1.5">
                            <NativeSelect
                              aria-label={`${FEATURE_LABELS[k]} for ${c.name}`}
                              className="h-8 px-2 text-xs"
                              disabled={!canEdit}
                              value={ov === undefined ? "inherit" : ov ? "on" : "off"}
                              onChange={(e) => setOverride(c.id, k, e.target.value as "inherit" | "on" | "off")}
                            >
                              <option value="inherit">Plan</option>
                              <option value="on">On</option>
                              <option value="off">Off</option>
                            </NativeSelect>
                            <Badge variant={on ? "success" : "muted"}>{on ? "On" : "Off"}</Badge>
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ListState>
      </Section>
    </div>
  );
}
