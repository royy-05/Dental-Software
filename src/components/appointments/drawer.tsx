"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Ban, CalendarClock, Check, CheckCheck, MailCheck, MessageSquareReply, Send, UserX, XCircle } from "lucide-react";
import type { Appointment, AppointmentStatus, FormField } from "@/types";
import { SOURCE_LABELS } from "@/types";
import { actorName, useApp } from "@/store/app";
import type { Slot } from "@/lib/slots";
import { fromWall, tzAbbrev } from "@/lib/time";
import { Phi } from "@/components/shared/phi";
import { useCan } from "@/components/shared/guards";
import { StatusBadge } from "@/components/shared/status-badge";
import { DeliveryLog } from "@/components/messaging/delivery-log";
import { SmsSimulator } from "@/components/messaging/sms-simulator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { SlotPicker } from "./slot-picker";
import type { ClinicData } from "./use-clinic-data";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

const NETWORK_LABEL: Record<string, string> = { in_network: "In network", out_of_network: "Out of network", not_accepted: "Not accepted", other: "Other plan" };

export function AppointmentDrawer({ appointmentId, data, onClose }: { appointmentId: string | null; data: ClinicData; onClose: () => void }) {
  const appt = data.appointments.find((a) => a.id === appointmentId) ?? null;
  const can = useCan();
  const logAudit = useApp((s) => s.logAudit);

  // Audit trail: patient record views (section 8).
  useEffect(() => {
    if (appointmentId && appt) logAudit({ action: "Viewed patient record", category: "phi_access", target: appointmentId, clinicId: appt.clinicId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId]);

  return (
    <Sheet open={!!appointmentId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl">
        {!appt ? (
          <SheetHeader>
            <SheetTitle>Appointment not found</SheetTitle>
            <SheetDescription>It may belong to another clinic. Switch clinic in the top bar.</SheetDescription>
          </SheetHeader>
        ) : (
          <DrawerBody appt={appt} data={data} canManage={can("appointments:manage")} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({ appt, data, canManage }: { appt: Appointment; data: ClinicData; canManage: boolean }) {
  const setStatus = useApp((s) => s.setAppointmentStatus);
  const notify = useApp((s) => s.notify);
  const addNote = useApp((s) => s.addAppointmentNote);
  const [note, setNote] = useState("");
  const [declineOpen, setDeclineOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [showSim, setShowSim] = useState(false);
  const reason = data.reasons.find((r) => r.id === appt.reasonId);
  const referrer = data.referrers.find((r) => r.id === appt.referrerId);
  const start = fromWall(appt.start);
  const end = fromWall(appt.end);
  const op = data.operatories.find((o) => o.id === appt.operatoryId);

  const fieldLabels = useMemo(() => {
    const all: FormField[] = [...(data.flow?.published.fields ?? []), ...(data.flow?.published.intakeFields ?? []), ...(reason?.questions ?? [])];
    return new Map(all.map((f) => [f.id, f.label]));
  }, [data.flow, reason]);

  const act = (status: AppointmentStatus, msg: string) => {
    setStatus(appt.id, status, { by: actorName() });
    toast.success(msg);
  };
  const active = appt.status === "unconfirmed" || appt.status === "confirmed";

  return (
    <div className="grid gap-5 pb-8">
      <SheetHeader>
        <div className="flex flex-wrap items-center gap-2">
          <SheetTitle className="text-lg font-semibold">
            <Phi>{`${appt.patient.firstName} ${appt.patient.lastName}`}</Phi>
          </SheetTitle>
          <StatusBadge status={appt.status} />
          <Badge variant={appt.patientType === "new" ? "secondary" : "outline"}>{appt.patientType === "new" ? "New patient" : "Returning"}</Badge>
        </div>
        <SheetDescription>
          {reason?.name} · {format(start, "EEE, MMM d, yyyy")} · {format(start, "h:mm a")}–{format(end, "h:mm a")} {data.clinic ? tzAbbrev(data.clinic.timeZone) : ""} · {data.providerName(appt.providerId)}
          {op ? ` · ${op.name}` : ""}
        </SheetDescription>
      </SheetHeader>

      {canManage && (
        <div className="flex flex-wrap gap-2" aria-label="Appointment actions">
          {appt.status === "unconfirmed" && (
            <Button size="sm" onClick={() => act("confirmed", "Appointment confirmed")}><Check /> Confirm</Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setRescheduleOpen(true)}><CalendarClock /> Reschedule</Button>
          {active && (
            <Button size="sm" variant="outline" onClick={() => act("cancelled", "Appointment cancelled and patient notified")}><XCircle /> Cancel</Button>
          )}
          {appt.status === "unconfirmed" && (
            <Button size="sm" variant="outline" onClick={() => setDeclineOpen(true)}><Ban /> Decline</Button>
          )}
          {(active || appt.status === "no_show") && (
            <Button size="sm" variant="outline" onClick={() => act("complete", "Marked complete")}><CheckCheck /> Mark complete</Button>
          )}
          {(active || appt.status === "complete") && (
            <Button size="sm" variant="outline" onClick={() => act("no_show", "Marked as no-show")}><UserX /> No-show</Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const msgs = notify(appt.id, "resend");
              toast.success(msgs.length ? `Confirmation resent (${msgs.length} message${msgs.length > 1 ? "s" : ""})` : "Nothing sent: templates are off");
            }}
          >
            <MailCheck /> Resend confirmation
          </Button>
          {appt.status === "unconfirmed" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const msgs = notify(appt.id, "confirmation_request");
                toast.success(msgs.length ? "Confirmation request sent" : "Nothing sent: SMS consent or template is off");
              }}
            >
              <Send /> Ask to confirm
            </Button>
          )}
        </div>
      )}

      <Section title="Patient">
        <dl className="grid gap-1.5">
          <Row label="Name"><Phi>{`${appt.patient.firstName} ${appt.patient.lastName}`}</Phi></Row>
          <Row label="Date of birth"><Phi>{appt.patient.dob}</Phi></Row>
          <Row label="Mobile">{appt.patient.phone && <Phi>{appt.patient.phone}</Phi>}</Row>
          <Row label="Email">{appt.patient.email && <Phi>{appt.patient.email}</Phi>}</Row>
          <Row label="Booked for someone else">{appt.bookingForSomeoneElse ? <>Yes{appt.bookerName ? <> · booked by <Phi>{appt.bookerName}</Phi></> : null}</> : "No"}</Row>
          <Row label="Message">{appt.patient.message && <Phi>{appt.patient.message}</Phi>}</Row>
          <Row label="SMS consent">
            {appt.smsConsent.given ? `Given ${appt.smsConsent.at ? format(new Date(appt.smsConsent.at), "MMM d, yyyy h:mm a") : ""} · Terms ${appt.smsConsent.termsVersion ?? ""} · IP ${appt.smsConsent.ip ?? ""}` : "Not given"}
          </Row>
          <Row label="Booked by">{appt.bookedBy === "staff" ? "Staff (phone-in)" : "Patient online"} · {format(new Date(appt.createdAt), "MMM d, yyyy h:mm a")}</Row>
        </dl>
      </Section>
      <Separator />

      <Section title="Insurance">
        {appt.insurance.hasInsurance ? (
          <dl className="grid gap-1.5">
            <Row label="Carrier">
              {appt.insurance.carrierName}{" "}
              {appt.insurance.networkStatus && <Badge variant={appt.insurance.networkStatus === "in_network" ? "success" : "warning"}>{NETWORK_LABEL[appt.insurance.networkStatus]}</Badge>}
            </Row>
            <Row label="Subscriber">{appt.insurance.subscriberName && <Phi>{appt.insurance.subscriberName}</Phi>}</Row>
            <Row label="Subscriber ID">{appt.insurance.subscriberId && <Phi>{appt.insurance.subscriberId}</Phi>}</Row>
            <Row label="Subscriber DOB">{appt.insurance.subscriberDob && <Phi>{appt.insurance.subscriberDob}</Phi>}</Row>
            {Object.entries(appt.insurance.extraAnswers ?? {}).map(([q, a]) => <Row key={q} label={q}>{a}</Row>)}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">No insurance (self-pay).</p>
        )}
      </Section>
      <Separator />

      <Section title="Intake answers">
        {Object.keys(appt.answers).length === 0 ? (
          <p className="text-sm text-muted-foreground">No answers.</p>
        ) : (
          <dl className="grid gap-1.5">
            {Object.entries(appt.answers).map(([k, v]) => (
              <Row key={k} label={fieldLabels.get(k) ?? k}>{typeof v === "boolean" ? (v ? "Yes" : "No") : <Phi>{v}</Phi>}</Row>
            ))}
          </dl>
        )}
      </Section>
      <Section title="Files">
        {appt.files.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files uploaded.</p>
        ) : (
          <ul className="text-sm">
            {appt.files.map((f) => <li key={f.name}>{f.name} <span className="text-muted-foreground">({Math.round(f.size / 1024)} KB, stored name only in prototype)</span></li>)}
          </ul>
        )}
      </Section>
      <Separator />

      <Section title="Source and tracking">
        <dl className="grid gap-1.5">
          <Row label="Source">{SOURCE_LABELS[appt.source]}</Row>
          <Row label="Referrer">{referrer ? `${referrer.name} (ID ${referrer.id})` : appt.referrerId ? `ID ${appt.referrerId}` : ""}</Row>
          {(["source", "medium", "campaign", "term", "content"] as const).map((k) => (
            <Row key={k} label={`utm_${k}`}>{appt.utm[k] ? <code className="text-xs">{appt.utm[k]}</code> : ""}</Row>
          ))}
          <Row label="gclid">{appt.gclid && <code className="text-xs">{appt.gclid}</code>}</Row>
          <Row label="fbclid">{appt.fbclid && <code className="text-xs">{appt.fbclid}</code>}</Row>
        </dl>
      </Section>
      <Separator />

      <Section title="Message log">
        <DeliveryLog appointmentId={appt.id} compact />
        {canManage && (
          <div>
            <Button variant="link" size="xs" className="px-0" onClick={() => setShowSim((v) => !v)} aria-expanded={showSim}>
              <MessageSquareReply /> {showSim ? "Hide" : "Open"} SMS reply simulator
            </Button>
            {showSim && data.clinic && (
              <div className="mt-2 rounded-md border p-3">
                <SmsSimulator clinicId={data.clinic.id} defaultPhone={appt.patient.phone} />
              </div>
            )}
          </div>
        )}
      </Section>
      <Separator />

      <Section title="Status history">
        <ol className="grid gap-2 border-l-2 border-muted pl-4">
          {[...appt.statusHistory].reverse().map((h, i) => (
            <li key={i} className="text-sm">
              <StatusBadge status={h.status} /> <span className="text-muted-foreground">{format(new Date(h.at), "MMM d, yyyy h:mm a")} · {h.by}</span>
              {h.note && <span className="block text-xs text-muted-foreground">{h.note}</span>}
            </li>
          ))}
        </ol>
        {appt.declineReason && <p className="text-sm">Decline reason: {appt.declineReason}</p>}
      </Section>
      <Separator />

      <Section title="Internal notes">
        {appt.notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet. Notes are never shown to the patient.</p>}
        <ul className="grid gap-2">
          {appt.notes.map((n) => (
            <li key={n.id} className="rounded-md bg-muted p-2.5 text-sm">
              {n.text}
              <span className="mt-1 block text-xs text-muted-foreground">{n.by} · {format(new Date(n.at), "MMM d, h:mm a")}</span>
            </li>
          ))}
        </ul>
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim()) return;
            addNote(appt.id, note.trim());
            setNote("");
            toast.success("Note added");
          }}
        >
          <Label htmlFor="appt-note" className="sr-only">Add internal note</Label>
          <Textarea id="appt-note" rows={2} placeholder="Add an internal note…" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button type="submit" size="sm" variant="secondary" className="justify-self-start" disabled={!note.trim()}>Add note</Button>
        </form>
      </Section>

      <DeclineDialog open={declineOpen} onOpenChange={setDeclineOpen} onConfirm={(reasonText) => {
        setStatus(appt.id, "declined", { by: actorName(), declineReason: reasonText });
        toast.success("Request declined and patient notified");
      }} />
      <RescheduleDialog open={rescheduleOpen} onOpenChange={setRescheduleOpen} appt={appt} data={data} />
    </div>
  );
}

const DECLINE_PRESETS = ["Outside service area", "Needs referral first", "Duplicate request", "Not a fit for this reason", "Other"];

function DeclineDialog({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (reason: string) => void }) {
  const [preset, setPreset] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState(false);
  const value = preset === "Other" || !preset ? text.trim() : `${preset}${text.trim() ? `: ${text.trim()}` : ""}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline request</DialogTitle>
          <DialogDescription>The patient gets the “Declined” email and SMS. A reason is required.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Select value={preset} onValueChange={(v) => { setPreset(v); setError(false); }}>
            <SelectTrigger aria-label="Decline reason"><SelectValue placeholder="Choose a reason" /></SelectTrigger>
            <SelectContent>
              {DECLINE_PRESETS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Label htmlFor="decline-text">Details {preset && preset !== "Other" ? "(optional)" : ""}</Label>
          <Textarea id="decline-text" rows={3} value={text} aria-invalid={error} onChange={(e) => { setText(e.target.value); setError(false); }} />
          {error && <p className="text-xs text-destructive">Enter a reason for declining.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Back</Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (!value) return setError(true);
              onConfirm(value);
              setPreset("");
              setText("");
              onOpenChange(false);
            }}
          >
            Decline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RescheduleDialog({ open, onOpenChange, appt, data }: { open: boolean; onOpenChange: (o: boolean) => void; appt: Appointment; data: ClinicData }) {
  const reschedule = useApp((s) => s.rescheduleAppointment);
  const [providerId, setProviderId] = useState(appt.providerId);
  const [slot, setSlot] = useState<Slot | null>(null);
  const reason = data.reasons.find((r) => r.id === appt.reasonId);
  const providers = data.providers.filter((p) => p.active && reason?.providerIds.includes(p.id));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Reschedule</DialogTitle>
          <DialogDescription>{reason?.name} · currently {format(fromWall(appt.start), "EEE, MMM d 'at' h:mm a")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Provider</Label>
            <Select value={providerId} onValueChange={(v) => { setProviderId(v); setSlot(null); }}>
              <SelectTrigger aria-label="Provider"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">First available</SelectItem>
                {providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.displayName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <SlotPicker clinicId={appt.clinicId} reasonId={appt.reasonId} providerId={providerId} ignoreAppointmentId={appt.id} value={slot} onChange={setSlot} initialDate={appt.start.slice(0, 10)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Back</Button>
          <Button
            disabled={!slot}
            onClick={() => {
              if (!slot) return;
              const res = reschedule(appt.id, { start: slot.start, providerId: slot.providerId, operatoryId: slot.operatoryId }, actorName());
              if (!res.ok) return toast.error(res.error ?? "Could not reschedule");
              toast.success("Rescheduled and patient notified");
              setSlot(null);
              onOpenChange(false);
            }}
          >
            Save new time
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
