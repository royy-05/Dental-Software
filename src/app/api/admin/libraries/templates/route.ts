import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { toTemplate } from "@/server/mappers";

export const GET = handler({ summary: "Global default email and SMS templates", access: { kind: "platform", permission: "admin:access" } }, async () =>
  withPlatform(async (tx) => (await tx.messageTemplate.findMany({ where: { clinicId: null }, orderBy: [{ event: "asc" }, { channel: "asc" }] })).map(toTemplate)),
);
