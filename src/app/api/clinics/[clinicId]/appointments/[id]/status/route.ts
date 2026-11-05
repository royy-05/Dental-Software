import { z } from "zod";
import { handler, idParams } from "@/server/http";
import { withTenant } from "@/server/db";
import { setAppointmentStatus } from "@/server/services/booking";
import { enqueueMessages } from "@/server/jobs/queue";
import { zStatus, zText } from "@/lib/schemas";

export const POST = handler({ summary: "Confirm, cancel, decline (reason required), mark complete or no-show; patient is notified for cancel/decline", access: { kind: "clinic", permission: "appointments:manage" }, params: idParams("id"), body: z.object({ status: zStatus, note: zText(1000).optional(), declineReason: zText(1000).optional() }) }, async ({ clinicId, params, body, actor }) => {
  const r = await withTenant(clinicId, (tx) => setAppointmentStatus(tx, clinicId, params.id, body, actor));
  await enqueueMessages(r.jobs);
  return r.appointment;
});
