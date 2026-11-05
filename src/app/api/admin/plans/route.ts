import { handler } from "@/server/http";
import { prisma } from "@/server/db";
import { toPlan } from "@/server/mappers";

export const GET = handler({ summary: "Plans with limits and modules", access: { kind: "platform", permission: "admin:access" } }, async () => (await prisma.plan.findMany({ orderBy: { priceMonthly: "asc" } })).map(toPlan));
