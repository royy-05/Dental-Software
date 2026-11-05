import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { loadClinicBundle } from "@/server/services/clinic";

export const GET = handler({ summary: "Clinic profile, settings, plan and resolved feature flags", access: { kind: "clinic", permission: "clinic:home" } }, async ({ clinicId }) =>
  withTenant(clinicId, (tx) => loadClinicBundle(tx, clinicId)),
);
