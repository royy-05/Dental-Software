import { z } from "zod";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { toMessageLog } from "@/server/mappers";
import { zId } from "@/lib/schemas";

const query = z.object({ appointmentId: zId.optional(), channel: z.enum(["email", "sms"]).optional(), status: z.string().max(20).optional(), to: z.string().max(64).optional(), limit: z.coerce.number().int().min(1).max(500).default(200) });

export const GET = handler({ summary: "Delivery log (newest first); filter by appointment, channel, status or recipient", access: { kind: "clinic", permission: "appointments:view" }, query }, async ({ clinicId, query }) =>
  withTenant(clinicId, async (tx) =>
    (await tx.messageLog.findMany({ where: { appointmentId: query.appointmentId, channel: query.channel, status: query.status, to: query.to }, orderBy: { createdAt: "desc" }, take: query.limit })).map(toMessageLog),
  ),
);
