import type { PlatformSettings } from "@/types";
import { withPlatform, withTenant } from "../db";
import { audit, SYSTEM_ACTOR } from "../audit";
import { wallToDb } from "../mappers";

/**
 * Patient data retention (section 8): each clinic keeps patient records for `retentionDays` (or the platform
 * default). Patients whose last appointment ended before the cutoff, and who have no upcoming appointment, are
 * deleted together with their appointments, consents and messages. Runs from the hourly tick; audited per clinic.
 */
export async function purgeExpiredPatientData(now = new Date()): Promise<{ clinics: number; patients: number }> {
  const platform = await withPlatform((tx) => tx.platformSetting.findUnique({ where: { id: "platform" } }));
  const defaultDays = (platform?.value as unknown as PlatformSettings | null)?.dataRetentionDays ?? 365 * 7;
  const clinics = await withPlatform((tx) => tx.clinic.findMany({ where: { deletedAt: null }, select: { id: true, retentionDays: true } }));
  let total = 0;
  let touched = 0;
  for (const c of clinics) {
    const days = c.retentionDays ?? defaultDays;
    const cutoff = new Date(now.getTime() - days * 86400000);
    const cutoffWall = wallToDb(cutoff.toISOString().slice(0, 16));
    const n = await withTenant(c.id, async (tx) => {
      const stale = await tx.$queryRaw<{ id: string }[]>`
        SELECT p.id FROM patients p
        WHERE p.clinic_id = ${c.id} AND p.created_at < ${cutoff}
          AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = p.id AND a.start >= ${cutoffWall})`;
      if (!stale.length) return 0;
      const ids = stale.map((s) => s.id);
      await tx.messageLog.deleteMany({ where: { appointment: { patientId: { in: ids } } } });
      await tx.patient.deleteMany({ where: { id: { in: ids } } });
      await audit(tx, SYSTEM_ACTOR, { action: `Purged ${ids.length} patient record${ids.length === 1 ? "" : "s"} past the retention period`, category: "settings", target: "Data retention", clinicId: c.id, details: `${days} days` });
      return ids.length;
    });
    if (n) {
      total += n;
      touched++;
    }
  }
  return { clinics: touched, patients: total };
}
