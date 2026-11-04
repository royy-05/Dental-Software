"use client";

import type { Source, StepKey, WidgetEventName } from "@/types";
import { useApp } from "@/store/app";

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

const GTM_NAMES: Partial<Record<WidgetEventName, string>> = {
  step_viewed: "step_viewed",
  reason_selected: "reason_selected",
  slot_selected: "slot_selected",
  booking_completed: "booking_completed",
};

/**
 * Logs a widget event for Form Analytics and mirrors it to the Tag Manager dataLayer.
 * Only ids and step names are sent: never names, contact details or answers (no PHI).
 */
export function trackWidget(e: { clinicId: string; sessionId: string; name: WidgetEventName; step?: StepKey; reasonId?: string; source: Source }) {
  useApp.getState().logWidgetEvent(e);
  const gtm = GTM_NAMES[e.name];
  if (gtm && typeof window !== "undefined") {
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push({ event: gtm, clinic_id: e.clinicId, step: e.step, reason_id: e.reasonId, source: e.source });
  }
}
