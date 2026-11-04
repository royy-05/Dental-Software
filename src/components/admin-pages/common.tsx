"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { toast } from "sonner";
import type { ClinicStatus } from "@/types";
import { can, type Permission } from "@/lib/permissions";
import { useApp, useCurrentUser } from "@/store/app";
import { NoAccess } from "@/components/shared/guards";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Permission helper for the current platform user. */
export function useAdminCan() {
  const user = useCurrentUser();
  return (p: Permission) => can(user?.role, p);
}

/** Page guard for admin pages (view permission). */
export function AdminGuard({ perm, children }: { perm: Permission; children: React.ReactNode }) {
  const allowed = useAdminCan()(perm);
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

/** "Log in as clinic": reason is required and written to the audit log by the store action. */
export function ImpersonateButton({ clinicId, clinicName, size = "sm", variant = "outline" }: { clinicId: string; clinicName: string; size?: ButtonProps["size"]; variant?: ButtonProps["variant"] }) {
  const allowed = useAdminCan()("admin:impersonate");
  const start = useApp((s) => s.startImpersonation);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
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
              start(clinicId, reason.trim());
              toast.success(`Impersonating ${clinicName}`);
              setOpen(false);
              router.push("/clinic");
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
              <Button type="submit">Start session</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Step 8: reset all demo data back to the seed. */
export function ResetDemoButton({ size = "default" }: { size?: ButtonProps["size"] }) {
  const allowed = useAdminCan()("admin:seed");
  const reset = useApp((s) => s.resetDemo);
  const [open, setOpen] = useState(false);
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
        description="This replaces every clinic, appointment, message, ticket and setting in this browser with fresh seed data dated from today. You stay signed in."
        confirmLabel="Reset data"
        variant="destructive"
        onConfirm={() => {
          reset();
          toast.success("Demo data reset");
        }}
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
