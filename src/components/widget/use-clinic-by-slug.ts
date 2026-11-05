"use client";

import { usePublicClinic } from "@/lib/api/public";

/** Public booking bundle for a clinic slug or custom slug (resolved by the server). */
export function useClinicBySlug(slug: string) {
  return usePublicClinic(slug);
}
