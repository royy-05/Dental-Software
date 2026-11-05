import { z } from "zod";
import { handler } from "@/server/http";
import { notFound } from "@/server/errors";
import { isDemoMode } from "@/server/env";
import { handleInboundSms } from "@/server/services/sms-inbound";
import { enqueueMessages } from "@/server/jobs/queue";
import { zPhone } from "@/lib/schemas";

/** The in-panel two-way SMS simulator calls the same handler as the provider webhook. DEMO_MODE only. */
export const POST = handler({ summary: "DEMO_MODE only: simulate an inbound patient SMS (C / STOP / HELP / START)", access: { kind: "clinic", permission: "appointments:manage" }, body: z.object({ from: zPhone, text: z.string().trim().min(1).max(500) }) }, async ({ clinicId, body }) => {
  if (!isDemoMode()) throw notFound();
  const r = await handleInboundSms(clinicId, body.from, body.text);
  await enqueueMessages(r.jobs);
  return { intent: r.intent, reply: r.reply };
});
