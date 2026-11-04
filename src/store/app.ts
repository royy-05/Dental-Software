"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { format } from "date-fns";
import type {
  Appointment,
  AppointmentStatus,
  AuditEntry,
  MessageLog,
  Role,
  SlotHold,
  WidgetEvent,
  WidgetEventName,
  StepKey,
  Source,
  Weekday,
} from "@/types";
import { buildSeed, DB_VERSION, type Db } from "@/mock";
import { buildMessages, interpretSmsReply, smsAutoReply, type NotifyEvent } from "@/lib/notify";
import { createHold, isSlotAvailable, type Slot, type SlotContext } from "@/lib/slots";
import { fromWall, nowInZone, toWall } from "@/lib/time";
import { impersonationRole } from "@/lib/permissions";
import { uid } from "@/lib/utils";

export type { Db };

export interface Impersonation {
  clinicId: string;
  reason: string;
  byUserId: string;
  startedAt: string;
}

export interface Session {
  userId?: string;
  clinicId?: string;
  hidePhi: boolean;
  impersonation?: Impersonation;
}

export type NewAppointmentInput = Omit<
  Appointment,
  "id" | "createdAt" | "status" | "statusHistory" | "notes" | "token" | "end"
> & { end?: string; status?: AppointmentStatus; holdId?: string; sessionId?: string };

export interface AppState {
  hydrated: boolean;
  db: Db;
  session: Session;
  setHydrated: () => void;
  // session
  login: (userId: string) => void;
  logout: () => void;
  setClinic: (clinicId: string) => void;
  setHidePhi: (v: boolean) => void;
  startImpersonation: (clinicId: string, reason: string) => void;
  stopImpersonation: () => void;
  // generic
  mutate: (fn: (db: Db) => void) => void;
  logAudit: (e: Omit<AuditEntry, "id" | "at" | "actorId" | "actorName" | "actorRole" | "ip"> & Partial<Pick<AuditEntry, "actorName" | "actorRole">>) => void;
  resetDemo: () => void;
  // slots & bookings
  slotContext: (clinicId: string, reasonId: string, extra?: Partial<SlotContext>) => SlotContext | null;
  holdSlot: (clinicId: string, slot: Slot, sessionId: string) => SlotHold;
  releaseHold: (holdId: string) => void;
  createAppointment: (input: NewAppointmentInput, by: string) => { ok: true; appointment: Appointment } | { ok: false; error: string };
  setAppointmentStatus: (id: string, status: AppointmentStatus, opts?: { by?: string; note?: string; declineReason?: string; silent?: boolean }) => void;
  rescheduleAppointment: (id: string, slot: { start: Date; providerId: string; operatoryId?: string; end?: Date }, by: string) => { ok: boolean; error?: string };
  addAppointmentNote: (id: string, text: string) => void;
  notify: (appointmentId: string, event: NotifyEvent) => MessageLog[];
  simulateInboundSms: (clinicId: string, phone: string, text: string) => MessageLog[];
  addMessages: (msgs: MessageLog[]) => void;
  // analytics (no PHI)
  logWidgetEvent: (e: { clinicId: string; sessionId: string; name: WidgetEventName; step?: StepKey; reasonId?: string; source: Source }) => void;
}

const STEP_RANK: Record<StepKey, number> = { reason: 0, provider: 1, datetime: 2, details: 3, insurance: 4, intake: 5, review: 6 };

function fakeIp(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `203.0.113.${(h % 250) + 2}`;
}

