import { z } from "zod";
import { format } from "date-fns";
import { SOURCE_LABELS, STATUS_LABELS } from "@/types";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { appointmentListInclude, toAppointment } from "@/server/mappers";
import { listProviders, listReasons } from "@/server/services/config";
import { filterAppointments, sortAppointments, type ApptFilters } from "@/components/appointments/filter";
import { toCsv, maskText } from "@/lib/utils";
import { listQuery, windowFor } from "@/server/services/appointments";

const query = listQuery.extend({
  tab: z.enum(["appointments", "declined"]).default("appointments"),
  q: z.string().max(100).default(""),
  reasonId: z.string().max(64).optional(),
  source: z.string().max(20).optional(),
  patientType: z.enum(["new", "existing"]).optional(),
  /** Hide PHI switch: the export masks names, phones and emails. */
  hidePhi: z.enum(["1", "0"]).default("0"),
});

/** CSV export with the same filters as the table. Audited as an export (section 8). */
export const GET = handler({ summary: "CSV export of the filtered appointment list (audited; masks PHI when hidePhi=1)", access: { kind: "clinic", permission: "appointments:export" }, query }, async ({ clinicId, query, actor }) =>
  withTenant(clinicId, async (tx) => {
    const [rows, providers, reasons] = await Promise.all([tx.appointment.findMany({ where: { start: windowFor(query) }, include: appointmentListInclude }), listProviders(tx), listReasons(tx)]);
    const f: ApptFilters = { q: query.q, status: query.status ?? "all", providerId: query.providerId ?? "all", reasonId: query.reasonId ?? "all", source: (query.source as ApptFilters["source"]) ?? "all", patientType: query.patientType ?? "all" };
    const providerName = (id: string) => providers.find((p) => p.id === id)?.displayName ?? "Unknown";
    const reasonName = (id: string) => reasons.find((r) => r.id === id)?.name ?? "Unknown";
    const list = sortAppointments(filterAppointments(rows.map((a) => toAppointment(a)), f, query.tab), "start", "desc", { provider: providerName, reason: reasonName });
    const hide = query.hidePhi === "1";
    const csv = toCsv(
      list.map((a) => ({
        date_scheduled: a.createdAt, patient_type: a.patientType, provider: providerName(a.providerId), patient: maskText(`${a.patient.firstName} ${a.patient.lastName}`, hide),
        phone: maskText(a.patient.phone, hide), email: maskText(a.patient.email, hide), reason: reasonName(a.reasonId), source: SOURCE_LABELS[a.source], referrer_id: a.referrerId ?? "",
        utm_source: a.utm.source ?? "", utm_medium: a.utm.medium ?? "", utm_campaign: a.utm.campaign ?? "", appointment_start: a.start, status: STATUS_LABELS[a.status], decline_reason: a.declineReason ?? "",
      })),
    );
    await audit(tx, actor, { action: `Exported ${list.length} appointments (CSV)`, category: "export", target: query.tab === "declined" ? "Declined appointments" : "Appointments", clinicId, details: hide ? "PHI masked" : undefined });
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="appointments-${query.tab}-${format(new Date(), "yyyy-MM-dd")}.csv"` } });
  }),
);
