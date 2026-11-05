import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { createReason, listReasons } from "@/server/services/config";
import { zReasonBody } from "@/lib/schemas";

export const GET = handler({ summary: "Reasons for visit in display order", access: { kind: "clinic", permission: "appointments:view" } }, async ({ clinicId }) => withTenant(clinicId, listReasons));

export const POST = handler({ summary: "Add a reason for visit (needs at least one provider)", access: { kind: "clinic", permission: "reasons:manage" }, body: zReasonBody }, async ({ clinicId, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    const r = await createReason(tx, clinicId, body);
    await audit(tx, actor, { action: `Added reason “${r.name}”`, category: "settings", target: "Reasons", clinicId });
    return r;
  }),
);
