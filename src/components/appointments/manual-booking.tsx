"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PhoneCall } from "lucide-react";
import type { Appointment } from "@/types";
import type { Slot } from "@/lib/slots";
import { toWall } from "@/lib/time";
import { api, ApiClientError } from "@/lib/api/client";
import { qk, useApiMutation, useClinicId } from "@/lib/api/session";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SlotPicker } from "./slot-picker";
import type { ClinicData } from "./use-clinic-data";

const schema = z
  .object({
    reasonId: z.string().min(1, "Choose a reason"),
    providerId: z.string(),
    patientType: z.enum(["new", "existing"]),
    firstName: z.string().trim().min(1, "Required"),
    lastName: z.string().trim().min(1, "Required"),
    dob: z.string().min(1, "Required"),
    phone: z.string().trim().regex(/^[\d\s()+-]{7,}$/, "Enter a valid phone number"),
    email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
    message: z.string(),
    hasInsurance: z.boolean(),
    carrierName: z.string(),
    subscriberName: z.string(),
    subscriberId: z.string(),
    smsConsent: z.boolean(),
    status: z.enum(["confirmed", "unconfirmed"]),
  })
  .refine((v) => !v.hasInsurance || v.carrierName.length > 0, { path: ["carrierName"], message: "Choose a carrier" });
type Values = z.infer<typeof schema>;

const DEFAULTS: Values = {
  reasonId: "",
  providerId: "any",
  patientType: "existing",
  firstName: "",
  lastName: "",
  dob: "",
  phone: "",
  email: "",
  message: "",
  hasInsurance: false,
  carrierName: "",
  subscriberName: "",
  subscriberId: "",
  smsConsent: true,
  status: "confirmed",
};

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="text-xs text-destructive">{msg}</p> : null;
}

