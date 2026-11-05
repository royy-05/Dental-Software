import type { AuditEntry } from "@/types";
import type { Tx } from "./db";

export interface Actor {
  id: string;
  name: string;
  role: AuditEntry["actorRole"];
  ip: string;
}

export const SYSTEM_ACTOR: Actor = { id: "system", name: "System", role: "system", ip: "internal" };
export const patientActor = (ip: string, name = "Patient (booking widget)"): Actor => ({ id: "patient", name, role: "patient", ip });

/**
 * Append an audit entry (section 8: logins, patient record views, exports, setting and template changes, with IP).
 * Must be called inside the same scoped transaction as the change it records. Never put PHI in `details`.
 */
export async function audit(
  tx: Tx,
  actor: Actor,
  e: { action: string; category: AuditEntry["category"]; target: string; clinicId?: string | null; details?: string },
) {
  await tx.auditLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: e.action,
      category: e.category,
      target: e.target.slice(0, 500),
      clinicId: e.clinicId ?? null,
      ip: actor.ip,
      details: e.details?.slice(0, 1000) ?? null,
    },
  });
}
