import { handler, idParams } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { duplicateReason } from "@/server/services/config";

export const POST = handler({ summary: "Duplicate a reason as an inactive copy placed right after it", access: { kind: "clinic", permission: "reasons:manage" }, params: idParams("id") }, async ({ clinicId, params, actor }) =>
  withTenant(clinicId, async (tx) => {
    const r = await duplicateReason(tx, clinicId, params.id);
    await audit(tx, actor, { action: `Duplicated reason “${r.name.replace(/ \(copy\)$/, "")}”`, category: "settings", target: "Reasons", clinicId });
    return r;
  }),
);
