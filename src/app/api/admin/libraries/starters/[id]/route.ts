import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { audit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { json, toStarterTemplate } from "@/server/mappers";
import { zFlowConfig, zId, zName, zText } from "@/lib/schemas";

const body = z.object({ name: zName(), description: zText(500), published: z.boolean(), flow: zFlowConfig, defaultReasons: z.array(z.object({ name: zName(), description: zText(300), duration: z.number().int().min(5).max(480), patientType: z.enum(["new", "existing", "both"]), color: zText(20), estimatedValue: z.number().int().min(0) })).max(50) }).partial();

export const PATCH = handler({ summary: "Edit or publish a starter template", access: { kind: "platform", permission: "admin:libraries:edit" }, params: z.object({ id: zId }), body }, async ({ params, body, actor }) =>
  withPlatform(async (tx) => {
    const t = await tx.starterTemplate.findUnique({ where: { id: params.id } });
    if (!t) throw notFound("Starter template");
    const row = await tx.starterTemplate.update({ where: { id: t.id }, data: { name: body.name, description: body.description, published: body.published, flow: body.flow ? json(body.flow) : undefined, defaultReasons: body.defaultReasons ? json(body.defaultReasons) : undefined } });
    await audit(tx, actor, { action: body.published !== undefined && Object.keys(body).length === 1 ? `${body.published ? "Published" : "Unpublished"} starter template` : "Edited starter template", category: "settings", target: row.name });
    return toStarterTemplate(row);
  }),
);
