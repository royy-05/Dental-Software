import { handler } from "@/server/http";
import { prisma } from "@/server/db";
import { toAnnouncement } from "@/server/mappers";

export const GET = handler({ summary: "Active platform announcements addressed to this clinic", access: { kind: "clinic", permission: "clinic:home" } }, async ({ clinicId }) => {
  const rows = await prisma.announcement.findMany({ where: { active: true }, orderBy: { createdAt: "desc" } });
  return rows.map(toAnnouncement).filter((a) => a.clinicIds === "all" || a.clinicIds.includes(clinicId));
});
