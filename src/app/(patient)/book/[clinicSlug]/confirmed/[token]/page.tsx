"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { CalendarPlus, CheckCircle2, ExternalLink, MapPin, Navigation, Phone } from "lucide-react";
import { useApp } from "@/store/app";
import { fromWall, tzAbbrev } from "@/lib/time";
import { useHydrated } from "@/components/shared/hydration";
import { LoadingState } from "@/components/shared/states";
import { BrandButton, WidgetUiProvider } from "@/components/widget/brand";
import { WidgetFooter, WidgetHeader } from "@/components/widget/chrome";
import { buildIcs, directionsUrl, googleCalendarUrl } from "@/components/widget/calendar-links";
import { useClinicBySlug } from "@/components/widget/use-clinic-by-slug";

function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function ConfirmedPage({ params }: { params: Promise<{ clinicSlug: string; token: string }> }) {
  const { clinicSlug, token } = use(params);
  const hydrated = useHydrated();
  const search = useSearchParams();
  const clinic = useClinicBySlug(clinicSlug);
  const appt = useApp((s) => s.db.appointments.find((a) => a.token === token));
  const reason = useApp((s) => s.db.reasons.find((r) => r.id === appt?.reasonId));
  const provider = useApp((s) => s.db.providers.find((p) => p.id === appt?.providerId));
  const referrers = useApp((s) => s.db.referrers);
  const platform = useApp((s) => s.db.platform);
  const [stay, setStay] = useState(false);
  const [left, setLeft] = useState<number | null>(null);

  const refId = search.get("referrer_id") ?? appt?.referrerId;
  const referrer = clinic && refId ? referrers.find((r) => r.clinicId === clinic.id && r.id === refId) : undefined;
  // Precedence: referrer > reason > clinic default.
  const redirectUrl = referrer?.redirectUrl || reason?.redirectUrl || clinic?.settings.widget.redirectUrl || "";
  const delay = Math.min(20, Math.max(0, clinic?.settings.widget.redirectDelaySec ?? 0));

  const hasAppt = !!appt;
  useEffect(() => {
    if (!redirectUrl || stay || !hasAppt) return;
    setLeft(delay);
    if (delay === 0) {
      window.location.assign(redirectUrl);
      return;
    }
    const t = setInterval(() => {
      setLeft((l) => {
        if (l === null) return l;
        if (l <= 1) {
          clearInterval(t);
          window.location.assign(redirectUrl);
          return 0;
        }
        return l - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [redirectUrl, delay, stay, hasAppt]);

  if (!hydrated) return <LoadingState className="mx-auto max-w-xl pt-16" />;
  if (!clinic || !appt)
    return (
      <main id="main" className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold">Booking not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">This link may have expired. Please contact the clinic.</p>
      </main>
    );

  const start = fromWall(appt.start);
  const end = fromWall(appt.end);
  const event = {
    title: `${reason?.name ?? "Appointment"} at ${clinic.name}`,
    start,
    end,
    location: clinic.address,
    description: `With ${provider?.displayName ?? "our team"}. Need to change it? ${typeof window !== "undefined" ? window.location.origin : ""}/book/${clinic.slug}/manage/${appt.token}`,
    uid: appt.id,
  };
  const downloadIcs = () => {
    const blob = new Blob([buildIcs(event)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "appointment.ics";
    a.click();
    URL.revokeObjectURL(url);
  };
  const embedded = search.get("embed") === "1";

  return (
    <WidgetUiProvider value={{ branding: clinic.branding, theme: clinic.branding.theme, mobile: false }}>
      <div className="flex min-h-screen flex-col bg-slate-50">
        <WidgetHeader clinic={clinic} compact={embedded} />
        <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="flex flex-col items-center gap-2 text-center">
              <CheckCircle2 className="h-12 w-12" style={{ color: clinic.branding.primaryColor }} aria-hidden />
              <h1 className="text-2xl font-bold">You&apos;re booked!</h1>
              <p className="text-sm text-muted-foreground">
                We sent a confirmation to {appt.patient.email || "your email"}
                {appt.smsConsent.given ? " and a text to your mobile" : ""}.
              </p>
            </div>
            {redirectUrl && !stay && left !== null && (
              <div role="status" className="mt-5 flex flex-wrap items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm">
                <ExternalLink className="h-4 w-4" aria-hidden />
                <span>Taking you to {hostOf(redirectUrl)} in {left}s…</span>
                <button type="button" className="ml-auto font-semibold underline" onClick={() => setStay(true)}>Stay on this page</button>
              </div>
            )}
            <dl className="mt-6 grid gap-3 rounded-lg border p-4 text-sm">
              <div className="flex gap-3"><dt className="w-20 text-muted-foreground">Visit</dt><dd className="font-medium">{reason?.name}</dd></div>
              <div className="flex gap-3"><dt className="w-20 text-muted-foreground">With</dt><dd className="font-medium">{provider?.displayName}</dd></div>
              <div className="flex gap-3"><dt className="w-20 text-muted-foreground">When</dt><dd className="font-medium">{format(start, "EEEE, MMMM d, yyyy")} at {format(start, "h:mm a")} {tzAbbrev(clinic.timeZone)}</dd></div>
              <div className="flex gap-3"><dt className="w-20 text-muted-foreground">Where</dt><dd className="font-medium">{clinic.address}</dd></div>
            </dl>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <BrandButton onClick={downloadIcs}><CalendarPlus /> Add to calendar (.ics)</BrandButton>
              <a href={googleCalendarUrl(event, clinic.timeZone)} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold hover:bg-slate-50" style={{ color: clinic.branding.primaryColor, borderColor: clinic.branding.primaryColor }}>
                <CalendarPlus className="h-4 w-4" aria-hidden /> Google Calendar
              </a>
              <a href={directionsUrl(clinic.address)} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold hover:bg-slate-50">
                <Navigation className="h-4 w-4" aria-hidden /> Directions
              </a>
              <a href={`tel:${clinic.phone}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold hover:bg-slate-50">
                <Phone className="h-4 w-4" aria-hidden /> Call {clinic.phone}
              </a>
            </div>
            <p className="mt-5 flex items-start gap-2 text-xs text-muted-foreground">
              <MapPin className="mt-0.5 h-3.5 w-3.5" aria-hidden /> Need to change plans?{" "}
              <Link href={`/book/${clinic.slug}/manage/${appt.token}`} className="font-semibold underline" style={{ color: clinic.branding.primaryColor }}>Reschedule or cancel</Link>
            </p>
          </div>
        </main>
        <WidgetFooter clinic={clinic} poweredBy={platform.branding.poweredByText} />
      </div>
    </WidgetUiProvider>
  );
}
