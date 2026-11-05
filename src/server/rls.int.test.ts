import { afterAll, describe, expect, it } from "vitest";
import { prisma, withPlatform, withTenant, clinicIdForSlug } from "./db";

const A = "c_brightsmile";
const B = "c_motion";

afterAll(() => prisma.$disconnect());

describe("row-level security (clinic isolation)", () => {
  it("connects as a role that cannot bypass RLS", async () => {
    const [row] = await prisma.$queryRaw<{ super: boolean; bypass: boolean }[]>`SELECT rolsuper AS super, rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`;
    expect(row).toEqual({ super: false, bypass: false });
  });

  it("returns no clinic rows at all without a scope (fail closed)", async () => {
    expect(await prisma.appointment.count()).toBe(0);
    expect(await prisma.patient.count()).toBe(0);
    expect(await prisma.clinic.count()).toBe(0);
  });

  it("tenant scope only sees its own clinic's rows in every clinic table", async () => {
    await withTenant(A, async (tx) => {
      const clinicIds = new Set<string>();
      for (const rows of [
        await tx.appointment.findMany({ select: { clinicId: true } }),
        await tx.patient.findMany({ select: { clinicId: true } }),
        await tx.provider.findMany({ select: { clinicId: true } }),
        await tx.reason.findMany({ select: { clinicId: true } }),
        await tx.messageLog.findMany({ select: { clinicId: true } }),
        await tx.ticket.findMany({ select: { clinicId: true } }),
        await tx.membership.findMany({ select: { clinicId: true } }),
        await tx.statusHistory.findMany({ select: { clinicId: true } }),
      ])
        rows.forEach((r) => clinicIds.add(r.clinicId));
      expect([...clinicIds]).toEqual([A]);
      expect(await tx.clinic.findMany({ select: { id: true } })).toEqual([{ id: A }]);
    });
  });

  it("cannot read another clinic's row even by primary key", async () => {
    const otherAppt = await withTenant(B, (tx) => tx.appointment.findFirstOrThrow({ select: { id: true } }));
    await withTenant(A, async (tx) => {
      expect(await tx.appointment.findUnique({ where: { id: otherAppt.id } })).toBeNull();
      expect(await tx.clinic.findUnique({ where: { id: B } })).toBeNull();
    });
  });

  it("cannot update or delete another clinic's rows", async () => {
    const otherAppt = await withTenant(B, (tx) => tx.appointment.findFirstOrThrow({ select: { id: true, status: true } }));
    await withTenant(A, async (tx) => {
      const upd = await tx.appointment.updateMany({ where: { id: otherAppt.id }, data: { status: "cancelled" } });
      expect(upd.count).toBe(0);
      const del = await tx.notification.deleteMany({ where: { clinicId: B } });
      expect(del.count).toBe(0);
    });
    const after = await withTenant(B, (tx) => tx.appointment.findUniqueOrThrow({ where: { id: otherAppt.id } }));
    expect(after.status).toBe(otherAppt.status);
  });

  it("cannot insert a row for another clinic", async () => {
    await expect(withTenant(A, (tx) => tx.notification.create({ data: { clinicId: B, title: "x", body: "y" } }))).rejects.toThrow(/row-level security/);
  });

  it("cannot move its own row into another clinic", async () => {
    await expect(
      withTenant(A, async (tx) => {
        const r = await tx.reason.findFirstOrThrow();
        await tx.reason.update({ where: { id: r.id }, data: { clinicId: B } });
      }),
    ).rejects.toThrow(/row-level security/);
  });

  it("scope is transaction-local and does not leak to the next query on the pooled connection", async () => {
    await withTenant(A, (tx) => tx.appointment.count());
    expect(await prisma.appointment.count()).toBe(0);
  });

  it("global message templates are readable by every tenant but only writable by the platform", async () => {
    await withTenant(A, async (tx) => {
      const globals = await tx.messageTemplate.count({ where: { clinicId: null } });
      expect(globals).toBeGreaterThan(0);
      const others = await tx.messageTemplate.count({ where: { clinicId: B } });
      expect(others).toBe(0);
      const upd = await tx.messageTemplate.updateMany({ where: { clinicId: null }, data: { body: "hacked" } });
      expect(upd.count).toBe(0);
    });
  });

  it("audit log is append-only for the app role", async () => {
    await expect(withPlatform((tx) => tx.auditLog.updateMany({ data: { action: "x" } }))).rejects.toThrow(/permission denied/);
  });

  it("platform scope sees every clinic", async () => {
    const n = await withPlatform((tx) => tx.clinic.count());
    expect(n).toBe(5);
  });

  it("resolves public slugs without exposing other columns", async () => {
    expect(await clinicIdForSlug("bright-smile-dental")).toBe(A);
    expect(await clinicIdForSlug("does-not-exist")).toBeNull();
  });
});
