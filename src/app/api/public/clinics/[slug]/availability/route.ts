import { z } from "zod";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { availabilityMap } from "@/server/services/booking";
import { resolveClinicSlug } from "@/server/services/public";
import { zDay, zId, zSessionId } from "@/lib/schemas";
import { fromDayKey } from "@/lib/time";
import { slugParams } from "@/server/public-params";

const query = z.object({ reasonId: zId, from: zDay, days: z.coerce.number().int().min(1).max(62).default(42), providerId: zId.optional(), sessionId: zSessionId.optional() });

export const GET = handler({ summary: "Bookable slot counts per day for the month calendar", access: { kind: "public", rateLimit: "publicReadPerIp" }, params: slugParams, query }, async ({ params, query }) => {
  const clinicId = await resolveClinicSlug(params.slug);
  return withTenant(clinicId, (tx) => availabilityMap(tx, clinicId, query.reasonId, fromDayKey(query.from), query.days, { providerId: query.providerId, sessionId: query.sessionId }));
});
