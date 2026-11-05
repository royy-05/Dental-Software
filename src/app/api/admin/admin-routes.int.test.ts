import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/auth", () => import("@/test/mock-auth"));

import { prisma, withPlatform } from "@/server/db";
import { memoryOutbox } from "@/server/messaging/email";
import { as, call, EMAILS } from "@/test/route";
import * as overview from "./overview/route";
import * as clinics from "./clinics/route";
import * as clinic from "./clinics/[id]/route";
import * as del from "./clinics/[id]/delete/route";
import * as restore from "./clinics/[id]/restore/route";
import * as clone from "./clinics/[id]/clone/route";
import * as plans from "./plans/[id]/route";
import * as users from "./users/route";
import * as user from "./users/[id]/route";
import * as audit from "./audit/route";
import * as settings from "./settings/route";
import * as tickets from "./tickets/route";
import * as ticket from "./tickets/[id]/messages/route";
import * as carriers from "./libraries/carriers/route";
import * as carrier from "./libraries/carriers/[id]/route";
import * as announcements from "./announcements/route";
import * as me from "@/app/api/me/route";
import * as clinicData from "@/app/api/clinics/[clinicId]/data/route";

beforeAll(async () => {
  await prisma.rateLimit.deleteMany();
});
afterAll(() => prisma.$disconnect());

