import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { audit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { toInvoice } from "@/server/mappers";
import { zId } from "@/lib/schemas";

export const PATCH = handler({ summary: "Set invoice status (paid, open, overdue, void)", access: { kind: "platform", permission: "admin:billing" }, params: z.object({ id: zId }), body: z.object({ status: z.enum(["paid", "open", "overdue", "void"]) }) }, async ({ params, body, actor }) =>
  withPlatform(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id: params.id } });
    if (!inv) throw notFound("Invoice");
    const row = await tx.invoice.update({ where: { id: inv.id }, data: { status: body.status } });
    await audit(tx, actor, { action: body.status === "paid" ? "Marked invoice paid" : `Set invoice ${body.status}`, category: "billing", target: inv.number, clinicId: inv.clinicId });
    return toInvoice(row);
  }),
);
