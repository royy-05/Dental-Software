"use client";

import { use, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { CalendarClock, CalendarX2, CheckCircle2, Phone } from "lucide-react";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/client";
import { publicApi, useManageView } from "@/lib/api/public";
import type { Slot } from "@/lib/slots";
import { dayKey, fromWall, nowInZone, toWall, tzAbbrev } from "@/lib/time";
import { LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { BrandButton, WidgetUiProvider } from "@/components/widget/brand";
import { WidgetFooter, WidgetHeader } from "@/components/widget/chrome";
import { DateTimePicker } from "@/components/widget/date-time-picker";

type Cache<T> = Map<string, T | "loading">;

/** Availability for the reschedule picker, loaded from the signed-link endpoints and cached per month / day. */
function useManageAvailability(token: string) {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const avail = useRef<Cache<Record<string, number>>>(new Map());
  const slots = useRef<Cache<Slot[]>>(new Map());
  const pending = useRef(0);
  useEffect(() => {
    // A new link (after a reschedule) means new availability.
    avail.current = new Map();
    slots.current = new Map();
  }, [token]);
  const availability = useCallback(
    (from: Date, days: number) => {
      const key = `${dayKey(from)}|${days}`;
      const hit = avail.current.get(key);
      if (hit === undefined) {
        avail.current.set(key, "loading");
        pending.current++;
        publicApi
          .manageAvailability(token, { from: dayKey(from), days })
          .then((m) => avail.current.set(key, m))
          .catch(() => avail.current.set(key, {}))
          .finally(() => {
            pending.current--;
            rerender();
          });
      }
      return hit && hit !== "loading" ? hit : {};
    },
    [token],
  );
  const slotsFor = useCallback(
    (day: Date) => {
      const key = dayKey(day);
      const hit = slots.current.get(key);
      if (hit === undefined) {
        slots.current.set(key, "loading");
        pending.current++;
        publicApi
          .manageSlots(token, { date: key })
          .then((list) => slots.current.set(key, list))
          .catch(() => slots.current.set(key, []))
          .finally(() => {
            pending.current--;
            rerender();
          });
      }
      return hit && hit !== "loading" ? hit : [];
    },
    [token],
  );
  return { availability, slotsFor, loading: pending.current > 0 };
}

export default function ManagePage({ params }: { params: Promise<{ clinicSlug: string; token: string }> }) {
  const { clinicSlug, token } = use(params);
  const router = useRouter();
  const view = useManageView(token);
  const clinic = view.data?.clinic;
  const appt = view.data?.appointment;
  const reason = view.data?.reason;
  const provider = view.data?.provider;
  const rules = view.data?.rules;
  const { availability, slotsFor, loading } = useManageAvailability(token);
  const [mode, setMode] = useState<"view" | "reschedule">("view");
  const [picked, setPicked] = useState<Slot | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelNote, setCancelNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"rescheduled" | "cancelled" | null>(null);
  const now = useMemo(() => (clinic ? nowInZone(clinic.timeZone) : new Date()), [clinic]);
  useEffect(() => {
    setMode("view");
    setPicked(null);
  }, [token]);
  useEffect(() => {
    if (view.data && done === null && view.data.appointment.statusHistory.at(-1)?.by === "Patient (reschedule link)" && sessionStorage.getItem("kivi-rescheduled") === token) {
      setDone("rescheduled");
      sessionStorage.removeItem("kivi-rescheduled");
    }
  }, [view.data, done, token]);

  if (view.isLoading) return <LoadingState className="mx-auto max-w-xl pt-16" />;
  if (view.error) {
    const isDb =
      view.error.message.includes("database") ||
      view.error.message.includes("database_unavailable") ||
      ("status" in view.error && ((view.error as { status?: number }).status === 503 || (view.error as { status?: number }).status === 500));
    return (
      <main id="main" className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold">{isDb ? "Service Temporarily Unavailable" : "Appointment not found"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isDb ? "We're currently unable to load your appointment details. Please try again shortly." : view.error.message}
        </p>
        {isDb && (
          <button
            type="button"
            onClick={() => view.refetch()}
            className="mt-5 inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700"
          >
            Try again
          </button>
        )}
      </main>
    );
  }
  if (!clinic || !appt || !rules)
    return (
      <main id="main" className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold">Appointment not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">{view.error instanceof Error ? view.error.message : "This link may have expired. Please contact the clinic."}</p>
      </main>
    );

  const start = fromWall(appt.start);
  const hoursUntil = (start.getTime() - now.getTime()) / 3600000;
  const windowH = rules.cancellationWindowHours;
  const active = appt.status === "unconfirmed" || appt.status === "confirmed";
  const inWindow = hoursUntil >= windowH;
  const color = clinic.branding.primaryColor;

  const fail = (e: unknown) => {
    toast.error(e instanceof ApiClientError ? e.message : "Something went wrong. Please try again.");
    if (e instanceof ApiClientError && (e.code === "link_stale" || e.code === "link_invalid" || e.code === "not_active" || e.code === "outside_window")) view.refetch();
  };
  const confirmReschedule = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const res = await publicApi.reschedule(token, { start: toWall(picked.start), providerId: picked.providerId });
      sessionStorage.setItem("kivi-rescheduled", res.token);
      router.replace(`/book/${clinicSlug}/manage/${res.token}`);
    } catch (e) {
      fail(e);
      setPicked(null);
    } finally {
      setBusy(false);
    }
  };
  const confirmCancel = async () => {
    setBusy(true);
    try {
      await publicApi.cancel(token, { note: cancelNote.trim() || undefined });
      setCancelOpen(false);
      setDone("cancelled");
      await view.refetch();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
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
                  maxDays={rules.bookingWindowDays}
                  availability={availability}
                  slotsFor={slotsFor}
                  selectedStart={picked?.start}
                  onSelect={setPicked}
                  loading={loading}
                />
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <BrandButton disabled={!picked || busy} onClick={confirmReschedule}>
                    {busy ? "Moving…" : picked ? `Move to ${format(picked.start, "EEE MMM d, h:mm a")}` : "Choose a time"}
                  </BrandButton>
                  <BrandButton variant="ghost" onClick={() => { setMode("view"); setPicked(null); }}>Keep current time</BrandButton>
                </div>
              </div>
            )}
          </div>
        </main>
        <WidgetFooter clinic={clinic} poweredBy={view.data!.platform.poweredByText} />
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
            <BrandButton disabled={busy} onClick={confirmCancel}>{busy ? "Cancelling…" : "Yes, cancel"}</BrandButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WidgetUiProvider>
  );
}
