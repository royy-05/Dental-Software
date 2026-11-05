import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { notFound } from "@/server/errors";
import { toTicket } from "@/server/mappers";
import { zId } from "@/lib/schemas";

/** The first platform reply records the response time (6.10). */
export const POST = handler({ summary: "Reply to a ticket as the platform team (sets first response time; moves to pending)", access: { kind: "platform", permission: "admin:support" }, params: z.object({ id: zId }), body: z.object({ body: z.string().trim().min(1).max(5000), status: z.enum(["open", "pending", "resolved", "closed"]).default("pending") }) }, async ({ params, body, actor }) =>
  withPlatform(async (tx) => {
    const t = await tx.ticket.findUnique({ where: { id: params.id } });
    if (!t) throw notFound("Ticket");
    const row = await tx.ticket.update({
      where: { id: t.id },
      data: { status: body.status, firstResponseAt: t.firstResponseAt ?? new Date(), assigneeId: t.assigneeId ?? actor.id, messages: { create: { clinicId: t.clinicId, authorName: actor.name, authorRole: actor.role, body: body.body } } },
      include: { messages: true },
    });
    return toTicket(row);
  }),
);
