import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { toUser } from "@/server/mappers";
import { clinicRole } from "@/server/auth/context";
import { PERMISSIONS } from "@/lib/permissions";

export const GET = handler({ summary: "Current user, clinic access and effective permissions", access: { kind: "user", allowDuringTwoFactorSetup: true } }, async ({ auth }) => {
  const { user, clinics } = await withPlatform(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: auth.userId }, include: { memberships: true } });
    const clinics = await tx.clinic.findMany({
      where: { deletedAt: null, ...(auth.platformRole ? {} : { id: { in: auth.memberships.map((m) => m.clinicId) } }) },
      select: { id: true, name: true, slug: true, specialty: true, status: true },
      orderBy: { name: "asc" },
    });
    return { user, clinics };
  });
  const accessible = clinics.filter((c) => clinicRole(auth, c.id));
  return {
    user: toUser(user),
    platformRole: auth.platformRole,
    impersonation: auth.impersonation,
    needsTwoFactorSetup: auth.needsTwoFactorSetup,
    clinics: accessible.map((c) => ({ ...c, role: clinicRole(auth, c.id), permissions: PERMISSIONS[clinicRole(auth, c.id)!] })),
    platformPermissions: auth.platformRole ? PERMISSIONS[auth.platformRole].filter((p) => p.startsWith("admin:")) : [],
  };
});
