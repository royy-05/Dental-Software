"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { ClinicGroup } from "@/types";
import { ROLE_LABELS } from "@/types";
import { useApp } from "@/store/app";
import { uid } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { ListState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminGuard, ConfirmDialog, Field, NativeSelect, Section, useAdminCan } from "@/components/admin-pages/common";
import { bookingsIn, lastDays, showRate } from "@/components/admin-pages/metrics";
import { ReadOnlyNotice } from "@/components/admin/shell";

export default function GroupsPage() {
  return (
    <AdminGuard perm="admin:clinics:view">
      <Groups />
    </AdminGuard>
  );
}

function Groups() {
  const groups = useApp((s) => s.db.groups);
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
      <ListState items={groups} emptyTitle="No clinic groups" emptyDescription="Create a group to combine locations under one owner.">
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

function GroupCard({ group, canEdit, onEdit }: { group: ClinicGroup; canEdit: boolean; onEdit: () => void }) {
  const db = useApp((s) => s.db);
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const [del, setDel] = useState(false);
  const [addUser, setAddUser] = useState("");
  const owner = db.users.find((u) => u.id === group.ownerUserId);
  const groupUsers = db.users.filter((u) => u.groupId === group.id);

  const report = useMemo(() => {
    const p = lastDays(30);
    return group.clinicIds.map((cid) => {
      const c = db.clinics.find((x) => x.id === cid);
      return { id: cid, name: c?.name ?? cid, bookings: bookingsIn(db.appointments, p, cid).length, show: showRate(db.appointments, p, cid), status: c?.status ?? "active" };
    });
  }, [db.appointments, db.clinics, group.clinicIds]);
  const total = report.reduce((s, r) => s + r.bookings, 0);
  const combinedShow = showRate(db.appointments.filter((a) => group.clinicIds.includes(a.clinicId)), lastDays(30));

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
                    onClick={() => {
                      mutate((d) => void (d.users.find((x) => x.id === u.id)!.groupId = undefined));
                      logAudit({ action: "Removed group user", category: "user", target: `${u.name} · ${group.name}` });
                      toast.success(`${u.name} removed from group`);
                    }}
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
                mutate((d) => {
                  const u = d.users.find((x) => x.id === addUser)!;
                  u.groupId = group.id;
                  u.clinicIds = [...new Set([...u.clinicIds, ...group.clinicIds])];
                });
                logAudit({ action: "Added group user", category: "user", target: group.name });
                toast.success("User added to group");
                setAddUser("");
              }}
            >
              <NativeSelect aria-label="Add user to group" className="h-9 flex-1" value={addUser} onChange={(e) => setAddUser(e.target.value)}>
                <option value="">Add a clinic user…</option>
                {db.users.filter((u) => u.groupId !== group.id && ["clinic_owner", "clinic_manager", "front_desk"].includes(u.role)).map((u) => (
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
        onConfirm={() => {
          mutate((d) => {
            d.groups = d.groups.filter((g) => g.id !== group.id);
            d.clinics.forEach((c) => c.groupId === group.id && (c.groupId = undefined));
            d.users.forEach((u) => u.groupId === group.id && (u.groupId = undefined));
          });
          logAudit({ action: "Deleted clinic group", category: "clinic", target: group.name });
          toast.success("Group deleted");
        }}
      />
    </Section>
  );
}

function GroupDialog({ group, onClose }: { group: ClinicGroup | null; onClose: () => void }) {
  const clinics = useApp((s) => s.db.clinics);
  const users = useApp((s) => s.db.users);
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const [name, setName] = useState(group?.name ?? "");
  const [ownerId, setOwnerId] = useState(group?.ownerUserId ?? "");
  const [clinicIds, setClinicIds] = useState<string[]>(group?.clinicIds ?? []);
  const owners = users.filter((u) => u.role === "clinic_owner");
  const valid = name.trim() && ownerId && clinicIds.length > 0;

  const save = () => {
    if (!valid) return;
    mutate((d) => {
      const id = group?.id ?? uid("g");
      const next: ClinicGroup = { id, name: name.trim(), ownerUserId: ownerId, clinicIds };
      if (group) Object.assign(d.groups.find((g) => g.id === id)!, next);
      else d.groups.push(next);
      for (const c of d.clinics) {
        if (clinicIds.includes(c.id)) c.groupId = id;
        else if (c.groupId === id) c.groupId = undefined;
      }
      const owner = d.users.find((u) => u.id === ownerId);
      if (owner) {
        owner.groupId = id;
        owner.clinicIds = [...new Set([...owner.clinicIds, ...clinicIds])];
      }
    });
    logAudit({ action: group ? "Edited clinic group" : "Created clinic group", category: "clinic", target: name });
    toast.success("Group saved");
    onClose();
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
          <Button onClick={save} disabled={!valid}>Save group</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
