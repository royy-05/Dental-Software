import type { Appointment, Clinic, MessageTemplate, OptOut, PlatformSettings, Provider, Reason } from "@/types";
import { dispositionFor, draftMessages, type NotifyEvent } from "@/lib/notify";
import { toWall } from "@/lib/time";
import { zonedWallToUtc } from "@/lib/tz";
import type { Tx } from "../db";
import { toOptOut, toTemplate } from "../mappers";
import { manageTokenFor, manageUrl } from "../links";
import { wallToDb } from "../mappers";

/** A delivery-log row that still needs a pg-boss job (handed to `enqueueMessages()` after the transaction commits). */
export interface QueuedJob {
  messageId: string;
  startAfter?: Date;
}

export async function platformSettings(tx: Tx): Promise<PlatformSettings> {
  const row = await tx.platformSetting.findUnique({ where: { id: "platform" } });
  return row?.value as unknown as PlatformSettings;
}

/** Clinic templates with the global defaults filling any gap (6.7). */
export async function effectiveTemplates(tx: Tx, clinicId: string): Promise<MessageTemplate[]> {
  const rows = await tx.messageTemplate.findMany({ where: { OR: [{ clinicId }, { clinicId: null }] } });
  const out = new Map<string, MessageTemplate>();
  for (const t of rows.map(toTemplate)) {
    const key = `${t.event}:${t.channel}`;
    if (t.clinicId === clinicId || !out.has(key)) out.set(key, t);
  }
  return [...out.values()];
}

export interface NotifyParams {
  clinic: Clinic;
  appointment: Appointment;
  reason?: Reason;
  provider?: Provider;
  now?: Date;
  baseUrl?: string;
}

/**
 * Write the messages an appointment event produces into the delivery log (section 7) inside the caller's
 * transaction: `queued` (send now), `scheduled` (reminder time or quiet hours) or `failed` (opted out).
 * Nothing is sent here; the returned jobs are enqueued after commit and the worker delivers them.
 */
export async function queueNotifications(tx: Tx, event: NotifyEvent, p: NotifyParams): Promise<QueuedJob[]> {
  const now = p.now ?? new Date();
  const [templates, optOutRows, platform] = await Promise.all([effectiveTemplates(tx, p.clinic.id), tx.optOut.findMany({ where: { clinicId: p.clinic.id } }), platformSettings(tx)]);
  const optOuts: OptOut[] = optOutRows.map(toOptOut);
  const baseUrl = p.baseUrl ?? process.env.APP_BASE_URL ?? "http://localhost:3000";
  const token = manageTokenFor({ id: p.appointment.id, version: p.appointment.version ?? 1, startUtc: zonedWallToUtc(p.appointment.start, p.clinic.timeZone) });
  const appointment: Appointment = { ...p.appointment, token };
  const ctxBase = { clinic: p.clinic, appointment, reason: p.reason, provider: p.provider, templates, now, baseUrl: baseUrl.replace(/\/$/, "") };
  const drafts = draftMessages(event, ctxBase);
  const quietHours = { start: platform?.messaging.quietHoursStart ?? 21, end: platform?.messaging.quietHoursEnd ?? 8 };
  const jobs: QueuedJob[] = [];
  for (const d of drafts) {
    const disp = dispositionFor(d, { clinic: p.clinic, optOuts, now, quietHours });
    const scheduledFor = disp.kind === "deferred" ? zonedWallToUtc(toWall(disp.scheduledFor), p.clinic.timeZone) : null;
    const row = await tx.messageLog.create({
      data: {
        clinicId: p.clinic.id,
        appointmentId: appointment.id,
        channel: d.channel,
        direction: "outbound",
        recipientType: d.recipientType,
        to: d.to,
        event: d.event,
        subject: d.subject ?? null,
        body: d.body,
        status: disp.kind === "blocked" ? "failed" : disp.kind === "deferred" ? "scheduled" : "queued",
        createdAt: now,
        scheduledFor,
        error: disp.kind === "blocked" ? disp.error : disp.kind === "deferred" ? (disp.note ?? null) : null,
      },
    });
    if (disp.kind !== "blocked") jobs.push({ messageId: row.id, startAfter: scheduledFor ?? undefined });
  }
  return jobs;
}

/** Reminders and other pending messages for an appointment become stale when it moves or is cancelled. */
export async function cancelPendingMessages(tx: Tx, appointmentId: string, reason: string) {
  await tx.messageLog.updateMany({
    where: { appointmentId, status: { in: ["queued", "scheduled"] }, event: { in: ["reminder_24h", "reminder_2h", "confirmation_request"] } },
    data: { status: "skipped", error: reason },
  });
}

export { manageUrl, wallToDb };
