"use client";

import { useState } from "react";
import { Moon } from "lucide-react";
import type { Clinic } from "@/types";
import { DeliveryLog } from "@/components/messaging/delivery-log";
import { SmsSimulator } from "@/components/messaging/sms-simulator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, SettingsCard, ToggleRow, useSaveClinic } from "./common";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export function NotificationSettings({ clinic }: { clinic: Clinic }) {
  const save = useSaveClinic();
  // Platform quiet-hours defaults (section 7); the platform team changes them in System settings.
  const quiet = { quietHoursStart: 21, quietHoursEnd: 8 };
  const [n, setN] = useState(clinic.settings.notifications);
  const [emails, setEmails] = useState(n.extraAlertEmails.join(", "));
  const emailList = emails.split(",").map((e) => e.trim()).filter(Boolean);
  const emailError = emailList.some((e) => !EMAIL_RE.test(e)) ? "One of the emails isn't valid." : !EMAIL_RE.test(n.clinicAlertEmail) ? "Clinic alert email isn't valid." : undefined;
  const hoursError = n.reminderFirstHours < 1 || n.reminderSecondHours < 1 || n.reminderSecondHours >= n.reminderFirstHours ? "The second reminder must be sooner than the first, and both at least 1 hour." : undefined;

  return (
    <div className="grid gap-6">
      <SettingsCard
        title="Notifications"
        description="Each email and SMS event can also be switched on or off in Templates."
        footer={
          <Button
            disabled={!!emailError || !!hoursError}
            onClick={() => save("Updated notification settings", (c) => void (c.settings.notifications = { ...n, extraAlertEmails: emailList, alternateSmsNumber: n.alternateSmsNumber || undefined }))}
          >
            Save
          </Button>
        }
      >
        <ToggleRow id="nt-sms-clinic" label="SMS alerts to the clinic" description="Text the clinic for each new booking and cancellation." checked={n.smsAlertsToClinic} onChange={(v) => setN({ ...n, smsAlertsToClinic: v })} />
        <ToggleRow id="nt-patient" label="Notify patient after booking" description="Send the booked email and SMS right away." checked={n.notifyPatientAfterBooking} onChange={(v) => setN({ ...n, notifyPatientAfterBooking: v })} />
        <ToggleRow id="nt-reminders" label="Appointment reminders" checked={n.remindersEnabled} onChange={(v) => setN({ ...n, remindersEnabled: v })} />
        {n.remindersEnabled && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="nt-r1">First reminder (hours before)</Label>
              <Input id="nt-r1" type="number" min={1} max={168} value={n.reminderFirstHours} onChange={(e) => setN({ ...n, reminderFirstHours: Number(e.target.value) })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nt-r2">Second reminder (hours before)</Label>
              <Input id="nt-r2" type="number" min={1} max={48} value={n.reminderSecondHours} onChange={(e) => setN({ ...n, reminderSecondHours: Number(e.target.value) })} />
            </div>
            <div className="sm:col-span-2">
              <FieldError msg={hoursError} />
            </div>
          </div>
        )}
        <ToggleRow id="nt-summary" label="Daily summary of tomorrow's schedule" description="Emailed to the clinic each evening." checked={n.dailySummary} onChange={(v) => setN({ ...n, dailySummary: v })} />
        <ToggleRow id="nt-reason" label="Leave the visit reason out of SMS" description="Protects privacy on shared phones; texts say “appointment” instead." checked={n.leaveReasonOutOfSms} onChange={(v) => setN({ ...n, leaveReasonOutOfSms: v })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="nt-alert">Clinic alert email</Label>
            <Input id="nt-alert" type="email" value={n.clinicAlertEmail} onChange={(e) => setN({ ...n, clinicAlertEmail: e.target.value.trim() })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nt-alt-sms">Alternate SMS number for alerts</Label>
            <Input id="nt-alt-sms" type="tel" placeholder={clinic.phone} value={n.alternateSmsNumber ?? ""} onChange={(e) => setN({ ...n, alternateSmsNumber: e.target.value })} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="nt-extra">Extra alert emails (comma-separated)</Label>
            <Input id="nt-extra" value={emails} placeholder="owner@example.com, manager@example.com" onChange={(e) => setEmails(e.target.value)} />
            <FieldError msg={emailError} />
          </div>
        </div>
        <p className="flex items-start gap-2 rounded-md bg-indigo-50 px-3 py-2 text-xs text-indigo-950">
          <Moon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Quiet hours: no patient SMS between {quiet.quietHoursStart}:00 and {quiet.quietHoursEnd}:00 patient local time. Texts triggered then are scheduled for {quiet.quietHoursEnd}:00. Set by the platform team.
        </p>
      </SettingsCard>

      <SettingsCard title="Delivery log" description="Every simulated email and SMS for this clinic: sent, delivered, failed, opened, scheduled.">
        <DeliveryLog clinicId={clinic.id} />
      </SettingsCard>

      <SettingsCard title="Two-way SMS simulator" description="Pretend to be a patient replying to a text. Reply C confirms the next appointment.">
        <SmsSimulator key={clinic.id} clinicId={clinic.id} />
      </SettingsCard>
    </div>
  );
}
