import { format } from "date-fns";
import type { Clinic } from "@/types";
import { smsSegments } from "@/lib/notify";
import { fromWall, nowInZone, toWall } from "@/lib/time";
import { prisma, withPlatform, withTenant, type Tx } from "../db";
import { emailAdapter, escapeHtml } from "../messaging/email";
import { smsAdapter } from "../messaging/sms";
import { log } from "../log";
import { dbToWall } from "../mappers";
import { loadClinic } from "../services/clinic";
import { purgeExpiredHolds } from "../services/booking";

/**
 * Delivery of queued messages (worker side). Each delivery-log row is claimed atomically (queued/scheduled -> sending)
 * so a pg-boss retry and the safety sweep can never send one message twice.
 */
const STALE_EVENTS = new Set(["reminder_24h", "reminder_2h", "confirmation_request"]);

export type DeliveryOutcome = "sent" | "delivered" | "failed" | "skipped" | "not_due" | "already_handled";

export async function deliverMessage(messageId: string, now = new Date()): Promise<DeliveryOutcome> {
  const claimed = await withPlatform(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE message_logs SET status = 'sending'
      WHERE id = ${messageId} AND status IN ('queued', 'scheduled') AND (scheduled_for IS NULL OR scheduled_for <= ${now})
      RETURNING id`;
    return rows.length > 0;
  });
  if (!claimed) {
    const row = await withPlatform((tx) => tx.messageLog.findUnique({ where: { id: messageId }, select: { status: true, scheduledFor: true } }));
    if (row && (row.status === "queued" || row.status === "scheduled") && row.scheduledFor && row.scheduledFor > now) return "not_due";
    return "already_handled";
  }
  const msg = await withPlatform((tx) => tx.messageLog.findUniqueOrThrow({ where: { id: messageId }, include: { appointment: { select: { status: true, version: true } }, clinic: { select: { name: true, phone: true } } } }));
  // Reminders and confirmation prompts for appointments that were moved or ended are skipped.
  if (STALE_EVENTS.has(msg.event) && msg.appointment && !["unconfirmed", "confirmed"].includes(msg.appointment.status)) {
    await withPlatform((tx) => tx.messageLog.update({ where: { id: messageId }, data: { status: "skipped", error: `Appointment is ${msg.appointment!.status}` } }));
    return "skipped";
  }
  if (msg.event === "confirmation_request" && msg.appointment?.status === "confirmed") {
    await withPlatform((tx) => tx.messageLog.update({ where: { id: messageId }, data: { status: "skipped", error: "Already confirmed" } }));
    return "skipped";
  }
  try {
    let providerMessageId: string;
    let provider: string;
    let status: "sent" | "delivered";
    if (msg.channel === "email") {
      const a = emailAdapter();
      const r = await a.send({ to: msg.to, subject: msg.subject ?? msg.clinic.name, text: msg.body, html: textToHtml(msg.body), id: msg.id });
      providerMessageId = r.providerMessageId;
      provider = a.name;
      status = "sent";
    } else {
      const a = smsAdapter();
      const r = await a.send({ to: msg.to, body: msg.body, id: msg.id });
      providerMessageId = r.providerMessageId;
      provider = a.name;
      status = a.name === "mock" ? "delivered" : "sent";
    }
    await withPlatform(async (tx) => {
      await tx.messageLog.update({ where: { id: messageId }, data: { status, sentAt: now, provider, providerMessageId, error: null } });
      if (msg.direction === "outbound") {
        await tx.clinic.update({
          where: { id: msg.clinicId },
          data: msg.channel === "sms" ? { smsCreditsUsed: { increment: smsSegments(msg.body).segments } } : { emailsSent: { increment: 1 } },
        });
      }
    });
    return status;
  } catch (e) {
    const error = e instanceof Error ? e.message.slice(0, 500) : "Send failed";
    await withPlatform((tx) => tx.messageLog.update({ where: { id: messageId }, data: { status: "failed", error } }));
    log.warn("Message delivery failed", { messageId, channel: msg.channel, error });
    return "failed";
  }
}

export function textToHtml(text: string): string {
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">${escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, "<br>")}</div>`;
}

/**
 * Safety net: deliver every due row that has no pg-boss job (queue down when it was created, or the job was lost),
 * plus rows stuck in `sending` for more than 10 minutes. Runs from the worker tick and from tests.
 */
export async function sweepDueMessages(now = new Date(), limit = 200): Promise<{ delivered: number; failed: number; skipped: number }> {
  const tally = { delivered: 0, failed: 0, skipped: 0 };
  await withPlatform((tx) => tx.$executeRaw`UPDATE message_logs SET status = 'queued' WHERE status = 'sending' AND created_at < ${new Date(now.getTime() - 10 * 60_000)}`);
  const due = await withPlatform((tx) =>
    tx.messageLog.findMany({
      where: { direction: "outbound", status: { in: ["queued", "scheduled"] }, OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }] },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: limit,
    }),
  );
  for (const m of due) {
    const r = await deliverMessage(m.id, now);
    if (r === "sent" || r === "delivered") tally.delivered++;
    else if (r === "failed") tally.failed++;
    else if (r === "skipped") tally.skipped++;
  }
  return tally;
}

