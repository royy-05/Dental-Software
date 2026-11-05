import { z } from "zod";
import { handler } from "@/server/http";
import { prisma, withPlatform } from "@/server/db";
import { audit } from "@/server/audit";
import { json, toAnnouncement } from "@/server/mappers";
import { zId, zText } from "@/lib/schemas";

export const GET = handler({ summary: "Announcement banners", access: { kind: "platform", permission: "admin:support" } }, async () => (await prisma.announcement.findMany({ orderBy: { createdAt: "desc" } })).map(toAnnouncement));

export const POST = handler({ summary: "Post an announcement banner to all or selected clinics", access: { kind: "platform", permission: "admin:support" }, body: z.object({ message: z.string().trim().min(3).max(500), clinicIds: z.union([z.literal("all"), z.array(zId).max(500)]), tone: z.enum(["info", "warning"]).default("info") }) }, async ({ body, actor }) =>
  withPlatform(async (tx) => {
    const a = await tx.announcement.create({ data: { message: body.message, clinicIds: json(body.clinicIds), tone: body.tone } });
    await audit(tx, actor, { action: "Posted announcement", category: "settings", target: zText(60).parse(body.message.slice(0, 60)) });
    return toAnnouncement(a);
  }),
);
