import { z } from "zod";
import { handler, idParams } from "@/server/http";
import { withTenant } from "@/server/db";
import { notFound } from "@/server/errors";
import { toTicket } from "@/server/mappers";

/** A clinic reply reopens a pending, resolved or closed ticket (docs/assumptions.md). */
export const POST = handler({ summary: "Reply to a ticket (reopens it)", access: { kind: "clinic", permission: "support:raise" }, params: idParams("id"), body: z.object({ body: z.string().trim().min(1).max(5000) }) }, async ({ clinicId, params, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    const t = await tx.ticket.findUnique({ where: { id: params.id } });
    if (!t) throw notFound("Ticket");
    const row = await tx.ticket.update({ where: { id: t.id }, data: { status: "open", messages: { create: { clinicId, authorName: actor.name, authorRole: actor.role, body: body.body } } }, include: { messages: true } });
    return toTicket(row);
  }),
);
