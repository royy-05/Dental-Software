import type { Role } from "@/types";
import { prisma, withPlatform, type Tx } from "../db";
import { audit, type Actor } from "../audit";
import { badRequest, conflict, forbidden } from "../errors";
import { emailAdapter, escapeHtml } from "../messaging/email";
import { enforce, LIMITS } from "../rate-limit";
import { checkPasswordStrength, hashPassword, verifyPassword } from "./password";
import { decrypt, encrypt, randomToken, sha256 } from "./crypto";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "./totp";
import { revokeAllSessions } from "./login";

const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const baseUrl = () => process.env.APP_BASE_URL ?? "http://localhost:3000";

async function issueToken(tx: Tx, userId: string, type: "invite" | "reset", ttlMs: number): Promise<string> {
  const token = randomToken();
  await tx.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
  await tx.authToken.create({ data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) } });
  return token;
}

async function consumeToken(token: string, type: "invite" | "reset") {
  const row = await prisma.authToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt.getTime() < Date.now()) throw badRequest("This link is invalid or has expired.");
  return row;
}

async function sendAccountEmail(to: string, subject: string, lines: string[], link: string) {
  const text = `${lines.join("\n\n")}\n\n${link}\n\nIf you did not expect this email you can ignore it.`;
  const html = `${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}<p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p><p>If you did not expect this email you can ignore it.</p>`;
  await emailAdapter().send({ to, subject, text, html });
}

/**
 * Invite a staff member to a clinic (5.10 Users). Creates the user if the email is new, adds the membership,
 * and emails a one-time link (7 days) to set a password. Existing users are just added to the clinic.
 */
export async function inviteClinicUser(tx: Tx, actor: Actor, input: { clinicId: string; clinicName: string; email: string; name: string; role: Role }) {
  const email = input.email.trim().toLowerCase();
  let user = await tx.user.findUnique({ where: { email }, include: { memberships: true } });
  if (user?.platformRole) throw conflict("That email belongs to a platform user.");
  if (user?.memberships.some((m) => m.clinicId === input.clinicId)) throw conflict("That person already has access to this clinic.");
  let token: string | null = null;
  if (!user) {
    user = await tx.user.create({ data: { email, name: input.name, invitedAt: new Date() }, include: { memberships: true } });
    token = await issueToken(tx, user.id, "invite", INVITE_TTL_MS);
  }
  await tx.membership.create({ data: { clinicId: input.clinicId, userId: user.id, role: input.role } });
  await audit(tx, actor, { action: `Invited user as ${input.role}`, category: "user", target: email, clinicId: input.clinicId });
  const link = token ? `${baseUrl()}/invite/${token}` : `${baseUrl()}/login`;
  await sendAccountEmail(
    email,
    `You're invited to ${input.clinicName} on Kivi Health`,
    token ? [`${actor.name} invited you to join ${input.clinicName}.`, "Use this link within 7 days to set your password:"] : [`${actor.name} added you to ${input.clinicName}.`, "Sign in to switch to it from the clinic selector:"],
    link,
  );
  return { userId: user.id, invited: !!token };
}

/** Invite a platform user (6.6: Super Admin / Support Agent). They must set up 2FA at first sign-in. */
export async function invitePlatformUser(tx: Tx, actor: Actor, input: { email: string; name: string; role: "super_admin" | "support_agent" }) {
  const email = input.email.trim().toLowerCase();
  if (await tx.user.findUnique({ where: { email } })) throw conflict("A user with that email already exists.");
  const user = await tx.user.create({ data: { email, name: input.name, platformRole: input.role, invitedAt: new Date(), forceTwoFactor: true } });
  const token = await issueToken(tx, user.id, "invite", INVITE_TTL_MS);
  await audit(tx, actor, { action: `Invited platform user as ${input.role}`, category: "user", target: email });
  await sendAccountEmail(email, "You're invited to the Kivi Health admin panel", [`${actor.name} invited you to the Kivi Health admin panel.`, "Set your password within 7 days:"], `${baseUrl()}/invite/${token}`);
  return { userId: user.id };
}

