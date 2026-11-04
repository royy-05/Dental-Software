"use client";

import { useMemo, useState } from "react";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Clinic, Referrer, ReferrerSourceType } from "@/types";
import { SOURCE_LABELS } from "@/types";
import { useApp } from "@/store/app";
import { ListState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { copyText, FieldError, SettingsCard } from "./common";
import { useOrigin } from "./widgets";

const TYPES: ReferrerSourceType[] = ["google_ads", "gbp", "rwg", "website", "custom"];

export function trackedLink(origin: string, clinic: Clinic, id: string) {
  return `${origin}/book/${clinic.slug}?referrer_id=${id}`;
}

export function nextReferrerId(list: Referrer[]): string {
  return String(list.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1);
}

function ReferrerDialog({ clinic, initial, open, onOpenChange }: { clinic: Clinic; initial?: Referrer; open: boolean; onOpenChange: (o: boolean) => void }) {
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const all = useApp((s) => s.db.referrers);
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<ReferrerSourceType>(initial?.sourceType ?? "custom");
  const [url, setUrl] = useState(initial?.redirectUrl ?? "");
  const nameError = name.trim().length < 2 ? "Give the referrer a name" : undefined;
  const urlError = url && !/^https?:\/\/\S+\.\S+/.test(url) ? "Enter a full URL starting with https://" : undefined;
  const [touched, setTouched] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (nameError || urlError) return;
    const id = initial?.id ?? nextReferrerId(all.filter((r) => r.clinicId === clinic.id));
    mutate((db) => {
      const existing = db.referrers.find((r) => r.clinicId === clinic.id && r.id === id);
      if (existing) Object.assign(existing, { name: name.trim(), sourceType: type, redirectUrl: url || undefined });
      else db.referrers.push({ id, clinicId: clinic.id, name: name.trim(), sourceType: type, redirectUrl: url || undefined });
    });
    logAudit({ action: initial ? "Edited referrer" : "Added referrer", category: "settings", target: `${name} (ID ${id})`, clinicId: clinic.id });
    toast.success(initial ? "Referrer updated" : `Referrer added with ID ${id}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? `Edit referrer ${initial.id}` : "Add referrer"}</DialogTitle>
          <DialogDescription>Bookings through this referrer&apos;s link are tagged with its source in reports.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="ref-name">Name</Label>
            <Input id="ref-name" value={name} aria-invalid={touched && !!nameError} onChange={(e) => setName(e.target.value)} />
            {touched && <FieldError msg={nameError} />}
          </div>
          <div className="grid gap-1.5">
            <Label>Source type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ReferrerSourceType)}>
              <SelectTrigger aria-label="Source type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {SOURCE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ref-url">Thank-you redirect URL (optional)</Label>
            <Input id="ref-url" type="url" value={url} placeholder="https://yourpractice.com/thanks-ads" aria-invalid={!!urlError} onChange={(e) => setUrl(e.target.value.trim())} />
            <p className="text-xs text-muted-foreground">Overrides the clinic redirect for this source, so ad conversion tags fire on the right page.</p>
            <FieldError msg={urlError} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{initial ? "Save" : "Add referrer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReferrerSettings({ clinic }: { clinic: Clinic }) {
  const all = useApp((s) => s.db.referrers);
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const origin = useOrigin();
  const list = useMemo(() => all.filter((r) => r.clinicId === clinic.id).sort((a, b) => Number(a.id) - Number(b.id)), [all, clinic.id]);
  const [editing, setEditing] = useState<Referrer | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Referrer | null>(null);

  return (
    <SettingsCard title="Referrers" description="One referrer ID per source, each with its own tracked booking link (?referrer_id=).">
      <div>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> Add referrer
        </Button>
      </div>
      <ListState items={list} emptyTitle="No referrers yet" emptyDescription="Add one for each ad campaign or website button you want to track.">
        {(rows) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Source type</TableHead>
                <TableHead>Redirect URL</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.id}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{SOURCE_LABELS[r.sourceType]}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">{r.redirectUrl ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="xs" onClick={() => copyText(trackedLink(origin, clinic, r.id), "Tracked link copied")} aria-label={`Copy tracked link for ${r.name}`}>
                        <Copy /> Link
                      </Button>
                      <Button variant="ghost" size="xs" onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="xs" className="text-destructive" onClick={() => setConfirmDelete(r)} aria-label={`Delete ${r.name}`}>
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ListState>
      {editing && <ReferrerDialog key={editing === "new" ? "new" : editing.id} clinic={clinic} initial={editing === "new" ? undefined : editing} open onOpenChange={(o) => !o && setEditing(null)} />}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete referrer “{confirmDelete?.name}”?</DialogTitle>
            <DialogDescription>Existing appointments keep their source. Links using ID {confirmDelete?.id} will be tracked as direct visits.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const r = confirmDelete!;
                mutate((db) => void (db.referrers = db.referrers.filter((x) => !(x.clinicId === clinic.id && x.id === r.id))));
                logAudit({ action: "Deleted referrer", category: "settings", target: `${r.name} (ID ${r.id})`, clinicId: clinic.id });
                toast.success("Referrer deleted");
                setConfirmDelete(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  );
}
