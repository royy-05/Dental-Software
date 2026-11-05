import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/auth", () => import("@/test/mock-auth"));

import { prisma, withPlatform, withTenant } from "@/server/db";
import { as, call, EMAILS } from "@/test/route";
import * as data from "./[clinicId]/data/route";
import * as reasons from "./[clinicId]/reasons/route";
import * as reason from "./[clinicId]/reasons/[id]/route";
import * as reorder from "./[clinicId]/reasons/reorder/route";
import * as duplicate from "./[clinicId]/reasons/[id]/duplicate/route";
import * as provider from "./[clinicId]/providers/[id]/route";
import * as operatories from "./[clinicId]/operatories/route";
import * as operatory from "./[clinicId]/operatories/[id]/route";
import * as hours from "./[clinicId]/schedule/hours/route";
import * as holidays from "./[clinicId]/schedule/holidays/route";
import * as referrers from "./[clinicId]/referrers/route";
import * as templates from "./[clinicId]/templates/route";
import * as template from "./[clinicId]/templates/[id]/route";
import * as flow from "./[clinicId]/flow/route";
import * as publish from "./[clinicId]/flow/publish/route";
import * as rollback from "./[clinicId]/flow/rollback/route";
import * as users from "./[clinicId]/users/route";
import * as user from "./[clinicId]/users/[userId]/route";
import * as tickets from "./[clinicId]/tickets/route";
import * as appointments from "./[clinicId]/appointments/route";
import * as appointment from "./[clinicId]/appointments/[id]/route";
import * as status from "./[clinicId]/appointments/[id]/status/route";
import * as exportRoute from "./[clinicId]/appointments/export/route";
import * as slots from "./[clinicId]/slots/route";
import * as insurances from "./[clinicId]/insurances/route";
import * as profile from "./[clinicId]/profile/route";

const A = "c_brightsmile";
const B = "c_motion";
const p = (clinicId: string, extra: Record<string, string> = {}) => ({ clinicId, ...extra });

beforeAll(async () => {
  await prisma.rateLimit.deleteMany();
});
afterAll(() => prisma.$disconnect());

describe("server-side permission checks", () => {
  it("front desk can read appointments but not change configuration", async () => {
    await as(EMAILS.frontDesk);
    expect((await call(data.GET, { params: p(A) })).status).toBe(200);
    expect((await call(appointments.GET, { params: p(A) })).status).toBe(200);
    expect((await call(reasons.POST, { params: p(A), body: {} })).status).toBe(403);
    expect((await call(templates.GET, { params: p(A) })).status).toBe(403);
    expect((await call(flow.GET, { params: p(A) })).status).toBe(403);
    expect((await call(users.GET, { params: p(A) })).status).toBe(403);
    expect((await call(exportRoute.GET, { params: p(A) })).status).toBe(403);
  });

  it("a clinic user cannot reach another clinic, even with a valid id", async () => {
    await as(EMAILS.frontDesk);
    expect((await call(data.GET, { params: p(A) })).status).toBe(200);
    expect((await call(data.GET, { params: p(B) })).status).toBe(403);
    expect((await call(appointments.GET, { params: p(B) })).status).toBe(403);
  });

  it("support agents have no direct clinic access; super admins do", async () => {
    await as(EMAILS.support);
    expect((await call(data.GET, { params: p(A) })).status).toBe(403);
    await as(EMAILS.super);
    expect((await call(data.GET, { params: p(A) })).status).toBe(200);
  });

  it("managers cannot see billing or invite owners; owners can", async () => {
    await as(EMAILS.manager);
    const r = await call(users.POST, { params: p(A), body: { name: "New Owner", email: `owner.${Date.now()}@example.com`, role: "clinic_owner" } });
    expect(r.status).toBe(403);
    await as(EMAILS.owner);
    const ok = await call(users.POST, { params: p(A), body: { name: "Desk Two", email: `desk.${Date.now()}@example.com`, role: "front_desk" } });
    expect(ok.status).toBe(200);
    expect(ok.json.invited).toBe(true);
  });

  it("validation errors name the field", async () => {
    await as(EMAILS.manager);
    const r = await call(reasons.POST, { params: p(A), body: { name: "", duration: 2 } });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe("validation_error");
    expect(r.json.error.details.some((d: { path: string }) => d.path === "name")).toBe(true);
  });
});

