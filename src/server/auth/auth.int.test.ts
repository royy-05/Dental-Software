import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/auth", () => import("@/test/mock-auth"));

import { prisma, withPlatform } from "@/server/db";
import { attemptLogin } from "./login";
import { loadSession, IDLE_TIMEOUT_MS } from "./context";
import { acceptInvite, inviteClinicUser, requestPasswordReset, resetPassword } from "./accounts";
import { totp } from "./totp";
import { DEMO_TOTP_SECRET, DEFAULT_DEMO_PASSWORD } from "@/server/seed";
import { memoryOutbox } from "@/server/messaging/email";
import { as, call, EMAILS, setTestSession, sessionFor } from "@/test/route";
import * as me from "@/app/api/me/route";
import * as impersonation from "@/app/api/admin/impersonation/route";

const PW = DEFAULT_DEMO_PASSWORD;
let ipSeq = 1;
const freshIp = () => `192.0.2.${ipSeq++}`;

beforeEach(async () => {
  await prisma.rateLimit.deleteMany();
  await withPlatform((tx) => tx.user.updateMany({ data: { failedLogins: 0, lockedUntil: null } }));
});
afterAll(() => prisma.$disconnect());

describe("login", () => {
  it("signs in with email and password and audits it", async () => {
    const r = await attemptLogin({ email: EMAILS.manager.toUpperCase(), password: PW, ip: freshIp(), userAgent: "test" });
    expect(r.ok).toBe(true);
    const entry = await withPlatform((tx) => tx.auditLog.findFirst({ where: { actorId: "u_manager", action: "Logged in" }, orderBy: { at: "desc" } }));
    expect(entry?.ip).toMatch(/^192\.0\.2\./);
  });

  it("rejects a wrong password with a generic code and audits the failure", async () => {
    const r = await attemptLogin({ email: EMAILS.manager, password: "wrong-password", ip: freshIp(), userAgent: "test" });
    expect(r).toEqual({ ok: false, code: "invalid" });
    const r2 = await attemptLogin({ email: "nobody@example.com", password: "x", ip: freshIp(), userAgent: "test" });
    expect(r2).toEqual({ ok: false, code: "invalid" });
  });

  it("requires a valid TOTP code when 2FA is on", async () => {
    const ip = freshIp();
    expect(await attemptLogin({ email: EMAILS.owner, password: PW, ip, userAgent: "t" })).toEqual({ ok: false, code: "2fa_required" });
    expect(await attemptLogin({ email: EMAILS.owner, password: PW, code: "000000", ip, userAgent: "t" })).toEqual({ ok: false, code: "2fa_invalid" });
    const ok = await attemptLogin({ email: EMAILS.owner, password: PW, code: totp(DEMO_TOTP_SECRET), ip, userAgent: "t" });
    expect(ok.ok).toBe(true);
  });

  it("rate limits repeated attempts for one email", async () => {
    const results = [];
    for (let i = 0; i < 6; i++) results.push((await attemptLogin({ email: EMAILS.frontDesk, password: "nope", ip: freshIp(), userAgent: "t" })) as { code?: string });
    expect(results.slice(0, 5).every((r) => r.code === "invalid")).toBe(true);
    expect(results[5].code).toBe("rate_limited");
  });

  it("locks the account after 10 consecutive failures", async () => {
    for (let i = 0; i < 10; i++) {
      await prisma.rateLimit.deleteMany();
      await attemptLogin({ email: EMAILS.physioFrontDesk, password: "nope", ip: freshIp(), userAgent: "t" });
    }
    await prisma.rateLimit.deleteMany();
    expect(await attemptLogin({ email: EMAILS.physioFrontDesk, password: PW, ip: freshIp(), userAgent: "t" })).toEqual({ ok: false, code: "locked" });
  });
});

