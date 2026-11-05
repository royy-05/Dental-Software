import { z } from "zod";
import { handler, idParams } from "@/server/http";
import { withTenant } from "@/server/db";
import { rescheduleBooking } from "@/server/services/booking";
import { enqueueMessages } from "@/server/jobs/queue";
import { zId, zWall } from "@/lib/schemas";

export const POST = handler({ summary: "Reschedule by staff (ignores notice and window; respects hours, rooms and existing bookings)", access: { kind: "clinic", permission: "appointments:manage" }, params: idParams("id"), body: z.object({ start: zWall, providerId: zId }) }, async ({ clinicId, params, body, actor }) => {
  const r = await withTenant(clinicId, (tx) => rescheduleBooking(tx, clinicId, params.id, { ...body, by: "staff" }, actor));
  await enqueueMessages(r.jobs);
  return r.appointment;
});