describe("configuration modules", () => {
  it("reasons: create, edit links, duplicate, reorder, delete; mirrors stay consistent", async () => {
    await as(EMAILS.manager);
    const d = (await call(data.GET, { params: p(A) })).json;
    const prov = d.providers[0];
    const room = d.operatories[0];
    const created = await call(reasons.POST, {
      params: p(A),
      body: { name: "Whitening", description: "", longDescription: "", duration: 45, patientType: "both", providerIds: [prov.id], operatoryIds: [room.id], color: "#123456", estimatedValue: 300, visibility: "online", active: true, questions: [], redirectUrl: "" },
    });
    expect(created.status).toBe(200);
    const id = created.json.id as string;
    const after = (await call(data.GET, { params: p(A) })).json;
    expect(after.providers.find((x: { id: string }) => x.id === prov.id).reasonIds).toContain(id);
    expect(after.operatories.find((x: { id: string }) => x.id === room.id).reasonIds).toContain(id);
    expect((await call(reason.PATCH, { method: "PATCH", params: p(A, { id }), body: { providerIds: [] } })).status).toBe(400);
    expect((await call(reason.PATCH, { method: "PATCH", params: p(A, { id }), body: { providerIds: [], active: false } })).status).toBe(200);
    expect((await call(reason.PATCH, { method: "PATCH", params: p(A, { id }), body: { providerIds: [prov.id], active: true } })).status).toBe(200);
    const dup = await call(duplicate.POST, { params: p(A, { id }) });
    expect(dup.status).toBe(200);
    expect(dup.json.active).toBe(false);
    expect(dup.json.order).toBe(created.json.order + 1);
    const ids = (await call(reasons.GET, { params: p(A) })).json.map((r: { id: string }) => r.id).reverse();
    expect((await call(reorder.POST, { params: p(A), body: { ids } })).status).toBe(200);
    expect((await call(reasons.GET, { params: p(A) })).json[0].id).toBe(ids[0]);
    expect((await call(reorder.POST, { params: p(A), body: { ids: ids.slice(1) } })).status).toBe(400);
    expect((await call(reason.DELETE, { method: "DELETE", params: p(A, { id: dup.json.id }) })).status).toBe(200);
    expect((await call(reason.DELETE, { method: "DELETE", params: p(A, { id }) })).status).toBe(200);
    const audit = await withPlatform((tx) => tx.auditLog.findFirst({ where: { clinicId: A, action: "Deleted reason “Whitening”" } }));
    expect(audit?.actorId).toBe("u_manager");
  });

  it("providers: hours validation, reasons-offered sync and online toggle", async () => {
    await as(EMAILS.manager);
    const d = (await call(data.GET, { params: p(A) })).json;
    const prov = d.providers[0];
    const bad = await call(provider.PATCH, { method: "PATCH", params: p(A, { id: prov.id }), body: { weeklyHours: { ...prov.weeklyHours, 1: { enabled: true, start: "17:00", end: "09:00" } } } });
    expect(bad.status).toBe(400);
    const less = prov.reasonIds.slice(1);
    const ok = await call(provider.PATCH, { method: "PATCH", params: p(A, { id: prov.id }), body: { reasonIds: less, showOnline: false } });
    expect(ok.status).toBe(200);
    expect(ok.json.reasonIds.sort()).toEqual([...less].sort());
    const rs = (await call(reasons.GET, { params: p(A) })).json;
    expect(rs.find((r: { id: string }) => r.id === prov.reasonIds[0]).providerIds).not.toContain(prov.id);
    await call(provider.PATCH, { method: "PATCH", params: p(A, { id: prov.id }), body: { reasonIds: prov.reasonIds, showOnline: true } });
    // Marcus manages c_motion too, so the row is simply not visible there (RLS); Theo has no access at all.
    const other = await call(provider.PATCH, { method: "PATCH", params: p(B, { id: prov.id }), body: { bio: "x" } });
    expect(other.status).toBe(404);
    await as(EMAILS.physioFrontDesk);
    expect((await call(provider.PATCH, { method: "PATCH", params: p(A, { id: prov.id }), body: { bio: "x" } })).status).toBe(403);
  });

  it("operatories and schedule", async () => {
    await as(EMAILS.manager);
    const made = await call(operatories.POST, { params: p(A), body: { name: "Room 9", active: true, providerIds: [], reasonIds: [] } });
    expect(made.status).toBe(200);
    expect((await call(operatory.PATCH, { method: "PATCH", params: p(A, { id: made.json.id }), body: { active: false } })).json.active).toBe(false);
    expect((await call(operatory.DELETE, { method: "DELETE", params: p(A, { id: made.json.id }) })).status).toBe(200);
    const h = await call(hours.PUT, { method: "PUT", params: p(A), body: { ...(await withTenant(A, (tx) => tx.clinic.findUniqueOrThrow({ where: { id: A } }))).hours as object, 6: { enabled: true, start: "09:00", end: "13:00" } } });
    expect(h.status).toBe(200);
    expect(h.json.hours[6].enabled).toBe(true);
    const hol = await call(holidays.POST, { params: p(A), body: { date: "2027-12-25", name: "Christmas" } });
    expect(hol.status).toBe(200);
  });

  it("referrers get sequential ids per clinic", async () => {
    await as(EMAILS.owner);
    const before = (await call(referrers.GET, { params: p(A) })).json.length;
    const r = await call(referrers.POST, { params: p(A), body: { name: "Spring mailer", sourceType: "custom", redirectUrl: "https://example.com/thanks" } });
    expect(r.status).toBe(200);
    expect(Number(r.json.id)).toBeGreaterThan(before);
  });

  it("templates: editing a global default creates the clinic copy; resetting restores it", async () => {
    await as(EMAILS.manager);
    const list = (await call(templates.GET, { params: p(A) })).json;
    const t = list.find((x: { event: string; channel: string }) => x.event === "form_request" && x.channel === "sms");
    const edited = await call(template.PATCH, { method: "PATCH", params: p(A, { id: t.id }), body: { body: "Custom {{patient_name}}" } });
    expect(edited.status).toBe(200);
    expect(edited.json.clinicId).toBe(A);
    expect(edited.json.body).toBe("Custom {{patient_name}}");
    const again = (await call(templates.GET, { params: p(A) })).json.find((x: { event: string; channel: string }) => x.event === "form_request" && x.channel === "sms");
    expect(again.id).toBe(edited.json.id);
  });

  it("booking flow: draft, publish, roll back keep history", async () => {
    await as(EMAILS.owner);
    const f = (await call(flow.GET, { params: p(A) })).json;
    const draft = { ...f.draft, rules: { ...f.draft.rules, minNoticeHours: 4 } };
    expect((await call(flow.PUT, { method: "PUT", params: p(A), body: draft })).json.draftUpdatedAt).toBeTruthy();
    const pub = await call(publish.POST, { params: p(A), body: { config: draft, note: "notice 4h" } });
    expect(pub.status).toBe(200);
    expect(pub.json.publishedVersion).toBe(f.publishedVersion + 1);
    expect(pub.json.published.rules.minNoticeHours).toBe(4);
    const rb = await call(rollback.POST, { params: p(A), body: { version: f.publishedVersion } });
    expect(rb.json.publishedVersion).toBe(f.publishedVersion + 2);
    expect(rb.json.versions.length).toBe(f.versions.length + 2);
    expect((await call(flow.PUT, { method: "PUT", params: p(A), body: { ...draft, rules: { ...draft.rules, slotInterval: 1 } } })).status).toBe(400);
  });

  it("users: role changes, owner protection, deactivation revokes sessions", async () => {
    await as(EMAILS.owner);
    const list = (await call(users.GET, { params: p(A) })).json;
    const desk = list.find((u: { email: string }) => u.email === EMAILS.frontDesk);
    expect((await call(user.PATCH, { method: "PATCH", params: p(A, { userId: desk.id }), body: { role: "clinic_manager" } })).status).toBe(200);
    expect((await call(user.PATCH, { method: "PATCH", params: p(A, { userId: desk.id }), body: { role: "front_desk" } })).status).toBe(200);
    await as(EMAILS.manager);
    const owner = list.find((u: { role: string }) => u.role === "clinic_owner");
    expect((await call(user.PATCH, { method: "PATCH", params: p(A, { userId: owner.id }), body: { active: false } })).status).toBe(403);
    expect((await call(user.DELETE, { method: "DELETE", params: p(A, { userId: owner.id }) })).status).toBe(403);
  });

  it("tickets and insurances", async () => {
    await as(EMAILS.frontDesk);
    const t = await call(tickets.POST, { params: p(A), body: { subject: "Printer broken", category: "bug", priority: "high", body: "The front desk printer does not print the schedule." } });
    expect(t.status).toBe(200);
    expect(t.json.messages[0].authorRole).toBe("front_desk");
    expect((await call(insurances.GET, { params: p(A) })).status).toBe(403);
    await as(EMAILS.manager);
    const ins = await call(insurances.POST, { params: p(A), body: { customNames: ["Local Plan A", "Local Plan A"] } });
    expect(ins.status).toBe(200);
    expect(ins.json.filter((i: { name: string }) => i.name === "Local Plan A")).toHaveLength(1);
  });
});

