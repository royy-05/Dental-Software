import { format } from "date-fns";
import { interpretSmsReply, smsAutoReply } from "@/lib/notify";
import { fromWall, nowInZone, toWall } from "@/lib/time";
import { withTenant } from "../db";
import { SYSTEM_ACTOR } from "../audit";
import { dbToWall, wallToDb } from "../mappers";
import { loadClinic } from "./clinic";
import { setAppointmentStatus } from "./booking";
import type { QueuedJob } from "./notify";

/**
 * Two-way SMS (section 7): C confirms the next upcoming appointment, STOP opts out, HELP and START are answered.
 * Called by the provider webhook (/api/webhooks/sms) and by the in-panel simulator.
 */
export async function handleInboundSms(clinicId: string, from: string, text: string, now = new Date()): Promise<{ intent: string; reply: string; jobs: QueuedJob[] }> {
  const intent = interpretSmsReply(text);
  return withTenant(clinicId, async (tx) => {
    const clinic = await loadClinic(tx, clinicId);
    const localNow = toWall(nowInZone(clinic.timeZone, now));
    const upcoming = await tx.appointment.findFirst({
      where: { patient: { phone: from }, start: { gte: wallToDb(localNow) }, status: { in: ["unconfirmed", "confirmed"] } },
      orderBy: { start: "asc" },
      select: { id: true, start: true, status: true },
    });
    await tx.messageLog.create({
      data: { clinicId, appointmentId: upcoming?.id ?? null, channel: "sms", direction: "inbound", recipientType: "clinic", to: clinic.settings.notifications.alternateSmsNumber || clinic.phone, event: "two_way_reply", body: text.slice(0, 1000), status: "delivered", createdAt: now, sentAt: now, provider: "inbound" },
    });
    let label: string | undefined;
    const jobs: QueuedJob[] = [];
    if (intent === "confirm" && upcoming) {
      label = format(fromWall(dbToWall(upcoming.start)), "EEE, MMM d 'at' h:mm a");
      if (upcoming.status === "unconfirmed") await setAppointmentStatus(tx, clinicId, upcoming.id, { status: "confirmed", by: "Patient (SMS reply C)", silent: true, now }, { ...SYSTEM_ACTOR, name: "Patient (SMS reply C)", role: "patient" });
    }
    if (intent === "stop") await tx.optOut.upsert({ where: { clinicId_phone_kind: { clinicId, phone: from, kind: "sms_stop" } }, create: { clinicId, phone: from, kind: "sms_stop", at: now }, update: {} });
    if (intent === "start") await tx.optOut.deleteMany({ where: { clinicId, phone: from, kind: "sms_stop" } });
    const reply = smsAutoReply(intent, clinic, label);
    // Carrier rules: STOP/HELP replies are always allowed; other replies are queued like any outbound SMS.
    const row = await tx.messageLog.create({
      data: { clinicId, appointmentId: upcoming?.id ?? null, channel: "sms", direction: "outbound", recipientType: "patient", to: from, event: "two_way_reply", body: reply, status: "queued", createdAt: new Date(now.getTime() + 1) },
    });
    jobs.push({ messageId: row.id });
    return { intent, reply, jobs };
  });
}
