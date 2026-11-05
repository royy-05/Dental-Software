import { TEMPLATE_EVENT_LABELS } from "@/types";
import { handler, idParams } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { toTemplate } from "@/server/mappers";
import { zTemplateBody } from "@/lib/schemas";

/** Editing a global default from the clinic panel creates the clinic's own copy. */
export const PATCH = handler({ summary: "Edit a template (subject, body, on/off); editing a global default creates the clinic's copy", access: { kind: "clinic", permission: "templates:manage" }, params: idParams("id"), body: zTemplateBody }, async ({ clinicId, params, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    const t = await tx.messageTemplate.findUnique({ where: { id: params.id } });
    if (!t) throw notFound("Template");
    const data = { subject: body.subject ?? t.subject, body: body.body ?? t.body, enabled: body.enabled ?? t.enabled };
    const row =
      t.clinicId === clinicId
        ? await tx.messageTemplate.update({ where: { id: t.id }, data })
        : await tx.messageTemplate.upsert({ where: { clinicId_event_channel: { clinicId, event: t.event, channel: t.channel } }, create: { clinicId, event: t.event, channel: t.channel, ...data }, update: data });
    const label = `${t.channel.toUpperCase()} “${TEMPLATE_EVENT_LABELS[t.event as keyof typeof TEMPLATE_EVENT_LABELS] ?? t.event}”`;
    const only = Object.keys(body);
    await audit(tx, actor, { action: only.length === 1 && only[0] === "enabled" ? `${body.enabled ? "Enabled" : "Disabled"} ${label}` : `Edited ${label}`, category: "template", target: "Templates", clinicId });
    return toTemplate(row);
  }),
);
