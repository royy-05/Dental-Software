"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import type { FeatureKey } from "@/types";
import { FEATURE_LABELS } from "@/types";
import { featureEnabled } from "@/lib/permissions";
import { useApp } from "@/store/app";
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
  const plans = useApp((s) => s.db.plans);
  const clinics = useApp((s) => s.db.clinics);
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const canEdit = useAdminCan()("admin:features:edit");
  const live = useMemo(() => clinics.filter((c) => !c.deletedAt), [clinics]);

  const setPlanModule = (planId: string, key: FeatureKey, on: boolean) => {
    mutate((d) => {
      const p = d.plans.find((x) => x.id === planId)!;
      p.limits.modules = on ? [...new Set([...p.limits.modules, key])] : p.limits.modules.filter((m) => m !== key);
    });
    const plan = plans.find((p) => p.id === planId);
    logAudit({ action: `${on ? "Enabled" : "Disabled"} ${FEATURE_LABELS[key]} for plan`, category: "settings", target: plan?.name ?? planId });
    toast.success(`${FEATURE_LABELS[key]} ${on ? "on" : "off"} for ${plan?.name}`);
  };

  const setOverride = (clinicId: string, key: FeatureKey, value: "inherit" | "on" | "off") => {
    mutate((d) => {
      const c = d.clinics.find((x) => x.id === clinicId)!;
      if (value === "inherit") delete c.featureOverrides[key];
      else c.featureOverrides[key] = value === "on";
    });
    const c = clinics.find((x) => x.id === clinicId);
    logAudit({ action: `Feature override ${FEATURE_LABELS[key]}: ${value}`, category: "settings", target: c?.name ?? clinicId, clinicId });
    toast.success(`${c?.name}: ${FEATURE_LABELS[key]} ${value === "inherit" ? "follows plan" : value}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feature flags"
        description="Turn modules on or off per plan or per clinic. Clinic overrides win over the plan. Turning Performance off hides it from the clinic panel immediately."
      />
      <ReadOnlyNotice perm="admin:features:edit" />
      <Section title="By plan">
        <ListState items={plans} emptyTitle="No plans">
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
        <ListState items={live} emptyTitle="No clinics">
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
