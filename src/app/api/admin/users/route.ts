import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { toUser } from "@/server/mappers";
import { invitePlatformUser } from "@/server/auth/accounts";
import { zEmail, zName } from "@/lib/schemas";

export const GET = handler({ summary: "All users across clinics plus the platform team (role, clinics, last login, 2FA)", access: { kind: "platform", permission: "admin:users:view" } }, async () =>
  withPlatform(async (tx) => (await tx.user.findMany({ include: { memberships: true }, orderBy: { name: "asc" } })).map(toUser)),
);

export const POST = handler({ summary: "Invite a platform user (Super Admin or Support Agent); 2FA is required at first sign-in", access: { kind: "platform", permission: "admin:users:edit" }, body: z.object({ name: zName(), email: zEmail, role: z.enum(["super_admin", "support_agent"]) }) }, async ({ body, actor }) =>
  withPlatform((tx) => invitePlatformUser(tx, actor, body)),
);
