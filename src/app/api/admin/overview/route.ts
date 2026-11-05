import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { adminOverview } from "@/server/services/reports";

export const GET = handler({ summary: "Super admin dashboard: clinic counts, platform bookings/conversion/show rate vs last 30 days, MRR, usage, health alerts (SQL)", access: { kind: "platform", permission: "admin:access" } }, async () =>
  withPlatform((tx) => adminOverview(tx)),
);
