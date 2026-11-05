import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { cloneClinicSettings } from "@/server/services/admin";
import { zId } from "@/lib/schemas";

export const POST = handler({ summary: "Clone branding, hours, settings and the published booking flow from another clinic", access: { kind: "platform", permission: "admin:clinics:edit" }, params: z.object({ id: zId }), body: z.object({ fromId: zId }) }, async ({ params, body, actor }) => {
  await withPlatform((tx) => cloneClinicSettings(tx, body.fromId, params.id, actor));
  return { ok: true };
});
