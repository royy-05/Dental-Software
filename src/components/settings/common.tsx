"use client";

import { toast } from "sonner";
import type { Clinic } from "@/types";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api/client";
import { clinicPath } from "@/lib/api/clinic";
import { qk, useClinicId, useCurrentClinic } from "@/lib/api/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * Save helper: applies `fn` to a copy of the current clinic, works out which sections changed and sends them to the
 * matching API route (profile, hours or insurance settings). The server validates and writes the audit entry.
 */
export function useSaveClinic() {
  const clinic = useCurrentClinic();
  const clinicId = useClinicId();
  const qc = useQueryClient();
  return (action: string, fn: (c: Clinic) => void, opts: { toast?: string | false } = {}) => {
    if (!clinic || !clinicId) return;
    const next = structuredClone(clinic);
    fn(next);
    const changed = <K extends keyof Clinic>(k: K) => JSON.stringify(next[k]) !== JSON.stringify(clinic[k]);
    const profile: Record<string, unknown> = {};
    for (const k of ["name", "phone", "email", "address", "description", "branding", "settings"] as const) if (changed(k)) profile[k] = next[k];
    if (changed("rwg")) profile.rwg = { enabled: next.rwg.enabled, websiteUrl: next.rwg.websiteUrl };
    if (changed("retentionDays")) profile.retentionDays = next.retentionDays ?? null;
    const calls: Promise<unknown>[] = [];
    if (Object.keys(profile).length) calls.push(api(clinicPath(clinicId, "/profile"), { method: "PATCH", body: profile }));
    if (changed("hours")) calls.push(api(clinicPath(clinicId, "/schedule/hours"), { method: "PUT", body: next.hours }));
    if (changed("insuranceSettings")) calls.push(api(clinicPath(clinicId, "/insurance-settings"), { method: "PUT", body: next.insuranceSettings }));
    if (changed("customDomain")) {
      toast.error("Custom domains are set up by the Kivi team. Raise a ticket with the domain you want.");
      return;
    }
    if (!calls.length) return;
    void Promise.all(calls)
      .then(async () => {
        await qc.invalidateQueries({ queryKey: qk.clinic(clinicId) });
        if (opts.toast !== false) toast.success(opts.toast ?? "Settings saved");
      })
      .catch((e) => toast.error(errorMessage(e)));
  };
}

export function SettingsCard({ title, description, children, footer }: { title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
      {footer && <div className="flex justify-end gap-2 border-t px-5 py-3">{footer}</div>}
    </Card>
  );
}

export function ToggleRow({ id, label, description, checked, onChange, disabled }: { id: string; label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

export function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p role="alert" className="text-xs text-destructive">
      {msg}
    </p>
  );
}

export async function copyText(text: string, what = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(what);
  } catch {
    toast.error("Couldn't copy. Select the text and copy it manually.");
  }
}