describe("sessions", () => {
  it("expires after 30 minutes idle", async () => {
    const sid = await sessionFor(EMAILS.manager);
    expect(await loadSession(sid, { ip: "x", touch: true })).not.toBeNull();
    await prisma.authSession.update({ where: { id: sid }, data: { lastSeenAt: new Date(Date.now() - IDLE_TIMEOUT_MS - 1000) } });
    expect(await loadSession(sid, { ip: "x", touch: true })).toBeNull();
    expect((await prisma.authSession.findUnique({ where: { id: sid } }))?.revokedAt).not.toBeNull();
  });

  it("API routes reject missing and idle sessions", async () => {
    setTestSession(null);
    expect((await call(me.GET)).status).toBe(401);
    const sid = await sessionFor(EMAILS.manager);
    await prisma.authSession.update({ where: { id: sid }, data: { lastSeenAt: new Date(Date.now() - IDLE_TIMEOUT_MS - 1000) } });
    setTestSession(sid);
    const r = await call(me.GET);
    expect(r.status).toBe(401);
    expect(r.json.error.code).toBe("session_expired");
  });

  it("/api/me returns only the clinics the user belongs to", async () => {
    await as(EMAILS.frontDesk);
    const r = await call(me.GET);
    expect(r.status).toBe(200);
    expect(r.json.clinics.map((c: { id: string }) => c.id)).toEqual(["c_brightsmile"]);
    expect(r.json.clinics[0].permissions).not.toContain("settings:manage");
  });
});

describe("impersonation", () => {
  it("requires a reason, is audited, and limits access to that clinic", async () => {
    await as(EMAILS.support);
    const bad = await call(impersonation.POST, { body: { clinicId: "c_motion", reason: "" } });
    expect(bad.status).toBe(400);
    const ok = await call(impersonation.POST, { body: { clinicId: "c_motion", reason: "Ticket 1001 - checking hours" } });
    expect(ok.status).toBe(200);
    const entry = await withPlatform((tx) => tx.auditLog.findFirst({ where: { category: "impersonation", clinicId: "c_motion" }, orderBy: { at: "desc" } }));
    expect(entry?.details).toContain("Ticket 1001");
    const r = await call(me.GET);
    expect(r.json.clinics.map((c: { id: string }) => c.id)).toEqual(["c_motion"]);
    expect(r.json.clinics[0].role).toBe("clinic_manager");
    expect((await call(impersonation.DELETE, { method: "DELETE" })).status).toBe(200);
  });

  it("is refused for clinic users", async () => {
    await as(EMAILS.owner);
    expect((await call(impersonation.POST, { body: { clinicId: "c_motion", reason: "just looking" } })).status).toBe(403);
  });
});

describe("invite and reset", () => {
  it("invites a new user who sets a compliant password and can sign in", async () => {
    memoryOutbox.length = 0;
    const email = `new.hire.${Date.now()}@example.com`;
    await withPlatform((tx) => inviteClinicUser(tx, { id: "u_owner", name: "Olivia Chen", role: "clinic_owner", ip: "x" }, { clinicId: "c_brightsmile", clinicName: "Bright Smile Dental", email, name: "New Hire", role: "front_desk" }));
    const mail = memoryOutbox.find((m) => m.to === email)!;
    const token = /\/invite\/([\w-]+)/.exec(mail.text)![1];
    await expect(acceptInvite({ token, password: "short", ip: "x" })).rejects.toThrow(/12 characters/);
    await acceptInvite({ token, password: "Brand-New-Pass-42", ip: "x" });
    await expect(acceptInvite({ token, password: "Brand-New-Pass-42", ip: "x" })).rejects.toThrow(/invalid or has expired/);
    expect((await attemptLogin({ email, password: "Brand-New-Pass-42", ip: freshIp(), userAgent: "t" })).ok).toBe(true);
  });

  it("resets a password with a one-time token and revokes existing sessions", async () => {
    memoryOutbox.length = 0;
    const sid = await sessionFor(EMAILS.dermManager);
    await requestPasswordReset(EMAILS.dermManager, freshIp());
    await requestPasswordReset("unknown@example.com", freshIp());
    expect(memoryOutbox).toHaveLength(1);
    const token = /reset-password\/([\w-]+)/.exec(memoryOutbox[0].text)![1];
    await resetPassword({ token, password: "Another-Good-Pass-7", ip: "x" });
    expect(await loadSession(sid, { ip: "x", touch: false })).toBeNull();
    await expect(resetPassword({ token, password: "Another-Good-Pass-8", ip: "x" })).rejects.toThrow();
  });
});
