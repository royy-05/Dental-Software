import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { toClinicInsurance } from "@/server/mappers";
import { listOperatories, listProviders, listReasons, listReferrers } from "@/server/services/config";
import { loadFlow } from "@/server/services/flow";

/** One round trip for the panel's configuration: everything except appointments, messages and reports. */
export const GET = handler({ summary: "Clinic configuration bundle: reasons, providers, operatories, referrers, insurances, booking flow (draft, published, versions)", access: { kind: "clinic", permission: "clinic:home" } }, async ({ clinicId }) =>
  withTenant(clinicId, async (tx) => {
    const [reasons, providers, operatories, referrers, insurances, flow, carriers] = await Promise.all([
      listReasons(tx), listProviders(tx), listOperatories(tx), listReferrers(tx),
      tx.clinicInsurance.findMany({ orderBy: { name: "asc" } }).then((r) => r.map(toClinicInsurance)),
      loadFlow(tx, clinicId),
      tx.insuranceCarrier.findMany({ orderBy: { name: "asc" } }),
    ]);
    return { reasons, providers, operatories, referrers, insurances, flow, carriers };
  }),
);
