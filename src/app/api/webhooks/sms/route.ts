import { z } from "zod";
import { handler } from "@/server/http";
import { ApiError } from "@/server/errors";
import { clinicIdForSlug } from "@/server/db";
import { handleInboundSms } from "@/server/services/sms-inbound";
import { enqueueMessages } from "@/server/jobs/queue";
import { safeEqual } from "@/server/auth/crypto";

/**
 * Inbound SMS webhook (two-way SMS, section 7). Provider-agnostic shape until the SMS vendor is chosen:
 * the provider adapter in Phase 2B maps Twilio/MSG91 payloads onto { clinicSlug, from, text }.
 * Authenticated with the shared secret in the x-webhook-secret header.
 */
const body = z.object({ clinicSlug: z.string().regex(/^[a-z0-9-]{3,80}$/), from: z.string().min(7).max(32), text: z.string().min(1).max(1000) });

export const POST = handler({ summary: "Inbound SMS webhook: C confirms, STOP/START opt out or in, HELP answers; auto-reply queued", access: { kind: "public", rateLimit: "publicReadPerIp" }, body }, async ({ body, req }) => {
  const secret = process.env.SMS_WEBHOOK_SECRET;
  const given = req.headers.get("x-webhook-secret") ?? "";
  if (!secret || !safeEqual(Buffer.from(secret), Buffer.from(given))) throw new ApiError(401, "unauthorized", "Bad webhook secret");
  const clinicId = await clinicIdForSlug(body.clinicSlug);
  if (!clinicId) throw new ApiError(404, "not_found", "Unknown clinic");
  const r = await handleInboundSms(clinicId, body.from, body.text);
  await enqueueMessages(r.jobs);
  return { intent: r.intent, reply: r.reply };
});
