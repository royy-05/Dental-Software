"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus, Trash2, X } from "lucide-react";
import type { ClinicGroup } from "@/types";
import { ROLE_LABELS } from "@/types";
import { api } from "@/lib/api/client";
import { qk, useApiMutation } from "@/lib/api/session";
import { useAdminAnalytics, useAdminClinics, useAdminGroups, useAdminUsers, type AdminGroup } from "@/lib/api/admin";
import { PageHeader } from "@/components/shared/page-header";
import { ListState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminGuard, ConfirmDialog, Field, NativeSelect, Section, useAdminCan } from "@/components/admin-pages/common";
import { ReadOnlyNotice } from "@/components/admin/shell";

const ADMIN_KEYS = [qk.admin()];

export default function GroupsPage() {
  return (
    <AdminGuard perm="admin:clinics:view">
      <Groups />
    </AdminGuard>
  );
}

function Groups() {
  const groupsQ = useAdminGroups();
  const groups = groupsQ.data ?? [];
  const canEdit = useAdminCan()("admin:groups:edit");
  const [editing, setEditing] = useState<ClinicGroup | "new" | null>(null);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Clinic groups"
        description="Multi-location practices: several clinics under one owner with group-level users and combined reports."
        actions={canEdit && <Button onClick={() => setEditing("new")}><Plus /> New group</Button>}
      />
      <ReadOnlyNotice perm="admin:groups:edit" />
      <ListState items={groups} loading={groupsQ.isLoading} emptyTitle="No clinic groups" emptyDescription="Create a group to combine locations under one owner.">
        {(list) => (
          <div className="space-y-6">
            {list.map((g) => (
              <GroupCard key={g.id} group={g} canEdit={canEdit} onEdit={() => setEditing(g)} />
            ))}
          </div>
        )}
      </ListState>
      {editing && <GroupDialog group={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function GroupCard({ group, canEdit, onEdit }: { group: AdminGroup; canEdit: boolean; onEdit: () => void }) {
  const users = useAdminUsers().data ?? [];
  const analytics = useAdminAnalytics(30);
  const [del, setDel] = useState(false);
  const [addUser, setAddUser] = useState("");
  const owner = users.find((u) => u.id === group.ownerUserId);
  const groupUsers = users.filter((u) => u.groupId === group.id);
  const userM = useApiMutation((v: { userId: string; groupId: string | null; msg: string }) => api(`/api/admin/users/${v.userId}`, { method: "PATCH", body: { groupId: v.groupId } }), { invalidate: ADMIN_KEYS, success: (_r, v) => v.msg });
  const delM = useApiMutation(() => api(`/api/admin/groups/${group.id}`, { method: "DELETE" }), { invalidate: ADMIN_KEYS, success: "Group deleted" });

  const report = useMemo(() => {
    const rows = analytics.data?.compare ?? [];
    return group.clinicIds.map((cid) => {
      const r = rows.find((x) => x.clinicId === cid);
      return { id: cid, name: r?.name ?? cid, bookings: r?.bookings ?? 0, show: r?.showRate ?? 0, status: r?.status ?? "active" };
    });
  }, [analytics.data, group.clinicIds]);
  const total = report.reduce((s, r) => s + r.bookings, 0);
  // Combined show rate = bookings-weighted average of the per-location rates.
  const combinedShow = total ? Math.round((report.reduce((s, r) => s + r.show * r.bookings, 0) / total) * 10) / 10 : 0;

  return (
    <Section
      title={group.name}
      description={`Owner: ${owner?.name ?? "—"} · ${group.clinicIds.length} locations`}
      actions={
        canEdit && (
          <>
            <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button>
            <Button size="sm" variant="ghost" aria-label={`Delete ${group.name}`} onClick={() => setDel(true)}><Trash2 /></Button>
          </>
        )
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Combined report (last 30 days)</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Bookings</TableHead>
                <TableHead className="text-right">Show rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.name} {r.status !== "active" && <Badge variant="muted" className="ml-1 capitalize">{r.status}</Badge>}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.bookings}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.show}%</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{total}</TableCell>
                <TableCell className="text-right tabular-nums">{combinedShow}%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div className="mt-3 h-40" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="bookings" name="Bookings" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Group-level users</h3>
          <p className="mb-2 text-xs text-muted-foreground">Group users get access to every location in the group.</p>
          <ul className="divide-y rounded-md border text-sm">
            {groupUsers.length === 0 && <li className="p-3 text-muted-foreground">No group users.</li>}
            {groupUsers.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2 p-2.5">
                <span>{u.name} <span className="text-xs text-muted-foreground">· {ROLE_LABELS[u.role]}</span></span>
                {canEdit && u.id !== group.ownerUserId && (
                  <Button
                    size="xs"
                    variant="ghost"
                    aria-label={`Remove ${u.name} from group`}
                    onClick={() => userM.mutate({ userId: u.id, groupId: null, msg: `${u.name} removed from group` })}
                  >
                    <X />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!addUser) return;
                userM.mutate({ userId: addUser, groupId: group.id, msg: "User added to group" });
                setAddUser("");
              }}
            >
              <NativeSelect aria-label="Add user to group" className="h-9 flex-1" value={addUser} onChange={(e) => setAddUser(e.target.value)}>
                <option value="">Add a clinic user…</option>
                {users.filter((u) => u.groupId !== group.id && ["clinic_owner", "clinic_manager", "front_desk"].includes(u.role)).map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({ROLE_LABELS[u.role]})</option>
                ))}
              </NativeSelect>
              <Button type="submit" size="sm" disabled={!addUser}>Add</Button>
            </form>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={del}
        onOpenChange={setDel}
        title={`Delete group ${group.name}?`}
        description="Clinics stay as they are; only the grouping and group-level access are removed."
        confirmLabel="Delete group"
        variant="destructive"
        onConfirm={() => delM.mutate()}
      />
    </Section>
  );
}

function GroupDialog({ group, onClose }: { group: ClinicGroup | null; onClose: () => void }) {
  const clinics = useAdminClinics().data ?? [];
  const users = useAdminUsers().data ?? [];
  const [name, setName] = useState(group?.name ?? "");
  const [ownerId, setOwnerId] = useState(group?.ownerUserId ?? "");
  const [clinicIds, setClinicIds] = useState<string[]>(group?.clinicIds ?? []);
  const owners = users.filter((u) => u.role === "clinic_owner");
  const valid = name.trim() && ownerId && clinicIds.length > 0;
  const saveM = useApiMutation(
    (body: { name: string; ownerUserId: string; clinicIds: string[] }) => (group ? api(`/api/admin/groups/${group.id}`, { method: "PATCH", body }) : api("/api/admin/groups", { body })),
    { invalidate: ADMIN_KEYS, success: "Group saved", onSuccess: onClose },
  );
  const save = () => {
    if (!valid) return;
    saveM.mutate({ name: name.trim(), ownerUserId: ownerId, clinicIds });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{group ? "Edit group" : "New clinic group"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Group name" htmlFor="g-name"><Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Owner" htmlFor="g-owner">
            <NativeSelect id="g-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">Select owner…</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </NativeSelect>
          </Field>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-sm font-medium">Locations</legend>
            {clinics.filter((c) => !c.deletedAt).map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={clinicIds.includes(c.id)} onChange={(e) => setClinicIds((ids) => (e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id)))} />
                {c.name}
              </label>
            ))}
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!valid || saveM.isPending}>Save group</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
