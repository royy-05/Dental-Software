import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { toClinic } from "@/server/mappers";
import { createClinic } from "@/server/services/admin";
import { zNewClinicBody } from "@/lib/schemas";

export const GET = handler({ summary: "All clinics (including soft-deleted) with plan, owner, bookings this month and last login", access: { kind: "platform", permission: "admin:clinics:view" } }, async () =>
  withPlatform(async (tx) => {
    const month = new Date();
    month.setDate(1);
    month.setHours(0, 0, 0, 0);
    const [rows, counts] = await Promise.all([
      tx.clinic.findMany({ include: { holidays: true, blockouts: true, featureFlags: true, plan: true }, orderBy: { name: "asc" } }),
      tx.$queryRaw<{ clinic_id: string; c: bigint }[]>`SELECT clinic_id, count(*) AS c FROM appointments WHERE created_at >= ${month} AND status <> 'declined' GROUP BY 1`,
    ]);
    const owners = await tx.user.findMany({ where: { id: { in: rows.map((r) => r.ownerUserId).filter((x): x is string => !!x) } }, select: { id: true, name: true, email: true } });
    return rows.map((r) => ({
      ...toClinic(r),
      planName: r.plan.name,
      owner: owners.find((o) => o.id === r.ownerUserId) ?? null,
      bookingsThisMonth: Number(counts.find((c) => c.clinic_id === r.id)?.c ?? 0),
    }));
  }),
);

export const POST = handler({ summary: "Add clinic wizard: details, slug, time zone, owner (existing or invite), plan, starter template, CSV import of reasons and providers", access: { kind: "platform", permission: "admin:clinics:edit" }, body: zNewClinicBody }, async ({ body, actor }) =>
  withPlatform(async (tx) => {
    const c = await createClinic(tx, body, actor);
    return toClinic(await tx.clinic.findUniqueOrThrow({ where: { id: c.id }, include: { holidays: true, blockouts: true, featureFlags: true } }));
  }, { timeoutMs: 60_000 }),
);
