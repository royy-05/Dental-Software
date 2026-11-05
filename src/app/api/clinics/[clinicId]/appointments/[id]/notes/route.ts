import { z } from "zod";
import { handler, idParams } from "@/server/http";
import { withTenant } from "@/server/db";
import { appointmentInclude, toAppointment } from "@/server/mappers";
import { addNote } from "@/server/services/booking";

export const POST = handler({ summary: "Add an internal note", access: { kind: "clinic", permission: "appointments:manage" }, params: idParams("id"), body: z.object({ text: z.string().trim().min(1).max(5000) }) }, async ({ clinicId, params, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    await addNote(tx, clinicId, params.id, body.text, actor);
    return toAppointment(await tx.appointment.findUniqueOrThrow({ where: { id: params.id }, include: appointmentInclude }));
  }),
);
