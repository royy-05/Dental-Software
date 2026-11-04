import type { ClinicFlow, FlowConfig, StarterTemplate } from "@/types";

/** Publish `config` as a new version (mutates `rec`, which may be an immer draft). */
export function applyPublish(rec: ClinicFlow, config: FlowConfig, by: string, note: string, at: string): number {
  const version = Math.max(rec.publishedVersion, ...rec.versions.map((v) => v.version)) + 1;
  const snapshot = structuredClone(config);
  rec.versions.unshift({ id: `fv_${rec.clinicId}_${version}`, clinicId: rec.clinicId, version, publishedAt: at, publishedBy: by, note, config: snapshot });
  rec.published = structuredClone(config);
  rec.draft = structuredClone(config);
  rec.publishedVersion = version;
  rec.draftUpdatedAt = undefined;
  return version;
}

/** Roll back = publish an earlier version's config again as a new version. */
export function applyRollback(rec: ClinicFlow, version: number, by: string, at: string): number | null {
  const v = rec.versions.find((x) => x.version === version);
  if (!v) return null;
  return applyPublish(rec, v.config, by, `Rolled back to v${version}`, at);
}

/** Copy a starter template into a draft config, keeping the clinic's booking rules' acceptance state. */
export function draftFromTemplate(t: StarterTemplate, current: FlowConfig): FlowConfig {
  const next = structuredClone(t.flow);
  next.rules.acceptingPatients = current.rules.acceptingPatients;
  next.rules.pausedMessage = current.rules.pausedMessage;
  return next;
}

export function sameConfig(a: FlowConfig, b: FlowConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
