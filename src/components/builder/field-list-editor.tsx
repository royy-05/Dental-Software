"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import type { FieldType, FormField, Reason } from "@/types";
import { FIELD_TYPE_LABELS } from "@/types";
import { uid } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConditionsEditor } from "./conditions-editor";
import { DragHandle, SortableList } from "./sortable-list";

const ALL_TYPES = Object.keys(FIELD_TYPE_LABELS) as FieldType[];
const sel = "h-10 rounded-md border border-input bg-card px-3 text-sm";

export function newField(type: FieldType): FormField {
  return {
    id: uid("cf"),
    type,
    label: type === "consent" ? "I agree to the clinic's policies" : `New ${FIELD_TYPE_LABELS[type].toLowerCase()} question`,
    placeholder: "",
    helpText: "",
    required: false,
    hidden: false,
    width: type === "long_text" || type === "consent" || type === "file" ? "full" : "half",
    options: type === "dropdown" || type === "radio" ? ["Option 1", "Option 2"] : undefined,
    conditions: [],
  };
}

function FieldEditorDialog({
  field,
  onSave,
  onClose,
  reasons,
  conditionFields,
}: {
  field: FormField;
  onSave: (f: FormField) => void;
  onClose: () => void;
  reasons: Reason[];
  conditionFields: FormField[];
}) {
  const [f, setF] = useState<FormField>(field);
  const set = <K extends keyof FormField>(k: K, v: FormField[K]) => setF((x) => ({ ...x, [k]: v }));
  const hasOptions = f.type === "dropdown" || f.type === "radio";
  const p = `fe-${f.id}`;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{f.builtIn ? "Edit built-in field" : "Edit field"}</DialogTitle>
          <DialogDescription>{f.builtIn ? "Built-in fields can be renamed or made optional, but not deleted or retyped." : FIELD_TYPE_LABELS[f.type]}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor={`${p}-label`}>Label</Label>
            <Input id={`${p}-label`} value={f.label} onChange={(e) => set("label", e.target.value)} />
          </div>
          {!f.builtIn && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${p}-type`}>Type</Label>
              <select id={`${p}-type`} className={sel} value={f.type} onChange={(e) => { const t = e.target.value as FieldType; setF((x) => ({ ...x, type: t, options: t === "dropdown" || t === "radio" ? (x.options ?? ["Option 1", "Option 2"]) : undefined })); }}>
                {ALL_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor={`${p}-width`}>Layout</Label>
            <select id={`${p}-width`} className={sel} value={f.width} onChange={(e) => set("width", e.target.value as FormField["width"])}>
              <option value="half">Half width</option>
              <option value="full">Full width</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${p}-ph`}>Placeholder</Label>
            <Input id={`${p}-ph`} value={f.placeholder ?? ""} onChange={(e) => set("placeholder", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${p}-def`}>Default value</Label>
            {f.type === "checkbox" || f.type === "consent" ? (
              <select id={`${p}-def`} className={sel} value={f.defaultValue ?? ""} onChange={(e) => set("defaultValue", e.target.value)}>
                <option value="">Unchecked</option>
                <option value="true">Checked</option>
              </select>
            ) : hasOptions ? (
              <select id={`${p}-def`} className={sel} value={f.defaultValue ?? ""} onChange={(e) => set("defaultValue", e.target.value)}>
                <option value="">None</option>
                {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <Input id={`${p}-def`} value={f.defaultValue ?? ""} onChange={(e) => set("defaultValue", e.target.value)} disabled={f.type === "file"} />
            )}
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor={`${p}-help`}>Help text</Label>
            <Input id={`${p}-help`} value={f.helpText ?? ""} onChange={(e) => set("helpText", e.target.value)} />
          </div>
          {hasOptions && (
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor={`${p}-opts`}>Options (one per line)</Label>
              <Textarea id={`${p}-opts`} rows={4} value={(f.options ?? []).join("\n")} onChange={(e) => set("options", e.target.value.split("\n"))} onBlur={(e) => set("options", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch id={`${p}-req`} checked={f.required} onCheckedChange={(v) => set("required", v)} />
            <Label htmlFor={`${p}-req`}>Required</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id={`${p}-show`} checked={!f.hidden} onCheckedChange={(v) => set("hidden", !v)} />
            <Label htmlFor={`${p}-show`}>Show on form</Label>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <p className="text-sm font-medium">Show this field only when</p>
            <ConditionsEditor idPrefix={p} conditions={f.conditions} onChange={(c) => set("conditions", c)} reasons={reasons} fields={conditionFields.filter((x) => x.id !== f.id)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (!f.label.trim()) return;
              onSave({ ...f, label: f.label.trim(), options: f.options?.map((s) => s.trim()).filter(Boolean) });
            }}
            disabled={!f.label.trim()}
          >
            Save field
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Sortable list of form fields with add / edit / show-hide / width / delete. */
export function FieldListEditor({
  title,
  description,
  fields,
  onChange,
  reasons,
  conditionFields,
  fileUploadsAvailable = true,
}: {
  title: string;
  description?: string;
  fields: FormField[];
  onChange: (f: FormField[]) => void;
  reasons: Reason[];
  conditionFields: FormField[];
  fileUploadsAvailable?: boolean;
}) {
  const [editing, setEditing] = useState<FormField | null>(null);
  const [addType, setAddType] = useState<FieldType>("short_text");
  const patch = (id: string, p: Partial<FormField>) => onChange(fields.map((f) => (f.id === id ? { ...f, ...p } : f)));

  return (
    <div className="grid gap-3">
      <div>
        <h3 className="font-semibold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {fields.length === 0 && <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No fields yet.</p>}
      <SortableList
        items={fields}
        onReorder={onChange}
        render={(f, handle) => (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-2 py-2">
            <DragHandle {...handle} label={f.label} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                {f.builtIn && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Built-in field" />}
                <span className={f.hidden ? "text-muted-foreground line-through" : ""}>{f.label}</span>
              </p>
              <p className="flex flex-wrap gap-1 pt-0.5">
                <Badge variant="muted">{FIELD_TYPE_LABELS[f.type]}</Badge>
                <Badge variant={f.required ? "warning" : "outline"}>{f.required ? "Required" : "Optional"}</Badge>
                {f.conditions.length > 0 && <Badge variant="info">{f.conditions.length} rule{f.conditions.length > 1 ? "s" : ""}</Badge>}
                {f.type === "file" && !fileUploadsAvailable && <Badge variant="danger">Uploads off</Badge>}
              </p>
            </div>
            <button
              type="button"
              className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
              onClick={() => patch(f.id, { width: f.width === "half" ? "full" : "half" })}
              aria-label={`Width: ${f.width}. Switch to ${f.width === "half" ? "full" : "half"} width`}
            >
              {f.width === "half" ? "½ width" : "Full width"}
            </button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={f.hidden ? `Show ${f.label}` : `Hide ${f.label}`} aria-pressed={!f.hidden} onClick={() => patch(f.id, { hidden: !f.hidden })}>
              {f.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${f.label}`} onClick={() => setEditing(f)}>
              <Pencil className="h-4 w-4" />
            </Button>
            {!f.builtIn && (
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={`Delete ${f.label}`} onClick={() => onChange(fields.filter((x) => x.id !== f.id))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`add-${title}`} className="sr-only">Field type to add</label>
        <select id={`add-${title}`} className="h-9 rounded-md border border-input bg-card px-2 text-sm" value={addType} onChange={(e) => setAddType(e.target.value as FieldType)}>
          {ALL_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>)}
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            const f = newField(addType);
            onChange([...fields, f]);
            setEditing(f);
          }}
        >
          <Plus /> Add field
        </Button>
      </div>
      {editing && (
        <FieldEditorDialog
          key={editing.id}
          field={editing}
          reasons={reasons}
          conditionFields={conditionFields}
          onClose={() => setEditing(null)}
          onSave={(f) => {
            patch(f.id, f);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
