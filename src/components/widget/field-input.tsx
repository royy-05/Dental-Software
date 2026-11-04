"use client";

import { Upload } from "lucide-react";
import type { FormField } from "@/types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

export interface FieldInputProps {
  field: FormField;
  value: string | boolean | undefined;
  onChange: (v: string | boolean) => void;
  error?: string;
  onFile?: (file: { name: string; size: number } | null) => void;
  idPrefix?: string;
  consentExtra?: React.ReactNode;
}

const selectCls =
  "flex h-11 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive";

/** Renders any builder field type with label, help text and an error linked via aria-describedby. */
export function FieldInput({ field: f, value, onChange, error, onFile, idPrefix = "w", consentExtra }: FieldInputProps) {
  const id = `${idPrefix}-${f.id}`;
  const helpId = f.helpText ? `${id}-help` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [helpId, errId].filter(Boolean).join(" ") || undefined;
  const common = { id, "aria-invalid": !!error, "aria-describedby": describedBy, "aria-required": f.required };
  const str = typeof value === "string" ? value : "";
  const label = (
    <label htmlFor={id} className="text-sm font-medium">
      {f.label}
      {f.required ? <span aria-hidden className="text-destructive"> *</span> : <span className="font-normal text-muted-foreground"> (optional)</span>}
    </label>
  );

  let control: React.ReactNode;
  switch (f.type) {
    case "long_text":
      control = <Textarea {...common} placeholder={f.placeholder} value={str} onChange={(e) => onChange(e.target.value)} rows={3} />;
      break;
    case "dropdown":
      control = (
        <select {...common} className={selectCls} value={str} onChange={(e) => onChange(e.target.value)}>
          <option value="">{f.placeholder || "Choose…"}</option>
          {(f.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
      break;
    case "radio":
      return (
        <fieldset className="grid gap-2" aria-describedby={describedBy} aria-invalid={!!error}>
          <legend className="mb-1 text-sm font-medium">
            {f.label}
            {f.required ? <span aria-hidden className="text-destructive"> *</span> : <span className="font-normal text-muted-foreground"> (optional)</span>}
          </legend>
          <div className="flex flex-wrap gap-2">
            {(f.options ?? []).map((o, i) => (
              <label key={o} htmlFor={`${id}-${i}`} className={cn("flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm has-[:checked]:border-current has-[:checked]:font-semibold")}>
                <input type="radio" id={`${id}-${i}`} name={id} value={o} checked={str === o} onChange={() => onChange(o)} className="h-4 w-4 accent-current" />
                {o}
              </label>
            ))}
          </div>
          {f.helpText && <p id={helpId} className="text-xs text-muted-foreground">{f.helpText}</p>}
          {error && <p id={errId} className="text-xs font-medium text-destructive">{error}</p>}
        </fieldset>
      );
    case "checkbox":
    case "consent":
      return (
        <div className="grid gap-1">
          <div className="flex items-start gap-3">
            <Checkbox {...common} checked={!!value} onCheckedChange={(c) => onChange(c === true)} className="mt-0.5" />
            <label htmlFor={id} className="text-sm leading-snug">
              {f.label}
              {f.required && <span aria-hidden className="text-destructive"> *</span>} {consentExtra}
            </label>
          </div>
          {f.helpText && <p id={helpId} className="ml-8 text-xs text-muted-foreground">{f.helpText}</p>}
          {error && <p id={errId} className="ml-8 text-xs font-medium text-destructive">{error}</p>}
        </div>
      );
    case "file":
      control = (
        <div className="flex flex-col gap-1">
          <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm hover:bg-muted">
            <Upload className="h-4 w-4" aria-hidden />
            {str ? <span className="truncate">{str}</span> : <span className="text-muted-foreground">{f.placeholder || "Choose a file"}</span>}
          </label>
          <input
            {...common}
            type="file"
            className="sr-only"
            accept="image/*,application/pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              onFile?.(file ? { name: file.name, size: file.size } : null);
              onChange(file?.name ?? "");
            }}
          />
        </div>
      );
      break;
    default: {
      const type = f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "date" ? "date" : f.type === "number" ? "number" : "text";
      const auto =
        f.builtIn === "firstName" ? "given-name" : f.builtIn === "lastName" ? "family-name" : f.builtIn === "email" ? "email" : f.builtIn === "phone" ? "tel" : f.builtIn === "dob" ? "bday" : undefined;
      control = (
        <Input
          {...common}
          type={type}
          inputMode={f.type === "phone" ? "tel" : f.type === "number" ? "decimal" : undefined}
          autoComplete={auto}
          placeholder={f.placeholder}
          value={str}
          onChange={(e) => onChange(e.target.value)}
          className="h-11"
        />
      );
    }
  }
  return (
    <div className="grid content-start gap-1.5">
      {label}
      {control}
      {f.helpText && <p id={helpId} className="text-xs text-muted-foreground">{f.helpText}</p>}
      {error && <p id={errId} className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
