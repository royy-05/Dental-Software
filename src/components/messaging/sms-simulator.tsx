"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Moon, Send, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/store/app";
import { nowInZone, toWall } from "@/lib/time";
import { quietHoursDeferral } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { usePhiText } from "@/components/shared/phi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Two-way SMS simulator (section 7): pretend to be a patient replying C / STOP / HELP / START.
 * Replies hit the same store action a Twilio webhook would call in production.
 */
export function SmsSimulator({ clinicId, defaultPhone }: { clinicId: string; defaultPhone?: string }) {
  const clinic = useApp((s) => s.db.clinics.find((c) => c.id === clinicId));
  const appointments = useApp((s) => s.db.appointments);
  const messages = useApp((s) => s.db.messages);
  const optOuts = useApp((s) => s.db.optOuts);
  const quiet = useApp((s) => s.db.platform.messaging);
  const simulate = useApp((s) => s.simulateInboundSms);
  const phi = usePhiText();

  const upcoming = useMemo(() => {
    if (!clinic) return [];
    const now = toWall(nowInZone(clinic.timeZone));
    return appointments
      .filter((a) => a.clinicId === clinicId && a.start >= now && (a.status === "unconfirmed" || a.status === "confirmed"))
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 25);
  }, [appointments, clinic, clinicId]);

  const [phone, setPhone] = useState(defaultPhone ?? upcoming.find((a) => a.status === "unconfirmed")?.patient.phone ?? upcoming[0]?.patient.phone ?? "");
  const [text, setText] = useState("");

  if (!clinic) return null;
  const thread = messages
    .filter((m) => m.clinicId === clinicId && m.channel === "sms" && (m.to === phone || (m.direction === "inbound" && m.appointmentId && appointments.find((a) => a.id === m.appointmentId)?.patient.phone === phone)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-12);
  const optedOut = optOuts.some((o) => o.clinicId === clinicId && o.phone === phone);
  const localNow = nowInZone(clinic.timeZone);
  const quietUntil = quietHoursDeferral(localNow, { start: quiet.quietHoursStart, end: quiet.quietHoursEnd });

  const send = (body: string) => {
    if (!phone || !body.trim()) return;
    const [, reply] = simulate(clinicId, phone, body.trim());
    toast.success("Reply processed", { description: reply?.body });
    setText("");
  };

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
      <div className="grid content-start gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="sim-phone">Patient mobile</Label>
          <select id="sim-phone" className="h-10 rounded-md border border-input bg-card px-3 text-sm" value={phone} onChange={(e) => setPhone(e.target.value)}>
            {upcoming.length === 0 && <option value="">No upcoming appointments</option>}
            {[...new Map(upcoming.map((a) => [a.patient.phone, a])).values()].map((a) => (
              <option key={a.id} value={a.patient.phone}>
                {phi(a.patient.phone)} · {format(new Date(a.start), "MMM d h:mm a")} · {a.status}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">
          Reply <strong>C</strong> confirms the next appointment, <strong>STOP</strong> opts out, <strong>HELP</strong> sends help text, <strong>START</strong> opts back in.
        </p>
        <div className="flex flex-wrap gap-2">
          {["C", "STOP", "HELP", "START"].map((k) => (
            <Button key={k} variant="outline" size="sm" onClick={() => send(k)} disabled={!phone}>
              Reply “{k}”
            </Button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <Input aria-label="Custom reply" placeholder="Type any reply…" value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" size="icon" aria-label="Send reply" disabled={!phone}>
            <Send />
          </Button>
        </form>
        {optedOut && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-900">This number has opted out (STOP). Outbound texts to it will fail.</p>}
        <p className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-xs", quietUntil ? "bg-indigo-50 text-indigo-950" : "bg-muted text-muted-foreground")}>
          <Moon className="h-3.5 w-3.5" aria-hidden />
          Quiet hours {quiet.quietHoursStart}:00–{quiet.quietHoursEnd}:00 patient local time.{" "}
          {quietUntil ? `It's quiet hours now (${format(localNow, "h:mm a")}): new patient texts are scheduled for ${format(quietUntil, "h:mm a")}.` : `Now ${format(localNow, "h:mm a")} clinic time: texts send immediately.`}
        </p>
      </div>
      <div className="rounded-xl border bg-slate-50 p-3" aria-label="SMS thread" role="log">
        <p className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <Smartphone className="h-3.5 w-3.5" aria-hidden /> {phi(phone) || "No number"}
        </p>
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {thread.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No texts with this number yet.</p>}
          {thread.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                m.direction === "inbound" ? "self-end bg-primary text-primary-foreground" : "self-start bg-white shadow-sm",
              )}
            >
              <p className="whitespace-pre-wrap">{phi(m.body) === "••••••" ? "••••••" : m.body}</p>
              <p className={cn("mt-1 text-[10px]", m.direction === "inbound" ? "text-white/80" : "text-muted-foreground")}>
                {format(new Date(m.createdAt), "MMM d, h:mm a")} · {m.status}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
