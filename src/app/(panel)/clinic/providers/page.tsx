"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import type { Provider } from "@/types";
import { api } from "@/lib/api/client";
import { clinicPath } from "@/lib/api/clinic";
import { useApiMutation } from "@/lib/api/session";
import { RequirePermission } from "@/components/shared/guards";
import { PageHeader } from "@/components/shared/page-header";
import { ListState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, useClinicConfig } from "@/components/config/common";
import { ProviderEditor, type ProviderSave } from "@/components/config/provider-editor";

function ProvidersModule() {
  const { clinicId, reasons, providers, operatories, isLoading } = useClinicConfig();
  const [editing, setEditing] = useState<Provider | null | "new">(null);
  const base = clinicPath(clinicId, "/providers");
  const create = useApiMutation((data: ProviderSave) => api<Provider>(base, { body: data }), { success: "Provider added", onSuccess: () => setEditing(null) });
  const update = useApiMutation(({ id, data }: { id: string; data: Partial<ProviderSave> }) => api<Provider>(`${base}/${id}`, { method: "PATCH", body: data }), {
    success: (p, v) => ("showOnline" in v.data && Object.keys(v.data).length === 1 ? `${p.displayName} ${p.showOnline ? "shows" : "is hidden"} in the booking widget` : "Provider updated"),
    onSuccess: (_p, v) => Object.keys(v.data).length > 1 && setEditing(null),
  });

  const setOnline = (p: Provider, v: boolean) => update.mutate({ id: p.id, data: { showOnline: v } });

  const save = (data: ProviderSave) => {
    const current = editing === "new" ? null : editing;
    if (current) update.mutate({ id: current.id, data });
    else create.mutate(data);
  };

  const onlineCount = providers.filter((p) => p.showOnline && p.active).length;

  return (
    <>
      <PageHeader title="Providers" description="Doctors, hygienists and assistants patients can book with." actions={<Button onClick={() => setEditing("new")}><Plus /> Add provider</Button>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card>
          <ListState items={providers} loading={isLoading} emptyTitle="No providers yet" emptyDescription="Add the people patients can book with." emptyAction={<Button size="sm" onClick={() => setEditing("new")}><Plus /> Add provider</Button>}>
            {(list) => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Operatories</TableHead>
                    <TableHead><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar name={p.displayName} src={p.photoUrl} color={p.color} />
                          <div>
                            <p className="font-medium">{p.displayName}</p>
                            <p className="text-xs text-muted-foreground">
                              {reasons.filter((r) => r.providerIds.includes(p.id)).length} reasons
                              {!p.active && <Badge variant="muted" className="ml-2">Inactive</Badge>}
                              {p.timeOff.length > 0 && <Badge variant="warning" className="ml-2">Time off planned</Badge>}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.externalId}</TableCell>
                      <TableCell>{p.role}</TableCell>
                      <TableCell className="text-xs">{operatories.filter((o) => p.operatoryIds.includes(o.id)).map((o) => o.name).join(", ") || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(p)} aria-label={`Edit ${p.displayName}`}><Pencil /> Edit</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ListState>
        </Card>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Shown online</CardTitle>
            <CardDescription>{onlineCount} of {providers.length} providers appear in the booking widget.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {providers.map((p) => (
              <label key={p.id} htmlFor={`online-${p.id}`} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <span className="flex items-center gap-2"><Avatar name={p.displayName} src={p.photoUrl} color={p.color} size={28} />{p.displayName}</span>
                <Switch id={`online-${p.id}`} checked={p.showOnline} disabled={!p.active} onCheckedChange={(v) => setOnline(p, v)} />
              </label>
            ))}
          </CardContent>
        </Card>
      </div>
      <ProviderEditor open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} provider={editing === "new" ? null : editing} reasons={reasons} operatories={operatories} onSave={save} />
    </>
  );
}

export default function ProvidersPage() {
  return (
    <RequirePermission perm="providers:manage">
      <ProvidersModule />
    </RequirePermission>
  );
}
