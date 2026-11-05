"use client";

import { useMemo, useState } from "react";
import { Copy, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Operatory, Provider, Reason } from "@/types";
import { api } from "@/lib/api/client";
import { clinicPath } from "@/lib/api/clinic";
import { useApiMutation } from "@/lib/api/session";
import { RequirePermission } from "@/components/shared/guards";
import { PageHeader } from "@/components/shared/page-header";
import { ListState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog, useClinicConfig, useConfirm } from "@/components/config/common";
import { ReasonEditor } from "@/components/config/reason-editor";

type ReasonSave = Omit<Reason, "id" | "clinicId" | "order" | "active">;

function TypeBadges({ t }: { t: Reason["patientType"] }) {
  return (
    <span className="flex gap-1">
      {(t === "new" || t === "both") && <Badge variant="info">New</Badge>}
      {(t === "existing" || t === "both") && <Badge variant="secondary">Returning</Badge>}
    </span>
  );
}

function Row({
  reason,
  providers,
  operatories,
  onEdit,
  onDuplicate,
  onDelete,
  onToggle,
}: {
  reason: Reason;
  providers: Provider[];
  operatories: Operatory[];
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggle: (v: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: reason.id });
  const provNames = providers.filter((p) => reason.providerIds.includes(p.id)).map((p) => p.displayName);
  const opNames = operatories.filter((o) => reason.operatoryIds.includes(o.id)).map((o) => o.name);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex flex-col gap-3 border-b bg-card p-3 last:border-0 sm:flex-row sm:items-center ${isDragging ? "relative z-10 shadow-lg" : ""}`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <button
          type="button"
          className="mt-1 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          aria-label={`Drag to reorder ${reason.name}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: reason.color }} aria-hidden />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {reason.name}
            <TypeBadges t={reason.patientType} />
            {reason.visibility === "staff_only" && <Badge variant="muted">Staff only</Badge>}
            {reason.questions.length > 0 && <Badge variant="outline">{reason.questions.length} question{reason.questions.length > 1 ? "s" : ""}</Badge>}
          </p>
          <p className="text-xs text-muted-foreground">
            {reason.duration} min · {provNames.length ? provNames.join(", ") : <span className="text-destructive">No providers</span>}
            {opNames.length > 0 && <> · Rooms: {opNames.join(", ")}</>}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 pl-10 sm:pl-0">
        <div className="mr-2 flex items-center gap-2">
          <Switch id={`active-${reason.id}`} checked={reason.active} onCheckedChange={onToggle} />
          <label htmlFor={`active-${reason.id}`} className="text-xs">{reason.active ? "Active" : "Inactive"}</label>
        </div>
        <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${reason.name}`}><Pencil /></Button>
        <Button variant="ghost" size="icon" onClick={onDuplicate} aria-label={`Duplicate ${reason.name}`}><Copy /></Button>
        <Button variant="ghost" size="icon" onClick={onDelete} aria-label={`Delete ${reason.name}`}><Trash2 /></Button>
      </div>
    </li>
  );
}

function ReasonsModule() {
  const { clinic, clinicId, reasons, providers, operatories, isLoading } = useClinicConfig();
  const [editing, setEditing] = useState<Reason | null | "new">(null);
  const del = useConfirm<Reason>();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids = useMemo(() => reasons.map((r) => r.id), [reasons]);
  const base = clinicPath(clinicId, "/reasons");

  const reorder = useApiMutation((next: string[]) => api(`${base}/reorder`, { body: { ids: next } }), { success: "Order saved" });
  const create = useApiMutation((data: ReasonSave) => api<Reason>(base, { body: data }), { success: "Reason added", onSuccess: () => setEditing(null) });
  const update = useApiMutation(({ id, data }: { id: string; data: Partial<ReasonSave> & { active?: boolean } }) => api<Reason>(`${base}/${id}`, { method: "PATCH", body: data }), {
    success: (r, v) => ("active" in v.data ? `${r.name} is now ${r.active ? "active" : "inactive"}` : "Reason updated"),
    onSuccess: (_r, v) => !("active" in v.data) && setEditing(null),
  });
  const duplicate = useApiMutation((id: string) => api(`${base}/${id}/duplicate`, { method: "POST" }), { success: "Reason duplicated (inactive until you turn it on)" });
  const remove = useApiMutation((id: string) => api(`${base}/${id}`, { method: "DELETE" }), { success: "Reason deleted" });

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    reorder.mutate(arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  };

  const save = (data: ReasonSave) => {
    const current = editing === "new" ? null : editing;
    if (current) update.mutate({ id: current.id, data });
    else create.mutate({ ...data, active: true } as ReasonSave);
  };

  return (
    <>
      <PageHeader
        title="Reasons for visit"
        description={`What patients can book at ${clinic?.name ?? "this clinic"}. Drag to change the order patients see.`}
        actions={<Button onClick={() => setEditing("new")}><Plus /> Add reason</Button>}
      />
      <Card>
        <ListState items={reasons} loading={isLoading} emptyTitle="No reasons yet" emptyDescription="Add the visit types patients can book online." emptyAction={<Button size="sm" onClick={() => setEditing("new")}><Plus /> Add reason</Button>}>
          {(list) => (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={list.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                <ul aria-label="Reasons for visit">
                  {list.map((r) => (
                    <Row
                      key={r.id}
                      reason={r}
                      providers={providers}
                      operatories={operatories}
                      onEdit={() => setEditing(r)}
                      onDelete={() => del.ask(r)}
                      onToggle={(v) => update.mutate({ id: r.id, data: { active: v } })}
                      onDuplicate={() => duplicate.mutate(r.id)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </ListState>
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">Only active, online reasons with at least one provider shown online appear in the booking widget.</p>
      <ReasonEditor
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        reason={editing === "new" ? null : editing}
        providers={providers}
        operatories={operatories}
        onSave={save}
      />
      <ConfirmDialog
        open={del.open}
        onOpenChange={(o) => !o && del.close()}
        title={`Delete “${del.item?.name}”?`}
        description="Existing appointments keep their history, but patients can no longer book this reason. This can't be undone."
        onConfirm={() => remove.mutate(del.item!.id)}
      />
    </>
  );
}

export default function ReasonsPage() {
  return (
    <RequirePermission perm="reasons:manage">
      <ReasonsModule />
    </RequirePermission>
  );
}
