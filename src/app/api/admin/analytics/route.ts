import { z } from "zod";
import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { adminAnalytics } from "@/server/services/reports";

export const GET = handler({ summary: "Platform analytics: compare clinics (bookings, conversion, show rate, source mix, ad cost per booking) and 12-month growth", access: { kind: "platform", permission: "admin:analytics" }, query: z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }) }, async ({ query }) =>
  withPlatform((tx) => adminAnalytics(tx, query.days)),
);
