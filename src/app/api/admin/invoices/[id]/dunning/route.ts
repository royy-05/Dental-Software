import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { audit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { toInvoice } from "@/server/mappers";
import { enqueueMessages } from "@/server/jobs/queue";
import { zId } from "@/lib/schemas";

/** Dunning emails go through the real queue to the clinic's alert email (logged as clinic-bound emails). */
export const POST = handler({ summary: "Send a dunning email for an overdue invoice (queued, logged)", access: { kind: "platform", permission: "admin:billing" }, params: z.object({ id: zId }) }, async ({ params, actor }) => {
  const { invoice, jobs } = await withPlatform(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id: params.id }, include: { clinic: true } });
    if (!inv) throw notFound("Invoice");
    const settings = inv.clinic.settings as { notifications: { clinicAlertEmail: string } };
    const to = settings.notifications.clinicAlertEmail || inv.clinic.email;
    const row = await tx.messageLog.create({
      data: { clinicId: inv.clinicId, channel: "email", direction: "outbound", recipientType: "clinic", to, event: "test", subject: `Payment reminder: invoice ${inv.number}`, body: `Invoice ${inv.number} for $${inv.amount} was due on ${inv.dueAt.toISOString().slice(0, 10)}. Please arrange payment.`, status: "queued" },
    });
    const updated = await tx.invoice.update({ where: { id: inv.id }, data: { dunningEmailsSent: { increment: 1 } } });
    await audit(tx, actor, { action: "Sent dunning email", category: "billing", target: inv.number, clinicId: inv.clinicId });
    return { invoice: toInvoice(updated), jobs: [{ messageId: row.id }] };
  });
  await enqueueMessages(jobs);
  return invoice;
});
