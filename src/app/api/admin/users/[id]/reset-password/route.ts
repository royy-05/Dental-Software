import { z } from "zod";
import { handler } from "@/server/http";
import { prisma } from "@/server/db";
import { notFound } from "@/server/errors";
import { requestPasswordReset } from "@/server/auth/accounts";
import { zId } from "@/lib/schemas";

export const POST = handler({ summary: "Email a password reset link to a user (audited)", access: { kind: "platform", permission: "admin:users:edit" }, params: z.object({ id: zId }) }, async ({ params, actor }) => {
  const u = await prisma.user.findUnique({ where: { id: params.id } });
  if (!u) throw notFound("User");
  await requestPasswordReset(u.email, actor.ip, { actor });
  return { ok: true };
});
