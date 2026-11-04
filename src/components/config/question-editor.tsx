"use client";

import { Plus, Trash2 } from "lucide-react";
import type { FieldType, FormField } from "@/types";
import { FIELD_TYPE_LABELS } from "@/types";
import { uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const QUESTION_TYPES: FieldType[] = ["short_text", "long_text", "dropdown", "radio", "checkbox", "date", "number"];
const HAS_OPTIONS: FieldType[] = ["dropdown", "radio"];

/** Per-reason questions (example: "Which tooth is hurting?" only for Emergency Exam). */
export function QuestionEditor({ value, onChange }: { value: FormField[]; onChange: (v: FormField[]) => void }) {
  const update = (id: string, patch: Partial<FormField>) => onChange(value.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">Per-reason questions</legend>
      <p className="text-xs text-muted-foreground">Shown in the patient details step only when this reason is picked.</p>
      {value.map((q, i) => (
        <div key={q.id} className="grid gap-2 rounded-md border p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
            <div className="grid gap-1">
              <Label htmlFor={`q-label-${q.id}`}>Question {i + 1}</Label>
              <Input id={`q-label-${q.id}`} value={q.label} onChange={(e) => update(q.id, { label: e.target.value })} placeholder="e.g. Which tooth is hurting?" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`q-type-${q.id}`}>Type</Label>
              <select
                id={`q-type-${q.id}`}
                className="h-10 rounded-md border border-input bg-card px-2 text-sm"
                value={q.type}
                onChange={(e) => {
                  const type = e.target.value as FieldType;
                  update(q.id, { type, options: HAS_OPTIONS.includes(type) ? (q.options?.length ? q.options : ["Option 1", "Option 2"]) : undefined });
                }}
              >
                {QUESTION_TYPES.map((t) => (
                  <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
          </div>
          {HAS_OPTIONS.includes(q.type) && (
            <div className="grid gap-1">
              <Label htmlFor={`q-opts-${q.id}`}>Options (comma-separated)</Label>
              <Input
                id={`q-opts-${q.id}`}
                value={(q.options ?? []).join(", ")}
                onChange={(e) => update(q.id, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm" htmlFor={`q-req-${q.id}`}>
              <Checkbox id={`q-req-${q.id}`} checked={q.required} onCheckedChange={(c) => update(q.id, { required: !!c })} /> Required
            </label>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(value.filter((x) => x.id !== q.id))} aria-label={`Remove question ${i + 1}`}>
              <Trash2 /> Remove
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={() => onChange([...value, { id: uid("rq"), type: "short_text", label: "", required: false, hidden: false, width: "full", conditions: [] }])}
      >
        <Plus /> Add question
      </Button>
    </fieldset>
  );
}
