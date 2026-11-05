import { prisma, withPlatform } from "../db";
import { audit } from "../audit";
import { hit, LIMITS } from "../rate-limit";
import { burnPasswordCheck, verifyPassword } from "./password";
import { decrypt } from "./crypto";
import { verifyTotp } from "./totp";
import { SESSION_MAX_AGE_SEC } from "./context";

export type LoginFailure = "invalid" | "2fa_required" | "2fa_invalid" | "locked" | "rate_limited";
export type LoginResult = { ok: true; sessionId: string; userId: string } | { ok: false; code: LoginFailure };

const LOCK_AFTER = 10;
const LOCK_MINUTES = 15;

/**
 * Email + password (+ TOTP when enabled). Rate limited per email and per IP, locks the account for 15 minutes
 * after 10 consecutive failures, and writes login successes and failures to the audit log.
 * Error codes never reveal whether the email exists.
 */
export async function attemptLogin(input: { email: string; password: string; code?: string; ip: string; userAgent: string }): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  const [perEmail, perIp] = await Promise.all([
    hit(`login:email:${email}`, LIMITS.loginPerEmail.limit, LIMITS.loginPerEmail.windowSec),
    hit(`login:ip:${input.ip}`, LIMITS.loginPerIp.limit, LIMITS.loginPerIp.windowSec),
  ]);
  if (!perEmail.ok || !perIp.ok) return { ok: false, code: "rate_limited" };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active || !user.passwordHash) {
    await burnPasswordCheck(input.password);
    return { ok: false, code: "invalid" };
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) return { ok: false, code: "locked" };

  const fail = async (code: LoginFailure, reason: string) => {
    const failed = user.failedLogins + 1;
    await withPlatform(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { failedLogins: failed, lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
      });
      await audit(tx, { id: user.id, name: user.name, role: (user.platformRole as never) ?? "front_desk", ip: input.ip }, { action: "Login failed", category: "login", target: email, details: reason });
    });
    return { ok: false as const, code: failed >= LOCK_AFTER ? ("locked" as const) : code };
  };

  if (!(await verifyPassword(user.passwordHash, input.password))) return fail("invalid", "Wrong password");

  if (user.twoFactor && user.totpSecretEnc) {
    if (!input.code) return { ok: false, code: "2fa_required" };
    if (!verifyTotp(decrypt(user.totpSecretEnc), input.code)) return fail("2fa_invalid", "Wrong 2FA code");
  }

  return withPlatform(async (tx) => {
    const session = await tx.authSession.create({
      data: { userId: user.id, ip: input.ip, userAgent: input.userAgent, expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SEC * 1000) },
    });
    await tx.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    const memberships = await tx.membership.findMany({ where: { userId: user.id }, select: { clinicId: true, role: true } });
    const role = user.platformRole ?? memberships[0]?.role ?? "front_desk";
    await audit(tx, { id: user.id, name: user.name, role: role as never, ip: input.ip }, {
      action: "Logged in",
      category: "login",
      target: user.platformRole ? "Super admin panel" : "Clinic panel",
      details: user.twoFactor ? "Password + 2FA" : "Password",
    });
    if (memberships.length) await tx.clinic.updateMany({ where: { id: { in: memberships.map((m) => m.clinicId) } }, data: { lastLoginAt: new Date() } });
    return { ok: true as const, sessionId: session.id, userId: user.id };
  });
}

export async function revokeSession(sessionId: string) {
  await prisma.authSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeAllSessions(userId: string) {
  await prisma.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
