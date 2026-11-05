import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform, withTenant } from "@/server/db";
import { forbidden } from "@/server/errors";
import { toUser } from "@/server/mappers";
import { inviteClinicUser } from "@/server/auth/accounts";
import { can } from "@/lib/permissions";
import { zClinicRole, zEmail, zName } from "@/lib/schemas";

export const GET = handler({ summary: "Staff with access to this clinic", access: { kind: "clinic", permission: "users:manage" } }, async ({ clinicId }) =>
  withPlatform(async (tx) => {
    const rows = await tx.membership.findMany({ where: { clinicId }, include: { user: { include: { memberships: true } } } });
    return rows.map((m) => ({ ...toUser(m.user), role: m.role, membershipId: m.id }));
  }),
);

/** Only a clinic owner can invite or assign the Clinic Owner role (docs/assumptions.md). */
export const POST = handler({ summary: "Invite staff (email with a 7-day link; existing users are just added)", access: { kind: "clinic", permission: "users:manage" }, body: z.object({ name: zName(), email: zEmail, role: zClinicRole }) }, async ({ clinicId, body, actor, role }) => {
  if (body.role === "clinic_owner" && !can(role, "users:remove_owner")) throw forbidden("Only the clinic owner can add another owner.");
  const clinic = await withTenant(clinicId, (tx) => tx.clinic.findUniqueOrThrow({ where: { id: clinicId }, select: { name: true } }));
  return withPlatform((tx) => inviteClinicUser(tx, actor, { clinicId, clinicName: clinic.name, ...body }));
});
