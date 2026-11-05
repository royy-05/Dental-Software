import { z } from "zod";
import { handler } from "@/server/http";
import { prisma, withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { draftFromStarter } from "@/server/services/flow";
import { toStarterTemplate } from "@/server/mappers";
import { zId } from "@/lib/schemas";

export const GET = handler({ summary: "Published starter templates clinics can copy", access: { kind: "clinic", permission: "settings:manage" } }, async () =>
  (await prisma.starterTemplate.findMany({ where: { published: true }, orderBy: { name: "asc" } })).map(toStarterTemplate),
);

export const POST = handler({ summary: "Replace the draft with a starter template (keeps the accepting-patients setting)", access: { kind: "clinic", permission: "settings:manage" }, body: z.object({ templateId: zId }) }, async ({ clinicId, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    const f = await draftFromStarter(tx, clinicId, body.templateId);
    await audit(tx, actor, { action: "Applied starter template to booking flow draft", category: "settings", target: "Booking flow", clinicId });
    return f;
  }),
);
