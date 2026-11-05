"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { LifeBuoy } from "lucide-react";
import type { Ticket } from "@/types";
import { api } from "@/lib/api/client";
import { qk, useApiMutation, useClinicId } from "@/lib/api/session";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const TICKET_CATEGORIES: { value: Ticket["category"]; label: string }[] = [
  { value: "question", label: "Question" },
  { value: "bug", label: "Something is broken" },
  { value: "billing", label: "Billing" },
  { value: "integrations", label: "Integrations" },
  { value: "feature_request", label: "Feature request" },
  { value: "other", label: "Other" },
];
export const TICKET_PRIORITIES: Ticket["priority"][] = ["low", "normal", "high", "urgent"];

const schema = z.object({
  subject: z.string().trim().min(4, "Add a short subject (4+ characters)"),
  category: z.enum(["bug", "question", "billing", "feature_request", "integrations", "other"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  body: z.string().trim().min(10, "Describe the issue (10+ characters)"),
});
type FormValues = z.infer<typeof schema>;

/** "Raise a Ticket" (top bar + Support module). Goes to the Super Admin support queue. */
export function RaiseTicketDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const clinicId = useClinicId();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { subject: "", category: "question", priority: "normal", body: "" } });
  const create = useApiMutation((body: FormValues & { screenshotName?: string }) => api<Ticket>(`/api/clinics/${clinicId}/tickets`, { body }), {
    invalidate: [qk.clinicRes(clinicId, "tickets")],
    success: false,
    onSuccess: (t) => {
      toast.success(`Ticket ${t.id} sent to Kivi support`);
      form.reset();
      setFile(null);
      setOpen(false);
    },
  });

  const onSubmit = (v: FormValues) => {
    if (!clinicId) return;
    create.mutate({ ...v, screenshotName: file?.name });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <LifeBuoy /> <span className="hidden sm:inline">Raise a Ticket</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Raise a ticket</DialogTitle>
          <DialogDescription>Goes to the Kivi Health support team. Please don&apos;t include patient details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="t-subject">Subject</Label>
            <Input id="t-subject" aria-invalid={!!form.formState.errors.subject} {...form.register("subject")} />
            {form.formState.errors.subject && <p className="text-xs text-destructive">{form.formState.errors.subject.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Category</Label>
              <Select value={form.watch("category")} onValueChange={(v) => form.setValue("category", v as FormValues["category"])}>
                <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Priority</Label>
              <Select value={form.watch("priority")} onValueChange={(v) => form.setValue("priority", v as FormValues["priority"])}>
                <SelectTrigger aria-label="Priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="t-body">Details</Label>
            <Textarea id="t-body" rows={4} aria-invalid={!!form.formState.errors.body} {...form.register("body")} />
            {form.formState.errors.body && <p className="text-xs text-destructive">{form.formState.errors.body.message}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="t-file">Screenshot (optional)</Label>
            <Input id="t-file" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground">Prototype: only the file name is kept.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Sending…" : "Send ticket"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
