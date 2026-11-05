import { z } from "zod";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { rollbackFlow } from "@/server/services/flow";

export const POST = handler({ summary: "Roll back: re-publish an earlier version as a new version", access: { kind: "clinic", permission: "settings:manage" }, body: z.object({ version: z.number().int().min(1) }) }, async ({ clinicId, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    const r = await rollbackFlow(tx, clinicId, body.version, actor.name);
    await audit(tx, actor, { action: `Rolled back booking flow to v${body.version} (now v${r.version})`, category: "settings", target: "Booking flow", clinicId });
    return r.flow;
  }),
);
