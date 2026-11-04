"use client";

import { Plus, Trash2 } from "lucide-react";
import type { Condition, FormField, Reason } from "@/types";
import { describeCondition } from "@/lib/flow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TYPES: { value: Condition["type"]; label: string }[] = [
  { value: "patient_type", label: "Patient type is" },
  { value: "reason", label: "Reason selected is" },
  { value: "insurance", label: "Insurance answer is" },
  { value: "answer", label: "A previous answer equals" },
  { value: "someone_else", label: "Booking is for someone else" },
];

const sel = "h-9 rounded-md border border-input bg-card px-2 text-sm";

function blank(type: Condition["type"], reasons: Reason[], fields: FormField[]): Condition {
  switch (type) {
    case "patient_type":
      return { type, value: "new" };
    case "reason":
      return { type, value: reasons[0]?.id ?? "" };
    case "insurance":
      return { type, value: "yes" };
    case "answer":
      return { type, fieldId: fields[0]?.id ?? "", value: fields[0]?.options?.[0] ?? "" };
    case "someone_else":
      return { type, value: true };
  }
}

/** "Show only when…" rule editor. All conditions must match (AND). */
export function ConditionsEditor({
  conditions,
  onChange,
  reasons,
  fields,
  idPrefix,
}: {
  conditions: Condition[];
  onChange: (c: Condition[]) => void;
  reasons: Reason[];
  fields: FormField[];
  idPrefix: string;
}) {
  const update = (i: number, c: Condition) => onChange(conditions.map((x, j) => (j === i ? c : x)));
  return (
    <div className="grid gap-2">
      {conditions.length === 0 && <p className="text-xs text-muted-foreground">Always shown. Add a rule to show it only in some cases.</p>}
      {conditions.map((c, i) => {
        const field = c.type === "answer" ? fields.find((f) => f.id === c.fieldId) : undefined;
        return (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
            {i > 0 && <span className="text-xs font-semibold text-muted-foreground">AND</span>}
            <select aria-label="Rule type" id={`${idPrefix}-type-${i}`} className={sel} value={c.type} onChange={(e) => update(i, blank(e.target.value as Condition["type"], reasons, fields))}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {c.type === "patient_type" && (
              <select aria-label="Patient type" className={sel} value={c.value} onChange={(e) => update(i, { ...c, value: e.target.value as "new" | "existing" })}>
                <option value="new">New</option>
                <option value="existing">Existing</option>
              </select>
            )}
            {c.type === "reason" && (
              <select aria-label="Reason" className={sel} value={c.value} onChange={(e) => update(i, { ...c, value: e.target.value })}>
                {reasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
            {c.type === "insurance" && (
              <select aria-label="Insurance answer" className={sel} value={c.value} onChange={(e) => update(i, { ...c, value: e.target.value as "yes" | "no" })}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            )}
            {c.type === "someone_else" && (
              <select aria-label="Someone else" className={sel} value={String(c.value)} onChange={(e) => update(i, { ...c, value: e.target.value === "true" })}>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            )}
            {c.type === "answer" && (
              <>
                <select aria-label="Question" className={sel} value={c.fieldId} onChange={(e) => { const f = fields.find((x) => x.id === e.target.value); update(i, { ...c, fieldId: e.target.value, value: f?.options?.[0] ?? "" }); }}>
                  {fields.length === 0 && <option value="">No earlier questions</option>}
                  {fields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
                {field?.options?.length ? (
                  <select aria-label="Answer value" className={sel} value={c.value} onChange={(e) => update(i, { ...c, value: e.target.value })}>
                    {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <Input aria-label="Answer value" className="h-9 w-40" value={c.value} onChange={(e) => update(i, { ...c, value: e.target.value })} />
                )}
              </>
            )}
            <Button type="button" variant="ghost" size="icon" className="ml-auto h-8 w-8" aria-label={`Remove rule: ${describeCondition(c, reasons, fields)}`} onClick={() => onChange(conditions.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => onChange([...conditions, blank("patient_type", reasons, fields)])}>
        <Plus /> Add rule
      </Button>
    </div>
  );
}
