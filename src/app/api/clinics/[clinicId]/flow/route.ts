import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { loadFlow, saveDraft } from "@/server/services/flow";
import { zFlowConfig } from "@/lib/schemas";

export const GET = handler({ summary: "Booking flow: draft, published config, versions", access: { kind: "clinic", permission: "settings:manage" } }, async ({ clinicId }) => withTenant(clinicId, (tx) => loadFlow(tx, clinicId)));

export const PUT = handler({ summary: "Save the builder draft (not live until published)", access: { kind: "clinic", permission: "settings:manage" }, body: zFlowConfig }, async ({ clinicId, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    const f = await saveDraft(tx, clinicId, body);
    await audit(tx, actor, { action: "Saved booking flow draft", category: "settings", target: "Booking flow", clinicId });
    return f;
  }),
);
