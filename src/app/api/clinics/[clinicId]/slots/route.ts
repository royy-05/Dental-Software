import { z } from "zod";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { slotsForDay } from "@/server/services/booking";
import { zDay, zId } from "@/lib/schemas";
import { fromDayKey } from "@/lib/time";

const query = z.object({ reasonId: zId, date: zDay, providerId: zId.optional(), ignoreAppointmentId: zId.optional() });

/** Staff slot picker: same engine as the widget with staffOverride (no min notice, window, cap or online-only). */
export const GET = handler({ summary: "Staff slots for a day (staff override rules)", access: { kind: "clinic", permission: "appointments:manage" }, query }, async ({ clinicId, query }) =>
  withTenant(clinicId, (tx) => slotsForDay(tx, clinicId, query.reasonId, fromDayKey(query.date), { providerId: query.providerId, ignoreAppointmentId: query.ignoreAppointmentId, staffOverride: true })),
);
