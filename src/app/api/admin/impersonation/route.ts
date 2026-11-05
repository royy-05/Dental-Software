import { z } from "zod";
import { handler, zId } from "@/server/http";
import { prisma, withPlatform } from "@/server/db";
import { audit } from "@/server/audit";
import { badRequest, notFound } from "@/server/errors";

export const POST = handler(
  {
    summary: "Start 'Log in as clinic' (reason required, audited)",
    access: { kind: "platform", permission: "admin:impersonate" },
    body: z.object({ clinicId: zId, reason: z.string().trim().min(5, "Give a reason of at least 5 characters").max(500) }),
  },
  async ({ auth, body, actor }) => {
    await withPlatform(async (tx) => {
      const clinic = await tx.clinic.findUnique({ where: { id: body.clinicId } });
      if (!clinic || clinic.deletedAt) throw notFound("Clinic");
      if (auth.impersonation) throw badRequest("End the current impersonation first.");
      await tx.authSession.update({ where: { id: auth.sessionId }, data: { impersonationClinic: clinic.id, impersonationReason: body.reason, impersonationAt: new Date() } });
      await audit(tx, actor, { action: "Impersonated clinic", category: "impersonation", target: clinic.name, clinicId: clinic.id, details: `Reason: ${body.reason}` });
    });
    return { ok: true, clinicId: body.clinicId };
  },
);

export const DELETE = handler({ summary: "End impersonation (audited)", access: { kind: "platform", permission: "admin:impersonate" } }, async ({ auth, actor }) => {
  if (!auth.impersonation) return { ok: true };
  const imp = auth.impersonation;
  await withPlatform(async (tx) => {
    const clinic = await tx.clinic.findUnique({ where: { id: imp.clinicId }, select: { name: true } });
    await audit(tx, actor, { action: "Ended impersonation", category: "impersonation", target: clinic?.name ?? imp.clinicId, clinicId: imp.clinicId });
  });
  await prisma.authSession.update({ where: { id: auth.sessionId }, data: { impersonationClinic: null, impersonationReason: null, impersonationAt: null } });
  return { ok: true };
});
