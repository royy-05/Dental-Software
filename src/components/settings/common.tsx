"use client";

import { toast } from "sonner";
import type { Clinic } from "@/types";
import { useApp, useCurrentClinic } from "@/store/app";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/** Save helper: mutates the current clinic, writes an audit entry and toasts. */
export function useSaveClinic() {
  const clinic = useCurrentClinic();
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  return (action: string, fn: (c: Clinic) => void, opts: { toast?: string | false } = {}) => {
    if (!clinic) return;
    mutate((db) => {
      const c = db.clinics.find((x) => x.id === clinic.id);
      if (c) fn(c);
    });
    logAudit({ action, category: "settings", target: clinic.name, clinicId: clinic.id });
    if (opts.toast !== false) toast.success(opts.toast ?? "Settings saved");
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
