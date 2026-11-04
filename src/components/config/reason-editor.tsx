"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { FormField, Operatory, Provider, Reason } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FieldError, MultiCheck } from "./common";
import { QuestionEditor } from "./question-editor";

const schema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  description: z.string().trim().max(160, "Keep it under 160 characters"),
  longDescription: z.string().trim(),
  duration: z.number({ message: "Enter minutes" }).int().min(5, "At least 5 minutes").max(480, "At most 8 hours"),
  patientType: z.enum(["new", "existing", "both"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color"),
  estimatedValue: z.number({ message: "Enter a value" }).min(0),
  visibility: z.enum(["online", "staff_only"]),
  redirectUrl: z.union([z.literal(""), z.string().url("Enter a full URL (https://…)")]),
  noticeOverride: z.string().regex(/^\d*$/, "Whole hours only"),
});
type Values = z.infer<typeof schema>;

export interface ReasonDraft {
  values: Omit<Reason, "id" | "clinicId" | "order" | "active">;
}

export function ReasonEditor({
  open,
  onOpenChange,
  reason,
  providers,
  operatories,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  reason: Reason | null; // null = new
  providers: Provider[];
  operatories: Operatory[];
  onSave: (data: Omit<Reason, "id" | "clinicId" | "order" | "active">) => void;
}) {
  const [providerIds, setProviderIds] = useState<string[]>([]);
  const [operatoryIds, setOperatoryIds] = useState<string[]>([]);
  const [questions, setQuestions] = useState<FormField[]>([]);
  const [linkError, setLinkError] = useState<string>();
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  const { errors } = form.formState;

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: reason?.name ?? "",
      description: reason?.description ?? "",
      longDescription: reason?.longDescription ?? "",
      duration: reason?.duration ?? 30,
      patientType: reason?.patientType ?? "both",
      color: reason?.color ?? "#0f766e",
      estimatedValue: reason?.estimatedValue ?? 0,
      visibility: reason?.visibility ?? "online",
      redirectUrl: reason?.redirectUrl ?? "",
      noticeOverride: reason?.noticeOverrideHours !== undefined ? String(reason.noticeOverrideHours) : "",
    });
    setProviderIds(reason?.providerIds ?? []);
    setOperatoryIds(reason?.operatoryIds ?? []);
    setQuestions(structuredClone(reason?.questions ?? []));
    setLinkError(undefined);
  }, [open, reason, form]);

  const submit = (v: Values) => {
    if (!providerIds.length) {
      setLinkError("Pick at least one provider, otherwise patients can't book this reason.");
      return;
    }
    onSave({
      name: v.name,
      description: v.description,
      longDescription: v.longDescription,
      duration: v.duration,
      patientType: v.patientType,
      color: v.color,
      estimatedValue: v.estimatedValue,
      visibility: v.visibility,
      redirectUrl: v.redirectUrl || undefined,
      noticeOverrideHours: v.noticeOverride === "" ? undefined : Number(v.noticeOverride),
      providerIds,
      operatoryIds,
      questions: questions.filter((q) => q.label.trim()),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold">{reason ? `Edit “${reason.name}”` : "New reason for visit"}</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">Controls what patients see in step 1 and how long the visit is booked for.</SheetDescription>
        </SheetHeader>
        <form onSubmit={form.handleSubmit(submit)} className="grid gap-4" noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="r-name">Name</Label>
            <Input id="r-name" aria-invalid={!!errors.name} {...form.register("name")} />
            <FieldError msg={errors.name?.message} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="r-desc">Short description</Label>
            <Input id="r-desc" aria-invalid={!!errors.description} {...form.register("description")} />
            <FieldError msg={errors.description?.message} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="r-long">Details (shown under “View details”)</Label>
            <Textarea id="r-long" rows={3} {...form.register("longDescription")} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="r-duration">Duration (minutes)</Label>
              <Input id="r-duration" type="number" min={5} step={5} aria-invalid={!!errors.duration} {...form.register("duration", { valueAsNumber: true })} />
              <FieldError msg={errors.duration?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="r-type">Patient type</Label>
              <select id="r-type" className="h-10 rounded-md border border-input bg-card px-2 text-sm" {...form.register("patientType")}>
                <option value="both">New and existing</option>
                <option value="new">New patients</option>
                <option value="existing">Existing patients</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="r-vis">Booking</Label>
              <select id="r-vis" className="h-10 rounded-md border border-input bg-card px-2 text-sm" {...form.register("visibility")}>
                <option value="online">Online</option>
                <option value="staff_only">Staff only</option>
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="r-color">Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" aria-label="Pick color" className="h-10 w-12 cursor-pointer rounded border" value={form.watch("color") ?? "#0f766e"} onChange={(e) => form.setValue("color", e.target.value)} />
                <Input id="r-color" aria-invalid={!!errors.color} {...form.register("color")} />
              </div>
              <FieldError msg={errors.color?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="r-value">Estimated value ($)</Label>
              <Input id="r-value" type="number" min={0} {...form.register("estimatedValue", { valueAsNumber: true })} />
              <FieldError msg={errors.estimatedValue?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="r-notice">Notice override (hours)</Label>
              <Input id="r-notice" inputMode="numeric" placeholder="Use clinic rule" aria-invalid={!!errors.noticeOverride} {...form.register("noticeOverride")} />
              <FieldError msg={errors.noticeOverride?.message} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="r-redirect">Redirect URL after booking (optional)</Label>
            <Input id="r-redirect" placeholder="https://…" aria-invalid={!!errors.redirectUrl} {...form.register("redirectUrl")} />
            <FieldError msg={errors.redirectUrl?.message} />
          </div>
          <MultiCheck
            legend="Providers"
            idPrefix="r-prov"
            options={providers.map((p) => ({ value: p.id, label: p.displayName, hint: p.active ? p.role : `${p.role} · inactive` }))}
            value={providerIds}
            onChange={(v) => {
              setProviderIds(v);
              setLinkError(undefined);
            }}
          />
          <FieldError msg={linkError} />
          <MultiCheck
            legend="Operatories (rooms needed)"
            idPrefix="r-op"
            options={operatories.map((o) => ({ value: o.id, label: o.name, hint: o.active ? undefined : "inactive" }))}
            value={operatoryIds}
            onChange={setOperatoryIds}
            empty="No operatories yet. Add them in Schedule & operatories."
          />
          <QuestionEditor value={questions} onChange={setQuestions} />
          <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-card pt-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">Save reason</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
