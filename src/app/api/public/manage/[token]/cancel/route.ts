import { z } from "zod";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { patientActor } from "@/server/audit";
import { setAppointmentStatus } from "@/server/services/booking";
import { enqueueMessages } from "@/server/jobs/queue";
import { zText } from "@/lib/schemas";
import { assertInsideWindow, resolveManageToken, tokenParams } from "@/server/public-params";

export const POST = handler({ summary: "Patient cancels from a signed link (inside the cancellation window)", access: { kind: "public", rateLimit: "manageLinkPerIp" }, params: tokenParams, body: z.object({ note: zText(1000).optional() }) }, async ({ params, body, ip }) => {
  const { appointmentId, clinicId } = await resolveManageToken(params.token);
  await assertInsideWindow(clinicId, appointmentId);
  const result = await withTenant(clinicId, (tx) => setAppointmentStatus(tx, clinicId, appointmentId, { status: "cancelled", note: body.note, by: "Patient (cancel link)" }, patientActor(ip, "Patient (cancel link)")));
  await enqueueMessages(result.jobs);
  return { ok: true, status: result.appointment.status };
});
