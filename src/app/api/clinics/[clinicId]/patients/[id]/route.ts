import { handler, idParams } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { appointmentInclude, toAppointment } from "@/server/mappers";

/** Patient rights (section 8): export or delete a patient's data on request. Both are audited. */
export const GET = handler({ summary: "Export everything stored about one patient (JSON) — audited", access: { kind: "clinic", permission: "patients:view" }, params: idParams("id") }, async ({ clinicId, params, actor }) =>
  withTenant(clinicId, async (tx) => {
    const p = await tx.patient.findUnique({ where: { id: params.id }, include: { appointments: { include: appointmentInclude }, consents: true } });
    if (!p) throw notFound("Patient");
    const messages = await tx.messageLog.findMany({ where: { appointmentId: { in: p.appointments.map((a) => a.id) } }, orderBy: { createdAt: "asc" } });
    await audit(tx, actor, { action: "Exported patient data", category: "export", target: p.id, clinicId });
    return {
      patient: { id: p.id, firstName: p.firstName, lastName: p.lastName, dob: p.dob, phone: p.phone, email: p.email, createdAt: p.createdAt, archivedAt: p.archivedAt },
      appointments: p.appointments.map((a) => toAppointment(a)),
      consents: p.consents,
      messages,
    };
  }),
);

export const DELETE = handler({ summary: "Delete a patient and their appointments, consents and messages (irreversible; audited)", access: { kind: "clinic", permission: "settings:manage" }, params: idParams("id") }, async ({ clinicId, params, actor }) =>
  withTenant(clinicId, async (tx) => {
    const p = await tx.patient.findUnique({ where: { id: params.id }, select: { id: true, appointments: { select: { id: true } } } });
    if (!p) throw notFound("Patient");
    await tx.messageLog.deleteMany({ where: { appointmentId: { in: p.appointments.map((a) => a.id) } } });
    await tx.patient.delete({ where: { id: p.id } });
    await audit(tx, actor, { action: "Deleted patient data on request", category: "settings", target: p.id, clinicId, details: `${p.appointments.length} appointments removed` });
    return { ok: true, appointmentsRemoved: p.appointments.length };
  }),
);
