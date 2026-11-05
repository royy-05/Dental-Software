import { z } from "zod";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { toNotification } from "@/server/mappers";
import { zId } from "@/lib/schemas";

export const GET = handler({ summary: "Latest 30 notifications for the bell", access: { kind: "clinic", permission: "clinic:home" } }, async ({ clinicId }) =>
  withTenant(clinicId, async (tx) => (await tx.notification.findMany({ orderBy: { at: "desc" }, take: 30 })).map(toNotification)),
);

export const POST = handler(
  { summary: "Mark notifications read (ids, or all)", access: { kind: "clinic", permission: "clinic:home" }, body: z.object({ ids: z.array(zId).max(100).optional(), all: z.boolean().optional() }) },
  async ({ clinicId, body }) =>
    withTenant(clinicId, async (tx) => {
      const r = await tx.notification.updateMany({ where: body.all ? { read: false } : { id: { in: body.ids ?? [] } }, data: { read: true } });
      return { updated: r.count };
    }),
);
