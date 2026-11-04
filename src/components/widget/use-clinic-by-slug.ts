"use client";

import { useApp } from "@/store/app";

/** Resolve a clinic from its booking slug or custom slug (Settings > Widgets). */
export function useClinicBySlug(slug: string) {
  return useApp((s) => s.db.clinics.find((c) => c.slug === slug || c.settings.widget.customSlug === slug));
}
