"use client";

/** Patient-facing data hooks (public, no login): booking bundle by slug, availability, slots, holds, bookings, manage links. */
import { useQuery } from "@tanstack/react-query";
import type { PublicBundle } from "@/server/services/public";
import type { Slot } from "@/lib/slots";
import { fromWall } from "@/lib/time";
import { api } from "./client";
import type { SlotDto } from "./clinic";

export type { PublicBundle };
export const toSlot = (s: SlotDto): Slot => ({ start: fromWall(s.start), end: fromWall(s.end), providerId: s.providerId, operatoryId: s.operatoryId });

export function usePublicClinic(slug: string | undefined) {
  return useQuery({ queryKey: ["public", "clinic", slug], queryFn: () => api<PublicBundle>(`/api/public/clinics/${slug}`), enabled: !!slug, staleTime: 60_000, retry: false });
}

export const publicApi = {
  availability: (slug: string, p: { reasonId: string; from: string; days?: number; providerId?: string; sessionId?: string }) =>
    api<Record<string, number>>(`/api/public/clinics/${slug}/availability?${new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))}`),
  slots: async (slug: string, p: { reasonId: string; date: string; providerId?: string; sessionId?: string }) =>
    (await api<SlotDto[]>(`/api/public/clinics/${slug}/slots?${new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined) as [string, string][])}`)).map(toSlot),
  hold: (slug: string, body: { reasonId: string; start: string; providerId: string; sessionId: string }) => api<{ id: string; expiresAt: number; slot: SlotDto }>(`/api/public/clinics/${slug}/holds`, { body }),
  releaseHold: (slug: string, body: { holdId: string; sessionId: string }) => api(`/api/public/clinics/${slug}/holds`, { method: "DELETE", body }),
  book: (slug: string, body: unknown) => api<{ id: string; token: string; start: string; end: string; providerId: string; reasonId: string; status: string }>(`/api/public/clinics/${slug}/bookings`, { body }),
  events: (slug: string, body: { sessionId: string; events: unknown[] }) => api(`/api/public/clinics/${slug}/events`, { body }),
  manage: (token: string) => api<ManageView>(`/api/public/manage/${token}`),
  manageAvailability: (token: string, p: { from: string; days?: number; providerId?: string }) => api<Record<string, number>>(`/api/public/manage/${token}/availability?${new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))}`),
  manageSlots: async (token: string, p: { date: string; providerId?: string }) => (await api<SlotDto[]>(`/api/public/manage/${token}/slots?${new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined) as [string, string][])}`)).map(toSlot),
  reschedule: (token: string, body: { start: string; providerId: string }) => api<{ ok: true; token: string; start: string; end: string; providerId: string; status: string }>(`/api/public/manage/${token}/reschedule`, { body }),
  cancel: (token: string, body: { note?: string }) => api<{ ok: true; status: string }>(`/api/public/manage/${token}/cancel`, { body }),
};

export interface ManageView {
  clinic: PublicBundle["clinic"];
  platform: PublicBundle["platform"];
  referrers: PublicBundle["referrers"];
  appointment: import("@/types").Appointment;
  reason: import("@/types").Reason | null;
  provider: import("@/types").Provider | null;
  rules: { cancellationWindowHours: number; bookingWindowDays: number };
}

export function useManageView(token: string | undefined) {
  return useQuery({ queryKey: ["public", "manage", token], queryFn: () => publicApi.manage(token!), enabled: !!token, retry: false, staleTime: 0 });
}
