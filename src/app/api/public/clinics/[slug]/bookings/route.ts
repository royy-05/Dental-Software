import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { badRequest } from "@/server/errors";
import { patientActor } from "@/server/audit";
import { userAgent } from "@/server/request";
import { createBooking } from "@/server/services/booking";
import { resolveClinicSlug } from "@/server/services/public";
import { enqueueMessages } from "@/server/jobs/queue";
import { zBookingBody } from "@/lib/schemas";
import { slugParams } from "@/server/public-params";

/**
 * Patient booking (section 3). Abuse protection (section 8): per-IP rate limit, a honeypot field, and the
 * server re-validates the slot under the booking lock. Source, referrer, UTM tags and click ids are stored on
 * the appointment; the SMS consent record carries the Terms version, timestamp and IP.
 */
export const POST = handler({ summary: "Book an appointment from the widget (rate limited, honeypot, slot re-checked under lock)", access: { kind: "public", rateLimit: "publicBookingPerIp" }, params: slugParams, body: zBookingBody }, async ({ params, body, ip, req }) => {
  if (body.website) throw badRequest("Could not complete the booking.");
  const clinicId = await resolveClinicSlug(params.slug);
  const referrer = body.referrerId ? await withTenant(clinicId, (tx) => tx.referrer.findUnique({ where: { clinicId_publicId: { clinicId, publicId: Number(body.referrerId) } } })) : null;
  const { website: _hp, ...rest } = body;
  const result = await withTenant(clinicId, (tx) =>
    createBooking(
      tx,
      clinicId,
      {
        ...rest,
        source: referrer ? (referrer.sourceType as "google_ads") : "direct",
        referrerId: referrer ? String(referrer.publicId) : undefined,
        bookedBy: "patient",
        consent: { ip, userAgent: userAgent(req.headers) },
      },
      patientActor(ip),
    ),
  );
  await enqueueMessages(result.jobs);
  const a = result.appointment;
  return { id: a.id, token: a.token, start: a.start, end: a.end, providerId: a.providerId, reasonId: a.reasonId, status: a.status };
});
