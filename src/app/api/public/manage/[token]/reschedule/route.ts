import { z } from "zod";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { patientActor } from "@/server/audit";
import { rescheduleBooking, tokenFor } from "@/server/services/booking";
import { loadClinic } from "@/server/services/clinic";
import { enqueueMessages } from "@/server/jobs/queue";
import { zId, zWall } from "@/lib/schemas";
import { assertInsideWindow, resolveManageToken, tokenParams } from "@/server/public-params";

export const POST = handler({ summary: "Patient reschedules from a signed link (inside the cancellation window; link version is bumped)", access: { kind: "public", rateLimit: "manageLinkPerIp" }, params: tokenParams, body: z.object({ start: zWall, providerId: zId }) }, async ({ params, body, ip }) => {
  const { appointmentId, clinicId } = await resolveManageToken(params.token);
  await assertInsideWindow(clinicId, appointmentId);
  const result = await withTenant(clinicId, (tx) => rescheduleBooking(tx, clinicId, appointmentId, { ...body, by: "patient" }, patientActor(ip, "Patient (reschedule link)")));
  await enqueueMessages(result.jobs);
  const a = result.appointment;
  const clinic = await withTenant(clinicId, (tx) => loadClinic(tx, clinicId));
  return { ok: true, token: tokenFor(clinic, { id: a.id, version: a.version ?? 1, start: new Date(`${a.start}:00.000Z`) }), start: a.start, end: a.end, providerId: a.providerId, status: a.status };
});
