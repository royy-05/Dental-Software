"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, Eye, Workflow } from "lucide-react";
import type { AppointmentStatus, Clinic } from "@/types";
import { STATUS_LABELS } from "@/types";
import { fmtDate } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/states";
import { copyText, FieldError, SettingsCard, ToggleRow, useSaveClinic } from "./common";

const ALL_STATUSES = Object.keys(STATUS_LABELS) as AppointmentStatus[];

function StatusChecklist({ idPrefix, value, onChange, options = ALL_STATUSES }: { idPrefix: string; value: AppointmentStatus[]; onChange: (v: AppointmentStatus[]) => void; options?: AppointmentStatus[] }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {options.map((s) => (
        <div key={s} className="flex items-center gap-2">
          <Checkbox id={`${idPrefix}-${s}`} checked={value.includes(s)} onCheckedChange={(c) => onChange(c ? [...value, s] : value.filter((x) => x !== s))} />
          <Label htmlFor={`${idPrefix}-${s}`} className="font-normal">
            {STATUS_LABELS[s]}
          </Label>
        </div>
      ))}
    </div>
  );
}

export function ConfirmationSettings({ clinic }: { clinic: Clinic }) {
  const save = useSaveClinic();
  const [c, setC] = useState(clinic.settings.confirmation);
  return (
    <SettingsCard
      title="Confirmation"
      description="How confirmations work and what is written back to your practice management system."
      footer={<Button onClick={() => save("Updated confirmation settings", (x) => void (x.settings.confirmation = c))}>Save</Button>}
    >
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Statuses that count as confirmed</legend>
        <StatusChecklist idPrefix="cf" value={c.confirmedStatuses} onChange={(v) => setC({ ...c, confirmedStatuses: v })} options={["unconfirmed", "confirmed", "complete"]} />
      </fieldset>
      <ToggleRow
        id="cf-prompt"
        label="Send a confirm prompt"
        description="After booking, unconfirmed patients get “Reply C to confirm” by SMS."
        checked={c.sendConfirmPrompt}
        onChange={(v) => setC({ ...c, sendConfirmPrompt: v })}
      />
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Statuses written back to the PMS</legend>
        <StatusChecklist idPrefix="pms" value={c.pmsWritebackStatuses} onChange={(v) => setC({ ...c, pmsWritebackStatuses: v })} />
        <p className="text-xs text-muted-foreground">
          PMS: {clinic.pms.name}. {clinic.pms.connected ? "Connected." : "Not connected (PMS sync is a later phase)."}
        </p>
      </fieldset>
    </SettingsCard>
  );
}

function LegalDoc({ kind, clinic }: { kind: "privacy" | "terms"; clinic: Clinic }) {
  const save = useSaveClinic();
  const l = clinic.settings.legal;
  const label = kind === "privacy" ? "Privacy Policy" : "Terms";
  const [enabled, setEnabled] = useState(kind === "privacy" ? l.privacyEnabled : l.termsEnabled);
  const [text, setText] = useState(kind === "privacy" ? l.privacyText : l.termsText);
  const [url, setUrl] = useState((kind === "privacy" ? l.privacyUrl : l.termsUrl) ?? "");
  const [view, setView] = useState(false);
  const urlError = url && !/^https?:\/\/\S+\.\S+/.test(url) ? "Enter a full URL starting with https://" : undefined;
  const original = kind === "privacy" ? l.privacyText : l.termsText;

  const onSave = () =>
    save(`Updated ${label}`, (c) => {
      const lg = c.settings.legal;
      if (kind === "privacy") {
        lg.privacyEnabled = enabled;
        lg.privacyText = text;
        lg.privacyUrl = url || undefined;
      } else {
        lg.termsEnabled = enabled;
        lg.termsText = text;
        lg.termsUrl = url || undefined;
        // New consent records reference this version (section 8).
        if (text !== original) lg.termsVersion = new Date().toISOString().slice(0, 10);
      }
    });

  return (
    <SettingsCard
      title={label}
      description={kind === "terms" ? `Current version: ${l.termsVersion}. Editing the text creates a new version stored with each SMS consent.` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={() => setView(true)}>
            <Eye /> View
          </Button>
          <Button variant="outline" onClick={() => copyText(text, `${label} copied`)}>
            <Copy /> Copy
          </Button>
          <Button disabled={!!urlError} onClick={onSave}>
            Save
          </Button>
        </>
      }
    >
      <ToggleRow id={`lg-${kind}-on`} label={`Show ${label} link in the booking widget`} checked={enabled} onChange={setEnabled} />
      <div className="grid gap-1.5">
        <Label htmlFor={`lg-${kind}-url`}>Custom URL (optional, replaces the hosted text)</Label>
        <Input id={`lg-${kind}-url`} type="url" value={url} placeholder="https://yourpractice.com/privacy" aria-invalid={!!urlError} onChange={(e) => setUrl(e.target.value.trim())} />
        <FieldError msg={urlError} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`lg-${kind}-text`}>Hosted text</Label>
        <Textarea id={`lg-${kind}-text`} rows={6} value={text} onChange={(e) => setText(e.target.value)} disabled={!!url} />
      </div>
      <Dialog open={view} onOpenChange={setView}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          {url ? (
            <p className="text-sm">
              Patients are sent to{" "}
              <a className="text-primary underline" href={url} target="_blank" rel="noreferrer">
                {url}
              </a>
            </p>
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm">{text}</pre>
          )}
        </DialogContent>
      </Dialog>
    </SettingsCard>
  );
}

