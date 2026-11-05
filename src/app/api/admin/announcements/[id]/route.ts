import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { notFound } from "@/server/errors";
import { toAnnouncement } from "@/server/mappers";
import { zId } from "@/lib/schemas";

export const PATCH = handler({ summary: "Turn an announcement on or off", access: { kind: "platform", permission: "admin:support" }, params: z.object({ id: zId }), body: z.object({ active: z.boolean() }) }, async ({ params, body }) =>
  withPlatform(async (tx) => {
    const a = await tx.announcement.findUnique({ where: { id: params.id } });
    if (!a) throw notFound("Announcement");
    return toAnnouncement(await tx.announcement.update({ where: { id: a.id }, data: { active: body.active } }));
  }),
);
