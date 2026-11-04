"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Channel, MessageTemplate, StarterTemplate, TemplateEvent } from "@/types";
import { TEMPLATE_EVENT_LABELS } from "@/types";
import { TEMPLATE_PLACEHOLDERS } from "@/mock/defaults";
import { smsSegments } from "@/lib/notify";
import { useApp } from "@/store/app";
import { uid } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { ListState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminGuard, ConfirmDialog, Field, NativeSelect, Section, useAdminCan } from "@/components/admin-pages/common";
import { ReadOnlyNotice } from "@/components/admin/shell";

export default function LibrariesPage() {
  return (
    <AdminGuard perm="admin:access">
      <PageHeader title="Global libraries" description="Shared defaults clinics pick from or copy: insurance carriers, message templates, starter booking flows and legal pages." />
      <ReadOnlyNotice perm="admin:libraries:edit" />
      <Tabs defaultValue="carriers">
        <TabsList>
          <TabsTrigger value="carriers">Insurance carriers</TabsTrigger>
          <TabsTrigger value="templates">Default templates</TabsTrigger>
          <TabsTrigger value="starters">Starter flows & reasons</TabsTrigger>
          <TabsTrigger value="legal">Legal pages</TabsTrigger>
        </TabsList>
        <TabsContent value="carriers"><Carriers /></TabsContent>
        <TabsContent value="templates"><DefaultTemplates /></TabsContent>
        <TabsContent value="starters"><Starters /></TabsContent>
        <TabsContent value="legal"><Legal /></TabsContent>
      </Tabs>
    </AdminGuard>
  );
}

