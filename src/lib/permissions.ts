import type { Clinic, FeatureKey, Plan, Role } from "@/types";

/**
 * Permission matrix (section 2). Each permission is a "module:action" string.
 * `can(role, perm)` is the single source of truth used by nav, routes and buttons.
 */
export type Permission =
  // clinic panel
  | "clinic:home"
  | "appointments:view"
  | "appointments:manage" // confirm, reschedule, cancel, decline, complete, no-show, resend, manual booking
  | "appointments:export"
  | "patients:view"
  | "reasons:manage"
  | "providers:manage"
  | "schedule:manage"
  | "insurances:manage"
  | "templates:manage"
  | "reports:view" // form analytics + performance
  | "settings:manage"
  | "users:manage"
  | "users:remove_owner"
  | "billing:view"
  | "support:raise"
  // super admin panel
  | "admin:access"
  | "admin:clinics:view"
  | "admin:clinics:edit"
  | "admin:clinics:delete"
  | "admin:impersonate"
  | "admin:groups:edit"
  | "admin:billing"
  | "admin:plans:edit"
  | "admin:features:edit"
  | "admin:users:view"
  | "admin:users:edit"
  | "admin:libraries:edit"
  | "admin:messaging:view"
  | "admin:messaging:edit"
  | "admin:integrations:edit"
  | "admin:support"
  | "admin:analytics"
  | "admin:audit"
  | "admin:system:edit"
  | "admin:seed";

const CLINIC_ALL: Permission[] = [
  "clinic:home",
  "appointments:view",
  "appointments:manage",
  "appointments:export",
  "patients:view",
  "reasons:manage",
  "providers:manage",
  "schedule:manage",
  "insurances:manage",
  "templates:manage",
  "reports:view",
  "settings:manage",
  "users:manage",
  "users:remove_owner",
  "billing:view",
  "support:raise",
];

const ADMIN_ALL: Permission[] = [
  "admin:access",
  "admin:clinics:view",
  "admin:clinics:edit",
  "admin:clinics:delete",
  "admin:impersonate",
  "admin:groups:edit",
  "admin:billing",
  "admin:plans:edit",
  "admin:features:edit",
  "admin:users:view",
  "admin:users:edit",
  "admin:libraries:edit",
  "admin:messaging:view",
  "admin:messaging:edit",
  "admin:integrations:edit",
  "admin:support",
  "admin:analytics",
  "admin:audit",
  "admin:system:edit",
  "admin:seed",
];

export const PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: [...ADMIN_ALL, ...CLINIC_ALL],
  // View clinics, tickets, logs; impersonate with reason. No billing, no plan/feature changes, no deletes.
  support_agent: [
    "admin:access",
    "admin:clinics:view",
    "admin:impersonate",
    "admin:users:view",
    "admin:messaging:view",
    "admin:support",
    "admin:analytics",
    "admin:audit",
    "admin:seed",
  ],
  clinic_owner: CLINIC_ALL,
  // No billing, cannot remove the owner.
  clinic_manager: CLINIC_ALL.filter((p) => p !== "billing:view" && p !== "users:remove_owner"),
  // Appointments (view, confirm, reschedule, cancel), patient details. No settings, templates or reports.
  front_desk: ["clinic:home", "appointments:view", "appointments:manage", "patients:view", "support:raise"],
};

export function can(role: Role | undefined | null, perm: Permission): boolean {
  if (!role) return false;
  return PERMISSIONS[role].includes(perm);
}

export function isPlatformRole(role: Role): boolean {
  return role === "super_admin" || role === "support_agent";
}

/** Role a platform user acts as while impersonating a clinic. Support agents get no billing. */
export function impersonationRole(role: Role): Role {
  return role === "super_admin" ? "clinic_owner" : "clinic_manager";
}

/** Feature flag resolution (6.5): per-clinic override wins, else the plan's module list. */
export function featureEnabled(clinic: Clinic | undefined, plans: Plan[], key: FeatureKey): boolean {
  if (!clinic) return false;
  const override = clinic.featureOverrides[key];
  if (override !== undefined) return override;
  const plan = plans.find((p) => p.id === clinic.planId);
  return plan ? plan.limits.modules.includes(key) : false;
}