export const useApp = create<AppState>()(
  persist(
    immer((set, get) => ({
      hydrated: false,
      db: buildSeed(),
      session: { hidePhi: false },
      setHydrated: () => set({ hydrated: true }),

      login: (userId) =>
        set((s) => {
          const user = s.db.users.find((u) => u.id === userId);
          if (!user) return;
          s.session.userId = userId;
          s.session.impersonation = undefined;
          s.session.clinicId = user.clinicIds[0] ?? s.db.clinics[0]?.id;
          user.lastLoginAt = new Date().toISOString();
          s.db.audit.unshift({
            id: uid("au"),
            at: new Date().toISOString(),
            actorId: user.id,
            actorName: user.name,
            actorRole: user.role,
            action: "Logged in",
            category: "login",
            target: user.role === "super_admin" || user.role === "support_agent" ? "Super admin panel" : "Clinic panel",
            ip: fakeIp(user.id),
          });
        }),
      logout: () => set((s) => void (s.session = { hidePhi: s.session.hidePhi })),
      setClinic: (clinicId) => set((s) => void (s.session.clinicId = clinicId)),
      setHidePhi: (v) => set((s) => void (s.session.hidePhi = v)),
      startImpersonation: (clinicId, reason) =>
        set((s) => {
          const user = s.db.users.find((u) => u.id === s.session.userId);
          if (!user) return;
          s.session.impersonation = { clinicId, reason, byUserId: user.id, startedAt: new Date().toISOString() };
          s.session.clinicId = clinicId;
          const clinic = s.db.clinics.find((c) => c.id === clinicId);
          s.db.audit.unshift({
            id: uid("au"),
            at: new Date().toISOString(),
            actorId: user.id,
            actorName: user.name,
            actorRole: user.role,
            action: "Impersonated clinic",
            category: "impersonation",
            target: clinic?.name ?? clinicId,
            clinicId,
            ip: fakeIp(user.id),
            details: `Reason: ${reason}`,
          });
        }),
      stopImpersonation: () =>
        set((s) => {
          const imp = s.session.impersonation;
          if (!imp) return;
          const user = s.db.users.find((u) => u.id === imp.byUserId);
          s.db.audit.unshift({
            id: uid("au"),
            at: new Date().toISOString(),
            actorId: imp.byUserId,
            actorName: user?.name ?? "Unknown",
            actorRole: user?.role ?? "super_admin",
            action: "Ended impersonation",
            category: "impersonation",
            target: s.db.clinics.find((c) => c.id === imp.clinicId)?.name ?? imp.clinicId,
            clinicId: imp.clinicId,
            ip: fakeIp(imp.byUserId),
          });
          s.session.impersonation = undefined;
        }),

      mutate: (fn) => set((s) => void fn(s.db)),

      logAudit: (e) =>
        set((s) => {
          const user = s.db.users.find((u) => u.id === s.session.userId);
          s.db.audit.unshift({
            id: uid("au"),
            at: new Date().toISOString(),
            actorId: user?.id ?? "anonymous",
            actorName: e.actorName ?? user?.name ?? "Patient",
            actorRole: e.actorRole ?? user?.role ?? "patient",
            ip: fakeIp(user?.id ?? "patient"),
            ...e,
          });
          if (s.db.audit.length > 2000) s.db.audit.length = 2000;
        }),

      resetDemo: () => {
        const session = get().session;
        set((s) => {
          s.db = buildSeed(new Date());
          s.session = { hidePhi: false, userId: session.userId, clinicId: session.clinicId };
        });
        get().logAudit({ action: "Reset demo data", category: "settings", target: "Platform" });
      },

      slotContext: (clinicId, reasonId, extra) => {
        const db = get().db;
        const clinic = db.clinics.find((c) => c.id === clinicId);
        const reason = db.reasons.find((r) => r.id === reasonId);
        const flow = db.flows.find((f) => f.clinicId === clinicId);
        if (!clinic || !reason || !flow) return null;
        return {
          reason,
          providers: db.providers.filter((p) => p.clinicId === clinicId),
          operatories: db.operatories.filter((o) => o.clinicId === clinicId),
          clinicHours: clinic.hours,
          holidays: clinic.holidays,
          blockouts: clinic.blockouts.filter((b) => !clinic.settings.scheduling.blockoutsToSkip.includes(b.id)),
          appointments: db.appointments.filter((a) => a.clinicId === clinicId),
          holds: db.holds.filter((h) => h.clinicId === clinicId),
          rules: flow.published.rules,
          now: nowInZone(clinic.timeZone),
          ...extra,
        };
      },

      holdSlot: (clinicId, slot, sessionId) => {
        const hold = createHold(slot, clinicId, sessionId);
        set((s) => {
          const now = Date.now();
          s.db.holds = s.db.holds.filter((h) => h.expiresAt > now && h.sessionId !== sessionId);
          s.db.holds.push(hold);
        });
        return hold;
      },
      releaseHold: (holdId) => set((s) => void (s.db.holds = s.db.holds.filter((h) => h.id !== holdId))),

      createAppointment: (input, by) => {
        const state = get();
        const db = state.db;
        const clinic = db.clinics.find((c) => c.id === input.clinicId);
        const reason = db.reasons.find((r) => r.id === input.reasonId);
        if (!clinic || !reason) return { ok: false, error: "Clinic or reason not found." };
        const start = fromWall(input.start);
        const staff = input.bookedBy === "staff";
        const ctx = state.slotContext(input.clinicId, input.reasonId, { sessionId: input.sessionId, staffOverride: staff });
        if (!ctx) return { ok: false, error: "Booking configuration missing." };
        if (input.holdId) {
          const hold = db.holds.find((h) => h.id === input.holdId);
          if (!hold || hold.expiresAt <= Date.now()) {
            // Hold expired: only proceed if the slot is still free.
            if (!isSlotAvailable({ start, providerId: input.providerId }, ctx)) {
              return { ok: false, error: "Your 5 minute hold expired and this time was taken. Please pick another time." };
            }
          }
        }
        const free = isSlotAvailable({ start, providerId: input.providerId }, ctx);
        if (!free) return { ok: false, error: "That time is no longer available. Please pick another time." };
        const nowIso = new Date().toISOString();
        const status: AppointmentStatus = input.status ?? "unconfirmed";
        const { holdId: _h, sessionId: _s, ...rest } = input;
        const appointment: Appointment = {
          ...rest,
          id: uid("a"),
          end: input.end ?? toWall(free.end),
          operatoryId: input.operatoryId ?? free.operatoryId,
          createdAt: nowIso,
          status,
          statusHistory: [{ status, at: nowIso, by }],
          notes: [],
          token: uid("tk"),
        };
        set((s) => {
          s.db.appointments.push(appointment);
          if (input.holdId) s.db.holds = s.db.holds.filter((h) => h.id !== input.holdId);
          s.db.notifications.unshift({
            id: uid("nt"),
            clinicId: clinic.id,
            at: nowIso,
            title: staff ? "Staff booking added" : "New online booking",
            body: `${reason.name} on ${format(start, "EEE, MMM d")} at ${format(start, "h:mm a")}`,
            read: false,
            href: `/clinic/appointments?open=${appointment.id}`,
          });
        });
        state.logAudit({
          action: staff ? "Created manual booking" : "Patient booked online",
          category: "booking",
          target: appointment.id,
          clinicId: clinic.id,
          ...(staff ? {} : { actorName: "Patient (booking widget)", actorRole: "patient" as const }),
        });
        get().notify(appointment.id, "booked");
        return { ok: true, appointment };
      },

      setAppointmentStatus: (id, status, opts = {}) => {
        const before = get().db.appointments.find((a) => a.id === id);
        if (!before || before.status === status) return;
        const by = opts.by ?? get().db.users.find((u) => u.id === get().session.userId)?.name ?? "System";
        set((s) => {
          const a = s.db.appointments.find((x) => x.id === id);
          if (!a) return;
          a.status = status;
          if (opts.declineReason) a.declineReason = opts.declineReason;
          a.statusHistory.push({ status, at: new Date().toISOString(), by, note: opts.note ?? opts.declineReason });
          if (status === "cancelled") {
            s.db.notifications.unshift({
              id: uid("nt"),
              clinicId: a.clinicId,
              at: new Date().toISOString(),
              title: "Appointment cancelled",
              body: `${a.start.slice(0, 10)} at ${format(fromWall(a.start), "h:mm a")}`,
              read: false,
              href: `/clinic/appointments?open=${a.id}`,
            });
          }
        });
        get().logAudit({ action: `Set status to ${status}`, category: "booking", target: id, clinicId: before.clinicId });
        if (opts.silent) return;
        if (status === "cancelled") get().notify(id, "cancelled");
        if (status === "declined") get().notify(id, "declined");
      },

      rescheduleAppointment: (id, slot, by) => {
        const state = get();
        const appt = state.db.appointments.find((a) => a.id === id);
        if (!appt) return { ok: false, error: "Appointment not found" };
        const staff = by !== "Patient (reschedule link)";
        const ctx = state.slotContext(appt.clinicId, appt.reasonId, { ignoreAppointmentId: id, staffOverride: staff });
        if (!ctx) return { ok: false, error: "Configuration missing" };
        const free = isSlotAvailable({ start: slot.start, providerId: slot.providerId }, ctx);
        if (!free) return { ok: false, error: "That time is no longer available." };
        set((s) => {
          const a = s.db.appointments.find((x) => x.id === id)!;
          const prev = a.start;
          a.start = toWall(free.start);
          a.end = toWall(free.end);
          a.providerId = free.providerId;
          a.operatoryId = slot.operatoryId ?? free.operatoryId;
          if (a.status === "cancelled" || a.status === "declined") a.status = "unconfirmed";
          a.statusHistory.push({ status: a.status, at: new Date().toISOString(), by, note: `Rescheduled from ${prev.replace("T", " ")}` });
        });
        state.logAudit({ action: "Rescheduled appointment", category: "booking", target: id, clinicId: appt.clinicId, ...(staff ? {} : { actorName: "Patient (reschedule link)", actorRole: "patient" as const }) });
        get().notify(id, "rescheduled");
        return { ok: true };
      },

      addAppointmentNote: (id, text) =>
        set((s) => {
          const a = s.db.appointments.find((x) => x.id === id);
          const user = s.db.users.find((u) => u.id === s.session.userId);
          if (a) a.notes.push({ id: uid("n"), at: new Date().toISOString(), by: user?.name ?? "Staff", text });
        }),

      notify: (appointmentId, event) => {
        const db = get().db;
        const appt = db.appointments.find((a) => a.id === appointmentId);
        if (!appt) return [];
        const clinic = db.clinics.find((c) => c.id === appt.clinicId)!;
        const msgs = buildMessages(event, {
          clinic,
          appointment: appt,
          reason: db.reasons.find((r) => r.id === appt.reasonId),
          provider: db.providers.find((p) => p.id === appt.providerId),
          templates: db.templates.filter((t) => t.clinicId === clinic.id),
          optOuts: db.optOuts,
          now: new Date(),
          quietHours: { start: db.platform.messaging.quietHoursStart, end: db.platform.messaging.quietHoursEnd },
          baseUrl: typeof window !== "undefined" ? window.location.origin : undefined,
        });
        get().addMessages(msgs);
        return msgs;
      },

      addMessages: (msgs) =>
        set((s) => {
          s.db.messages.unshift(...msgs);
          for (const m of msgs) {
            const c = s.db.clinics.find((x) => x.id === m.clinicId);
            if (!c || m.direction !== "outbound") continue;
            if (m.channel === "sms") c.smsCreditsUsed += Math.max(1, Math.ceil(m.body.length / 153));
            else c.emailsSent += 1;
          }
          if (s.db.messages.length > 3000) s.db.messages.length = 3000;
        }),

      simulateInboundSms: (clinicId, phone, text) => {
        const db = get().db;
        const clinic = db.clinics.find((c) => c.id === clinicId);
        if (!clinic) return [];
        const intent = interpretSmsReply(text);
        const localNow = toWall(nowInZone(clinic.timeZone));
        const upcoming = db.appointments
          .filter((a) => a.clinicId === clinicId && a.patient.phone === phone && a.start >= localNow && ["unconfirmed", "confirmed"].includes(a.status))
          .sort((a, b) => a.start.localeCompare(b.start))[0];
        const nowIso = new Date().toISOString();
        const inbound: MessageLog = {
          id: uid("msg"),
          clinicId,
          appointmentId: upcoming?.id,
          channel: "sms",
          direction: "inbound",
          recipientType: "clinic",
          to: clinic.phone,
          event: "two_way_reply",
          body: text,
          status: "delivered",
          createdAt: nowIso,
        };
        let label: string | undefined;
        if (intent === "confirm" && upcoming) {
          label = format(fromWall(upcoming.start), "EEE, MMM d 'at' h:mm a");
          get().setAppointmentStatus(upcoming.id, "confirmed", { by: "Patient (SMS reply C)", silent: true });
        }
        set((s) => {
          if (intent === "stop" && !s.db.optOuts.some((o) => o.clinicId === clinicId && o.phone === phone)) {
            s.db.optOuts.unshift({ id: uid("oo"), clinicId, phone, at: nowIso, kind: "sms_stop" });
          }
          if (intent === "start") s.db.optOuts = s.db.optOuts.filter((o) => !(o.clinicId === clinicId && o.phone === phone && o.kind === "sms_stop"));
        });
        const reply: MessageLog = {
          id: uid("msg"),
          clinicId,
          appointmentId: upcoming?.id,
          channel: "sms",
          direction: "outbound",
          recipientType: "patient",
          to: phone,
          event: "two_way_reply",
          body: smsAutoReply(intent, clinic, label),
          status: "delivered",
          createdAt: new Date(Date.now() + 1000).toISOString(),
        };
        get().addMessages([reply, inbound]);
        return [inbound, reply];
      },

      logWidgetEvent: (e) =>
        set((s) => {
          const at = new Date().toISOString();
          const evt: WidgetEvent = { id: uid("we"), at, ...e };
          s.db.widgetEvents.push(evt);
          if (s.db.widgetEvents.length > 5000) s.db.widgetEvents.splice(0, s.db.widgetEvents.length - 5000);
          // Keep the aggregated session (Form Analytics) in sync.
          let sess = s.db.widgetSessions.find((w) => w.id === e.sessionId);
          if (!sess) {
            const clinic = s.db.clinics.find((c) => c.id === e.clinicId);
            const local = clinic ? nowInZone(clinic.timeZone) : new Date();
            sess = {
              id: e.sessionId,
              clinicId: e.clinicId,
              at,
              localHour: local.getHours(),
              localWeekday: local.getDay() as Weekday,
              source: e.source,
              furthestStep: "reason",
              booked: false,
            };
            s.db.widgetSessions.push(sess);
          }
          if (e.reasonId) sess.reasonId = e.reasonId;
          if (e.step && STEP_RANK[e.step] > STEP_RANK[sess.furthestStep]) sess.furthestStep = e.step;
          if (e.name === "booking_completed") {
            sess.booked = true;
            sess.furthestStep = "review";
          }
        }),
    })),
    {
      name: "kivi-demo",
      version: DB_VERSION,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ db: s.db, session: s.session }),
      migrate: () => ({ db: buildSeed(), session: { hidePhi: false } }) as unknown as AppState,
    },
  ),
);

