import { z } from "zod";
import { handler } from "@/server/http";
import { prisma, withPlatform } from "@/server/db";
import { audit } from "@/server/audit";
import { zName } from "@/lib/schemas";

export const GET = handler({ summary: "Master insurance carrier list", access: { kind: "platform", permission: "admin:access" } }, async () => prisma.insuranceCarrier.findMany({ orderBy: { name: "asc" } }));

export const POST = handler({ summary: "Add a master carrier", access: { kind: "platform", permission: "admin:libraries:edit" }, body: z.object({ name: zName(120) }) }, async ({ body, actor }) =>
  withPlatform(async (tx) => {
    const c = await tx.insuranceCarrier.create({ data: { id: `ins_${body.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40)}_${Date.now().toString(36)}`, name: body.name } });
    await audit(tx, actor, { action: "Added insurance carrier", category: "settings", target: c.name });
    return c;
  }),
);
