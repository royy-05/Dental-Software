import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { toOptOut } from "@/server/mappers";

export const GET = handler({ summary: "Bounce and opt-out lists across clinics", access: { kind: "platform", permission: "admin:messaging:view" } }, async () =>
  withPlatform(async (tx) => (await tx.optOut.findMany({ orderBy: { at: "desc" }, take: 1000 })).map(toOptOut)),
);
