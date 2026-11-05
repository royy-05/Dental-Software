import { z } from "zod";
import { withPlatform, withTenant } from "./db";
import { ApiError, notFound } from "./errors";
import { verifyManageToken } from "./links";
import { dbToWall } from "./mappers";
import { publishedFlow } from "./services/booking";
import { loadClinic } from "./services/clinic";
import { fromWall, nowInZone } from "@/lib/time";

/** Shared pieces of the public (patient-facing) routes. Kept out of route files: Next.js only allows HTTP exports there. */
export const slugParams = z.object({ slug: z.string().regex(/^[a-z0-9-]{3,80}$/) });
export const tokenParams = z.object({ token: z.string().min(20).max(400) });

/** Resolve a signed link to its clinic and appointment, rejecting stale versions. */
export async function resolveManageToken(token: string) {
  const v = verifyManageToken(token);
  if (!v.ok) throw new ApiError(v.reason === "expired" ? 410 : 404, "link_invalid", v.reason === "expired" ? "This link has expired. Please contact the clinic." : "This link is not valid.");
  const row = await withPlatform((tx) => tx.appointment.findUnique({ where: { id: v.payload.appointmentId }, select: { id: true, clinicId: true, version: true } }));
  if (!row) throw notFound("Appointment");
  if (row.version !== v.payload.version) throw new ApiError(410, "link_stale", "This link is out of date. Please use the link in your most recent message.");
  return { appointmentId: row.id, clinicId: row.clinicId };
}

/** The cancellation window applies to patient-initiated changes (section 3 "within the clinic's cancellation window"). */
export async function assertInsideWindow(clinicId: string, appointmentId: string) {
  await withTenant(clinicId, async (tx) => {
    const [row, clinic, flow] = await Promise.all([tx.appointment.findUniqueOrThrow({ where: { id: appointmentId }, select: { start: true, status: true } }), loadClinic(tx, clinicId), publishedFlow(tx, clinicId)]);
    if (!["unconfirmed", "confirmed"].includes(row.status)) throw new ApiError(409, "not_active", "This appointment can no longer be changed online.");
    const hours = (fromWall(dbToWall(row.start)).getTime() - nowInZone(clinic.timeZone).getTime()) / 3600000;
    const windowH = flow?.rules.cancellationWindowHours ?? 24;
    if (hours < windowH) throw new ApiError(409, "outside_window", `Online changes close ${windowH} hours before your visit. Please call the clinic.`);
  });
}
