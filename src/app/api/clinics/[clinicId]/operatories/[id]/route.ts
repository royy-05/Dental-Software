import { handler, idParams } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { deleteOperatory, updateOperatory } from "@/server/services/config";
import { zOperatoryBody } from "@/lib/schemas";

const params = idParams("id");

export const PATCH = handler({ summary: "Edit an operatory and its links", access: { kind: "clinic", permission: "schedule:manage" }, params, body: zOperatoryBody.partial() }, async ({ clinicId, params, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    const o = await updateOperatory(tx, clinicId, params.id, body);
    const keys = Object.keys(body);
    await audit(tx, actor, { action: keys.length === 1 && keys[0] === "active" ? `${o.active ? "Activated" : "Deactivated"} operatory ${o.name}` : `Edited operatory ${o.name}`, category: "settings", target: "Operatories", clinicId });
    return o;
  }),
);

export const DELETE = handler({ summary: "Delete an operatory (refused while it has upcoming appointments)", access: { kind: "clinic", permission: "schedule:manage" }, params }, async ({ clinicId, params, actor }) =>
  withTenant(clinicId, async (tx) => {
    const o = await deleteOperatory(tx, params.id);
    await audit(tx, actor, { action: `Deleted operatory ${o.name}`, category: "settings", target: "Operatories", clinicId });
    return { ok: true };
  }),
);
