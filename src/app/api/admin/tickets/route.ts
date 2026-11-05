import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { toTicket } from "@/server/mappers";

export const GET = handler({ summary: "Support desk: every clinic's tickets with replies", access: { kind: "platform", permission: "admin:support" } }, async () =>
  withPlatform(async (tx) => (await tx.ticket.findMany({ include: { messages: true }, orderBy: { createdAt: "desc" } })).map(toTicket)),
);