/** Manual booking by staff for phone-in patients (5.2). */
export function ManualBookingDialog({ data, onBooked }: { data: ClinicData; onBooked?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const clinicId = useClinicId();
  const create = useApiMutation((body: unknown) => api<Appointment>(`/api/clinics/${clinicId}/appointments`, { body }), {
    invalidate: [qk.clinicRes(clinicId, "appointments"), qk.clinicRes(clinicId, "notifications"), qk.clinicRes(clinicId, "messages")],
    errorToast: false,
  });
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });
  const { register, watch, setValue, formState } = form;
  const errors = formState.errors;
  const reasonId = watch("reasonId");
  const providerId = watch("providerId");
  const hasInsurance = watch("hasInsurance");
  const reason = data.reasons.find((r) => r.id === reasonId);
  const reasonProviders = data.providers.filter((p) => p.active && reason?.providerIds.includes(p.id));

  const onSubmit = async (v: Values) => {
    if (!data.clinic) return;
    if (!slot) {
      setSlotError("Pick a time");
      return;
    }
    const carrier = data.insurances.find((i) => i.name === v.carrierName);
    try {
      const appt = await create.mutateAsync({
        reasonId: v.reasonId,
        providerId: slot.providerId,
        start: toWall(slot.start),
        patientType: v.patientType,
        patient: { firstName: v.firstName, lastName: v.lastName, dob: v.dob, phone: v.phone, email: v.email, message: v.message },
        bookingForSomeoneElse: false,
        insurance: v.hasInsurance
          ? { hasInsurance: true, carrierName: v.carrierName, networkStatus: carrier?.status ?? "other", subscriberName: v.subscriberName, subscriberId: v.subscriberId }
          : { hasInsurance: false },
        answers: {},
        files: [],
        smsConsent: v.smsConsent,
        status: v.status,
      });
      toast.success("Appointment booked", { description: "Confirmation messages were queued for delivery." });
      form.reset(DEFAULTS);
      setSlot(null);
      setOpen(false);
      onBooked?.(appt.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not book";
      if (e instanceof ApiClientError && e.code === "slot_taken") setSlot(null);
      setSlotError(msg);
      toast.error(msg);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSlotError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <PhoneCall /> New booking
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manual booking</DialogTitle>
          <DialogDescription>For phone-in patients. Staff bookings can use staff-only reasons and skip minimum notice.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-5">
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold">Visit</legend>
            <div className="grid gap-1.5">
              <Label>Reason</Label>
              <Select
                value={reasonId}
                onValueChange={(v) => {
                  setValue("reasonId", v, { shouldValidate: true });
                  setValue("providerId", "any");
                  setSlot(null);
                }}
              >
                <SelectTrigger aria-label="Reason" aria-invalid={!!errors.reasonId}><SelectValue placeholder="Choose a reason" /></SelectTrigger>
                <SelectContent>
                  {data.reasons.filter((r) => r.active).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} ({r.duration} min){r.visibility === "staff_only" ? " · staff only" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError msg={errors.reasonId?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label>Provider</Label>
              <Select value={providerId} onValueChange={(v) => { setValue("providerId", v); setSlot(null); }} disabled={!reason}>
                <SelectTrigger aria-label="Provider"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">First available</SelectItem>
                  {reasonProviders.map((p) => <SelectItem key={p.id} value={p.id}>{p.displayName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              {data.clinic && (
                <SlotPicker
                  reasonId={reasonId || undefined}
                  providerId={providerId}
                  value={slot}
                  onChange={(s) => {
                    setSlot(s);
                    setSlotError(null);
                  }}
                />
              )}
              <FieldError msg={slotError ?? undefined} />
            </div>
          </fieldset>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold">Patient</legend>
            <div className="grid gap-1.5">
              <Label htmlFor="mb-first">First name</Label>
              <Input id="mb-first" aria-invalid={!!errors.firstName} {...register("firstName")} />
              <FieldError msg={errors.firstName?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mb-last">Last name</Label>
              <Input id="mb-last" aria-invalid={!!errors.lastName} {...register("lastName")} />
              <FieldError msg={errors.lastName?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mb-dob">Date of birth</Label>
              <Input id="mb-dob" type="date" aria-invalid={!!errors.dob} {...register("dob")} />
              <FieldError msg={errors.dob?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mb-phone">Mobile</Label>
              <Input id="mb-phone" type="tel" placeholder="(555) 010-0000" aria-invalid={!!errors.phone} {...register("phone")} />
              <FieldError msg={errors.phone?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mb-email">Email (optional)</Label>
              <Input id="mb-email" type="email" aria-invalid={!!errors.email} {...register("email")} />
              <FieldError msg={errors.email?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label>Patient type</Label>
              <Select value={watch("patientType")} onValueChange={(v) => setValue("patientType", v as Values["patientType"])}>
                <SelectTrigger aria-label="Patient type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New patient</SelectItem>
                  <SelectItem value="existing">Existing patient</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="mb-msg">Note from the patient</Label>
              <Textarea id="mb-msg" rows={2} {...register("message")} />
            </div>
          </fieldset>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold">Insurance</legend>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox checked={hasInsurance} onCheckedChange={(c) => setValue("hasInsurance", c === true)} /> Patient has insurance
            </label>
            {hasInsurance && (
              <>
                <div className="grid gap-1.5">
                  <Label>Carrier</Label>
                  <Select value={watch("carrierName")} onValueChange={(v) => setValue("carrierName", v, { shouldValidate: true })}>
                    <SelectTrigger aria-label="Carrier" aria-invalid={!!errors.carrierName}><SelectValue placeholder="Choose carrier" /></SelectTrigger>
                    <SelectContent>
                      {data.insurances.map((i) => <SelectItem key={i.id} value={i.name}>{i.name}</SelectItem>)}
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldError msg={errors.carrierName?.message} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="mb-subname">Subscriber full name</Label>
                  <Input id="mb-subname" {...register("subscriberName")} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="mb-subid">Subscriber ID</Label>
                  <Input id="mb-subid" {...register("subscriberId")} />
                </div>
              </>
            )}
          </fieldset>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={watch("smsConsent")} onCheckedChange={(c) => setValue("smsConsent", c === true)} /> Patient agreed to SMS (verbal consent)
            </label>
            <div className="flex items-center gap-2">
              <Label className="text-sm">Status</Label>
              <Select value={watch("status")} onValueChange={(v) => setValue("status", v as Values["status"])}>
                <SelectTrigger className="h-9 w-36" aria-label="Status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="unconfirmed">Unconfirmed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Booking…" : "Book appointment"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
