import { z } from "zod";
import { handler, idParams } from "@/server/http";
import { withPlatform } from "@/server/db";
import { audit } from "@/server/audit";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { revokeAllSessions } from "@/server/auth/login";
import { can } from "@/lib/permissions";
import { zClinicRole } from "@/lib/schemas";

const params = idParams("userId");

export const PATCH = handler({ summary: "Change a staff member's role in this clinic or deactivate/reactivate their login", access: { kind: "clinic", permission: "users:manage" }, params, body: z.object({ role: zClinicRole.optional(), active: z.boolean().optional() }) }, async ({ clinicId, params, body, actor, role, auth }) =>
  withPlatform(async (tx) => {
    const m = await tx.membership.findUnique({ where: { userId_clinicId: { userId: params.userId, clinicId } }, include: { user: true } });
    if (!m) throw notFound("User");
    if (m.userId === auth.userId) throw badRequest("You cannot change your own access.");
    const touchesOwner = m.role === "clinic_owner" || body.role === "clinic_owner";
    if (touchesOwner && !can(role, "users:remove_owner")) throw forbidden("Only the clinic owner can change an owner.");
    if (body.role && body.role !== m.role) {
      await tx.membership.update({ where: { id: m.id }, data: { role: body.role } });
      await audit(tx, actor, { action: `Changed role to ${body.role}`, category: "user", target: m.user.email, clinicId });
    }
    if (body.active !== undefined && body.active !== m.user.active) {
      if (m.user.platformRole) throw forbidden("Platform users are managed by the platform team.");
      await tx.user.update({ where: { id: m.userId }, data: { active: body.active } });
      await audit(tx, actor, { action: body.active ? "Reactivated user" : "Deactivated user", category: "user", target: m.user.email, clinicId });
      if (!body.active) await revokeAllSessions(m.userId);
    }
    return { ok: true };
  }),
);

export const DELETE = handler({ summary: "Remove a staff member from this clinic", access: { kind: "clinic", permission: "users:manage" }, params }, async ({ clinicId, params, actor, role, auth }) =>
  withPlatform(async (tx) => {
    const m = await tx.membership.findUnique({ where: { userId_clinicId: { userId: params.userId, clinicId } }, include: { user: true } });
    if (!m) throw notFound("User");
    if (m.userId === auth.userId) throw badRequest("You cannot remove yourself.");
    if (m.role === "clinic_owner" && !can(role, "users:remove_owner")) throw forbidden("Only the clinic owner can remove an owner.");
    await tx.membership.delete({ where: { id: m.id } });
    await audit(tx, actor, { action: "Removed user from clinic", category: "user", target: m.user.email, clinicId });
    return { ok: true };
  }),
);