/** Daily summary of tomorrow's schedule to the clinic (section 7), sent once per clinic-local day at 17:00. */
export async function sendDailySummaries(now = new Date()): Promise<number> {
  const clinics = await withPlatform((tx) => tx.clinic.findMany({ where: { deletedAt: null, status: { in: ["active", "trial"] } }, select: { id: true, timeZone: true, settings: true } }));
  let sent = 0;
  for (const c of clinics) {
    const settings = c.settings as unknown as Clinic["settings"];
    if (!settings.notifications.dailySummary || !settings.notifications.clinicAlertEmail) continue;
    const local = nowInZone(c.timeZone, now);
    if (local.getHours() !== 17) continue;
    const dayStart = new Date(now.getTime() - 24 * 3600_000);
    const already = await withTenant(c.id, (tx) => tx.messageLog.count({ where: { event: "daily_summary", createdAt: { gte: dayStart } } }));
    if (already) continue;
    await withTenant(c.id, async (tx) => {
      const clinic = await loadClinic(tx, c.id);
      const tomorrow = toWall(new Date(local.getFullYear(), local.getMonth(), local.getDate() + 1)).slice(0, 10);
      const appts = await tx.appointment.findMany({
        where: { start: { gte: new Date(`${tomorrow}T00:00:00.000Z`), lt: new Date(`${tomorrow}T23:59:59.999Z`) }, status: { in: ["unconfirmed", "confirmed"] } },
        include: { patient: { select: { firstName: true, lastName: true } } },
        orderBy: { start: "asc" },
      });
      const [reasons, providers] = await Promise.all([tx.reason.findMany({ select: { id: true, name: true } }), tx.provider.findMany({ select: { id: true, displayName: true } })]);
      const lines = appts.map((a) => `${format(fromWall(dbToWall(a.start)), "h:mm a")}  ${a.patient.firstName} ${a.patient.lastName} · ${reasons.find((r) => r.id === a.reasonId)?.name ?? ""} · ${providers.find((p) => p.id === a.providerId)?.displayName ?? ""} (${a.status})`);
      const body = `Schedule for ${format(fromWall(`${tomorrow}T00:00`), "EEEE, MMMM d")}\n\n${lines.length ? lines.join("\n") : "No appointments booked."}\n\n${lines.length} appointment${lines.length === 1 ? "" : "s"}.`;
      for (const to of [settings.notifications.clinicAlertEmail, ...settings.notifications.extraAlertEmails].filter(Boolean)) {
        await tx.messageLog.create({ data: { clinicId: c.id, channel: "email", direction: "outbound", recipientType: "clinic", to, event: "daily_summary", subject: `${clinic.name}: tomorrow's schedule (${lines.length})`, body, status: "queued", createdAt: now } });
      }
    });
    sent++;
  }
  return sent;
}

/** Everything the hourly tick does. Exported so tests can run it without pg-boss. */
export async function hourlyTick(now = new Date()) {
  const holds = await withPlatform((tx) => purgeExpiredHolds(tx, now));
  const summaries = await sendDailySummaries(now);
  await expireRateLimits(now);
  const swept = await sweepDueMessages(now);
  return { holds, summaries, swept };
}

async function expireRateLimits(now: Date) {
  await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 2 * 3600_000) } } });
}

export type { Tx };
