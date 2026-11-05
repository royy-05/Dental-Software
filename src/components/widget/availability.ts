"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { addDays, startOfDay } from "date-fns";
import type { FlowConfig } from "@/types";
import type { PublicBundle } from "@/lib/api/public";
import { publicApi } from "@/lib/api/public";
import { availableDays, firstAvailable, getSlotsForDay, type Slot, type SlotContext } from "@/lib/slots";
import { dayKey, nowInZone } from "@/lib/time";

/**
 * Availability for the widget's DateTimePicker, whose `availability(from, days)` and `slotsFor(day)` callbacks
 * are synchronous. Live mode caches server answers (/api/public/.../availability and /slots) and loads missing
 * entries lazily; the picker re-renders when they arrive. Preview mode (builder) runs the slot engine locally
 * against the bundle with no appointments or holds, so it needs no network.
 */
export interface AvailabilitySource {
  /** Day -> number of bookable times. Missing entries are being loaded. */
  availability(reasonId: string | undefined, providerId: string | undefined, from: Date, days: number): Record<string, number>;
  /** First-available slots for a day (per provider when `providerId` is set). Empty while loading. */
  slotsFor(reasonId: string | undefined, providerId: string | undefined, day: Date): Slot[];
  /** Is anything still loading for the given reason/provider? */
  loading: boolean;
  /** Drop every cached answer (after a failed booking or an expired hold). */
  reset(): void;
}

type Cache<T> = Map<string, T | "loading">;

export function useAvailabilitySource(opts: { live: boolean; slug: string; bundle: PublicBundle; flow: FlowConfig; sessionId: string; reasonIds: string[] }): AvailabilitySource {
  const { live, slug, bundle, flow, sessionId, reasonIds } = opts;
  // `version` bumps whenever a cached answer arrives so the callbacks (and the picker's memos) refresh.
  const [version, rerender] = useReducer((x: number) => x + 1, 0);
  const avail = useRef<Cache<Record<string, number>>>(new Map());
  const slots = useRef<Cache<Slot[]>>(new Map());
  const pending = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const bump = () => {
    if (alive.current) rerender();
  };

  // ---- preview: local engine over the bundle
  const previewCtx = useCallback(
    (reasonId: string, providerId?: string): SlotContext | null => {
      const reason = bundle.reasons.find((r) => r.id === reasonId);
      if (!reason) return null;
      return {
        reason,
        providers: bundle.providers,
        operatories: [],
        clinicHours: bundle.clinic.hours,
        holidays: bundle.clinic.holidays,
        blockouts: [],
        appointments: [],
        holds: [],
        rules: flow.rules,
        now: nowInZone(bundle.clinic.timeZone),
        providerId,
      };
    },
    [bundle, flow.rules],
  );

  const loadAvailability = useCallback(
    (key: string, reasonId: string, providerId: string | undefined, from: Date, days: number) => {
      avail.current.set(key, "loading");
      pending.current++;
      publicApi
        .availability(slug, { reasonId, from: dayKey(from), days, providerId, sessionId })
        .then((m) => avail.current.set(key, m))
        .catch(() => avail.current.set(key, {}))
        .finally(() => {
          pending.current--;
          bump();
        });
    },
    [slug, sessionId],
  );

  const loadSlots = useCallback(
    (key: string, reasonId: string, providerId: string | undefined, day: Date) => {
      slots.current.set(key, "loading");
      pending.current++;
      publicApi
        .slots(slug, { reasonId, date: dayKey(day), providerId, sessionId })
        .then((list) => slots.current.set(key, list))
        .catch(() => slots.current.set(key, []))
        .finally(() => {
          pending.current--;
          bump();
        });
    },
    [slug, sessionId],
  );

  const oneAvailability = useCallback(
    (reasonId: string, providerId: string | undefined, from: Date, days: number): Record<string, number> | null => {
      if (!live) {
        const c = previewCtx(reasonId, providerId);
        return c ? availableDays(from, days, c) : {};
      }
      const key = `${reasonId}|${providerId ?? ""}|${dayKey(from)}|${days}`;
      const hit = avail.current.get(key);
      if (hit === undefined) loadAvailability(key, reasonId, providerId, from, days);
      return hit && hit !== "loading" ? hit : null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, previewCtx, loadAvailability, version],
  );

  const oneSlots = useCallback(
    (reasonId: string, providerId: string | undefined, day: Date): Slot[] | null => {
      if (!live) {
        const c = previewCtx(reasonId, providerId);
        if (!c) return [];
        const all = getSlotsForDay(startOfDay(day), c);
        return providerId ? all : firstAvailable(all);
      }
      const key = `${reasonId}|${providerId ?? ""}|${dayKey(day)}`;
      const hit = slots.current.get(key);
      if (hit === undefined) loadSlots(key, reasonId, providerId, day);
      return hit && hit !== "loading" ? hit : null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, previewCtx, loadSlots, version],
  );

  const availability = useCallback(
    (reasonId: string | undefined, providerId: string | undefined, from: Date, days: number) => {
      const ids = reasonId ? [reasonId] : reasonIds;
      const out: Record<string, number> = {};
      for (const rid of ids) {
        const m = oneAvailability(rid, providerId, from, days);
        if (!m) continue;
        for (const [k, v] of Object.entries(m)) out[k] = (out[k] ?? 0) + v;
      }
      return out;
    },
    [oneAvailability, reasonIds],
  );

  const slotsFor = useCallback(
    (reasonId: string | undefined, providerId: string | undefined, day: Date) => {
      if (reasonId) return oneSlots(reasonId, providerId, day) ?? [];
      // Date-first: union of every bookable reason, one time per start.
      const all: Slot[] = [];
      for (const rid of reasonIds) all.push(...(oneSlots(rid, providerId, day) ?? []));
      return firstAvailable(all.sort((a, b) => a.start.getTime() - b.start.getTime()));
    },
    [oneSlots, reasonIds],
  );

  const reset = useCallback(() => {
    avail.current = new Map();
    slots.current = new Map();
    bump();
  }, []);

  const loading = pending.current > 0;
  return useMemo(() => ({ availability, slotsFor, loading, reset }), [availability, slotsFor, loading, reset]);
}

export { addDays };
