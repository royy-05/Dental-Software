import { addDays, addMinutes, startOfDay, subDays, subHours, subMinutes } from "date-fns";
import type {
  Appointment,
  AppointmentStatus,
  Clinic,
  ClinicInsurance,
  Operatory,
  PatientType,
  Provider,
  Reason,
  Referrer,
  Source,
  StepKey,
  Weekday,
  WidgetSession,
} from "@/types";
import { dayKey, fromWall, hm, minuteOfDay, nowInZone, overlaps, toWall } from "@/lib/time";
import { createRng, type Rng } from "./rng";
import { FIRST_NAMES, LAST_NAMES, fakePhone } from "./names";

/** Days of generated history: 45 past days + today + 14 future days = 60 days. */
export const PAST_DAYS = 45;
export const FUTURE_DAYS = 14;

interface Person {
  firstName: string;
  lastName: string;
  dob: string;
  phone: string;
  email: string;
}

function people(rng: Rng, n: number, offset: number): Person[] {
  const out: Person[] = [];
  for (let i = 0; i < n; i++) {
    const firstName = rng.pick(FIRST_NAMES);
    const lastName = rng.pick(LAST_NAMES);
    const year = rng.int(1950, 2018);
    out.push({
      firstName,
      lastName,
      dob: `${year}-${String(rng.int(1, 12)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`,
      phone: fakePhone(offset + i),
      email: `${firstName}.${lastName}${i}`.toLowerCase() + "@example.com",
    });
  }
  return out;
}

const SOURCE_WEIGHTS: [Source, number][] = [
  ["google_ads", 26],
  ["gbp", 24],
  ["website", 22],
  ["rwg", 8],
  ["custom", 8],
  ["direct", 6],
  ["staff", 6],
];

const SOURCE_TO_REFERRER: Partial<Record<Source, string>> = { google_ads: "1", gbp: "2", rwg: "3", website: "4", custom: "5" };

function pastStatus(rng: Rng): AppointmentStatus {
  return rng.weighted<AppointmentStatus>([
    ["complete", 74],
    ["no_show", 7],
    ["cancelled", 11],
    ["declined", 3],
    ["confirmed", 5],
  ]);
}
function futureStatus(rng: Rng): AppointmentStatus {
  return rng.weighted<AppointmentStatus>([
    ["confirmed", 52],
    ["unconfirmed", 36],
    ["cancelled", 9],
    ["declined", 3],
  ]);
}

export interface GenInput {
  clinic: Clinic;
  providers: Provider[];
  reasons: Reason[];
  operatories: Operatory[];
  insurances: ClinicInsurance[];
  referrers: Referrer[];
  now: Date;
  seed: number;
}

