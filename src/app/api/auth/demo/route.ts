import { handler } from "@/server/http";
import { notFound } from "@/server/errors";
import { isDemoMode } from "@/server/env";
import { prisma } from "@/server/db";
import { totp } from "@/server/auth/totp";
import { DEMO_TOTP_SECRET } from "@/server/seed";

/** Demo helper for reviewers. Only exists when DEMO_MODE=true; never enable it in production. */
export const GET = handler({ summary: "DEMO_MODE only: seeded demo accounts and the current demo 2FA code", access: { kind: "public", rateLimit: "publicReadPerIp" } }, async () => {
  if (!isDemoMode()) throw notFound();
  const users = await prisma.user.findMany({
    where: { active: true, email: { endsWith: ".example.com" } },
    select: { email: true, name: true, platformRole: true, twoFactor: true },
    orderBy: { createdAt: "asc" },
  });
  return { users, password: process.env.SEED_DEMO_PASSWORD ?? "Demo-Passw0rd-2026", totpCode: totp(DEMO_TOTP_SECRET), totpSecret: DEMO_TOTP_SECRET };
});
