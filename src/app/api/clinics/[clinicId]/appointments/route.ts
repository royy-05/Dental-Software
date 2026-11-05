import { z } from "zod";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { appointmentListInclude, toAppointment } from "@/server/mappers";
import { listQuery, windowFor } from "@/server/services/appointments";
import { createBooking } from "@/server/services/booking";
import { enqueueMessages } from "@/server/jobs/queue";
import { zBookingBody } from "@/lib/schemas";

export const GET = handler({ summary: "Appointments in a date window (list and calendar); detail rows carry patient, insurance, attribution and consent", access: { kind: "clinic", permission: "appointments:view" }, query: listQuery }, async ({ clinicId, query }) =>
  withTenant(clinicId, async (tx) =>
    (await tx.appointment.findMany({ where: { start: windowFor(query), status: query.status, providerId: query.providerId }, include: appointmentListInclude, orderBy: { start: "desc" }, take: query.limit })).map((a) => toAppointment(a)),
  ),
);

const staffBody = zBookingBody.omit({ website: true, holdId: true, sessionId: true, referrerId: true, utm: true, gclid: true, fbclid: true }).extend({ status: z.enum(["confirmed", "unconfirmed"]).default("confirmed") });

/** Manual booking by staff for phone-in patients (5.2). Ignores min notice, booking window, daily cap and online visibility. */
export const POST = handler({ summary: "Manual (phone-in) booking by staff", access: { kind: "clinic", permission: "appointments:manage" }, body: staffBody }, async ({ clinicId, body, actor }) => {
  const r = await withTenant(clinicId, (tx) => createBooking(tx, clinicId, { ...body, source: "staff", utm: {}, bookedBy: "staff", consent: { ip: "staff-entered" } }, actor));
  await enqueueMessages(r.jobs);
  return r.appointment;
});
