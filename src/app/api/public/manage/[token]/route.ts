import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { resolveManageToken, tokenParams } from "@/server/public-params";
import { appointmentInclude, providerInclude, reasonInclude, toAppointment, toProvider, toReason } from "@/server/mappers";
import { publicBundle } from "@/server/services/public";
import { publishedFlow, tokenFor } from "@/server/services/booking";
import { loadClinic } from "@/server/services/clinic";

export const GET = handler({ summary: "Patient view of an appointment from a signed link (confirmation and manage pages)", access: { kind: "public", rateLimit: "manageLinkPerIp" }, params: tokenParams }, async ({ params }) => {
  const { appointmentId, clinicId } = await resolveManageToken(params.token);
  return withTenant(clinicId, async (tx) => {
    const [row, bundle, clinic, flow] = await Promise.all([
      tx.appointment.findUniqueOrThrow({ where: { id: appointmentId }, include: appointmentInclude }),
      publicBundle(tx, clinicId),
      loadClinic(tx, clinicId),
      publishedFlow(tx, clinicId),
    ]);
    const [reason, provider] = await Promise.all([
      tx.reason.findUnique({ where: { id: row.reasonId }, include: reasonInclude }),
      tx.provider.findUnique({ where: { id: row.providerId }, include: providerInclude }),
    ]);
    const appointment = toAppointment(row, tokenFor(clinic, row));
    return {
      clinic: bundle.clinic,
      platform: bundle.platform,
      referrers: bundle.referrers,
      appointment,
      reason: reason ? toReason(reason) : null,
      provider: provider ? toProvider(provider) : null,
      rules: { cancellationWindowHours: flow?.rules.cancellationWindowHours ?? 24, bookingWindowDays: flow?.rules.bookingWindowDays ?? 60 },
    };
  });
});