export function LegalSettings({ clinic }: { clinic: Clinic }) {
  return (
    <div className="grid gap-6">
      <LegalDoc kind="privacy" clinic={clinic} />
      <LegalDoc kind="terms" clinic={clinic} />
    </div>
  );
}

export function BookingSchedulingSettings({ clinic }: { clinic: Clinic }) {
  const save = useSaveClinic();
  const [s, setS] = useState(clinic.settings.scheduling);
  return (
    <div className="grid gap-6">
      <SettingsCard title="Booking flow" description="Steps, fields, conditional rules, booking rules, preview, versions and starter templates.">
        <div>
          <Button asChild>
            <Link href="/clinic/settings/booking-flow">
              <Workflow /> Open step and form builder
            </Link>
          </Button>
        </div>
      </SettingsCard>
      <SettingsCard title="Scheduling" footer={<Button onClick={() => save("Updated scheduling settings", (c) => void (c.settings.scheduling = s))}>Save</Button>}>
        <ToggleRow id="sc-sync" label="Auto sync with PMS" description="Pull availability and push bookings automatically (PMS sync is a later phase)." checked={s.autoSync} onChange={(v) => setS({ ...s, autoSync: v })} />
        <ToggleRow id="sc-block" label="Block scheduling" description="Only offer times inside blocks reserved for each reason in the PMS schedule." checked={s.blockScheduling} onChange={(v) => setS({ ...s, blockScheduling: v })} />
        <ToggleRow id="sc-unarchive" label="Unarchive patient on booking" description="If an archived patient books online, reactivate their PMS record." checked={s.unarchivePatientOnBooking} onChange={(v) => setS({ ...s, unarchivePatientOnBooking: v })} />
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Blockouts to skip</legend>
          <p className="text-xs text-muted-foreground">Checked blockouts are ignored by online booking (patients can book over them).</p>
          {clinic.blockouts.length === 0 ? (
            <EmptyState className="py-4" title="No blockouts" description="Add blockouts in Schedule & operatories." />
          ) : (
            clinic.blockouts.map((b) => (
              <div key={b.id} className="flex items-center gap-2">
                <Checkbox
                  id={`skip-${b.id}`}
                  checked={s.blockoutsToSkip.includes(b.id)}
                  onCheckedChange={(c) => setS({ ...s, blockoutsToSkip: c ? [...s.blockoutsToSkip, b.id] : s.blockoutsToSkip.filter((x) => x !== b.id) })}
                />
                <Label htmlFor={`skip-${b.id}`} className="font-normal">
                  {b.label || "Blockout"} · {fmtDate(b.start, "MMM d, h:mm a")} – {fmtDate(b.end, "h:mm a")}
                </Label>
              </div>
            ))
          )}
        </fieldset>
      </SettingsCard>
    </div>
  );
}
