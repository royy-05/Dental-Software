import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { toTicket } from "@/server/mappers";
import { zTicketBody } from "@/lib/schemas";

export const GET = handler({ summary: "This clinic's support tickets with replies", access: { kind: "clinic", permission: "support:raise" } }, async ({ clinicId }) =>
  withTenant(clinicId, async (tx) => (await tx.ticket.findMany({ include: { messages: true }, orderBy: { createdAt: "desc" } })).map(toTicket)),
);

export const POST = handler({ summary: "Raise a ticket (goes to the Super Admin support queue)", access: { kind: "clinic", permission: "support:raise" }, body: zTicketBody }, async ({ clinicId, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    const t = await tx.ticket.create({
      data: {
        clinicId, subject: body.subject, category: body.category, priority: body.priority, status: "open", createdBy: actor.name, screenshotName: body.screenshotName ?? null,
        messages: { create: { clinicId, authorName: actor.name, authorRole: actor.role, body: body.body } },
      },
      include: { messages: true },
    });
    await audit(tx, actor, { action: "Raised support ticket", category: "settings", target: t.subject, clinicId });
    return toTicket(t);
  }),
);
