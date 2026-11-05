import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { badRequest } from "@/server/errors";
import { json } from "@/server/mappers";
import { loadClinic } from "@/server/services/clinic";
import { zWeeklyHours } from "@/lib/schemas";

export const PUT = handler({ summary: "Set clinic opening hours", access: { kind: "clinic", permission: "schedule:manage" }, body: zWeeklyHours }, async ({ clinicId, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    for (const h of Object.values(body)) if (h.enabled && h.start >= h.end) throw badRequest("Closing time must be after opening time.");
    await tx.clinic.update({ where: { id: clinicId }, data: { hours: json(body) } });
    await audit(tx, actor, { action: "Updated clinic hours", category: "settings", target: "Schedule", clinicId });
    return loadClinic(tx, clinicId);
  }),
);
