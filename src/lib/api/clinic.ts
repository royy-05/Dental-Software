"use client";

/**
 * Clinic panel data hooks (TanStack Query over /api/clinics/:clinicId/...). Every hook is scoped to the clinic
 * selected in the top bar. Mutations go through `useApiMutation` (toasts + cache invalidation).
 */
import { useQuery } from "@tanstack/react-query";
import type {
  AdSpend,
  Appointment,
  ClinicFlow,
  ClinicInsurance,
  InsuranceCarrier,
  MessageLog,
  MessageTemplate,
  Operatory,
  OptOut,
  Provider,
  Reason,
  Referrer,
  StarterTemplate,
  Ticket,
  User,
} from "@/types";
import type { Slot } from "@/lib/slots";
import { fromWall } from "@/lib/time";
import { api } from "./client";
import { qk, useClinicId } from "./session";

export interface ClinicConfig {
  reasons: Reason[];
  providers: Provider[];
  operatories: Operatory[];
  referrers: Referrer[];
  insurances: ClinicInsurance[];
  flow: ClinicFlow;
  carriers: InsuranceCarrier[];
}

const EMPTY: ClinicConfig = { reasons: [], providers: [], operatories: [], referrers: [], insurances: [], carriers: [], flow: undefined as unknown as ClinicFlow };

/** Reasons, providers, operatories, referrers, insurances and the booking flow in one request. */
export function useClinicConfig(clinicIdOverride?: string) {
  const selected = useClinicId();
  const clinicId = clinicIdOverride ?? selected;
  const q = useQuery({ queryKey: qk.clinicRes(clinicId, "config"), queryFn: () => api<ClinicConfig>(`/api/clinics/${clinicId}/data`), enabled: !!clinicId, staleTime: 30_000 });
  return { ...q, clinicId, config: q.data ?? EMPTY };
}

export interface AppointmentWindow {
  from?: string; // YYYY-MM-DD
  to?: string;
  status?: Appointment["status"];
  providerId?: string;
}

/** Appointments in a date window (default: 60 days back to 90 days ahead), newest first. */
export function useAppointments(window: AppointmentWindow = {}, opts: { enabled?: boolean; refetchInterval?: number } = {}) {
  const clinicId = useClinicId();
  const qs = new URLSearchParams(Object.entries(window).filter(([, v]) => v) as [string, string][]).toString();
  return useQuery({
    queryKey: qk.clinicRes(clinicId, "appointments", window),
    queryFn: () => api<Appointment[]>(`/api/clinics/${clinicId}/appointments${qs ? `?${qs}` : ""}`),
    enabled: !!clinicId && opts.enabled !== false,
    refetchInterval: opts.refetchInterval,
    staleTime: 15_000,
  });
}

export function useAppointment(id: string | null) {
  const clinicId = useClinicId();
  return useQuery({ queryKey: qk.clinicRes(clinicId, "appointment", id), queryFn: () => api<Appointment>(`/api/clinics/${clinicId}/appointments/${id}`), enabled: !!clinicId && !!id, staleTime: 0 });
}

export interface SlotDto {
  start: string;
  end: string;
  providerId: string;
  operatoryId?: string;
}
export const toSlot = (s: SlotDto): Slot => ({ start: fromWall(s.start), end: fromWall(s.end), providerId: s.providerId, operatoryId: s.operatoryId });

/** Staff slot picker: slots for one day with staff override rules. */
export function useStaffSlots(p: { reasonId?: string; date: string; providerId?: string; ignoreAppointmentId?: string }) {
  const clinicId = useClinicId();
  const qs = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]).toString();
  return useQuery({ queryKey: qk.clinicRes(clinicId, "slots", p), queryFn: async () => (await api<SlotDto[]>(`/api/clinics/${clinicId}/slots?${qs}`)).map(toSlot), enabled: !!clinicId && !!p.reasonId && !!p.date, staleTime: 5_000 });
}