function Carriers() {
  const carriers = useApp((s) => s.db.carriers);
  const clinicIns = useApp((s) => s.db.clinicInsurances);
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const canEdit = useAdminCan()("admin:libraries:edit");
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const rows = useMemo(() => [...carriers].filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)), [carriers, q]);
  const usage = (id: string) => clinicIns.filter((c) => c.carrierId === id).length;
  const dup = (n: string, except?: string) => carriers.some((c) => c.id !== except && c.name.toLowerCase() === n.trim().toLowerCase());

  return (
    <Section title="Master insurance carrier list" description="Clinics pick carriers from this list in their Insurances module.">
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="h-9 w-full sm:w-56" placeholder="Search carriers" aria-label="Search carriers" value={q} onChange={(e) => setQ(e.target.value)} />
        {canEdit && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim() || dup(name)) return toast.error(dup(name) ? "Carrier already exists" : "Enter a name");
              mutate((d) => void d.carriers.push({ id: uid("ins"), name: name.trim() }));
              logAudit({ action: "Added insurance carrier", category: "settings", target: name.trim() });
              toast.success(`${name.trim()} added`);
              setName("");
            }}
          >
            <Input className="h-9 w-56" placeholder="New carrier name" aria-label="New carrier name" value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" size="sm"><Plus /> Add</Button>
          </form>
        )}
      </div>
      <ListState items={rows} emptyTitle="No carriers">
        {(list) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Carrier</TableHead>
                <TableHead>Used by clinics</TableHead>
                {canEdit && <TableHead><span className="sr-only">Actions</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{usage(c.id)}</TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <Button size="xs" variant="ghost" aria-label={`Rename ${c.name}`} onClick={() => setEditing({ ...c })}><Pencil /></Button>
                      <Button size="xs" variant="ghost" aria-label={`Remove ${c.name}`} onClick={() => setRemoving(c)}><Trash2 /></Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ListState>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename carrier</DialogTitle></DialogHeader>
          {editing && <Field label="Name" htmlFor="car-name"><Input id="car-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              disabled={!editing?.name.trim() || (editing ? dup(editing.name, editing.id) : true)}
              onClick={() => {
                if (!editing) return;
                mutate((d) => {
                  d.carriers.find((x) => x.id === editing.id)!.name = editing.name.trim();
                  d.clinicInsurances.forEach((ci) => ci.carrierId === editing.id && (ci.name = editing.name.trim()));
                });
                logAudit({ action: "Renamed insurance carrier", category: "settings", target: editing.name });
                toast.success("Carrier renamed");
                setEditing(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name}?`}
        description="Clinics that already use it keep it as a custom carrier."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={() => {
          if (!removing) return;
          mutate((d) => {
            d.carriers = d.carriers.filter((x) => x.id !== removing.id);
            d.clinicInsurances.forEach((ci) => {
              if (ci.carrierId === removing.id) {
                ci.carrierId = undefined;
                ci.custom = true;
              }
            });
          });
          logAudit({ action: "Removed insurance carrier", category: "settings", target: removing.name });
          toast.success(`${removing.name} removed`);
        }}
      />
    </Section>
  );
}

function DefaultTemplates() {
  const templates = useApp((s) => s.db.templates);
  const canEdit = useAdminCan()("admin:libraries:edit");
  const [channel, setChannel] = useState<Channel>("email");
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const rows = useMemo(() => templates.filter((t) => t.clinicId === null && t.channel === channel), [templates, channel]);
  return (
    <Section title="Default email and SMS templates" description="New clinics start from these. Clinics edit their own copies under Templates.">
      <div className="mb-3 flex gap-2" role="group" aria-label="Channel">
        <Button size="sm" variant={channel === "email" ? "default" : "outline"} aria-pressed={channel === "email"} onClick={() => setChannel("email")}>Email</Button>
        <Button size="sm" variant={channel === "sms" ? "default" : "outline"} aria-pressed={channel === "sms"} onClick={() => setChannel("sms")}>SMS</Button>
      </div>
      <ListState items={rows} emptyTitle="No templates">
        {(list) => (
          <ul className="divide-y">
            {list.map((t) => (
              <li key={t.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{TEMPLATE_EVENT_LABELS[t.event]} {!t.enabled && <Badge variant="muted">Off by default</Badge>}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.channel === "email" ? t.subject : t.body}</p>
                </div>
                <Button size="xs" variant="outline" onClick={() => setEditing(t)}>{canEdit ? "Edit" : "View"}</Button>
              </li>
            ))}
          </ul>
        )}
      </ListState>
      {editing && <TemplateDialog template={editing} canEdit={canEdit} onClose={() => setEditing(null)} />}
    </Section>
  );
}

function TemplateDialog({ template, canEdit, onClose }: { template: MessageTemplate; canEdit: boolean; onClose: () => void }) {
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const [v, setV] = useState(template);
  const seg = smsSegments(v.body);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{TEMPLATE_EVENT_LABELS[template.event as TemplateEvent]} · {template.channel.toUpperCase()}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          {v.channel === "email" && <Field label="Subject" htmlFor="tpl-subj"><Input id="tpl-subj" disabled={!canEdit} value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} /></Field>}
          <Field label="Body" htmlFor="tpl-body" hint={v.channel === "sms" ? `${seg.chars} characters · ${seg.segments} segment${seg.segments > 1 ? "s" : ""}` : undefined}>
            <Textarea id="tpl-body" rows={7} disabled={!canEdit} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />
          </Field>
          {canEdit && (
            <div className="flex flex-wrap gap-1" aria-label="Insert placeholder">
              {TEMPLATE_PLACEHOLDERS.map((p) => (
                <Button key={p} type="button" size="xs" variant="secondary" onClick={() => setV({ ...v, body: `${v.body}${p}` })}>{p}</Button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch id="tpl-on" disabled={!canEdit} checked={v.enabled} onCheckedChange={(c) => setV({ ...v, enabled: c })} />
            <label htmlFor="tpl-on" className="text-sm">On by default for new clinics</label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{canEdit ? "Cancel" : "Close"}</Button>
          {canEdit && (
            <Button
              disabled={!v.body.trim()}
              onClick={() => {
                mutate((d) => Object.assign(d.templates.find((t) => t.id === template.id)!, v));
                logAudit({ action: "Edited default template", category: "template", target: `${TEMPLATE_EVENT_LABELS[template.event]} (${template.channel})` });
                toast.success("Default template saved");
                onClose();
              }}
            >
              Save
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Starters() {
  const starters = useApp((s) => s.db.starterTemplates);
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const canEdit = useAdminCan()("admin:libraries:edit");
  const [editing, setEditing] = useState<StarterTemplate | null>(null);
  return (
    <>
      <ListState items={starters} emptyTitle="No starter templates">
        {(list) => (
          <div className="grid gap-4 md:grid-cols-3">
            {list.map((t) => (
              <Section
                key={t.id}
                title={t.name}
                description={t.description}
                actions={canEdit && <Button size="xs" variant="outline" onClick={() => setEditing(t)}>Edit</Button>}
              >
                <p className="mb-2 text-xs capitalize text-muted-foreground">Specialty: {t.specialty} · order {t.flow.order.replace("_", " ")} · {t.flow.intakeFields.length} intake questions</p>
                <ul className="mb-3 space-y-1 text-sm">
                  {t.defaultReasons.map((r) => (
                    <li key={r.name} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} aria-hidden />
                      {r.name} <span className="text-xs text-muted-foreground">· {r.duration} min · {r.patientType}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2">
                  <Switch
                    id={`pub-${t.id}`}
                    checked={t.published}
                    disabled={!canEdit}
                    onCheckedChange={(on) => {
                      mutate((d) => void (d.starterTemplates.find((x) => x.id === t.id)!.published = on));
                      logAudit({ action: `${on ? "Published" : "Unpublished"} starter template`, category: "settings", target: t.name });
                      toast.success(`${t.name} ${on ? "published" : "unpublished"}`);
                    }}
                  />
                  <label htmlFor={`pub-${t.id}`} className="text-sm">{t.published ? "Published to clinics" : "Draft"}</label>
                </div>
              </Section>
            ))}
          </div>
        )}
      </ListState>
      {editing && <StarterDialog starter={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function StarterDialog({ starter, onClose }: { starter: StarterTemplate; onClose: () => void }) {
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const [v, setV] = useState(structuredClone(starter));
  const setReason = (i: number, patch: Partial<StarterTemplate["defaultReasons"][number]>) =>
    setV({ ...v, defaultReasons: v.defaultReasons.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Edit starter template</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Field label="Name" htmlFor="st-name"><Input id="st-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="Description" htmlFor="st-desc"><Textarea id="st-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Default reasons</legend>
            {v.defaultReasons.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_110px_auto] items-center gap-2">
                <Input aria-label="Reason name" value={r.name} onChange={(e) => setReason(i, { name: e.target.value })} />
                <Input aria-label="Duration minutes" type="number" min={5} value={r.duration} onChange={(e) => setReason(i, { duration: Number(e.target.value) || 15 })} />
                <NativeSelect aria-label="Patient type" value={r.patientType} onChange={(e) => setReason(i, { patientType: e.target.value as "new" | "existing" | "both" })}>
                  <option value="new">New</option>
                  <option value="existing">Existing</option>
                  <option value="both">Both</option>
                </NativeSelect>
                <Button size="icon" variant="ghost" aria-label={`Remove ${r.name}`} onClick={() => setV({ ...v, defaultReasons: v.defaultReasons.filter((_, j) => j !== i) })}><Trash2 /></Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="justify-self-start"
              onClick={() => setV({ ...v, defaultReasons: [...v.defaultReasons, { name: "New reason", description: "", duration: 30, patientType: "both", color: "#0f766e", estimatedValue: 100 }] })}
            >
              <Plus /> Add reason
            </Button>
          </fieldset>
          <p className="text-xs text-muted-foreground">The booking flow itself (steps, fields and rules) is copied from the default for this specialty. Clinics edit their copy in the step and form builder.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!v.name.trim() || v.defaultReasons.some((r) => !r.name.trim())}
            onClick={() => {
              mutate((d) => Object.assign(d.starterTemplates.find((x) => x.id === starter.id)!, v));
              logAudit({ action: "Edited starter template", category: "settings", target: v.name });
              toast.success("Starter template saved");
              onClose();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Legal() {
  const legal = useApp((s) => s.db.legalTemplates);
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const canEdit = useAdminCan()("admin:libraries:edit");
  const [drafts, setDrafts] = useState<Record<string, { body: string; version: string }>>({});
  return (
    <ListState items={legal} emptyTitle="No legal templates">
      {(list) => (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((l) => {
            const d = drafts[l.id] ?? { body: l.body, version: l.version };
            const dirty = d.body !== l.body || d.version !== l.version;
            return (
              <Section key={l.id} title={l.title} description="Clinics can use this text or their own URL.">
                <div className="grid gap-3">
                  <Field label="Version" htmlFor={`lv-${l.id}`}><Input id={`lv-${l.id}`} disabled={!canEdit} value={d.version} onChange={(e) => setDrafts({ ...drafts, [l.id]: { ...d, version: e.target.value } })} /></Field>
                  <Field label="Text" htmlFor={`lb-${l.id}`}><Textarea id={`lb-${l.id}`} rows={8} disabled={!canEdit} value={d.body} onChange={(e) => setDrafts({ ...drafts, [l.id]: { ...d, body: e.target.value } })} /></Field>
                  {canEdit && (
                    <Button
                      className="justify-self-start"
                      disabled={!dirty || !d.body.trim()}
                      onClick={() => {
                        mutate((db) => Object.assign(db.legalTemplates.find((x) => x.id === l.id)!, d));
                        logAudit({ action: "Edited legal template", category: "settings", target: `${l.title} v${d.version}` });
                        toast.success(`${l.title} saved`);
                      }}
                    >
                      Save {l.title}
                    </Button>
                  )}
                </div>
              </Section>
            );
          })}
        </div>
      )}
    </ListState>
  );
}
