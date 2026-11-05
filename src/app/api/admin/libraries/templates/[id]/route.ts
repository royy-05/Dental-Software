import { z } from "zod";
import { TEMPLATE_EVENT_LABELS } from "@/types";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { audit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { toTemplate } from "@/server/mappers";
import { zId, zTemplateBody } from "@/lib/schemas";

export const PATCH = handler({ summary: "Edit a global default template", access: { kind: "platform", permission: "admin:libraries:edit" }, params: z.object({ id: zId }), body: zTemplateBody }, async ({ params, body, actor }) =>
  withPlatform(async (tx) => {
    const t = await tx.messageTemplate.findUnique({ where: { id: params.id } });
    if (!t || t.clinicId) throw notFound("Default template");
    const row = await tx.messageTemplate.update({ where: { id: t.id }, data: body });
    await audit(tx, actor, { action: "Edited default template", category: "template", target: `${TEMPLATE_EVENT_LABELS[t.event as keyof typeof TEMPLATE_EVENT_LABELS] ?? t.event} (${t.channel})` });
    return toTemplate(row);
  }),
);
