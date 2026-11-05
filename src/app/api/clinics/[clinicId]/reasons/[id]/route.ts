import { handler, idParams } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { deleteReason, updateReason } from "@/server/services/config";
import { zReasonBody } from "@/lib/schemas";

const params = idParams("id");

export const PATCH = handler({ summary: "Edit a reason (any subset of fields; links replace the stored links)", access: { kind: "clinic", permission: "reasons:manage" }, params, body: zReasonBody.partial() }, async ({ clinicId, params, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    const r = await updateReason(tx, clinicId, params.id, body);
    const only = Object.keys(body);
    const action = only.length === 1 && only[0] === "active" ? `${body.active ? "Activated" : "Deactivated"} reason “${r.name}”` : only.length === 1 && only[0] === "questions" ? `Edited questions for “${r.name}”` : `Edited reason “${r.name}”`;
    await audit(tx, actor, { action, category: "settings", target: "Reasons", clinicId });
    return r;
  }),
);

export const DELETE = handler({ summary: "Delete a reason (refused while it has upcoming appointments)", access: { kind: "clinic", permission: "reasons:manage" }, params }, async ({ clinicId, params, actor }) =>
  withTenant(clinicId, async (tx) => {
    const r = await deleteReason(tx, params.id);
    await audit(tx, actor, { action: `Deleted reason “${r.name}”`, category: "settings", target: "Reasons", clinicId });
    return { ok: true };
  }),
);
