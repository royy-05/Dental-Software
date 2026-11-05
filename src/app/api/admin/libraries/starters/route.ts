import { handler } from "@/server/http";
import { prisma } from "@/server/db";
import { toStarterTemplate } from "@/server/mappers";

export const GET = handler({ summary: "Starter booking flows by specialty (published and drafts)", access: { kind: "platform", permission: "admin:access" } }, async () => (await prisma.starterTemplate.findMany({ orderBy: { name: "asc" } })).map(toStarterTemplate));
