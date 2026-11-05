import type { Source, StepKey, Weekday, WidgetEventName } from "@/types";
import { nowInZone } from "@/lib/time";
import type { Tx } from "../db";

const STEP_RANK: Record<StepKey, number> = { reason: 0, provider: 1, datetime: 2, details: 3, insurance: 4, intake: 5, review: 6 };

/** Widget funnel events (section 3 "drop-off tracking"): raw events plus one aggregated session row. No PHI. */
export async function recordWidgetEvents(tx: Tx, clinicId: string, sessionId: string, events: { name: WidgetEventName; step?: StepKey; reasonId?: string; source: Source }[], now = new Date()) {
  const clinic = await tx.clinic.findUniqueOrThrow({ where: { id: clinicId }, select: { timeZone: true } });
  let session = await tx.widgetSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    const local = nowInZone(clinic.timeZone, now);
    session = await tx.widgetSession.create({ data: { id: sessionId, clinicId, at: now, localHour: local.getHours(), localWeekday: local.getDay() as Weekday, source: events[0]?.source ?? "direct", furthestStep: "reason" } });
  }
  let furthest = session.furthestStep as StepKey;
  let reasonId = session.reasonId;
  let booked = session.booked;
  await tx.widgetEvent.createMany({ data: events.map((e) => ({ clinicId, sessionId, name: e.name, step: e.step ?? null, reasonId: e.reasonId ?? null, source: e.source, at: now })) });
  for (const e of events) {
    if (e.reasonId) reasonId = e.reasonId;
    if (e.step && STEP_RANK[e.step] > STEP_RANK[furthest]) furthest = e.step;
    if (e.name === "booking_completed") {
      booked = true;
      furthest = "review";
    }
  }
  await tx.widgetSession.update({ where: { id: sessionId }, data: { furthestStep: furthest, reasonId, booked } });
}
