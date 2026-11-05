"use client";

import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Clinic, FeatureKey, Plan, Role, User } from "@/types";
import { can, type Permission } from "@/lib/permissions";
import { useUi } from "@/store/ui";
import { api, errorMessage } from "./client";

// ---------- types returned by the API ----------

export interface MeClinic {
  id: string;
  name: string;
  slug: string;
  specialty: Clinic["specialty"];
  status: Clinic["status"];
  role: Role;
  permissions: Permission[];
}
export interface Me {
  user: User;
  platformRole: "super_admin" | "support_agent" | null;
  impersonation: { clinicId: string; reason: string; startedAt: string } | null;
  needsTwoFactorSetup: boolean;
  clinics: MeClinic[];
  platformPermissions: Permission[];
}
export interface ClinicBundle {
  clinic: Clinic;
  plan: Plan;
  features: Record<FeatureKey, boolean>;
}

// ---------- query keys ----------

export const qk = {
  me: ["me"] as const,
  clinic: (clinicId: string | undefined) => ["clinic", clinicId ?? "none"] as const,
  clinicRes: (clinicId: string | undefined, ...rest: unknown[]) => ["clinic", clinicId ?? "none", ...rest] as const,
  admin: (...rest: unknown[]) => ["admin", ...rest] as const,
};

// ---------- session ----------

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: () => api<Me>("/api/me"), staleTime: 60_000, retry: false });
}

export function useCurrentUser(): User | undefined {
  return useMe().data?.user;
}

/** The clinic selected in the top bar, falling back to the first clinic the user can open. */
export function useClinicId(): string | undefined {
  const me = useMe().data;
  const stored = useUi((s) => s.clinicId);
  const setClinicId = useUi((s) => s.setClinicId);
  const resolved = useMemo(() => {
    if (!me) return undefined;
    if (stored && me.clinics.some((c) => c.id === stored)) return stored;
    return me.clinics[0]?.id;
  }, [me, stored]);
  useEffect(() => {
    if (resolved && resolved !== stored) setClinicId(resolved);
  }, [resolved, stored, setClinicId]);
  return resolved;
}

export function useAccessibleClinics(): MeClinic[] {
  return useMe().data?.clinics ?? [];
}

/** Role used for permission checks: the clinic role in the selected clinic, otherwise the platform role. */
export function useEffectiveRole(): Role | undefined {
  const me = useMe().data;
  const clinicId = useClinicId();
  if (!me) return undefined;
  const clinicRole = me.clinics.find((c) => c.id === clinicId)?.role;
  if (me.impersonation) return clinicRole;
  return clinicRole ?? me.platformRole ?? undefined;
}

/** Role for super admin panel pages (ignores the selected clinic). */
export function usePlatformRole(): Role | undefined {
  const me = useMe().data;
  if (!me) return undefined;
  if (me.impersonation) return me.clinics[0]?.role;
  return me.platformRole ?? undefined;
}

export function useCan() {
  const role = useEffectiveRole();
  return (p: Permission) => can(role, p);
}

// ---------- current clinic ----------

export function useClinicBundle(clinicIdOverride?: string) {
  const selected = useClinicId();
  const clinicId = clinicIdOverride ?? selected;
  return useQuery({
    queryKey: qk.clinicRes(clinicId, "bundle"),
    queryFn: () => api<ClinicBundle>(`/api/clinics/${clinicId}`),
    enabled: !!clinicId,
    staleTime: 30_000,
  });
}

export function useCurrentClinic(): Clinic | undefined {
  return useClinicBundle().data?.clinic;
}

export function useFeature(key: FeatureKey): boolean {
  return useClinicBundle().data?.features[key] ?? false;
}

// ---------- mutations ----------

export interface MutationOpts<TVars, TResult> {
  /** Query key prefixes to refetch on success (default: the selected clinic). */
  invalidate?: QueryKey[];
  success?: string | false | ((r: TResult, v: TVars) => string | false);
  onSuccess?: (r: TResult, v: TVars) => void;
  /** Show error toast (default true) */
  errorToast?: boolean;
}

/** useMutation with toasts and cache invalidation. */
export function useApiMutation<TVars = void, TResult = unknown>(fn: (v: TVars) => Promise<TResult>, opts: MutationOpts<TVars, TResult> = {}) {
  const qc = useQueryClient();
  const clinicId = useClinicId();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r, v) => {
      const keys = opts.invalidate ?? [qk.clinic(clinicId)];
      await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
      const msg = typeof opts.success === "function" ? opts.success(r, v) : opts.success;
      if (msg) toast.success(msg);
      opts.onSuccess?.(r, v);
    },
    onError: (e) => {
      if (opts.errorToast !== false) toast.error(errorMessage(e));
    },
  });
}

/** Read-only global catalogue: plans (for plan names and limits). */
export function usePlans() {
  return useQuery({ queryKey: ["catalog", "plans"], queryFn: () => api<Plan[]>("/api/catalog/plans"), staleTime: 5 * 60_000 });
}
