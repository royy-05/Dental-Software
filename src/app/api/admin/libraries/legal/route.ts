import { handler } from "@/server/http";
import { prisma } from "@/server/db";
import { toLegalTemplate } from "@/server/mappers";

export const GET = handler({ summary: "Legal page templates (Privacy Policy, Terms)", access: { kind: "platform", permission: "admin:access" } }, async () => (await prisma.legalTemplate.findMany({ orderBy: { kind: "asc" } })).map(toLegalTemplate));
