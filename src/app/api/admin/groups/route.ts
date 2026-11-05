import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { audit } from "@/server/audit";
import { toGroup } from "@/server/mappers";
import { zId, zName } from "@/lib/schemas";

export const GET = handler({ summary: "Clinic groups (multi-location practices) with members", access: { kind: "platform", permission: "admin:clinics:view" } }, async () =>
  withPlatform(async (tx) => {
    const groups = await tx.clinicGroup.findMany({ include: { clinics: { select: { id: true } }, users: { select: { id: true, name: true, email: true } } }, orderBy: { name: "asc" } });
    return groups.map((g) => ({ ...toGroup(g), users: g.users }));
  }),
);

export const POST = handler({ summary: "Create a group", access: { kind: "platform", permission: "admin:groups:edit" }, body: z.object({ name: zName(), ownerUserId: zId.optional(), clinicIds: z.array(zId).max(200).default([]) }) }, async ({ body, actor }) =>
  withPlatform(async (tx) => {
    const g = await tx.clinicGroup.create({ data: { name: body.name, ownerUserId: body.ownerUserId ?? null } });
    if (body.clinicIds.length) await tx.clinic.updateMany({ where: { id: { in: body.clinicIds } }, data: { groupId: g.id } });
    await audit(tx, actor, { action: "Created clinic group", category: "clinic", target: g.name });
    return toGroup(await tx.clinicGroup.findUniqueOrThrow({ where: { id: g.id }, include: { clinics: { select: { id: true } } } }));
  }),
);
