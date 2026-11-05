import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { toAudit } from "@/server/mappers";

const query = z.object({ clinicId: z.string().max(64).optional(), category: z.string().max(30).optional(), q: z.string().max(100).optional(), limit: z.coerce.number().int().min(1).max(1000).default(300) });

export const GET = handler({ summary: "Audit log across the platform (who did what, when, from which IP), filterable", access: { kind: "platform", permission: "admin:audit" }, query }, async ({ query }) =>
  withPlatform(async (tx) =>
    (
      await tx.auditLog.findMany({
        where: { clinicId: query.clinicId, category: query.category, ...(query.q ? { OR: [{ action: { contains: query.q, mode: "insensitive" } }, { actorName: { contains: query.q, mode: "insensitive" } }, { target: { contains: query.q, mode: "insensitive" } }] } : {}) },
        orderBy: { at: "desc" },
        take: query.limit,
      })
    ).map(toAudit),
  ),
);
