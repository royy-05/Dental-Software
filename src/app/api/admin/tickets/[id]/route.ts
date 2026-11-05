import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { notFound } from "@/server/errors";
import { toTicket } from "@/server/mappers";
import { zId, zTicketPriority, zTicketStatus } from "@/lib/schemas";

export const PATCH = handler({ summary: "Assign, prioritise or change the status of a ticket", access: { kind: "platform", permission: "admin:support" }, params: z.object({ id: zId }), body: z.object({ status: zTicketStatus.optional(), priority: zTicketPriority.optional(), assigneeId: zId.nullable().optional() }) }, async ({ params, body }) =>
  withPlatform(async (tx) => {
    const t = await tx.ticket.findUnique({ where: { id: params.id } });
    if (!t) throw notFound("Ticket");
    const row = await tx.ticket.update({ where: { id: t.id }, data: { status: body.status, priority: body.priority, assigneeId: body.assigneeId === undefined ? undefined : body.assigneeId }, include: { messages: true } });
    return toTicket(row);
  }),
);
