import { afterAll, describe, expect, it } from "vitest";
import { prisma, withPlatform, withTenant } from "@/server/db";
import { memoryOutbox } from "@/server/messaging/email";
import { hourlyTick, sendDailySummaries, sweepDueMessages } from "./deliver";
import { purgeExpiredPatientData } from "./retention";

const CLINIC = "c_motion";

afterAll(() => prisma.$disconnect());

describe("hourly tick", () => {
  it("sends each clinic one daily summary of tomorrow's schedule at 17:00 local time", async () => {
    const tz = (await withPlatform((tx) => tx.clinic.findUniqueOrThrow({ where: { id: CLINIC }, select: { timeZone: true } }))).timeZone;
    // Find an instant that is 17:xx in the clinic's zone today.
    const now = new Date();
    let at = new Date(now);
    for (let h = 0; h < 48; h++) {
      at = new Date(now.getTime() + h * 3600_000);
      const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(at));
      if (hour === 17) break;
    }
    const before = await withTenant(CLINIC, (tx) => tx.messageLog.count({ where: { event: "daily_summary" } }));
    const sent = await sendDailySummaries(at);
    expect(sent).toBeGreaterThan(0);
    const rows = await withTenant(CLINIC, (tx) => tx.messageLog.findMany({ where: { event: "daily_summary" }, orderBy: { createdAt: "desc" } }));
    expect(rows.length).toBeGreaterThan(before);
    expect(rows[0].subject).toMatch(/tomorrow's schedule/);
    expect(rows[0].recipientType).toBe("clinic");
    // Idempotent within the day.
    expect(await sendDailySummaries(at)).toBe(0);
    memoryOutbox.length = 0;
    await sweepDueMessages(at);
    expect(memoryOutbox.some((m) => /tomorrow's schedule/.test(m.subject))).toBe(true);
  });

  it("purges patients past the clinic's retention period and audits it", async () => {
    const old = new Date(Date.now() - 400 * 86400000);
    const p = await withTenant(CLINIC, (tx) => tx.patient.create({ data: { clinicId: CLINIC, firstName: "Old", lastName: "Record", dob: "1950-01-01", phone: "(555) 0100-0001", email: "old.record@example.com", createdAt: old } }));
    await withPlatform((tx) => tx.clinic.update({ where: { id: CLINIC }, data: { retentionDays: 365 } }));
    const r = await purgeExpiredPatientData();
    expect(r.patients).toBeGreaterThanOrEqual(1);
    expect(await withTenant(CLINIC, (tx) => tx.patient.findUnique({ where: { id: p.id } }))).toBeNull();
    const entry = await withPlatform((tx) => tx.auditLog.findFirst({ where: { clinicId: CLINIC, target: "Data retention" }, orderBy: { at: "desc" } }));
    expect(entry?.actorRole).toBe("system");
    // Recent patients with upcoming visits are untouched.
    const recent = await withTenant(CLINIC, (tx) => tx.patient.count());
    expect(recent).toBeGreaterThan(0);
    await withPlatform((tx) => tx.clinic.update({ where: { id: CLINIC }, data: { retentionDays: null } }));
  });

  it("the tick runs end to end", async () => {
    const r = await hourlyTick();
    expect(r.swept).toBeDefined();
    expect(r.retention.clinics).toBeGreaterThanOrEqual(0);
  });
});
