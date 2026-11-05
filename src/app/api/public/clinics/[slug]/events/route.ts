import { z } from "zod";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { resolveClinicSlug } from "@/server/services/public";
import { recordWidgetEvents } from "@/server/services/analytics";
import { zId, zSessionId, zSource, zStepKey } from "@/lib/schemas";
import { slugParams } from "@/server/public-params";

const body = z.object({
  sessionId: zSessionId,
  events: z
    .array(z.object({ name: z.enum(["widget_opened", "step_viewed", "reason_selected", "provider_selected", "slot_selected", "details_submitted", "booking_completed"]), step: zStepKey.optional(), reasonId: zId.optional(), source: zSource }))
    .min(1)
    .max(50),
});

export const POST = handler({ summary: "Record widget funnel events for Form Analytics (ids and step names only, never PHI)", access: { kind: "public", rateLimit: "publicReadPerIp" }, params: slugParams, body }, async ({ params, body }) => {
  const clinicId = await resolveClinicSlug(params.slug);
  await withTenant(clinicId, (tx) => recordWidgetEvents(tx, clinicId, body.sessionId, body.events));
  return { ok: true };
});
