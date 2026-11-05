import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { createOperatory, listOperatories } from "@/server/services/config";
import { zOperatoryBody } from "@/lib/schemas";

export const GET = handler({ summary: "Operatories (rooms or chairs) with linked providers and reasons", access: { kind: "clinic", permission: "appointments:view" } }, async ({ clinicId }) => withTenant(clinicId, listOperatories));

export const POST = handler({ summary: "Add an operatory", access: { kind: "clinic", permission: "schedule:manage" }, body: zOperatoryBody }, async ({ clinicId, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    const o = await createOperatory(tx, clinicId, body);
    await audit(tx, actor, { action: `Added operatory ${o.name}`, category: "settings", target: "Operatories", clinicId });
    return o;
  }),
);
