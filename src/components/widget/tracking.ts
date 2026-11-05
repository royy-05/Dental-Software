"use client";

import type { Source, StepKey, WidgetEventName } from "@/types";
import { publicApi } from "@/lib/api/public";

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

export interface WidgetTrackEvent {
  name: WidgetEventName;
  step?: StepKey;
  reasonId?: string;
  source: Source;
}

/**
 * Funnel tracking for Form Analytics (section 3). Events are batched per widget session and posted to
 * /api/public/clinics/:slug/events about a second after the last one; booking_completed and page hide flush
 * at once (sendBeacon so the request survives navigation). Only ids and step names are sent: never names,
 * contact details or answers (no PHI). Each event is also mirrored to the Tag Manager dataLayer.
 */
export interface WidgetTracker {
  track(e: WidgetTrackEvent): void;
  flush(): void;
  dispose(): void;
}

export function createTracker(slug: string, sessionId: string, clinicId: string): WidgetTracker {
  let queue: WidgetTrackEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const send = (useBeacon: boolean) => {
    if (!queue.length) return;
    const batch = queue;
    queue = [];
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const body = { sessionId, events: batch };
    if (useBeacon && typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const ok = navigator.sendBeacon(`/api/public/clinics/${slug}/events`, new Blob([JSON.stringify(body)], { type: "application/json" }));
      if (ok) return;
    }
    publicApi.events(slug, body).catch(() => {
      /* analytics must never break booking */
    });
  };
  const onHide = () => send(true);
  if (typeof window !== "undefined") window.addEventListener("pagehide", onHide);

  return {
    track(e) {
      queue.push(e);
      const gtm = GTM_NAMES[e.name];
      if (gtm && typeof window !== "undefined") {
        window.dataLayer = window.dataLayer ?? [];
        window.dataLayer.push({ event: gtm, clinic_id: clinicId, step: e.step, reason_id: e.reasonId, source: e.source });
      }
      if (e.name === "booking_completed") send(true);
      else if (!timer) timer = setTimeout(() => send(false), 1000);
    },
    flush: () => send(false),
    dispose() {
      if (typeof window !== "undefined") window.removeEventListener("pagehide", onHide);
      send(true);
    },
  };
}
