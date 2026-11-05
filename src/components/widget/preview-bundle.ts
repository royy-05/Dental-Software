import type { Clinic, ClinicInsurance, FlowConfig, Operatory, Provider, Reason, Referrer } from "@/types";
import type { PublicBundle } from "@/lib/api/public";

/**
 * Builds a PublicBundle-shaped object from clinic-panel data so the builder's live preview can render
 * BookingWidget without the public API (no network, no PHI).
 */
export function bundleFromClinicConfig(
  clinic: Clinic,
  config: { reasons: Reason[]; providers: Provider[]; operatories?: Operatory[]; insurances: ClinicInsurance[]; referrers: Referrer[] },
  flow: FlowConfig,
  features: { otp?: boolean; file_uploads?: boolean } = {},
): PublicBundle {
  return {
    clinic,
    flow,
    reasons: config.reasons,
    providers: config.providers.filter((p) => p.active),
    insurances: config.insurances,
    referrers: config.referrers,
    features: { otp: !!features.otp, file_uploads: features.file_uploads ?? true },
    platform: { maintenanceMode: false, poweredByText: "Powered by Kivi Health" },
  };
}
