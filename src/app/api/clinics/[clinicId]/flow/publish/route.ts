import { z } from "zod";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { publishFlow } from "@/server/services/flow";
import { zFlowConfig, zText } from "@/lib/schemas";

export const POST = handler({ summary: "Publish a config as a new live version", access: { kind: "clinic", permission: "settings:manage" }, body: z.object({ config: zFlowConfig, note: zText(300).default("") }) }, async ({ clinicId, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    const r = await publishFlow(tx, clinicId, body.config, actor.name, body.note);
    await audit(tx, actor, { action: `Published booking flow v${r.version}`, category: "settings", target: "Booking flow", clinicId, details: body.note || undefined });
    return r.flow;
  }),
);
