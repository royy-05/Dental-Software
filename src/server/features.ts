import type { FeatureKey } from "@/types";
import { withPlatform, type Tx } from "./db";

/** Feature flag resolution (6.5): a per-clinic override wins, otherwise the plan's module list. */
export async function featureEnabledForClinic(clinicId: string, key: FeatureKey, tx?: Tx): Promise<boolean> {
  const run = async (t: Tx) => {
    const clinic = await t.clinic.findUnique({ where: { id: clinicId }, select: { plan: true, featureFlags: { where: { key } } } });
    if (!clinic) return false;
    const override = clinic.featureFlags[0];
    if (override) return override.enabled;
    return ((clinic.plan.limits as { modules?: string[] }).modules ?? []).includes(key);
  };
  return tx ? run(tx) : withPlatform(run);
}
