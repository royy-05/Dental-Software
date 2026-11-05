import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { audit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { toLegalTemplate } from "@/server/mappers";
import { zId, zName, zText } from "@/lib/schemas";

export const PATCH = handler({ summary: "Edit a legal template (bumps its version)", access: { kind: "platform", permission: "admin:libraries:edit" }, params: z.object({ id: zId }), body: z.object({ title: zName().optional(), body: zText(50_000).optional(), version: zText(40).optional() }) }, async ({ params, body, actor }) =>
  withPlatform(async (tx) => {
    const l = await tx.legalTemplate.findUnique({ where: { id: params.id } });
    if (!l) throw notFound("Legal template");
    const row = await tx.legalTemplate.update({ where: { id: l.id }, data: { title: body.title, body: body.body, version: body.version ?? new Date().toISOString().slice(0, 7) } });
    await audit(tx, actor, { action: "Edited legal template", category: "settings", target: `${row.title} v${row.version}` });
    return toLegalTemplate(row);
  }),
);
