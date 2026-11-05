import { z } from "zod";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { deleteReferrer, updateReferrer } from "@/server/services/config";
import { zId, zReferrerBody } from "@/lib/schemas";

const params = z.object({ clinicId: zId, id: z.coerce.number().int().min(1).max(999_999_999) });

export const PATCH = handler({ summary: "Edit a referrer", access: { kind: "clinic", permission: "settings:manage" }, params, body: zReferrerBody.partial() }, async ({ clinicId, params, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    const r = await updateReferrer(tx, clinicId, params.id, body);
    await audit(tx, actor, { action: "Edited referrer", category: "settings", target: `${r.name} (ID ${r.id})`, clinicId });
    return r;
  }),
);

export const DELETE = handler({ summary: "Delete a referrer (past bookings keep their source)", access: { kind: "clinic", permission: "settings:manage" }, params }, async ({ clinicId, params, actor }) =>
  withTenant(clinicId, async (tx) => {
    const r = await deleteReferrer(tx, clinicId, params.id);
    await audit(tx, actor, { action: "Deleted referrer", category: "settings", target: `${r.name} (ID ${r.publicId})`, clinicId });
    return { ok: true };
  }),
);
