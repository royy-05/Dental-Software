import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { toMessageLog } from "@/server/mappers";

const query = z.object({ clinicId: z.string().max(64).optional(), channel: z.enum(["email", "sms"]).optional(), status: z.string().max(20).optional(), limit: z.coerce.number().int().min(1).max(1000).default(300) });

export const GET = handler({ summary: "Delivery logs across clinics (6.8)", access: { kind: "platform", permission: "admin:messaging:view" }, query }, async ({ query }) =>
  withPlatform(async (tx) => (await tx.messageLog.findMany({ where: { clinicId: query.clinicId, channel: query.channel, status: query.status }, orderBy: { createdAt: "desc" }, take: query.limit })).map(toMessageLog)),
);
