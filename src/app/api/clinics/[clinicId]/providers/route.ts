import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { createProvider, listProviders } from "@/server/services/config";
import { zProviderBody } from "@/lib/schemas";

export const GET = handler({ summary: "Providers with hours, breaks, time off and links", access: { kind: "clinic", permission: "appointments:view" } }, async ({ clinicId }) => withTenant(clinicId, listProviders));

export const POST = handler({ summary: "Add a provider", access: { kind: "clinic", permission: "providers:manage" }, body: zProviderBody }, async ({ clinicId, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    const p = await createProvider(tx, clinicId, body);
    await audit(tx, actor, { action: `Added provider ${p.displayName}`, category: "settings", target: "Providers", clinicId });
    return p;
  }),
);
