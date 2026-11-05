"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, MoreHorizontal, Pause, Pencil, Play, RotateCcw, ShieldOff, Trash2, Eye } from "lucide-react";
import type { Clinic, ClinicStatus } from "@/types";
import { api } from "@/lib/api/client";
import { qk, useApiMutation } from "@/lib/api/session";
import { useAdminClinics } from "@/lib/api/admin";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog, Field, NativeSelect, useAdminCan } from "./common";
import { TIME_ZONES } from "./clinic-ops";
import { isSlugTaken, slugify } from "./metrics";

const ADMIN_KEYS = [qk.admin()];

export function ClinicActions({ clinic, showView = true }: { clinic: Clinic; showView?: boolean }) {
  const allow = useAdminCan();
  const clinics = useAdminClinics().data ?? [];
  const [dialog, setDialog] = useState<null | "edit" | "delete" | "clone" | "suspend">(null);
  const canEdit = allow("admin:clinics:edit");
  const canDelete = allow("admin:clinics:delete");

  const patch = useApiMutation((v: { status: ClinicStatus; label: string }) => api(`/api/admin/clinics/${clinic.id}`, { method: "PATCH", body: { status: v.status } }), {
    invalidate: ADMIN_KEYS,
    success: (_r, v) => `${clinic.name}: ${v.label.toLowerCase()}`,
  });
  const del = useApiMutation(() => api(`/api/admin/clinics/${clinic.id}/delete`, { method: "POST" }), { invalidate: ADMIN_KEYS, success: `${clinic.name} deleted. Restore within 30 days.` });
  const restore = useApiMutation(() => api(`/api/admin/clinics/${clinic.id}/restore`, { method: "POST" }), { invalidate: ADMIN_KEYS, success: `${clinic.name} restored` });
  const clone = useApiMutation((fromId: string) => api(`/api/admin/clinics/${clinic.id}/clone`, { body: { fromId } }), {
    invalidate: ADMIN_KEYS,
    success: (_r, fromId) => `Copied branding, settings and booking flow from ${clinics.find((c) => c.id === fromId)?.name ?? "the other clinic"}`,
  });
  const setStatus = (status: ClinicStatus, label: string) => patch.mutate({ status, label });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${clinic.name}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {showView && (
            <DropdownMenuItem asChild>
              <Link href={`/admin/clinics/${clinic.id}`}><Eye className="h-4 w-4" /> View details</Link>
            </DropdownMenuItem>
          )}
          {canEdit && !clinic.deletedAt && (
            <>
              <DropdownMenuItem onSelect={() => setDialog("edit")}><Pencil className="h-4 w-4" /> Edit</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog("clone")}><Copy className="h-4 w-4" /> Clone settings from…</DropdownMenuItem>
              <DropdownMenuSeparator />
              {clinic.status !== "paused" && clinic.status !== "churned" && <DropdownMenuItem onSelect={() => setStatus("paused", "Paused")}><Pause className="h-4 w-4" /> Pause</DropdownMenuItem>}
              {clinic.status !== "suspended" && <DropdownMenuItem onSelect={() => setDialog("suspend")}><ShieldOff className="h-4 w-4" /> Suspend</DropdownMenuItem>}
              {clinic.status !== "active" && <DropdownMenuItem onSelect={() => setStatus("active", "Reactivated")}><Play className="h-4 w-4" /> Reactivate</DropdownMenuItem>}
            </>
          )}
          {canDelete && !clinic.deletedAt && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onSelect={() => setDialog("delete")}><Trash2 className="h-4 w-4" /> Delete (30-day restore)</DropdownMenuItem>
            </>
          )}
          {canDelete && clinic.deletedAt && (
            <DropdownMenuItem onSelect={() => restore.mutate()}>
              <RotateCcw className="h-4 w-4" /> Restore
            </DropdownMenuItem>
          )}
          {!canEdit && !canDelete && !showView && <DropdownMenuItem disabled>Read-only</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === "edit" && <EditClinicDialog clinic={clinic} clinics={clinics} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Delete ${clinic.name}?`}
        description="The clinic is hidden everywhere and its booking link stops working. You can restore it within 30 days."
        confirmLabel="Delete clinic"
        variant="destructive"
        onConfirm={() => del.mutate()}
      />
      <ConfirmDialog
        open={dialog === "suspend"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Suspend ${clinic.name}?`}
        description="Staff lose access to online booking until reactivated (e.g. for non-payment or abuse)."
        confirmLabel="Suspend"
        variant="destructive"
        onConfirm={() => setStatus("suspended", "Suspended")}
      />
      <CloneDialog open={dialog === "clone"} onClose={() => setDialog(null)} clinic={clinic} sources={clinics.filter((c) => c.id !== clinic.id && !c.deletedAt)} onClone={(fromId) => clone.mutate(fromId)} />
    </>
  );
}

function CloneDialog({ open, onClose, clinic, sources, onClone }: { open: boolean; onClose: () => void; clinic: Clinic; sources: Clinic[]; onClone: (fromId: string) => void }) {
  const [from, setFrom] = useState(sources[0]?.id ?? "");
  const value = from || sources[0]?.id || "";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clone settings into {clinic.name}</DialogTitle>
          <DialogDescription>Copies branding, clinic hours, settings, insurance settings and the published booking flow. Reasons, providers and appointments are not copied.</DialogDescription>
        </DialogHeader>
        <Field label="Copy from" htmlFor="clone-from">
          <NativeSelect id="clone-from" value={value} onChange={(e) => setFrom(e.target.value)}>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </NativeSelect>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!value} onClick={() => { onClone(value); onClose(); }}>Clone settings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditClinicDialog({ clinic, clinics, onClose }: { clinic: Clinic; clinics: Clinic[]; onClose: () => void }) {
  const [v, setV] = useState({ name: clinic.name, slug: clinic.slug, timeZone: clinic.timeZone, phone: clinic.phone, email: clinic.email, address: clinic.address, description: clinic.description });
  const slugBad = !/^[a-z0-9-]{3,60}$/.test(v.slug) || isSlugTaken(v.slug, clinics, clinic.id);
  const save = useApiMutation(
    (body: typeof v) => api(`/api/admin/clinics/${clinic.id}`, { method: "PATCH", body: { name: body.name.trim(), slug: body.slug, timeZone: body.timeZone, phone: body.phone, email: body.email, address: body.address } }),
    { invalidate: ADMIN_KEYS, success: "Clinic saved", onSuccess: onClose },
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit {clinic.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="e-name"><Input id="e-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="Booking slug" htmlFor="e-slug" hint={slugBad ? "Slug is invalid or taken." : `/book/${v.slug}`}>
            <Input id="e-slug" aria-invalid={slugBad} value={v.slug} onChange={(e) => setV({ ...v, slug: slugify(e.target.value) })} />
          </Field>
          <Field label="Time zone" htmlFor="e-tz">
            <NativeSelect id="e-tz" value={v.timeZone} onChange={(e) => setV({ ...v, timeZone: e.target.value })}>
              {[...new Set([v.timeZone, ...TIME_ZONES])].map((t) => <option key={t}>{t}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Phone" htmlFor="e-phone"><Input id="e-phone" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field>
          <Field label="Email" htmlFor="e-email"><Input id="e-email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
          <Field label="Address" htmlFor="e-addr"><Input id="e-addr" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} /></Field>
          <div className="sm:col-span-2">
            <Field label="Description" htmlFor="e-desc" hint="Shown on the booking page; clinics edit it under Settings › Appearance."><Textarea id="e-desc" value={v.description} disabled /></Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate(v)} disabled={!v.name.trim() || slugBad || save.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
