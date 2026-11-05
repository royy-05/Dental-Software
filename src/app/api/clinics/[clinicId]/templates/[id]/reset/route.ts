import { TEMPLATE_EVENT_LABELS } from "@/types";
import { handler, idParams } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { toTemplate } from "@/server/mappers";

export const POST = handler({ summary: "Reset a template to the global default", access: { kind: "clinic", permission: "templates:manage" }, params: idParams("id") }, async ({ clinicId, params, actor }) =>
  withTenant(clinicId, async (tx) => {
    const t = await tx.messageTemplate.findUnique({ where: { id: params.id } });
    if (!t) throw notFound("Template");
    const def = await tx.messageTemplate.findFirst({ where: { clinicId: null, event: t.event, channel: t.channel } });
    if (!def) throw notFound("Default template");
    const row = t.clinicId === clinicId ? await tx.messageTemplate.update({ where: { id: t.id }, data: { subject: def.subject, body: def.body, enabled: def.enabled } }) : def;
    await audit(tx, actor, { action: `Reset ${t.channel.toUpperCase()} template “${TEMPLATE_EVENT_LABELS[t.event as keyof typeof TEMPLATE_EVENT_LABELS] ?? t.event}” to default`, category: "template", target: "Templates", clinicId });
    return toTemplate(row);
  }),
);
