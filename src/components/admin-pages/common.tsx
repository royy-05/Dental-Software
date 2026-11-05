"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import type { ClinicStatus } from "@/types";
import { can, type Permission } from "@/lib/permissions";
import { api } from "@/lib/api/client";
import { qk, useApiMutation, useMe, usePlatformRole } from "@/lib/api/session";
import { useQueryClient } from "@tanstack/react-query";
import { NoAccess } from "@/components/shared/guards";
import { LoadingState } from "@/components/shared/states";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Permission helper for the current platform user. */
export function useAdminCan() {
  const role = usePlatformRole();
  return (p: Permission) => can(role, p);
}

/** Page guard for admin pages (view permission). The server enforces the same matrix on every route. */
export function AdminGuard({ perm, children }: { perm: Permission; children: React.ReactNode }) {
  const me = useMe();
  const allowed = useAdminCan()(perm);
  if (me.isLoading) return <LoadingState />;
  if (!allowed) return <NoAccess body="Your platform role doesn't include this section." />;
  return <>{children}</>;
}

export const CLINIC_STATUS_VARIANT: Record<ClinicStatus | "deleted", BadgeProps["variant"]> = {
  active: "success",
  trial: "violet",
  paused: "warning",
  suspended: "danger",
  churned: "muted",
  deleted: "danger",
};

export function ClinicStatusBadge({ status, deleted }: { status: ClinicStatus; deleted?: boolean }) {
  const s = deleted ? "deleted" : status;
  return (
    <Badge variant={CLINIC_STATUS_VARIANT[s]} className="capitalize">
      {s}
    </Badge>
  );
}

export function Section({ title, description, actions, children, className }: { title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription className="mt-1">{description}</CardDescription>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "default",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: ButtonProps["variant"];
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={variant}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Log in as clinic": reason is required; the server stores it on the session and in the audit log. */
export function ImpersonateButton({ clinicId, clinicName, size = "sm", variant = "outline" }: { clinicId: string; clinicName: string; size?: ButtonProps["size"]; variant?: ButtonProps["variant"] }) {
  const allowed = useAdminCan()("admin:impersonate");
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const start = useApiMutation((body: { clinicId: string; reason: string }) => api("/api/admin/impersonation", { body }), {
    invalidate: [qk.me],
    success: `Impersonating ${clinicName}`,
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["clinic"] });
      setOpen(false);
      router.push("/clinic");
    },
  });
  if (!allowed) return null;
  const valid = reason.trim().length >= 5;
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        <LogIn /> Log in as clinic
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log in as {clinicName}</DialogTitle>
            <DialogDescription>You&apos;ll see the clinic panel as the clinic does. Your reason is stored in the audit log.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setTouched(true);
              if (!valid) return;
              start.mutate({ clinicId, reason: reason.trim() });
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor={`imp-reason-${clinicId}`}>Reason (required)</Label>
              <Textarea
                id={`imp-reason-${clinicId}`}
                value={reason}
                aria-invalid={touched && !valid}
                aria-describedby={`imp-help-${clinicId}`}
                placeholder="e.g. Ticket t_1002: check SMS reminder settings"
                onChange={(e) => setReason(e.target.value)}
              />
              <p id={`imp-help-${clinicId}`} className={touched && !valid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                At least 5 characters.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={start.isPending}>Start session</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Reset all demo data back to the seed (DEMO_MODE only on the server). */
export function ResetDemoButton({ size = "default" }: { size?: ButtonProps["size"] }) {
  const allowed = useAdminCan()("admin:seed");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const reset = useApiMutation(() => api("/api/admin/demo/reset", { method: "POST" }), {
    invalidate: [],
    success: "Demo data reset",
    onSuccess: () => qc.invalidateQueries(),
  });
  if (!allowed) return null;
  return (
    <>
      <Button variant="destructive" size={size} onClick={() => setOpen(true)}>
        Reset demo data
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Reset all demo data?"
        description="This replaces every clinic, appointment, message, ticket and setting in the database with fresh seed data dated from today. You stay signed in."
        confirmLabel="Reset data"
        variant="destructive"
        onConfirm={() => reset.mutate()}
      />
    </>
  );
}

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function NativeSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={"h-10 rounded-md border border-input bg-card px-3 text-sm disabled:opacity-50 " + (props.className ?? "")} />;
}