// ---------- selectors / hooks ----------

export function useCurrentUser() {
  return useApp((s) => s.db.users.find((u) => u.id === s.session.userId));
}

/** Role used for permission checks (impersonation acts as a clinic role). */
export function useEffectiveRole(): Role | undefined {
  return useApp((s) => {
    const user = s.db.users.find((u) => u.id === s.session.userId);
    if (!user) return undefined;
    return s.session.impersonation ? impersonationRole(user.role) : user.role;
  });
}

/** Clinics the current user may open in the clinic panel. */
export function useAccessibleClinics() {
  const clinics = useApp((s) => s.db.clinics);
  const user = useCurrentUser();
  const imp = useApp((s) => s.session.impersonation);
  if (!user) return [];
  if (imp) return clinics.filter((c) => c.id === imp.clinicId);
  if (user.role === "super_admin" || user.role === "support_agent") return clinics.filter((c) => !c.deletedAt);
  return clinics.filter((c) => user.clinicIds.includes(c.id) && !c.deletedAt);
}

export function useCurrentClinic() {
  return useApp((s) => s.db.clinics.find((c) => c.id === s.session.clinicId));
}

export function actorName(): string {
  const s = useApp.getState();
  return s.db.users.find((u) => u.id === s.session.userId)?.name ?? "Staff";
}
