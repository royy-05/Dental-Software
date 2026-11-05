import { z } from "zod";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { availabilityMap } from "@/server/services/booking";
import { zDay, zId } from "@/lib/schemas";
import { fromDayKey } from "@/lib/time";
import { resolveManageToken, tokenParams } from "@/server/public-params";

export const GET = handler({ summary: "Day availability for a patient reschedule", access: { kind: "public", rateLimit: "manageLinkPerIp" }, params: tokenParams, query: z.object({ from: zDay, days: z.coerce.number().int().min(1).max(62).default(42), providerId: zId.optional() }) }, async ({ params, query }) => {
  const { appointmentId, clinicId } = await resolveManageToken(params.token);
  return withTenant(clinicId, async (tx) => {
    const a = await tx.appointment.findUniqueOrThrow({ where: { id: appointmentId }, select: { reasonId: true } });
    return availabilityMap(tx, clinicId, a.reasonId, fromDayKey(query.from), query.days, { providerId: query.providerId, ignoreAppointmentId: appointmentId });
  });
});
