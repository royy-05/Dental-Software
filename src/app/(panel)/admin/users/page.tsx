"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { KeyRound, Plus, ShieldCheck, UserX, UserCheck } from "lucide-react";
import type { Role, User } from "@/types";
import { ROLE_LABELS } from "@/types";
import { isPlatformRole } from "@/lib/permissions";
import { api } from "@/lib/api/client";
import { qk, useApiMutation, useCurrentUser } from "@/lib/api/session";
import { useAdminClinics, useAdminUsers } from "@/lib/api/admin";
import { PageHeader } from "@/components/shared/page-header";
import { ListState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminGuard, Field, NativeSelect, useAdminCan } from "@/components/admin-pages/common";
import { ReadOnlyNotice } from "@/components/admin/shell";

const ADMIN_KEYS = [qk.admin()];

export default function UsersPage() {
  return (
    <AdminGuard perm="admin:users:view">
      <Users />
    </AdminGuard>
  );
}

function Users() {
  const usersQ = useAdminUsers();
  const users = useMemo(() => usersQ.data ?? [], [usersQ.data]);
  const canEdit = useAdminCan()("admin:users:edit");
  const [inviting, setInviting] = useState(false);
  const clinicUsers = useMemo(() => users.filter((u) => !isPlatformRole(u.role)), [users]);
  const teamUsers = useMemo(() => users.filter((u) => isPlatformRole(u.role)), [users]);
  return (
    <div>
      <PageHeader
        title="Users"
        description="All users across clinics, plus the Kivi platform team."
        actions={canEdit && <Button onClick={() => setInviting(true)}><Plus /> Invite platform user</Button>}
      />
      <ReadOnlyNotice perm="admin:users:edit" />
      <Tabs defaultValue="clinic">
        <TabsList>
          <TabsTrigger value="clinic">Clinic users ({clinicUsers.length})</TabsTrigger>
          <TabsTrigger value="team">Super admin team ({teamUsers.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="clinic"><UserTable users={clinicUsers} loading={usersQ.isLoading} showClinics /></TabsContent>
        <TabsContent value="team"><UserTable users={teamUsers} loading={usersQ.isLoading} /></TabsContent>
      </Tabs>
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
    </div>
  );
}

function UserTable({ users, showClinics = false, loading }: { users: User[]; showClinics?: boolean; loading?: boolean }) {
  const clinics = useAdminClinics().data ?? [];
  const me = useCurrentUser()?.id;
  const canEdit = useAdminCan()("admin:users:edit");
  const patchM = useApiMutation((v: { u: User; patch: Partial<Pick<User, "active" | "forceTwoFactor">>; action: string }) => api(`/api/admin/users/${v.u.id}`, { method: "PATCH", body: v.patch }), {
    invalidate: ADMIN_KEYS,
    success: (_r, v) => `${v.action}: ${v.u.name}`,
  });
  const resetM = useApiMutation((u: User) => api(`/api/admin/users/${u.id}/reset-password`, { method: "POST" }), { invalidate: ADMIN_KEYS, success: (_r, u) => `Password reset email sent to ${u.email}` });
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"all" | Role>("all");
  const rows = useMemo(
    () => users.filter((u) => (role === "all" || u.role === role) && (!q || `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()))),
    [users, q, role],
  );

  const update = (u: User, patch: Partial<Pick<User, "active" | "forceTwoFactor">>, action: string) => {
    if (!Object.keys(patch).length) return resetM.mutate(u);
    patchM.mutate({ u, patch, action });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input className="h-9 w-full sm:w-64" placeholder="Search name or email" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} />
        <NativeSelect aria-label="Role filter" className="h-9" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
          <option value="all">All roles</option>
          {[...new Set(users.map((u) => u.role))].map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </NativeSelect>
      </div>
      <div className="rounded-lg border bg-card">
        <ListState items={rows} loading={loading} emptyTitle="No users match">
          {(list) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  {showClinics && <TableHead>Clinics</TableHead>}
                  <TableHead>Last login</TableHead>
                  <TableHead>2FA</TableHead>
                  <TableHead>Status</TableHead>
                  {canEdit && <TableHead><span className="sr-only">Actions</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <span className="font-medium">{u.name}</span>
                      <span className="block text-xs text-muted-foreground">{u.email}</span>
                    </TableCell>
                    <TableCell>{ROLE_LABELS[u.role]}</TableCell>
                    {showClinics && (
                      <TableCell className="max-w-[220px] text-xs">
                        {u.clinicIds.map((id) => clinics.find((c) => c.id === id)?.name ?? id).join(", ") || "—"}
                      </TableCell>
                    )}
                    <TableCell className="whitespace-nowrap text-xs">{u.lastLoginAt ? formatDistanceToNow(new Date(u.lastLoginAt), { addSuffix: true }) : u.invitedAt ? "Invited" : "Never"}</TableCell>
                    <TableCell>
                      {u.twoFactor ? <Badge variant="success">On</Badge> : u.forceTwoFactor ? <Badge variant="warning">Required at next login</Badge> : <Badge variant="muted">Off</Badge>}
                    </TableCell>
                    <TableCell>{u.active ? <Badge variant="secondary">Active</Badge> : <Badge variant="danger">Deactivated</Badge>}</TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button size="xs" variant="ghost" onClick={() => update(u, {}, "Sent password reset")} aria-label={`Reset password for ${u.name}`}>
                            <KeyRound /> <span className="hidden xl:inline">Reset password</span>
                          </Button>
                          {!u.twoFactor && !u.forceTwoFactor && (
                            <Button size="xs" variant="ghost" onClick={() => update(u, { forceTwoFactor: true }, "Forced 2FA")} aria-label={`Force 2FA for ${u.name}`}>
                              <ShieldCheck /> <span className="hidden xl:inline">Force 2FA</span>
                            </Button>
                          )}
                          {u.id !== me &&
                            (u.active ? (
                              <Button size="xs" variant="ghost" className="text-destructive" onClick={() => update(u, { active: false }, "Deactivated user")} aria-label={`Deactivate ${u.name}`}>
                                <UserX /> <span className="hidden xl:inline">Deactivate</span>
                              </Button>
                            ) : (
                              <Button size="xs" variant="ghost" onClick={() => update(u, { active: true }, "Reactivated user")} aria-label={`Reactivate ${u.name}`}>
                                <UserCheck /> <span className="hidden xl:inline">Reactivate</span>
                              </Button>
                            ))}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ListState>
      </div>
    </div>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const users = useAdminUsers().data ?? [];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("support_agent");
  const inviteM = useApiMutation((body: { name: string; email: string; role: "super_admin" | "support_agent" }) => api("/api/admin/users", { body }), {
    invalidate: ADMIN_KEYS,
    success: (_r, b) => `Invite emailed to ${b.email}. 2FA required at first sign-in.`,
    onSuccess: onClose,
  });
  const emailOk = /^\S+@\S+\.\S+$/.test(email);
  const dup = users.some((u) => u.email.toLowerCase() === email.toLowerCase());
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Invite platform user</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Field label="Name" htmlFor="inv-name"><Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Email" htmlFor="inv-email" hint={dup ? "A user with this email already exists." : undefined}><Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Role" htmlFor="inv-role">
            <NativeSelect id="inv-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="support_agent">Support Agent</option>
              <option value="super_admin">Super Admin</option>
            </NativeSelect>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!name.trim() || !emailOk || dup || inviteM.isPending} onClick={() => inviteM.mutate({ name: name.trim(), email: email.trim(), role: role as "super_admin" | "support_agent" })}>
            Send invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
