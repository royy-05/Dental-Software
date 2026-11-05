import { handler, idParams } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { updateProvider } from "@/server/services/config";
import { zProviderBody } from "@/lib/schemas";

export const PATCH = handler({ summary: "Edit a provider (profile, hours, breaks, time off, rooms, reasons offered, online visibility)", access: { kind: "clinic", permission: "providers:manage" }, params: idParams("id"), body: zProviderBody.partial() }, async ({ clinicId, params, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    const p = await updateProvider(tx, clinicId, params.id, body);
    const keys = Object.keys(body);
    const action = keys.length === 1 && keys[0] === "showOnline" ? `${body.showOnline ? "Showed" : "Hid"} ${p.displayName} online` : `Edited provider ${p.displayName}`;
    await audit(tx, actor, { action, category: "settings", target: "Providers", clinicId });
    return p;
  }),
);
