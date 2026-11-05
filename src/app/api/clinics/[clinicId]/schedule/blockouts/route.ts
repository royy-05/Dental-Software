import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { toBlockout } from "@/server/mappers";
import { addBlockout } from "@/server/services/config";
import { zBlockout } from "@/lib/schemas";

export const POST = handler({ summary: "Add a blockout (whole clinic, one provider or one room)", access: { kind: "clinic", permission: "schedule:manage" }, body: zBlockout }, async ({ clinicId, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    const b = await addBlockout(tx, clinicId, body);
    await audit(tx, actor, { action: `Added blockout “${body.label}”`, category: "settings", target: "Schedule", clinicId });
    return toBlockout(b);
  }),
);
