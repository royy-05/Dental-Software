import { z } from "zod";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { listReasons, reorderReasons } from "@/server/services/config";
import { zId } from "@/lib/schemas";

export const POST = handler({ summary: "Set the display order of every reason", access: { kind: "clinic", permission: "reasons:manage" }, body: z.object({ ids: z.array(zId).min(1).max(500) }) }, async ({ clinicId, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    await reorderReasons(tx, body.ids);
    await audit(tx, actor, { action: "Reordered reasons for visit", category: "settings", target: "Reasons", clinicId });
    return listReasons(tx);
  }),
);
