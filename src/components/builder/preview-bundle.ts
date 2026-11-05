import type { Clinic, FlowConfig } from "@/types";
import type { PublicBundle } from "@/lib/api/public";
import type { ClinicConfig } from "@/lib/api/clinic";
import { bookableReasons } from "@/lib/flow";

/**
 * The builder's live preview renders the real BookingWidget. It needs the same bundle the public page gets, so this
 * assembles one from the signed-in clinic's data and the draft flow. Nothing is sent to the server in preview mode.
 */
export function previewBundle(clinic: Clinic, config: ClinicConfig, flow: FlowConfig, features: { otp: boolean; file_uploads: boolean }): PublicBundle {
  const providers = config.providers.filter((p) => p.active);
  return {
    clinic,
    flow,
    reasons: bookableReasons(config.reasons, providers),
    providers: providers.filter((p) => p.showOnline),
    insurances: config.insurances,
    referrers: config.referrers,
    features,
    platform: { maintenanceMode: false, poweredByText: "Powered by Kivi Health" },
  };
}
