"use client";

import { use, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { CalendarClock, CalendarX2, CheckCircle2, Phone } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/store/app";
import { availableDays, firstAvailable, getSlotsForDay, type Slot } from "@/lib/slots";
import { fromWall, nowInZone, tzAbbrev } from "@/lib/time";
import { useHydrated } from "@/components/shared/hydration";
import { LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { BrandButton, WidgetUiProvider } from "@/components/widget/brand";
import { WidgetFooter, WidgetHeader } from "@/components/widget/chrome";
import { DateTimePicker } from "@/components/widget/date-time-picker";
import { useClinicBySlug } from "@/components/widget/use-clinic-by-slug";

export default function ManagePage({ params }: { params: Promise<{ clinicSlug: string; token: string }> }) {
  const { clinicSlug, token } = use(params);
  const hydrated = useHydrated();
  const clinic = useClinicBySlug(clinicSlug);
  const appt = useApp((s) => s.db.appointments.find((a) => a.token === token));
  const reason = useApp((s) => s.db.reasons.find((r) => r.id === appt?.reasonId));
  const provider = useApp((s) => s.db.providers.find((p) => p.id === appt?.providerId));
  const flow = useApp((s) => s.db.flows.find((f) => f.clinicId === clinic?.id));
  const appointments = useApp((s) => s.db.appointments);
  const holds = useApp((s) => s.db.holds);
  const platform = useApp((s) => s.db.platform);
  const reschedule = useApp((s) => s.rescheduleAppointment);
  const setStatus = useApp((s) => s.setAppointmentStatus);
  const [mode, setMode] = useState<"view" | "reschedule">("view");
  const [picked, setPicked] = useState<Slot | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelNote, setCancelNote] = useState("");
  const [done, setDone] = useState<"rescheduled" | "cancelled" | null>(null);

  const ctx = useCallback(() => {
    if (!clinic || !appt || !flow) return null;
    return useApp.getState().slotContext(clinic.id, appt.reasonId, { rules: flow.published.rules, ignoreAppointmentId: appt.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic, appt, flow, appointments, holds]);
  const slotsFor = useCallback((day: Date) => {
    const c = ctx();
    return c ? firstAvailable(getSlotsForDay(day, c)) : [];
  }, [ctx]);
  const availability = useCallback((from: Date, days: number) => {
    const c = ctx();
    return c ? availableDays(from, days, c) : {};
  }, [ctx]);
  const now = useMemo(() => (clinic ? nowInZone(clinic.timeZone) : new Date()), [clinic]);

  if (!hydrated) return <LoadingState className="mx-auto max-w-xl pt-16" />;
  if (!clinic || !appt || !flow)
    return (
      <main id="main" className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold">Appointment not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">This link may have expired. Please contact the clinic.</p>
      </main>
    );

  const start = fromWall(appt.start);
  const hoursUntil = (start.getTime() - now.getTime()) / 3600000;
  const windowH = flow.published.rules.cancellationWindowHours;
  const active = appt.status === "unconfirmed" || appt.status === "confirmed";
  const inWindow = hoursUntil >= windowH;
  const color = clinic.branding.primaryColor;

  const confirmReschedule = () => {
    if (!picked) return;
    const res = reschedule(appt.id, { start: picked.start, providerId: picked.providerId, operatoryId: picked.operatoryId }, "Patient (reschedule link)");
    if (!res.ok) {
      toast.error(res.error ?? "Couldn't reschedule");
      setPicked(null);
      return;
    }
    setDone("rescheduled");
    setMode("view");
    setPicked(null);
  };
  const confirmCancel = () => {
    setStatus(appt.id, "cancelled", { by: "Patient (cancel link)", note: cancelNote.trim() || undefined });
    setCancelOpen(false);
    setDone("cancelled");
  };

  return (
    <WidgetUiProvider value={{ branding: clinic.branding, theme: clinic.branding.theme, mobile: false }}>
      <div className="flex min-h-screen flex-col bg-slate-50">
        <WidgetHeader clinic={clinic} />
        <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
          <div className="rounded-xl border bg-white p-5 shadow-sm sm:p-6">
            <h1 className="text-xl font-bold">Manage your appointment</h1>
            {done && (
              <p role="status" className="mt-3 flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-950">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> {done === "rescheduled" ? "Your appointment has been moved. We sent you an updated confirmation." : "Your appointment is cancelled. We sent you a confirmation."}
              </p>
            )}
            <dl className="mt-4 grid gap-2 rounded-lg border p-4 text-sm">
              <div className="flex gap-3"><dt className="w-20 text-muted-foreground">Visit</dt><dd className="font-medium">{reason?.name}</dd></div>
              <div className="flex gap-3"><dt className="w-20 text-muted-foreground">With</dt><dd className="font-medium">{provider?.displayName}</dd></div>
              <div className="flex gap-3"><dt className="w-20 text-muted-foreground">When</dt><dd className="font-medium">{format(start, "EEEE, MMMM d, yyyy 'at' h:mm a")} {tzAbbrev(clinic.timeZone)}</dd></div>
              <div className="flex items-center gap-3"><dt className="w-20 text-muted-foreground">Status</dt><dd><StatusBadge status={appt.status} /></dd></div>
            </dl>

            {!active ? (
              <div className="mt-5 text-sm">
                <p>{appt.status === "cancelled" ? "This appointment is cancelled." : "This appointment can no longer be changed online."}</p>
                <Link href={`/book/${clinic.slug}`} className="mt-2 inline-block font-semibold underline" style={{ color }}>Book a new appointment</Link>
              </div>
            ) : !inWindow ? (
              <div className="mt-5 rounded-md bg-amber-50 p-4 text-sm text-amber-950">
                <p>Online changes close {windowH} hours before your visit. Please call us to reschedule or cancel.</p>
                <a href={`tel:${clinic.phone}`} className="mt-2 inline-flex items-center gap-1 font-semibold underline"><Phone className="h-4 w-4" aria-hidden /> {clinic.phone}</a>
              </div>
            ) : mode === "view" ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <BrandButton onClick={() => setMode("reschedule")}><CalendarClock /> Reschedule</BrandButton>
                <BrandButton variant="secondary" onClick={() => setCancelOpen(true)}><CalendarX2 /> Cancel appointment</BrandButton>
                <p className="w-full text-xs text-muted-foreground">You can change online until {windowH} hours before your visit.</p>
              </div>
            ) : (
              <div className="mt-6">
                <h2 className="mb-4 font-semibold">Pick a new time</h2>
                <DateTimePicker
                  timeZone={clinic.timeZone}
                  now={now}
                  maxDays={flow.published.rules.bookingWindowDays}
                  availability={availability}
                  slotsFor={slotsFor}
                  selectedStart={picked?.start}
                  onSelect={setPicked}
                />
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <BrandButton disabled={!picked} onClick={confirmReschedule}>
                    {picked ? `Move to ${format(picked.start, "EEE MMM d, h:mm a")}` : "Choose a time"}
                  </BrandButton>
                  <BrandButton variant="ghost" onClick={() => { setMode("view"); setPicked(null); }}>Keep current time</BrandButton>
                </div>
              </div>
            )}
          </div>
        </main>
        <WidgetFooter clinic={clinic} poweredBy={platform.branding.poweredByText} />
      </div>
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this appointment?</DialogTitle>
            <DialogDescription>{reason?.name} on {format(start, "EEE, MMM d 'at' h:mm a")}</DialogDescription>
          </DialogHeader>
          <label htmlFor="cancel-note" className="text-sm font-medium">Reason (optional)</label>
          <Textarea id="cancel-note" value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} rows={3} />
          <DialogFooter>
            <BrandButton variant="secondary" onClick={() => setCancelOpen(false)}>Keep appointment</BrandButton>
            <BrandButton onClick={confirmCancel}>Yes, cancel</BrandButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WidgetUiProvider>
  );
}
