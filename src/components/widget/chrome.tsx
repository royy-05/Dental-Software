"use client";

import { useState } from "react";
import { Check, Clock, MapPin, Phone } from "lucide-react";
import type { Clinic, StepConfig } from "@/types";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWidgetUi } from "./brand";

export function WidgetHeader({ clinic, compact }: { clinic: Clinic; compact?: boolean }) {
  const { branding, theme } = useWidgetUi();
  const big = theme === "reason_first" && !compact;
  return (
    <header style={{ backgroundColor: branding.headerColor }} className={cn("text-white", big ? "px-5 py-8" : "px-4 py-3")}>
      <div className={cn("mx-auto flex items-center gap-3", theme === "compact" ? "max-w-xl" : "max-w-5xl")}>
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt={`${clinic.name} logo`} className={cn("rounded bg-white object-contain p-0.5", big ? "h-12 w-12" : "h-9 w-9")} />
        ) : (
          <span aria-hidden className={cn("flex items-center justify-center rounded-full bg-white/20 font-bold", big ? "h-12 w-12 text-xl" : "h-9 w-9")}>
            {clinic.name[0]}
          </span>
        )}
        <div className="min-w-0">
          <p className={cn("truncate font-semibold", big ? "text-xl" : "text-base")}>{clinic.name}</p>
          {(big || theme === "full_page") && !compact && <p className="truncate text-sm text-white/90">{clinic.description}</p>}
        </div>
        {theme === "full_page" && !compact && (
          <a href={`tel:${clinic.phone}`} className="ml-auto hidden items-center gap-1 rounded-md bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25 sm:flex">
            <Phone className="h-4 w-4" aria-hidden /> {clinic.phone}
          </a>
        )}
      </div>
    </header>
  );
}

export function LegalLink({ kind, clinic, url, children }: { kind: "terms" | "privacy"; clinic: Clinic; url?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const legal = clinic.settings.legal;
  const href = url || (kind === "terms" ? legal.termsUrl : legal.privacyUrl);
  const enabled = kind === "terms" ? legal.termsEnabled : legal.privacyEnabled;
  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
        {children}
      </a>
    );
  if (!enabled) return <span>{children}</span>;
  return (
    <>
      <button type="button" className="underline underline-offset-2" onClick={() => setOpen(true)}>
        {children}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{kind === "terms" ? "Terms" : "Privacy Policy"}</DialogTitle>
            <DialogDescription>{clinic.name}{kind === "terms" ? ` · version ${legal.termsVersion}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="whitespace-pre-wrap text-sm">{kind === "terms" ? legal.termsText : legal.privacyText}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function WidgetFooter({ clinic, poweredBy, termsUrl, privacyUrl }: { clinic: Clinic; poweredBy: string; termsUrl?: string; privacyUrl?: string }) {
  const { theme } = useWidgetUi();
  return (
    <footer className="border-t bg-white px-4 py-5 text-xs text-slate-600">
      <div className={cn("mx-auto flex flex-col gap-2", theme === "compact" ? "max-w-xl" : "max-w-5xl")}>
        <p className="font-semibold text-slate-800">{clinic.name}</p>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <a href={`tel:${clinic.phone}`} className="flex items-center gap-1 hover:underline"><Phone className="h-3.5 w-3.5" aria-hidden /> {clinic.phone}</a>
          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden /> {clinic.address}</span>
        </p>
        <p className="flex flex-wrap gap-3">
          <LegalLink kind="terms" clinic={clinic} url={termsUrl}>Terms</LegalLink>
          <LegalLink kind="privacy" clinic={clinic} url={privacyUrl}>Privacy Policy</LegalLink>
          <span className="ml-auto text-slate-500">{poweredBy}</span>
        </p>
      </div>
    </footer>
  );
}

export function Stepper({ steps, index, onJump }: { steps: StepConfig[]; index: number; onJump: (i: number) => void }) {
  const { branding, theme, mobile } = useWidgetUi();
  const pct = Math.round(((index + 1) / steps.length) * 100);
  if (theme === "compact" || mobile)
    return (
      <div className="mb-5">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          Step {index + 1} of {steps.length} · {steps[index]?.title}
        </p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Booking progress">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: branding.primaryColor }} />
        </div>
      </div>
    );
  return (
    <nav aria-label="Booking steps" className="mb-6">
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {steps.map((s, i) => {
          const done = i < index;
          const current = i === index;
          return (
            <li key={s.key} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!done}
                onClick={() => onJump(i)}
                aria-current={current ? "step" : undefined}
                className={cn("flex items-center gap-2 rounded-full px-1 py-0.5", done && "hover:underline", !done && !current && "text-muted-foreground")}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
                  style={current || done ? { backgroundColor: branding.primaryColor, color: "#fff" } : { backgroundColor: "#e2e8f0", color: "#334155" }}
                >
                  {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
                </span>
                <span className={cn(current && "font-semibold")}>{s.title}</span>
                {done && <span className="sr-only">(completed, select to edit)</span>}
              </button>
              {i < steps.length - 1 && <span aria-hidden className="h-px w-6 bg-slate-300" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function HoldBanner({ secondsLeft, label, expired, onRecheck }: { secondsLeft: number; label: string; expired: boolean; onRecheck: () => void }) {
  const m = Math.floor(secondsLeft / 60);
  const s = String(secondsLeft % 60).padStart(2, "0");
  if (expired)
    return (
      <div role="alert" className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        <Clock className="h-4 w-4" aria-hidden />
        <span>Your 5-minute hold on {label} has expired.</span>
        <button type="button" className="ml-auto font-semibold underline" onClick={onRecheck}>Check the time again</button>
      </div>
    );
  return (
    <div className="mb-4 flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-800" role="timer" aria-live="off">
      <Clock className="h-4 w-4" aria-hidden />
      <span>
        We&apos;re holding <strong>{label}</strong> for you for <strong className="tabular-nums">{m}:{s}</strong>
      </span>
    </div>
  );
}