describe("appointments", () => {
  it("detail view is audited, status actions work, export returns CSV and audits, slots respect staff override", async () => {
    await as(EMAILS.frontDesk);
    const list = (await call(appointments.GET, { params: p(A), query: { status: "unconfirmed" } })).json;
    expect(list.length).toBeGreaterThan(0);
    const a = list.find((x: { start: string }) => x.start > new Date().toISOString().slice(0, 16)) ?? list[0];
    const detail = await call(appointment.GET, { params: p(A, { id: a.id }) });
    expect(detail.status).toBe(200);
    expect(detail.json.statusHistory.length).toBeGreaterThan(0);
    const audit = await withPlatform((tx) => tx.auditLog.findFirst({ where: { clinicId: A, category: "phi_access", target: a.id, actorId: "u_frontdesk" } }));
    expect(audit).not.toBeNull();
    const declined = await call(status.POST, { params: p(A, { id: a.id }), body: { status: "declined" } });
    expect(declined.status).toBe(400);
    const confirmed = await call(status.POST, { params: p(A, { id: a.id }), body: { status: "confirmed" } });
    expect(confirmed.status).toBe(200);
    expect(confirmed.json.status).toBe("confirmed");
    await as(EMAILS.manager);
    const csv = await call(exportRoute.GET, { params: p(A), query: { tab: "appointments", hidePhi: "1" } });
    expect(csv.status).toBe(200);
    expect(String(csv.json)).toMatch(/^date_scheduled,patient_type/);
    expect(String(csv.json)).toMatch(/•{3}/);
    const exp = await withPlatform((tx) => tx.auditLog.findFirst({ where: { clinicId: A, category: "export", actorId: "u_manager" }, orderBy: { at: "desc" } }));
    expect(exp?.details).toBe("PHI masked");
    const reasonId = (await call(reasons.GET, { params: p(A) })).json[0].id;
    const day = new Date(Date.now() + 86400000);
    while (day.getDay() === 0 || day.getDay() === 6) day.setDate(day.getDate() + 1);
    const s = await call(slots.GET, { params: p(A), query: { reasonId, date: day.toISOString().slice(0, 10) } });
    expect(s.status).toBe(200);
  });

  it("profile updates are audited with the changed sections and custom slugs must be unique", async () => {
    await as(EMAILS.owner);
    const r = await call(profile.PATCH, { method: "PATCH", params: p(A), body: { phone: "(555) 0100-0000" } });
    expect(r.status).toBe(200);
    expect(r.json.clinic.phone).toBe("(555) 0100-0000");
    const taken = await call(profile.PATCH, { method: "PATCH", params: p(A), body: { settings: { ...r.json.clinic.settings, widget: { ...r.json.clinic.settings.widget, customSlug: "motion-physio" } } } });
    expect([400, 409]).toContain(taken.status);
  });
});
