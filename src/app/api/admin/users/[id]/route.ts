import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { audit } from "@/server/audit";
import { badRequest, notFound } from "@/server/errors";
import { toUser } from "@/server/mappers";
import { revokeAllSessions } from "@/server/auth/login";
import { zId } from "@/lib/schemas";

export const PATCH = handler({ summary: "Deactivate/reactivate, force 2FA, or move a user into a clinic group", access: { kind: "platform", permission: "admin:users:edit" }, params: z.object({ id: zId }), body: z.object({ active: z.boolean().optional(), forceTwoFactor: z.boolean().optional(), groupId: zId.nullable().optional() }) }, async ({ params, body, actor, auth }) =>
  withPlatform(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: params.id }, include: { memberships: true } });
    if (!u) throw notFound("User");
    if (u.id === auth.userId && body.active === false) throw badRequest("You cannot deactivate yourself.");
    if (body.groupId) {
      // Group-level users (6.3) get access to every location in the group as Clinic Manager, keeping any higher role they already have.
      const clinics = await tx.clinic.findMany({ where: { groupId: body.groupId, deletedAt: null }, select: { id: true } });
      for (const c of clinics) {
        if (!u.memberships.some((m) => m.clinicId === c.id)) await tx.membership.create({ data: { userId: u.id, clinicId: c.id, role: "clinic_manager" } });
      }
    }
    const row = await tx.user.update({ where: { id: u.id }, data: { active: body.active, forceTwoFactor: body.forceTwoFactor, groupId: body.groupId === undefined ? undefined : body.groupId }, include: { memberships: true } });
    const what = body.active === false ? "Deactivated user" : body.active === true ? "Reactivated user" : body.forceTwoFactor ? "Forced 2FA" : body.forceTwoFactor === false ? "Removed 2FA requirement" : body.groupId ? "Added group user" : "Removed group user";
    await audit(tx, actor, { action: what, category: "user", target: `${u.name} (${u.email})` });
    if (body.active === false) await revokeAllSessions(u.id);
    return toUser(row);
  }),
);
