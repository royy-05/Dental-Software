import { z } from "zod";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { createHold, releaseHold } from "@/server/services/booking";
import { resolveClinicSlug } from "@/server/services/public";
import { zId, zSessionId, zWall } from "@/lib/schemas";
import { slugParams } from "@/server/public-params";

export const POST = handler(
  { summary: "Hold a slot for 5 minutes during checkout (replaces the session's earlier hold)", access: { kind: "public", rateLimit: "publicHoldPerIp" }, params: slugParams, body: z.object({ reasonId: zId, start: zWall, providerId: zId, sessionId: zSessionId }) },
  async ({ params, body }) => {
    const clinicId = await resolveClinicSlug(params.slug);
    return withTenant(clinicId, (tx) => createHold(tx, clinicId, body));
  },
);

export const DELETE = handler(
  { summary: "Release a hold early", access: { kind: "public", rateLimit: "publicHoldPerIp" }, params: slugParams, body: z.object({ holdId: zId, sessionId: zSessionId }) },
  async ({ params, body }) => {
    const clinicId = await resolveClinicSlug(params.slug);
    await withTenant(clinicId, (tx) => releaseHold(tx, body.holdId, body.sessionId));
    return { ok: true };
  },
);