export function generateAppointments(input: GenInput): Appointment[] {
  const { clinic, providers, reasons, operatories, insurances, now } = input;
  const rng = createRng(input.seed);
  const clinicNow = nowInZone(clinic.timeZone, now);
  const today = startOfDay(clinicNow);
  const pool = people(rng, 160, input.seed % 50);
  const out: Appointment[] = [];
  const busyProvider = new Map<string, [number, number][]>();
  const busyOp = new Map<string, [number, number][]>();
  let n = 0;

  for (let offset = -PAST_DAYS; offset <= FUTURE_DAYS; offset++) {
    const day = addDays(today, offset);
    const wd = day.getDay() as Weekday;
    const clinicHours = clinic.hours[wd];
    if (!clinicHours.enabled) continue;
    for (const p of providers) {
      const ph = p.weeklyHours[wd];
      if (!ph.enabled || !p.active) continue;
      const dk = dayKey(day);
      if (p.timeOff.some((t) => dk >= t.start && dk <= t.end)) continue;
      const winStart = Math.max(hm(ph.start), hm(clinicHours.start));
      const winEnd = Math.min(hm(ph.end), hm(clinicHours.end));
      const pReasons = reasons.filter((r) => r.providerIds.includes(p.id));
      if (!pReasons.length) continue;
      const target = offset < 0 ? rng.int(2, 5) : rng.int(0, Math.max(1, 5 - Math.floor(offset / 3)));
      for (let k = 0; k < target; k++) {
        for (let attempt = 0; attempt < 8; attempt++) {
          const reason = rng.pick(pReasons);
          const slots = Math.floor((winEnd - winStart - reason.duration) / 15);
          if (slots < 0) break;
          const startMin = winStart + rng.int(0, slots) * 15;
          const endMin = startMin + reason.duration;
          if (p.breaks.some((b) => (b.weekday === "all" || b.weekday === wd) && overlaps(startMin, endMin, hm(b.start), hm(b.end)))) continue;
          const pk = `${p.id}|${dk}`;
          const pBusy = busyProvider.get(pk) ?? [];
          if (pBusy.some(([s, e]) => overlaps(startMin, endMin, s, e))) continue;
          const opChoices = reason.operatoryIds.filter((o) => p.operatoryIds.includes(o) && operatories.some((x) => x.id === o && x.active));
          const op = opChoices.find((o) => !(busyOp.get(`${o}|${dk}`) ?? []).some(([s, e]) => overlaps(startMin, endMin, s, e)));
          if (opChoices.length && !op) continue;
          pBusy.push([startMin, endMin]);
          busyProvider.set(pk, pBusy);
          if (op) busyOp.set(`${op}|${dk}`, [...(busyOp.get(`${op}|${dk}`) ?? []), [startMin, endMin]]);

          const start = addMinutes(day, startMin);
          const end = addMinutes(day, endMin);
          const isPast = start < clinicNow;
          const leadHours = rng.weighted<number>([
            [rng.int(2, 24), 25],
            [rng.int(24, 96), 35],
            [rng.int(96, 336), 30],
            [rng.int(336, 600), 10],
          ]);
          let created = subHours(start, leadHours);
          if (created > clinicNow) created = subMinutes(clinicNow, rng.int(5, 600));
          const status = isPast ? pastStatus(rng) : futureStatus(rng);
          const patientType: PatientType = reason.patientType === "both" ? (rng.chance(0.35) ? "new" : "existing") : reason.patientType;
          const person = rng.pick(pool);
          const source: Source = reason.visibility === "staff_only" ? "staff" : rng.weighted(SOURCE_WEIGHTS);
          const referrerId = SOURCE_TO_REFERRER[source];
          const hasIns = rng.chance(0.7) && insurances.length > 0;
          const ins = hasIns ? rng.pick(insurances) : undefined;
          const createdIso = new Date(created.getTime()).toISOString();
          const history: Appointment["statusHistory"] = [{ status: "unconfirmed", at: createdIso, by: source === "staff" ? "Front Desk" : "Patient (online)" }];
          if (status !== "unconfirmed") {
            const at = new Date(Math.min(created.getTime() + 3 * 3600000, clinicNow.getTime())).toISOString();
            if (status === "complete" || status === "no_show") history.push({ status: "confirmed", at, by: "Patient (SMS reply C)" });
            history.push({
              status,
              at: status === "complete" || status === "no_show" ? end.toISOString() : at,
              by: status === "confirmed" ? (rng.chance(0.5) ? "Patient (SMS reply C)" : "Fiona Diaz") : status === "cancelled" ? "Patient (cancel link)" : "Front Desk",
            });
          }
          const answers: Appointment["answers"] = {};
          for (const qq of reason.questions) {
            if (qq.options?.length) answers[qq.id] = rng.pick(qq.options);
          }
          n += 1;
          out.push({
            id: `a_${clinic.id.slice(2, 6)}_${n}`,
            clinicId: clinic.id,
            createdAt: createdIso,
            start: toWall(start),
            end: toWall(end),
            reasonId: reason.id,
            providerId: p.id,
            operatoryId: op,
            patientType,
            patient: { ...person, message: rng.chance(0.15) ? "Please call if an earlier slot opens up." : "" },
            bookingForSomeoneElse: rng.chance(0.08),
            bookerName: undefined,
            insurance: ins
              ? {
                  hasInsurance: true,
                  carrierName: ins.name,
                  networkStatus: ins.status,
                  subscriberName: `${person.firstName} ${person.lastName}`,
                  subscriberId: `SUB${rng.int(100000, 999999)}`,
                  subscriberDob: person.dob,
                }
              : { hasInsurance: false },
            answers,
            files: [],
            source,
            referrerId,
            utm:
              source === "google_ads"
                ? { source: "google", medium: "cpc", campaign: rng.pick(["brand", "emergency-dentist", "near-me", "new-patients"]), term: rng.pick(["dentist near me", "physio", "dermatologist", "emergency"]) }
                : source === "custom"
                  ? { source: "facebook", medium: "paid_social", campaign: "spring-offer" }
                  : source === "gbp"
                    ? { source: "google", medium: "organic", campaign: "gbp-listing" }
                    : {},
            gclid: source === "google_ads" ? `Cj0KCQ${rng.int(10000000, 99999999)}` : undefined,
            fbclid: source === "custom" ? `IwAR${rng.int(10000000, 99999999)}` : undefined,
            status,
            declineReason: status === "declined" ? rng.pick(["Outside service area", "Needs referral first", "Duplicate request"]) : undefined,
            statusHistory: history,
            notes: rng.chance(0.06) ? [{ id: `n_${n}`, at: createdIso, by: "Fiona Diaz", text: "Patient prefers morning appointments." }] : [],
            smsConsent: { given: rng.chance(0.85), at: createdIso, termsVersion: "2026-01", ip: `203.0.113.${rng.int(1, 254)}` },
            bookedBy: source === "staff" ? "staff" : "patient",
            token: `tk${input.seed}${n}${rng.int(1000, 9999)}`,
          });
          break;
        }
      }
    }
  }
  return out;
}

