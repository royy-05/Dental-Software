import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { toHoliday } from "@/server/mappers";
import { addHoliday } from "@/server/services/config";
import { zHoliday } from "@/lib/schemas";

export const POST = handler({ summary: "Add a holiday (clinic closed all day)", access: { kind: "clinic", permission: "schedule:manage" }, body: zHoliday }, async ({ clinicId, body, actor }) =>
  withTenant(clinicId, async (tx) => {
    const h = await addHoliday(tx, clinicId, body);
    await audit(tx, actor, { action: `Added holiday ${body.date}`, category: "settings", target: "Schedule", clinicId });
    return toHoliday(h);
  }),
);