describe("super admin panel", () => {
  it("support agents can read but not change plans, features, clinics or users", async () => {
    await as(EMAILS.support);
    expect((await call(overview.GET)).status).toBe(200);
    expect((await call(clinics.GET)).status).toBe(200);
    expect((await call(audit.GET)).status).toBe(200);
    expect((await call(plans.PATCH, { method: "PATCH", params: { id: "plan_pro" }, body: { priceMonthly: 1 } })).status).toBe(403);
    expect((await call(clinic.PATCH, { method: "PATCH", params: { id: "c_motion" }, body: { status: "paused" } })).status).toBe(403);
    expect((await call(del.POST, { params: { id: "c_motion" } })).status).toBe(403);
    expect((await call(users.POST, { body: { name: "X", email: "x@example.com", role: "support_agent" } })).status).toBe(403);
    expect((await call(settings.PATCH, { method: "PATCH", body: { maintenanceMode: true } })).status).toBe(403);
    await as(EMAILS.owner);
    expect((await call(overview.GET)).status).toBe(403);
  });

  it("add clinic wizard creates a bookable clinic with defaults, invites the owner, and the slug must be unique", async () => {
    memoryOutbox.length = 0;
    await as(EMAILS.super);
    const plan = await prisma.plan.findFirstOrThrow();
    const email = `owner.${Date.now()}@example.com`;
    const body = {
      name: "Harbor Dental", slug: `harbor-dental-${Date.now().toString(36)}`, specialty: "dental", timeZone: "America/Chicago", phone: "(555) 0100-9000", email: "hello@harbor.example.com", address: "1 Pier St", planId: plan.id, trial: true,
      owner: { mode: "invite", name: "Harper Owner", email },
      importReasons: [{ name: "Cleaning", duration: "45", patient_type: "both" }, { name: "", duration: "10" }],
      importProviders: [{ name: "Dr. Pier", role: "Doctor" }, { display_name: "Hy Gienist", role: "Hygienist", id: "PMS-7" }],
    };
    const r = await call(clinics.POST, { body });
    expect(r.status).toBe(200);
    expect(r.json.status).toBe("trial");
    expect(memoryOutbox.some((m) => m.to === email && /invite/.test(m.text))).toBe(true);
    const detail = await call(clinic.GET, { params: { id: r.json.id } });
    expect(detail.json.counts.providers).toBe(2);
    expect(detail.json.counts.reasons).toBe(1);
    expect(detail.json.users[0].role).toBe("clinic_owner");
    const dup = await call(clinics.POST, { body });
    expect(dup.status).toBe(409);
    // The new owner (once invited) sees exactly this clinic.
    await as(email);
    const mine = await call(me.GET);
    expect(mine.json.clinics.map((c: { id: string }) => c.id)).toEqual([r.json.id]);
    const cfg = await call(clinicData.GET, { params: { clinicId: r.json.id } });
    expect(cfg.json.flow.publishedVersion).toBe(1);
    expect(cfg.json.referrers).toHaveLength(4);
    expect(cfg.json.providers[0].reasonIds).toHaveLength(1);
    // Clone settings from Bright Smile and soft delete / restore.
    await as(EMAILS.super);
    expect((await call(clone.POST, { params: { id: r.json.id }, body: { fromId: "c_brightsmile" } })).status).toBe(200);
    expect((await call(clinicData.GET, { params: { clinicId: r.json.id } })).json.flow.publishedVersion).toBe(2);
    expect((await call(del.POST, { params: { id: r.json.id } })).status).toBe(200);
    await as(email);
    expect((await call(me.GET)).json.clinics).toHaveLength(0);
    await as(EMAILS.super);
    expect((await call(restore.POST, { params: { id: r.json.id } })).status).toBe(200);
  });

  it("feature flags: plan modules and per-clinic overrides are audited and resolved", async () => {
    await as(EMAILS.super);
    const p = await call(plans.PATCH, { method: "PATCH", params: { id: "plan_starter" }, body: { limits: { modules: ["performance"] } } });
    expect(p.status).toBe(200);
    expect(p.json.limits.modules).toContain("performance");
    const c = await call(clinic.PATCH, { method: "PATCH", params: { id: "c_clearskin" }, body: { featureOverrides: { performance: false } } });
    expect(c.status).toBe(200);
    expect(c.json.featureOverrides.performance).toBe(false);
    const d = await call(clinic.GET, { params: { id: "c_clearskin" } });
    expect(d.json.features.performance).toBe(false);
    const entry = await withPlatform((tx) => tx.auditLog.findFirst({ where: { clinicId: "c_clearskin", action: { startsWith: "Feature override performance" } }, orderBy: { at: "desc" } }));
    expect(entry).not.toBeNull();
    await call(clinic.PATCH, { method: "PATCH", params: { id: "c_clearskin" }, body: { featureOverrides: { performance: null } } });
    await call(plans.PATCH, { method: "PATCH", params: { id: "plan_starter" }, body: { limits: { modules: [] } } });
  });

  it("users: invite platform user (forced 2FA), deactivate revokes sessions, reset password sends mail", async () => {
    await as(EMAILS.super);
    memoryOutbox.length = 0;
    const email = `agent.${Date.now()}@example.com`;
    const inv = await call(users.POST, { body: { name: "New Agent", email, role: "support_agent" } });
    expect(inv.status).toBe(200);
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(u.forceTwoFactor).toBe(true);
    const off = await call(user.PATCH, { method: "PATCH", params: { id: "u_frontdesk" }, body: { active: false } });
    expect(off.status).toBe(200);
    await as(EMAILS.frontDesk);
    expect((await call(me.GET)).status).toBe(401);
    await as(EMAILS.super);
    await call(user.PATCH, { method: "PATCH", params: { id: "u_frontdesk" }, body: { active: true } });
  });

  it("support desk, libraries and announcements", async () => {
    await as(EMAILS.support);
    const list = await call(tickets.GET);
    expect(list.status).toBe(200);
    const t = list.json.find((x: { status: string }) => x.status === "open") ?? list.json[0];
    const reply = await call(ticket.POST, { params: { id: t.id }, body: { body: "Looking into it now." } });
    expect(reply.status).toBe(200);
    expect(reply.json.status).toBe("pending");
    expect(reply.json.firstResponseAt).toBeTruthy();
    expect((await call(carriers.POST, { body: { name: "Nope" } })).status).toBe(403);
    await as(EMAILS.super);
    const made = await call(carriers.POST, { body: { name: "Test Carrier" } });
    expect(made.status).toBe(200);
    expect((await call(carrier.PATCH, { method: "PATCH", params: { id: made.json.id }, body: { name: "Test Carrier 2" } })).json.name).toBe("Test Carrier 2");
    expect((await call(carrier.DELETE, { method: "DELETE", params: { id: made.json.id } })).status).toBe(200);
    const a = await call(announcements.POST, { body: { message: "Maintenance tonight 2am", clinicIds: "all", tone: "warning" } });
    expect(a.status).toBe(200);
    const s = await call(settings.PATCH, { method: "PATCH", body: { maintenanceMode: false } });
    expect(s.status).toBe(200);
  });
});