export async function describeInvite(token: string) {
  const row = await consumeToken(token, "invite");
  return { email: row.user.email, name: row.user.name };
}

export async function acceptInvite(input: { token: string; password: string; name?: string; ip: string }) {
  const row = await consumeToken(input.token, "invite");
  const problem = checkPasswordStrength(input.password, row.user.email);
  if (problem) throw badRequest(problem);
  const passwordHash = await hashPassword(input.password);
  await withPlatform(async (tx) => {
    await tx.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash, passwordChangedAt: new Date(), name: input.name?.trim() || row.user.name } });
    await audit(tx, { id: row.userId, name: row.user.name, role: (row.user.platformRole as Role) ?? "front_desk", ip: input.ip }, { action: "Accepted invite and set password", category: "user", target: row.user.email });
  });
}

/** Always succeeds from the caller's point of view (no account enumeration). */
export async function requestPasswordReset(email: string, ip: string, opts: { actor?: Actor } = {}) {
  if (!opts.actor) await enforce(`reset:ip:${ip}`, LIMITS.passwordResetPerIp.limit, LIMITS.passwordResetPerIp.windowSec);
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !user.active) return;
  const token = await withPlatform(async (tx) => {
    const t = await issueToken(tx, user.id, "reset", RESET_TTL_MS);
    if (opts.actor) await audit(tx, opts.actor, { action: "Sent password reset", category: "user", target: user.email });
    return t;
  });
  await sendAccountEmail(user.email, "Reset your Kivi Health password", ["We received a request to reset your password.", "This link works once, for 1 hour:"], `${baseUrl()}/reset-password/${token}`);
}

export async function resetPassword(input: { token: string; password: string; ip: string }) {
  const row = await consumeToken(input.token, "reset");
  const problem = checkPasswordStrength(input.password, row.user.email);
  if (problem) throw badRequest(problem);
  const passwordHash = await hashPassword(input.password);
  await withPlatform(async (tx) => {
    await tx.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash, passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null } });
    await audit(tx, { id: row.userId, name: row.user.name, role: (row.user.platformRole as Role) ?? "front_desk", ip: input.ip }, { action: "Reset password", category: "user", target: row.user.email });
  });
  await revokeAllSessions(row.userId);
}

export async function changePassword(userId: string, current: string, next: string, actor: Actor) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, current))) throw badRequest("Current password is wrong.");
  const problem = checkPasswordStrength(next, user.email);
  if (problem) throw badRequest(problem);
  const passwordHash = await hashPassword(next);
  await withPlatform(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: new Date() } });
    await audit(tx, actor, { action: "Changed password", category: "user", target: user.email });
  });
}

// ---------- TOTP 2FA ----------

/** Starts enrolment: stores a new encrypted secret (inactive until confirmed) and returns it for the authenticator app. */
export async function startTotpSetup(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.twoFactor) throw conflict("Two-factor authentication is already on.");
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: userId }, data: { totpSecretEnc: encrypt(secret) } });
  return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
}

export async function confirmTotpSetup(userId: string, code: string, actor: Actor) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.totpSecretEnc) throw badRequest("Start setup first.");
  if (!verifyTotp(decrypt(user.totpSecretEnc), code)) throw badRequest("That code is not right. Check the time on your phone and try again.");
  await withPlatform(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { twoFactor: true } });
    await audit(tx, actor, { action: "Turned on 2FA", category: "user", target: user.email });
  });
}

export async function disableTotp(userId: string, password: string, code: string, actor: Actor) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.forceTwoFactor) throw forbidden("Two-factor authentication is required for your account.");
  if (!(await verifyPassword(user.passwordHash, password))) throw badRequest("Password is wrong.");
  if (!user.totpSecretEnc || !verifyTotp(decrypt(user.totpSecretEnc), code)) throw badRequest("That code is not right.");
  await withPlatform(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { twoFactor: false, totpSecretEnc: null } });
    await audit(tx, actor, { action: "Turned off 2FA", category: "user", target: user.email });
  });
}