const STEP_FUNNEL: [StepKey, number][] = [
  ["reason", 34],
  ["datetime", 31],
  ["details", 24],
  ["review", 11],
];

/** Widget visit sessions (no PHI) for Form Analytics. */
export function generateSessions(clinic: Clinic, appts: Appointment[], now: Date, seed: number): WidgetSession[] {
  const rng = createRng(seed + 7);
  const out: WidgetSession[] = [];
  const clinicNow = nowInZone(clinic.timeZone, now);
  const cutoff = subDays(clinicNow, 60);
  let n = 0;
  const booked = appts.filter((a) => a.bookedBy === "patient" && new Date(a.createdAt) >= cutoff);
  for (const a of booked) {
    const local = new Date(a.createdAt);
    out.push({
      id: `ws_${clinic.id.slice(2, 6)}_${++n}`,
      clinicId: clinic.id,
      at: a.createdAt,
      localHour: local.getHours(),
      localWeekday: local.getDay() as Weekday,
      source: a.source,
      reasonId: a.reasonId,
      furthestStep: "review",
      booked: true,
    });
  }
  const reasonIds = [...new Set(appts.map((a) => a.reasonId))];
  const abandoned = Math.round(booked.length * 1.6);
  for (let i = 0; i < abandoned; i++) {
    const day = subDays(startOfDay(clinicNow), rng.int(0, 59));
    const hour = rng.weighted<number>([
      [7, 3], [8, 6], [9, 9], [10, 9], [11, 8], [12, 10], [13, 8], [14, 7], [15, 6], [16, 6], [17, 7], [18, 8], [19, 9], [20, 8], [21, 6], [22, 3],
    ]);
    const local = addMinutes(day, hour * 60 + rng.int(0, 59));
    if (local > clinicNow) continue;
    const furthestStep = rng.weighted(STEP_FUNNEL);
    out.push({
      id: `ws_${clinic.id.slice(2, 6)}_${++n}`,
      clinicId: clinic.id,
      at: local.toISOString(),
      localHour: local.getHours(),
      localWeekday: local.getDay() as Weekday,
      source: rng.weighted(SOURCE_WEIGHTS.filter(([s]) => s !== "staff")),
      reasonId: furthestStep === "reason" ? undefined : rng.pick(reasonIds),
      furthestStep,
      booked: false,
    });
  }
  return out;
}

export function minuteOf(wall: string): number {
  return minuteOfDay(fromWall(wall));
}
