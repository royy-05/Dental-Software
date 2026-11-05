import { z } from "zod";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { badRequest } from "@/server/errors";
import { toClinicInsurance } from "@/server/mappers";
import { zId, zName } from "@/lib/schemas";

export const GET = handler({ summary: "Carriers this clinic accepts, plus the master carrier list", access: { kind: "clinic", permission: "insurances:manage" } }, async ({ clinicId }) =>
  withTenant(clinicId, async (tx) => ({
    insurances: (await tx.clinicInsurance.findMany({ orderBy: { name: "asc" } })).map(toClinicInsurance),
    carriers: await tx.insuranceCarrier.findMany({ orderBy: { name: "asc" } }),
  })),
);

/** Pick from the master list or add custom carriers (comma-separated bulk add). Custom carriers start "in network". */
export const POST = handler({ summary: "Add carriers from the master list and/or custom carriers (bulk)", access: { kind: "clinic", permission: "insurances:manage" }, body: z.object({ carrierIds: z.array(zId).max(100).default([]), customNames: z.array(zName(120)).max(100).default([]) }) }, async ({ clinicId, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    if (!body.carrierIds.length && !body.customNames.length) throw badRequest("Choose at least one carrier.");
    const existing = await tx.clinicInsurance.findMany({ select: { carrierId: true, name: true } });
    const haveNames = new Set(existing.map((e) => e.name.toLowerCase()));
    const haveIds = new Set(existing.map((e) => e.carrierId));
    const master = await tx.insuranceCarrier.findMany({ where: { id: { in: body.carrierIds } } });
    const rows = [
      ...master.filter((c) => !haveIds.has(c.id)).map((c) => ({ clinicId, carrierId: c.id, name: c.name, status: "in_network", custom: false })),
      ...body.customNames.filter((n) => (haveNames.has(n.toLowerCase()) ? false : (haveNames.add(n.toLowerCase()), true))).map((n) => ({ clinicId, carrierId: null, name: n, status: "in_network", custom: true })),
    ];
    if (rows.length) await tx.clinicInsurance.createMany({ data: rows });
    await audit(tx, actor, { action: `Added ${rows.length} insurance carrier${rows.length === 1 ? "" : "s"}`, category: "settings", target: "Insurances", clinicId });
    return (await tx.clinicInsurance.findMany({ orderBy: { name: "asc" } })).map(toClinicInsurance);
  }),
);
