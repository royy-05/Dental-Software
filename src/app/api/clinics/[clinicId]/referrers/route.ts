import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { createReferrer, listReferrers } from "@/server/services/config";
import { zReferrerBody } from "@/lib/schemas";

export const GET = handler({ summary: "Referrers (tracked booking links)", access: { kind: "clinic", permission: "appointments:view" } }, async ({ clinicId }) => withTenant(clinicId, listReferrers));

export const POST = handler({ summary: "Add a referrer; the server assigns the next numeric id", access: { kind: "clinic", permission: "settings:manage" }, body: zReferrerBody }, async ({ clinicId, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    const r = await createReferrer(tx, clinicId, body);
    await audit(tx, actor, { action: "Added referrer", category: "settings", target: `${r.name} (ID ${r.id})`, clinicId });
    return r;
  }),
);
