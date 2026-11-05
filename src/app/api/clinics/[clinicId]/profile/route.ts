import { z } from "zod";
import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { json } from "@/server/mappers";
import { conflict } from "@/server/errors";
import { loadClinicBundle } from "@/server/services/clinic";
import { zBranding, zClinicSettings, zEmail, zName, zText } from "@/lib/schemas";

/** Settings > Appearance, Widgets, Confirmation, Legal, Notifications, Reserve with Google, data retention (5.10). */
const body = z
  .object({
    name: zName(),
    phone: zText(40),
    email: zEmail.or(z.literal("")),
    address: zText(300),
    description: zText(2000),
    branding: zBranding,
    settings: zClinicSettings,
    rwg: z.object({ enabled: z.boolean(), websiteUrl: zText(2048) }),
    retentionDays: z.number().int().min(30).max(3650).nullable(),
  })
  .partial();

const LABELS: Record<string, string> = {
  name: "practice name", phone: "phone", email: "email", address: "address", description: "description", branding: "appearance",
  settings: "settings", rwg: "Reserve with Google", retentionDays: "data retention",
};

export const PATCH = handler({ summary: "Update clinic profile and settings (audited with the changed sections)", access: { kind: "clinic", permission: "settings:manage" }, body }, async ({ clinicId, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    const current = await tx.clinic.findUniqueOrThrow({ where: { id: clinicId } });
    const data: Record<string, unknown> = {};
    const changed: string[] = [];
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      changed.push(LABELS[k] ?? k);
      if (k === "settings") {
        const s = v as z.infer<typeof zClinicSettings>;
        data.settings = json(s);
        data.customSlug = s.widget.customSlug ?? null;
      } else if (k === "rwg") {
        data.rwg = json({ ...(current.rwg as object), ...(v as object) });
      } else if (k === "branding") data.branding = json(v);
      else data[k] = v;
    }
    if (data.customSlug && data.customSlug !== current.customSlug) {
      const taken = await tx.$queryRaw<{ id: string | null }[]>`SELECT clinic_id_for_slug(${data.customSlug as string}) AS id`;
      if (taken[0]?.id && taken[0].id !== clinicId) throw conflict("That booking link is already taken.");
    }
    await tx.clinic.update({ where: { id: clinicId }, data });
    if (changed.length) await audit(tx, actor, { action: `Updated ${[...new Set(changed)].join(", ")}`, category: "settings", target: current.name, clinicId });
    return loadClinicBundle(tx, clinicId);
  }),
);
