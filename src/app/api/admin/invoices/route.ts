import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { audit } from "@/server/audit";
import { toInvoice } from "@/server/mappers";
import { zId } from "@/lib/schemas";

export const GET = handler({ summary: "Invoices across clinics", access: { kind: "platform", permission: "admin:billing" } }, async () =>
  withPlatform(async (tx) => (await tx.invoice.findMany({ orderBy: { issuedAt: "desc" } })).map(toInvoice)),
);

export const POST = handler({ summary: "Create a manual invoice (manual billing until Stripe)", access: { kind: "platform", permission: "admin:billing" }, body: z.object({ clinicId: zId, amount: z.number().int().min(1).max(1_000_000), dueInDays: z.number().int().min(1).max(90).default(14) }) }, async ({ body, actor }) =>
  withPlatform(async (tx) => {
    const count = await tx.invoice.count();
    const now = new Date();
    const inv = await tx.invoice.create({ data: { clinicId: body.clinicId, number: `INV-${now.getFullYear()}-${String(count + 1).padStart(4, "0")}`, amount: body.amount, issuedAt: now, dueAt: new Date(now.getTime() + body.dueInDays * 86400000), status: "open" } });
    await audit(tx, actor, { action: "Created manual invoice", category: "billing", target: inv.number, clinicId: body.clinicId });
    return toInvoice(inv);
  }),
);
