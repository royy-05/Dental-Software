import { handler, idParams } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { appointmentInclude, toAppointment } from "@/server/mappers";
import { loadClinic } from "@/server/services/clinic";
import { tokenFor } from "@/server/services/booking";

/** Opening the detail drawer is a patient record view: audited as phi_access (section 8). */
export const GET = handler({ summary: "Appointment detail (status history, notes, consent); writes a 'Viewed patient record' audit entry", access: { kind: "clinic", permission: "patients:view" }, params: idParams("id") }, async ({ clinicId, params, actor }) =>
  withTenant(clinicId, async (tx) => {
    const row = await tx.appointment.findUnique({ where: { id: params.id }, include: appointmentInclude });
    if (!row) throw notFound("Appointment");
    const clinic = await loadClinic(tx, clinicId);
    await audit(tx, actor, { action: "Viewed patient record", category: "phi_access", target: row.id, clinicId });
    return toAppointment(row, tokenFor(clinic, row));
  }),
);
