import type { Clinic, FeatureKey, Plan } from "@/types";
import { FEATURE_LABELS } from "@/types";
import type { Tx } from "../db";
import { notFound } from "../errors";
import { toClinic, toPlan } from "../mappers";

export const clinicInclude = { holidays: true, blockouts: true, featureFlags: true } as const;

export async function loadClinic(tx: Tx, clinicId: string): Promise<Clinic> {
  const row = await tx.clinic.findUnique({ where: { id: clinicId }, include: clinicInclude });
  if (!row) throw notFound("Clinic");
  return toClinic(row);
}

export function resolveFeatures(clinic: Clinic, plan: Plan): Record<FeatureKey, boolean> {
  return Object.fromEntries(
    (Object.keys(FEATURE_LABELS) as FeatureKey[]).map((k) => [k, clinic.featureOverrides[k] ?? plan.limits.modules.includes(k)]),
  ) as Record<FeatureKey, boolean>;
}

export async function loadClinicBundle(tx: Tx, clinicId: string) {
  const row = await tx.clinic.findUnique({ where: { id: clinicId }, include: { ...clinicInclude, plan: true } });
  if (!row) throw notFound("Clinic");
  const clinic = toClinic(row);
  const plan = toPlan(row.plan);
  return { clinic, plan, features: resolveFeatures(clinic, plan) };
}
