"use client";

import { useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { UserPlus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Clinic, Role } from "@/types";
import { ROLE_LABELS } from "@/types";
import { api } from "@/lib/api/client";
import { clinicPath, useClinicUsers, type ClinicUser } from "@/lib/api/clinic";
import { qk, useApiMutation, useClinicBundle, useCurrentUser, useEffectiveRole } from "@/lib/api/session";
import { can } from "@/lib/permissions";
import { currency } from "@/lib/utils";
import { ListState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FieldError, SettingsCard } from "./common";

type ClinicRole = Extract<Role, "clinic_owner" | "clinic_manager" | "front_desk">;
const CLINIC_ROLES: ClinicRole[] = ["clinic_owner", "clinic_manager", "front_desk"];

const inviteSchema = z.object({
  name: z.string().trim().min(2, "Enter the person's name"),
  email: z.string().trim().email("Enter a valid email"),
  role: z.enum(["clinic_owner", "clinic_manager", "front_desk"]),
});
type InviteValues = z.infer<typeof inviteSchema>;

/** Roles the current user may grant: only owners can create or assign another owner. */
export function assignableRoles(actor: Role | undefined): ClinicRole[] {
  return can(actor, "users:remove_owner") ? CLINIC_ROLES : CLINIC_ROLES.filter((r) => r !== "clinic_owner");
}

function InviteDialog({ clinic, open, onOpenChange }: { clinic: Clinic; open: boolean; onOpenChange: (o: boolean) => void }) {
  const role = useEffectiveRole();
  const invite = useApiMutation((v: InviteValues) => api<{ userId: string; invited: boolean }>(clinicPath(clinic.id, "/users"), { body: v }), {
    invalidate: [qk.clinicRes(clinic.id, "users")],
    success: (r, v) => (r.invited ? `Invite sent to ${v.email}` : `${v.email} already has a login; added to ${clinic.name}`),
    onSuccess: () => {
      form.reset();
      onOpenChange(false);
    },
  });
  const form = useForm<InviteValues>({ resolver: zodResolver(inviteSchema), defaultValues: { name: "", email: "", role: "front_desk" } });
  const e = form.formState.errors;

  const onSubmit = (v: InviteValues) => invite.mutate(v);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite staff</DialogTitle>
          <DialogDescription>They get an email with a link (valid 7 days) to set a password. Existing users are added to this clinic.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="inv-name">Name</Label>
            <Input id="inv-name" aria-invalid={!!e.name} {...form.register("name")} />
            <FieldError msg={e.name?.message} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="inv-email">Email</Label>
            <Input id="inv-email" type="email" aria-invalid={!!e.email} {...form.register("email")} />
            <FieldError msg={e.email?.message} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="inv-role">Role</Label>
            <select id="inv-role" className="h-10 rounded-md border border-input bg-card px-3 text-sm" {...form.register("role")}>
              {assignableRoles(role).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={invite.isPending}>Send invite</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UsersSettings({ clinic }: { clinic: Clinic }) {
  const usersQ = useClinicUsers();
  const users = useMemo(() => usersQ.data ?? [], [usersQ.data]);
  const me = useCurrentUser();
  const role = useEffectiveRole();
  const [inviteOpen, setInviteOpen] = useState(false);
  const list = useMemo(() => [...users].sort((a, b) => CLINIC_ROLES.indexOf(a.role as ClinicRole) - CLINIC_ROLES.indexOf(b.role as ClinicRole)), [users]);
  const canTouchOwner = can(role, "users:remove_owner");
  const roles = assignableRoles(role);
  const invalidate = [qk.clinicRes(clinic.id, "users")];
  const patch = useApiMutation(({ id, body }: { id: string; body: { role?: Role; active?: boolean }; action: string }) => api(clinicPath(clinic.id, `/users/${id}`), { method: "PATCH", body }), { invalidate, success: (_r, v) => v.action });
  const remove = useApiMutation(({ id }: { id: string; action: string }) => api(clinicPath(clinic.id, `/users/${id}`), { method: "DELETE" }), { invalidate, success: (_r, v) => v.action });
  const update = (u: ClinicUser, action: string, body: { role?: Role; active?: boolean } | "remove") => {
    if (body === "remove") remove.mutate({ id: u.id, action });
    else patch.mutate({ id: u.id, body, action });
  };

  return (
    <SettingsCard title="Users" description="Staff who can sign in to this clinic. Managers can't change or remove the clinic owner.">
      <div>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus /> Invite staff
        </Button>
      </div>
      <ListState items={list} loading={usersQ.isLoading} emptyTitle="No staff yet" emptyDescription="Invite your team to share the work.">
        {(rows) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => {
                const isOwner = u.role === "clinic_owner";
                const locked = (isOwner && !canTouchOwner) || u.id === me?.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <span className="block font-medium">{u.name}</span>
                      <span className="block text-xs text-muted-foreground">{u.email}</span>
                    </TableCell>
                    <TableCell>
                      {locked ? (
                        <span className="text-sm">{ROLE_LABELS[u.role]}</span>
                      ) : (
                        <select
                          aria-label={`Role for ${u.name}`}
                          className="h-8 rounded-md border border-input bg-card px-2 text-sm"
                          value={u.role}
                          onChange={(e) => update(u, `Changed role to ${ROLE_LABELS[e.target.value as Role]}`, { role: e.target.value as Role })}
                        >
                          {(roles.includes(u.role as ClinicRole) ? roles : [u.role as ClinicRole, ...roles]).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      )}
                    </TableCell>
                    <TableCell>
                      {!u.active ? <Badge variant="muted">Deactivated</Badge> : !u.lastLoginAt ? <Badge variant="info">Invited</Badge> : <Badge variant="success">Active</Badge>}
                      {u.twoFactor && <Badge variant="outline" className="ml-1">2FA</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.lastLoginAt ? formatDistanceToNow(new Date(u.lastLoginAt), { addSuffix: true }) : "Never"}</TableCell>
                    <TableCell className="text-right">
                      {locked ? (
                        <span className="text-xs text-muted-foreground">{u.id === me?.id ? "You" : "Owner"}</span>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="xs" onClick={() => update(u, u.active ? `Deactivated ${u.name}` : `Reactivated ${u.name}`, { active: !u.active })}>
                            {u.active ? "Deactivate" : "Reactivate"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-destructive"
                            onClick={() => update(u, `Removed ${u.name} from ${clinic.name}`, "remove")}
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </ListState>
      <InviteDialog clinic={clinic} open={inviteOpen} onOpenChange={setInviteOpen} />
    </SettingsCard>
  );
}

export function BillingView({ clinic }: { clinic: Clinic }) {
  const plan = useClinicBundle().data?.plan;
  return (
    <div className="grid gap-6">
      <SettingsCard title="Plan" description="Billing is handled by the Kivi team. Card payments through Stripe come in a later phase; invoices are manual until then.">
        {plan ? (
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Plan</p>
              <p className="text-lg font-semibold">{plan.name}</p>
              {clinic.status === "trial" && clinic.trialEndsAt && <Badge variant="violet">Trial until {format(new Date(clinic.trialEndsAt), "MMM d")}</Badge>}
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Price</p>
              <p className="text-lg font-semibold">{currency(plan.priceMonthly)}/mo</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Providers</p>
              <p className="text-lg font-semibold">up to {plan.limits.providers}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">SMS credits</p>
              <p className="text-lg font-semibold">
                {clinic.smsCreditsUsed} / {plan.limits.smsCredits}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No plan assigned.</p>
        )}
      </SettingsCard>
      <SettingsCard title="Invoices" description="Invoices are issued by the Kivi team and sent to the clinic's alert email. Contact support for copies.">
        <p className="text-sm text-muted-foreground">{clinic.status === "trial" ? "Your first invoice is issued when the trial ends." : "Invoice history is available from the Kivi team in this phase."}</p>
      </SettingsCard>
    </div>
  );
}
