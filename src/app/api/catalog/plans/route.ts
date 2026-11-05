import { handler } from "@/server/http";
import { prisma } from "@/server/db";
import { toPlan } from "@/server/mappers";

export const GET = handler({ summary: "Plan catalogue (names, prices, limits, modules)", access: { kind: "user" } }, async () =>
  (await prisma.plan.findMany({ orderBy: { priceMonthly: "asc" } })).map(toPlan),
);
