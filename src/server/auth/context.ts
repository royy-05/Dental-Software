import type { Role } from "@/types";
import { can, impersonationRole, type Permission } from "@/lib/permissions";
import { prisma, withPlatform } from "../db";
import type { Actor } from "../audit";

import { IDLE_TIMEOUT_MS, SESSION_MAX_AGE_SEC } from "./session-constants";

/** Idle timeout (section 8): a session unused for 30 minutes is revoked. */
export { IDLE_TIMEOUT_MS, SESSION_MAX_AGE_SEC };

export interface AuthContext {
  sessionId: string;
  userId: string;
  name: string;
  email: string;
  platformRole: "super_admin" | "support_agent" | null;
  memberships: { clinicId: string; role: Role }[];
  impersonation: { clinicId: string; reason: string; startedAt: string } | null;
  twoFactor: boolean;
  /** Platform users with forceTwoFactor must enrol before using anything else. */
  needsTwoFactorSetup: boolean;
  ip: string;
}

export function actorOf(ctx: AuthContext): Actor {
  return { id: ctx.userId, name: ctx.name, role: ctx.platformRole ?? primaryClinicRole(ctx), ip: ctx.ip };
}

function primaryClinicRole(ctx: AuthContext): Role {
  const rank: Record<string, number> = { clinic_owner: 3, clinic_manager: 2, front_desk: 1 };
  return [...ctx.memberships].sort((a, b) => (rank[b.role] ?? 0) - (rank[a.role] ?? 0))[0]?.role ?? "front_desk";
}

/**
 * The role the user acts as inside one clinic, or null when they have no access.
 * - Impersonating: only the impersonated clinic, as Clinic Owner (super admin) or Clinic Manager (support agent).
 * - Super Admin: every clinic, full access.
 * - Support Agent: no direct clinic access (must impersonate, which is audited).
 * - Clinic users: their membership role.
 */
export function clinicRole(ctx: AuthContext, clinicId: string): Role | null {
  if (ctx.impersonation) {
    return ctx.impersonation.clinicId === clinicId && ctx.platformRole ? impersonationRole(ctx.platformRole) : null;
  }
  if (ctx.platformRole === "super_admin") return "super_admin";
  if (ctx.platformRole === "support_agent") return null;
  return ctx.memberships.find((m) => m.clinicId === clinicId)?.role ?? null;
}

export function platformCan(ctx: AuthContext, perm: Permission): boolean {
  return !!ctx.platformRole && can(ctx.platformRole, perm);
}

/**
 * Load and validate the server-side session behind an Auth.js JWT: not revoked, not past its absolute expiry,
 * used within the idle timeout, user still active. Touches last_seen_at unless the request is a background poll.
 */
export async function loadSession(sessionId: string, opts: { ip: string; touch: boolean }): Promise<AuthContext | null> {
  const s = await prisma.authSession.findUnique({ where: { id: sessionId }, include: { user: true } });
  if (!s || s.revokedAt) return null;
  const now = Date.now();
  if (s.expiresAt.getTime() <= now || now - s.lastSeenAt.getTime() > IDLE_TIMEOUT_MS || !s.user.active) {
    await prisma.authSession.update({ where: { id: s.id }, data: { revokedAt: new Date() } });
    return null;
  }
  if (opts.touch && now - s.lastSeenAt.getTime() > 30_000) {
    await prisma.authSession.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } });
  }
  const memberships = await withPlatform((tx) => tx.membership.findMany({ where: { userId: s.userId, clinic: { deletedAt: null } }, select: { clinicId: true, role: true } }));
  const platformRole = (s.user.platformRole as AuthContext["platformRole"]) ?? null;
  return {
    sessionId: s.id,
    userId: s.userId,
    name: s.user.name,
    email: s.user.email,
    platformRole,
    memberships: memberships.map((m) => ({ clinicId: m.clinicId, role: m.role as Role })),
    impersonation:
      s.impersonationClinic && platformRole
        ? { clinicId: s.impersonationClinic, reason: s.impersonationReason ?? "", startedAt: (s.impersonationAt ?? s.createdAt).toISOString() }
        : null,
    twoFactor: s.user.twoFactor,
    needsTwoFactorSetup: s.user.forceTwoFactor && !s.user.twoFactor,
    ip: opts.ip,
  };
}
