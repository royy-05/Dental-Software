import { z } from "zod";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { slotsForDay } from "@/server/services/booking";
import { resolveClinicSlug } from "@/server/services/public";
import { zDay, zId, zSessionId } from "@/lib/schemas";
import { fromDayKey } from "@/lib/time";
import { slugParams } from "@/server/public-params";

const query = z.object({ reasonId: zId, date: zDay, providerId: zId.optional(), sessionId: zSessionId.optional() });

export const GET = handler({ summary: "Bookable slots for one day (first available per time unless a provider is given)", access: { kind: "public", rateLimit: "publicReadPerIp" }, params: slugParams, query }, async ({ params, query }) => {
  const clinicId = await resolveClinicSlug(params.slug);
  return withTenant(clinicId, (tx) => slotsForDay(tx, clinicId, query.reasonId, fromDayKey(query.date), { providerId: query.providerId, sessionId: query.sessionId }));
});
