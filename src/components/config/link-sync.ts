import type { Operatory, Provider, Reason } from "@/types";

/**
 * Keeps the many-to-many links between reasons, providers and operatories consistent.
 * The canonical links are reason.providerIds, reason.operatoryIds and provider.operatoryIds;
 * provider.reasonIds, operatory.providerIds and operatory.reasonIds are mirrors.
 */
export interface LinkDb {
  reasons: Reason[];
  providers: Provider[];
  operatories: Operatory[];
}

const uniq = (a: string[]) => [...new Set(a)];

/** Recompute every mirror list for one clinic from the canonical links. */
export function rebuildMirrors(db: LinkDb, clinicId: string) {
  const reasons = db.reasons.filter((r) => r.clinicId === clinicId);
  const providers = db.providers.filter((p) => p.clinicId === clinicId);
  for (const p of providers) p.reasonIds = reasons.filter((r) => r.providerIds.includes(p.id)).map((r) => r.id);
  for (const o of db.operatories.filter((x) => x.clinicId === clinicId)) {
    o.providerIds = providers.filter((p) => p.operatoryIds.includes(o.id)).map((p) => p.id);
    o.reasonIds = reasons.filter((r) => r.operatoryIds.includes(o.id)).map((r) => r.id);
  }
}

/** Provider editor saved "reasons offered": write into each reason.providerIds. */
export function setProviderReasons(db: LinkDb, providerId: string, reasonIds: string[]) {
  const p = db.providers.find((x) => x.id === providerId);
  if (!p) return;
  for (const r of db.reasons.filter((x) => x.clinicId === p.clinicId)) {
    const has = r.providerIds.includes(providerId);
    const want = reasonIds.includes(r.id);
    if (want && !has) r.providerIds = uniq([...r.providerIds, providerId]);
    if (!want && has) r.providerIds = r.providerIds.filter((id) => id !== providerId);
  }
  rebuildMirrors(db, p.clinicId);
}

/** Operatory editor saved linked providers/reasons: write into provider.operatoryIds and reason.operatoryIds. */
export function setOperatoryLinks(db: LinkDb, operatoryId: string, providerIds: string[], reasonIds: string[]) {
  const o = db.operatories.find((x) => x.id === operatoryId);
  if (!o) return;
  for (const p of db.providers.filter((x) => x.clinicId === o.clinicId)) {
    const want = providerIds.includes(p.id);
    const has = p.operatoryIds.includes(operatoryId);
    if (want && !has) p.operatoryIds = uniq([...p.operatoryIds, operatoryId]);
    if (!want && has) p.operatoryIds = p.operatoryIds.filter((id) => id !== operatoryId);
  }
  for (const r of db.reasons.filter((x) => x.clinicId === o.clinicId)) {
    const want = reasonIds.includes(r.id);
    const has = r.operatoryIds.includes(operatoryId);
    if (want && !has) r.operatoryIds = uniq([...r.operatoryIds, operatoryId]);
    if (!want && has) r.operatoryIds = r.operatoryIds.filter((id) => id !== operatoryId);
  }
  rebuildMirrors(db, o.clinicId);
}

/** Remove every reference to a deleted entity. */
export function removeReason(db: LinkDb, reasonId: string) {
  const r = db.reasons.find((x) => x.id === reasonId);
  if (!r) return;
  db.reasons.splice(db.reasons.indexOf(r), 1);
  rebuildMirrors(db, r.clinicId);
}

export function removeOperatory(db: LinkDb, operatoryId: string) {
  const o = db.operatories.find((x) => x.id === operatoryId);
  if (!o) return;
  db.operatories.splice(db.operatories.indexOf(o), 1);
  for (const p of db.providers) p.operatoryIds = p.operatoryIds.filter((id) => id !== operatoryId);
  for (const r of db.reasons) r.operatoryIds = r.operatoryIds.filter((id) => id !== operatoryId);
  rebuildMirrors(db, o.clinicId);
}

/** Parse "A, B ,, C" into trimmed unique names, skipping ones already present (case-insensitive). */
export function parseBulkNames(input: string, existing: string[]): string[] {
  const have = new Set(existing.map((n) => n.toLowerCase()));
  const out: string[] = [];
  for (const raw of input.split(",")) {
    const n = raw.trim().replace(/\s+/g, " ");
    if (!n || have.has(n.toLowerCase())) continue;
    have.add(n.toLowerCase());
    out.push(n);
  }
  return out;
}
