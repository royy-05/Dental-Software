import { describe, expect, it } from "vitest";
import { can, isPlatformRole, impersonationRole, PERMISSIONS, type Permission } from "./permissions";
import type { Role } from "@/types";

describe("Permissions Matrix (Section 2)", () => {
  it("super_admin has full access across platform and clinic permissions", () => {
    expect(can("super_admin", "admin:access")).toBe(true);
    expect(can("super_admin", "admin:billing")).toBe(true);
    expect(can("super_admin", "admin:clinics:delete")).toBe(true);
    expect(can("super_admin", "appointments:manage")).toBe(true);
    expect(can("super_admin", "settings:manage")).toBe(true);
    expect(isPlatformRole("super_admin")).toBe(true);
  });

  it("support_agent has restricted platform view and support access without billing or destructive actions", () => {
    expect(can("support_agent", "admin:access")).toBe(true);
    expect(can("support_agent", "admin:clinics:view")).toBe(true);
    expect(can("support_agent", "admin:support")).toBe(true);
    expect(can("support_agent", "admin:audit")).toBe(true);
    expect(can("support_agent", "admin:impersonate")).toBe(true);

    // Forbidden permissions
    expect(can("support_agent", "admin:billing")).toBe(false);
    expect(can("support_agent", "admin:plans:edit")).toBe(false);
    expect(can("support_agent", "admin:clinics:delete")).toBe(false);
    expect(can("support_agent", "admin:system:edit")).toBe(false);
    expect(isPlatformRole("support_agent")).toBe(true);
  });

  it("clinic_owner has all clinic panel permissions", () => {
    expect(can("clinic_owner", "clinic:home")).toBe(true);
    expect(can("clinic_owner", "appointments:view")).toBe(true);
    expect(can("clinic_owner", "appointments:manage")).toBe(true);
    expect(can("clinic_owner", "reasons:manage")).toBe(true);
    expect(can("clinic_owner", "providers:manage")).toBe(true);
    expect(can("clinic_owner", "schedule:manage")).toBe(true);
    expect(can("clinic_owner", "insurances:manage")).toBe(true);
    expect(can("clinic_owner", "templates:manage")).toBe(true);
    expect(can("clinic_owner", "reports:view")).toBe(true);
    expect(can("clinic_owner", "settings:manage")).toBe(true);
    expect(can("clinic_owner", "users:manage")).toBe(true);
    expect(can("clinic_owner", "users:remove_owner")).toBe(true);
    expect(can("clinic_owner", "billing:view")).toBe(true);
    expect(isPlatformRole("clinic_owner")).toBe(false);
  });

  it("clinic_manager has all clinic permissions except billing:view and users:remove_owner", () => {
    expect(can("clinic_manager", "clinic:home")).toBe(true);
    expect(can("clinic_manager", "appointments:view")).toBe(true);
    expect(can("clinic_manager", "appointments:manage")).toBe(true);
    expect(can("clinic_manager", "providers:manage")).toBe(true);
    expect(can("clinic_manager", "reasons:manage")).toBe(true);
    expect(can("clinic_manager", "settings:manage")).toBe(true);

    // Forbidden permissions
    expect(can("clinic_manager", "billing:view")).toBe(false);
    expect(can("clinic_manager", "users:remove_owner")).toBe(false);
    expect(isPlatformRole("clinic_manager")).toBe(false);
  });

  it("front_desk is restricted to home, appointments, patients, and support", () => {
    expect(can("front_desk", "clinic:home")).toBe(true);
    expect(can("front_desk", "appointments:view")).toBe(true);
    expect(can("front_desk", "appointments:manage")).toBe(true);
    expect(can("front_desk", "patients:view")).toBe(true);
    expect(can("front_desk", "support:raise")).toBe(true);

    // Forbidden management permissions
    expect(can("front_desk", "reasons:manage")).toBe(false);
    expect(can("front_desk", "providers:manage")).toBe(false);
    expect(can("front_desk", "schedule:manage")).toBe(false);
    expect(can("front_desk", "insurances:manage")).toBe(false);
    expect(can("front_desk", "templates:manage")).toBe(false);
    expect(can("front_desk", "reports:view")).toBe(false);
    expect(can("front_desk", "settings:manage")).toBe(false);
    expect(can("front_desk", "users:manage")).toBe(false);
    expect(can("front_desk", "billing:view")).toBe(false);
  });

  it("determines correct impersonation roles for platform roles", () => {
    expect(impersonationRole("super_admin")).toBe("clinic_owner");
    expect(impersonationRole("support_agent")).toBe("clinic_manager");
  });

  it("verifies permissions for all defined role lists", () => {
    const roles: Role[] = ["super_admin", "support_agent", "clinic_owner", "clinic_manager", "front_desk"];
    for (const r of roles) {
      expect(Array.isArray(PERMISSIONS[r])).toBe(true);
      expect(PERMISSIONS[r].length).toBeGreaterThan(0);
    }
    // undefined or null role returns false
    expect(can(undefined, "clinic:home")).toBe(false);
    expect(can(null, "clinic:home")).toBe(false);
  });
});
