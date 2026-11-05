import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { json } from "@/server/mappers";
import { loadClinic } from "@/server/services/clinic";
import { zInsuranceSettings } from "@/lib/schemas";

export const PUT = handler({ summary: "Insurance settings: other insurance, optional fields, extra questions, warning messages", access: { kind: "clinic", permission: "insurances:manage" }, body: zInsuranceSettings }, async ({ clinicId, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    await tx.clinic.update({ where: { id: clinicId }, data: { insuranceSettings: json({ ...body, extraQuestions: body.extraQuestions.filter((q) => q.trim()) }) } });
    await audit(tx, actor, { action: "Updated insurance settings", category: "settings", target: "Insurances", clinicId });
    return loadClinic(tx, clinicId);
  }),
);
