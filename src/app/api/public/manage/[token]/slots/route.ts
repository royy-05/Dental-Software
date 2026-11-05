import { z } from "zod";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { slotsForDay } from "@/server/services/booking";
import { zDay, zId } from "@/lib/schemas";
import { fromDayKey } from "@/lib/time";
import { resolveManageToken, tokenParams } from "@/server/public-params";

export const GET = handler({ summary: "Slots for a patient reschedule (the appointment's own time does not block)", access: { kind: "public", rateLimit: "manageLinkPerIp" }, params: tokenParams, query: z.object({ date: zDay, providerId: zId.optional() }) }, async ({ params, query }) => {
  const { appointmentId, clinicId } = await resolveManageToken(params.token);
  return withTenant(clinicId, async (tx) => {
    const a = await tx.appointment.findUniqueOrThrow({ where: { id: appointmentId }, select: { reasonId: true } });
    return slotsForDay(tx, clinicId, a.reasonId, fromDayKey(query.date), { providerId: query.providerId, ignoreAppointmentId: appointmentId });
  });
});
