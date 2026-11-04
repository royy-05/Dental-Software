"use client";

import { use, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { WidgetTheme } from "@/types";
import { useApp } from "@/store/app";
import { useHydrated } from "@/components/shared/hydration";
import { LoadingState } from "@/components/shared/states";
import { BookingWidget } from "@/components/widget/booking-widget";
import { parseAttribution } from "@/components/widget/attribution";
import { useClinicBySlug } from "@/components/widget/use-clinic-by-slug";

const THEMES: WidgetTheme[] = ["compact", "full_page", "reason_first"];

export default function BookPage({ params }: { params: Promise<{ clinicSlug: string }> }) {
  const { clinicSlug } = use(params);
  const hydrated = useHydrated();
  const search = useSearchParams();
  const clinic = useClinicBySlug(clinicSlug);
  const referrers = useApp((s) => s.db.referrers);
  const attribution = useMemo(() => (clinic ? parseAttribution(search, clinic.id, referrers) : undefined), [clinic, search, referrers]);
  const theme = search.get("theme") as WidgetTheme | null;

  if (!hydrated) return <LoadingState label="Loading booking…" className="mx-auto max-w-xl pt-16" />;
  if (!clinic)
    return (
      <main id="main" className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold">Booking page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">Check the link or contact the clinic directly.</p>
      </main>
    );
  return (
    <BookingWidget
      key={clinic.id}
      clinicId={clinic.id}
      mode="live"
      embedded={search.get("embed") === "1"}
      themeOverride={theme && THEMES.includes(theme) ? theme : undefined}
      attribution={attribution}
    />
  );
}
