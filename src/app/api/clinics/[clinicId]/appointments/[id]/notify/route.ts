import { z } from "zod";
import { handler, idParams } from "@/server/http";
import { withTenant } from "@/server/db";
import { resendMessages } from "@/server/services/booking";
import { enqueueMessages } from "@/server/jobs/queue";

export const POST = handler({ summary: "Resend the confirmation or send a confirmation request", access: { kind: "clinic", permission: "appointments:manage" }, params: idParams("id"), body: z.object({ event: z.enum(["resend", "confirmation_request"]) }) }, async ({ clinicId, params, body, actor }) => {
  const r = await withTenant(clinicId, (tx) => resendMessages(tx, clinicId, params.id, body.event, actor));
  await enqueueMessages(r.jobs);
  return { sent: r.jobs.length };
});
