"use client";

/** Super admin panel data hooks (TanStack Query over /api/admin/...). */
import { useQuery } from "@tanstack/react-query";
import type { Announcement, AuditEntry, Clinic, ClinicGroup, Coupon, FeatureKey, InsuranceCarrier, Invoice, LegalTemplate, MessageLog, MessageTemplate, OptOut, Plan, PlatformSettings, StarterTemplate, Ticket, User } from "@/types";
import type { AdminOverview } from "@/server/services/reports";
import { api } from "./client";
import { qk } from "./session";

export type AdminClinic = Clinic & { planName: string; owner: { id: string; name: string; email: string } | null; bookingsThisMonth: number };
export interface AdminClinicDetail {
  clinic: Clinic;
  plan: Plan;
  features: Record<FeatureKey, boolean>;
  users: (User & { role: string })[];
  counts: { appointments: number; providers: number; reasons: number; failedMessages: number; lastBookingAt: string | null };
}
export type AdminGroup = ClinicGroup & { users: { id: string; name: string; email: string }[] };
export type AdminAnalytics = Awaited<ReturnType<typeof import("@/server/services/reports").adminAnalytics>>;

const q = <T,>(key: unknown[], path: string, opts: { staleTime?: number; enabled?: boolean } = {}) => ({ queryKey: qk.admin(...key), queryFn: () => api<T>(path), staleTime: opts.staleTime ?? 15_000, enabled: opts.enabled });

export const useAdminOverview = () => useQuery(q<AdminOverview>(["overview"], "/api/admin/overview"));
export const useAdminClinics = () => useQuery(q<AdminClinic[]>(["clinics"], "/api/admin/clinics"));
export const useAdminClinic = (id: string | undefined) => useQuery(q<AdminClinicDetail>(["clinic", id], `/api/admin/clinics/${id}`, { enabled: !!id }));
export const useAdminGroups = () => useQuery(q<AdminGroup[]>(["groups"], "/api/admin/groups"));
export const useAdminPlans = () => useQuery(q<Plan[]>(["plans"], "/api/admin/plans", { staleTime: 60_000 }));
export const useAdminInvoices = () => useQuery(q<Invoice[]>(["invoices"], "/api/admin/invoices"));
export const useAdminCoupons = () => useQuery(q<Coupon[]>(["coupons"], "/api/admin/coupons"));
export const useAdminUsers = () => useQuery(q<User[]>(["users"], "/api/admin/users"));
export const useAdminCarriers = () => useQuery(q<InsuranceCarrier[]>(["carriers"], "/api/admin/libraries/carriers"));
export const useAdminTemplates = () => useQuery(q<MessageTemplate[]>(["templates"], "/api/admin/libraries/templates"));
export const useAdminStarters = () => useQuery(q<StarterTemplate[]>(["starters"], "/api/admin/libraries/starters"));
export const useAdminLegal = () => useQuery(q<LegalTemplate[]>(["legal"], "/api/admin/libraries/legal"));
export const useAdminTickets = () => useQuery(q<Ticket[]>(["tickets"], "/api/admin/tickets"));
export const useAdminAnnouncements = () => useQuery(q<Announcement[]>(["announcements"], "/api/admin/announcements"));
export const useAdminSettings = () => useQuery(q<PlatformSettings>(["settings"], "/api/admin/settings", { staleTime: 60_000 }));
export const useAdminOptOuts = () => useQuery(q<OptOut[]>(["opt-outs"], "/api/admin/opt-outs"));
export const useAdminAnalytics = (days: number) => useQuery(q<AdminAnalytics>(["analytics", days], `/api/admin/analytics?days=${days}`, { staleTime: 60_000 }));
export function useAdminMessages(filter: { clinicId?: string; channel?: string; status?: string; limit?: number } = {}) {
  const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v).map(([k, v]) => [k, String(v)])).toString();
  return useQuery(q<MessageLog[]>(["messages", filter], `/api/admin/messages${qs ? `?${qs}` : ""}`));
}
export function useAdminAudit(filter: { clinicId?: string; category?: string; q?: string; limit?: number } = {}) {
  const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v).map(([k, v]) => [k, String(v)])).toString();
  return useQuery(q<AuditEntry[]>(["audit", filter], `/api/admin/audit${qs ? `?${qs}` : ""}`));
}
