import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { toOptOut } from "@/server/mappers";

export const GET = handler({ summary: "SMS opt-outs and email bounces for this clinic", access: { kind: "clinic", permission: "appointments:view" } }, async ({ clinicId }) =>
  withTenant(clinicId, async (tx) => (await tx.optOut.findMany({ orderBy: { at: "desc" } })).map(toOptOut)),
);