export function useTemplates() {
  const clinicId = useClinicId();
  return useQuery({ queryKey: qk.clinicRes(clinicId, "templates"), queryFn: () => api<MessageTemplate[]>(`/api/clinics/${clinicId}/templates`), enabled: !!clinicId });
}

export function useStarterTemplates() {
  const clinicId = useClinicId();
  return useQuery({ queryKey: qk.clinicRes(clinicId, "starters"), queryFn: () => api<StarterTemplate[]>(`/api/clinics/${clinicId}/flow/template`), enabled: !!clinicId, staleTime: 5 * 60_000 });
}

export type ClinicUser = User & { membershipId: string };
export function useClinicUsers() {
  const clinicId = useClinicId();
  return useQuery({ queryKey: qk.clinicRes(clinicId, "users"), queryFn: () => api<ClinicUser[]>(`/api/clinics/${clinicId}/users`), enabled: !!clinicId });
}

export function useTickets() {
  const clinicId = useClinicId();
  return useQuery({ queryKey: qk.clinicRes(clinicId, "tickets"), queryFn: () => api<Ticket[]>(`/api/clinics/${clinicId}/tickets`), enabled: !!clinicId });
}

export function useAdSpend() {
  const clinicId = useClinicId();
  return useQuery({ queryKey: qk.clinicRes(clinicId, "ad-spend"), queryFn: () => api<AdSpend[]>(`/api/clinics/${clinicId}/ad-spend`), enabled: !!clinicId });
}

export function useMessages(filter: { appointmentId?: string; channel?: "email" | "sms"; to?: string; limit?: number } = {}, opts: { refetchInterval?: number } = {}) {
  const clinicId = useClinicId();
  const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString();
  return useQuery({ queryKey: qk.clinicRes(clinicId, "messages", filter), queryFn: () => api<MessageLog[]>(`/api/clinics/${clinicId}/messages${qs ? `?${qs}` : ""}`, { background: true }), enabled: !!clinicId, refetchInterval: opts.refetchInterval, staleTime: 5_000 });
}

export function useOptOuts() {
  const clinicId = useClinicId();
  return useQuery({ queryKey: qk.clinicRes(clinicId, "opt-outs"), queryFn: () => api<OptOut[]>(`/api/clinics/${clinicId}/opt-outs`), enabled: !!clinicId });
}

// ---------- reports (SQL on the server) ----------

export interface DayRange {
  from: string;
  to: string;
}

export function useHomeReport(range: DayRange | undefined) {
  const clinicId = useClinicId();
  return useQuery({ queryKey: qk.clinicRes(clinicId, "report-home", range), queryFn: () => api<import("@/components/home/metrics").HomeMetrics>(`/api/clinics/${clinicId}/reports/home?from=${range!.from}&to=${range!.to}`), enabled: !!clinicId && !!range, staleTime: 30_000 });
}

export type PerformanceReport = Awaited<ReturnType<typeof import("@/server/services/reports").performanceReport>>;
export function usePerformanceReport(range: DayRange | undefined, enabled = true) {
  const clinicId = useClinicId();
  return useQuery({ queryKey: qk.clinicRes(clinicId, "report-performance", range), queryFn: () => api<PerformanceReport>(`/api/clinics/${clinicId}/reports/performance?from=${range!.from}&to=${range!.to}`), enabled: !!clinicId && !!range && enabled, staleTime: 30_000 });
}

export type FormAnalyticsReport = Awaited<ReturnType<typeof import("@/server/services/reports").formAnalyticsReport>>;
export function useFormAnalyticsReport(range: DayRange | undefined, source: string) {
  const clinicId = useClinicId();
  return useQuery({ queryKey: qk.clinicRes(clinicId, "report-form", range, source), queryFn: () => api<FormAnalyticsReport>(`/api/clinics/${clinicId}/reports/form-analytics?from=${range!.from}&to=${range!.to}&source=${source}`), enabled: !!clinicId && !!range, staleTime: 30_000 });
}

/** Path helper for mutations. */
export function clinicPath(clinicId: string | undefined, suffix: string) {
  return `/api/clinics/${clinicId}${suffix}`;
}
