"use client";

import { use, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { WidgetTheme } from "@/types";
import { usePublicClinic } from "@/lib/api/public";
import { LoadingState } from "@/components/shared/states";
import { BookingWidget } from "@/components/widget/booking-widget";
import { parseAttribution } from "@/components/widget/attribution";

const THEMES: WidgetTheme[] = ["compact", "full_page", "reason_first"];

export default function BookPage({ params }: { params: Promise<{ clinicSlug: string }> }) {
  const { clinicSlug } = use(params);
  const search = useSearchParams();
  const bundle = usePublicClinic(clinicSlug);
  const clinic = bundle.data?.clinic;
  const referrers = bundle.data?.referrers;
  const attribution = useMemo(() => (clinic && referrers ? parseAttribution(search, clinic.id, referrers) : undefined), [clinic, referrers, search]);
  const theme = search.get("theme") as WidgetTheme | null;

  if (bundle.isLoading) return <LoadingState label="Loading booking…" className="mx-auto max-w-xl pt-16" />;
  if (bundle.error) {
    const isDbDown =
      (bundle.error instanceof Error &&
        (bundle.error.message.includes("database") ||
          bundle.error.message.includes("database_unavailable") ||
          bundle.error.message.includes("Can't reach database") ||
          ("status" in bundle.error && ((bundle.error as { status?: number }).status === 503 || (bundle.error as { status?: number }).status === 500))));

    return (
      <main id="main" className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold">{isDbDown ? "Service Temporarily Unavailable" : "Booking page not found"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isDbDown
            ? "We're currently having trouble reaching our booking system. Please try again in a few moments or contact the clinic directly."
            : "Check the link or contact the clinic directly."}
        </p>
        {isDbDown && (
          <button
            type="button"
            onClick={() => bundle.refetch()}
            className="mt-5 inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700"
          >
            Try again
          </button>
        )}
      </main>
    );
  }
  if (!bundle.data)
    return (
      <main id="main" className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold">Booking page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">Check the link or contact the clinic directly.</p>
      </main>
    );
  return (
    <BookingWidget
      key={bundle.data.clinic.id}
      bundle={bundle.data}
      slug={clinicSlug}
      mode="live"
      embedded={search.get("embed") === "1"}
      themeOverride={theme && THEMES.includes(theme) ? theme : undefined}
      attribution={attribution}
    />
  );
}
