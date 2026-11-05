import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { audit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { toGroup } from "@/server/mappers";
import { zId, zName } from "@/lib/schemas";

const params = z.object({ id: zId });

export const PATCH = handler({ summary: "Edit a group: name, owner, member clinics, group-level users", access: { kind: "platform", permission: "admin:groups:edit" }, params, body: z.object({ name: zName().optional(), ownerUserId: zId.nullable().optional(), clinicIds: z.array(zId).max(200).optional(), userIds: z.array(zId).max(200).optional() }) }, async ({ params, body, actor }) =>
  withPlatform(async (tx) => {
    const g = await tx.clinicGroup.findUnique({ where: { id: params.id } });
    if (!g) throw notFound("Group");
    await tx.clinicGroup.update({ where: { id: g.id }, data: { name: body.name ?? g.name, ownerUserId: body.ownerUserId === undefined ? g.ownerUserId : body.ownerUserId } });
    if (body.clinicIds) {
      await tx.clinic.updateMany({ where: { groupId: g.id, id: { notIn: body.clinicIds } }, data: { groupId: null } });
      await tx.clinic.updateMany({ where: { id: { in: body.clinicIds } }, data: { groupId: g.id } });
    }
    if (body.userIds) {
      await tx.user.updateMany({ where: { groupId: g.id, id: { notIn: body.userIds } }, data: { groupId: null } });
      await tx.user.updateMany({ where: { id: { in: body.userIds }, platformRole: null }, data: { groupId: g.id } });
    }
    await audit(tx, actor, { action: "Edited clinic group", category: "clinic", target: body.name ?? g.name });
    return toGroup(await tx.clinicGroup.findUniqueOrThrow({ where: { id: g.id }, include: { clinics: { select: { id: true } } } }));
  }),
);

export const DELETE = handler({ summary: "Delete a group (clinics and users are unlinked, not deleted)", access: { kind: "platform", permission: "admin:groups:edit" }, params }, async ({ params, actor }) =>
  withPlatform(async (tx) => {
    const g = await tx.clinicGroup.findUnique({ where: { id: params.id } });
    if (!g) throw notFound("Group");
    await tx.clinicGroup.delete({ where: { id: g.id } });
    await audit(tx, actor, { action: "Deleted clinic group", category: "clinic", target: g.name });
    return { ok: true };
  }),
);
