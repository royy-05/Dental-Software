"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ChevronRight, Clock, Sparkles, UserRound } from "lucide-react";
import type { FlowConfig, PatientType, Provider, Reason, StepKey } from "@/types";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BrandButton, useWidgetUi } from "./brand";

const forType = (r: Reason, t: PatientType) => r.patientType === "both" || r.patientType === t;

function ReasonCard({ reason, selected, onSelect, big }: { reason: Reason; selected: boolean; onSelect: () => void; big: boolean }) {
  const { branding } = useWidgetUi();
  const [open, setOpen] = useState(false);
  return (
    <li className={cn("relative flex flex-col rounded-lg border bg-white shadow-sm transition", selected && "ring-2")} style={selected ? { borderColor: branding.primaryColor, ["--tw-ring-color" as string]: branding.primaryColor } : undefined}>
      {big && <span aria-hidden className="h-1.5 rounded-t-lg" style={{ backgroundColor: reason.color }} />}
      <button type="button" onClick={onSelect} aria-pressed={selected} className={cn("flex flex-1 items-start gap-3 rounded-lg p-4 text-left hover:bg-slate-50", big && "flex-col")}>
        <span className="min-w-0 flex-1">
          <span className={cn("block font-semibold", big && "text-lg")}>{reason.name}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{reason.description}</span>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-600">
            <Clock className="h-3.5 w-3.5" aria-hidden /> {reason.duration} min
          </span>
        </span>
        {!big && <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-400" aria-hidden />}
      </button>
      <button type="button" onClick={() => setOpen(true)} className="mx-4 mb-3 self-start text-xs font-semibold underline underline-offset-2" style={{ color: branding.primaryColor }}>
        View details<span className="sr-only"> for {reason.name}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reason.name}</DialogTitle>
            <DialogDescription>{reason.duration} minutes</DialogDescription>
          </DialogHeader>
          <p className="text-sm">{reason.longDescription || reason.description}</p>
          <BrandButton onClick={() => { setOpen(false); onSelect(); }}>Choose {reason.name}</BrandButton>
        </DialogContent>
      </Dialog>
    </li>
  );
}

export function ReasonStep({
  reasons,
  display,
  patientType,
  selectedId,
  onSelect,
  emptyText,
}: {
  reasons: Reason[];
  display: FlowConfig["reasonDisplay"];
  patientType?: PatientType;
  selectedId?: string;
  onSelect: (r: Reason, t: PatientType) => void;
  emptyText: string;
}) {
  const { theme, mobile, branding } = useWidgetUi();
  const big = theme === "reason_first";
  const [tab, setTab] = useState<PatientType>(patientType ?? "new");
  const listCls = cn("grid gap-3", big && !mobile && "sm:grid-cols-2", big && !mobile && "lg:grid-cols-3", !big && theme === "full_page" && !mobile && "md:grid-cols-2");
  const renderList = (list: Reason[], t: PatientType) =>
    list.length ? (
      <ul className={listCls}>
        {list.map((r) => (
          <ReasonCard key={`${t}-${r.id}`} reason={r} big={big} selected={selectedId === r.id && patientType === t} onSelect={() => onSelect(r, t)} />
        ))}
      </ul>
    ) : (
      <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">{emptyText}</p>
    );

  if (!reasons.length) return <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">{emptyText}</p>;

  const typeToggle = (label: string) => (
    <div role="tablist" aria-label={label} className="mb-4 inline-flex rounded-lg bg-slate-100 p-1">
      {(["new", "existing"] as PatientType[]).map((t) => (
        <button
          key={t}
          role="tab"
          type="button"
          aria-selected={tab === t}
          id={`rtab-${t}`}
          aria-controls={`rpanel-${t}`}
          onClick={() => setTab(t)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              const next = tab === "new" ? "existing" : "new";
              setTab(next);
              document.getElementById(`rtab-${next}`)?.focus();
            }
          }}
          tabIndex={tab === t ? 0 : -1}
          className="rounded-md px-4 py-2 text-sm font-medium"
          style={tab === t ? { backgroundColor: "#fff", color: branding.primaryColor, boxShadow: "0 1px 2px rgba(0,0,0,.1)" } : undefined}
        >
          {t === "new" ? "New Patient" : "Existing Patient"}
        </button>
      ))}
    </div>
  );

  if (display === "tabs")
    return (
      <div>
        {typeToggle("Patient type")}
        <div role="tabpanel" id={`rpanel-${tab}`} aria-labelledby={`rtab-${tab}`}>{renderList(reasons.filter((r) => forType(r, tab)), tab)}</div>
      </div>
    );
  if (display === "list")
    return (
      <div>
        <p className="mb-2 text-sm font-medium">Have you visited us before?</p>
        {typeToggle("Have you visited us before?")}
        <div role="tabpanel" id={`rpanel-${tab}`} aria-labelledby={`rtab-${tab}`}>{renderList(reasons.filter((r) => forType(r, tab)), tab)}</div>
      </div>
    );
  return (
    <div className="grid gap-6">
      {(["new", "existing"] as PatientType[]).map((t) => (
        <section key={t} aria-labelledby={`rsec-${t}`}>
          <h3 id={`rsec-${t}`} className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
            {t === "new" ? <Sparkles className="h-4 w-4" aria-hidden /> : <UserRound className="h-4 w-4" aria-hidden />}
            {t === "new" ? "New Patient" : "Existing Patient"}
          </h3>
          {renderList(reasons.filter((r) => forType(r, t)), t)}
        </section>
      ))}
    </div>
  );
}

export function initials(name: string) {
  return name.replace(/^Dr\.\s*/, "").split(/[\s,]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("");
}

export function ProviderStep({ providers, selectedId, onSelect }: { providers: Provider[]; selectedId?: string; onSelect: (id: string) => void }) {
  const { branding, mobile } = useWidgetUi();
  const opts: { id: string; name: string; sub: string; color: string; photo?: string; bio?: string }[] = [
    { id: "any", name: "First available", sub: "Earliest time with any provider", color: branding.primaryColor },
    ...providers.map((p) => ({ id: p.id, name: p.displayName, sub: p.role, color: p.color, photo: p.photoUrl, bio: p.bio })),
  ];
  return (
    <ul className={cn("grid gap-3", !mobile && "sm:grid-cols-2")}>
      {opts.map((o) => {
        const sel = selectedId === o.id;
        return (
          <li key={o.id}>
            <button
              type="button"
              aria-pressed={sel}
              onClick={() => onSelect(o.id)}
              className={cn("flex h-full w-full items-start gap-3 rounded-lg border bg-white p-4 text-left shadow-sm hover:bg-slate-50", sel && "ring-2")}
              style={sel ? { borderColor: branding.primaryColor, ["--tw-ring-color" as string]: branding.primaryColor } : undefined}
            >
              {o.photo ? (
                <img src={o.photo} alt="" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: o.color }}>
                  {o.id === "any" ? <Sparkles className="h-5 w-5" /> : initials(o.name)}
                </span>
              )}
              <span>
                <span className="block font-semibold">{o.name}</span>
                <span className="block text-sm text-muted-foreground">{o.sub}</span>
                {o.bio && <span className="mt-1 line-clamp-2 block text-xs text-slate-600">{o.bio}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export interface SummaryData {
  reason?: Reason;
  providerName?: string;
  start?: Date;
  patientName?: string;
  patientType?: PatientType;
  timeZoneLabel: string;
}

export function BookingSummary({ data, onEdit, editable }: { data: SummaryData; onEdit?: (k: StepKey) => void; editable: StepKey[] }) {
  const { branding } = useWidgetUi();
  const rows: { k: StepKey; label: string; value?: string }[] = [
    { k: "reason", label: "Reason", value: data.reason ? `${data.reason.name} (${data.reason.duration} min)${data.patientType ? ` · ${data.patientType === "new" ? "New" : "Existing"} patient` : ""}` : undefined },
    { k: "provider", label: "Provider", value: data.providerName },
    { k: "datetime", label: "Date", value: data.start ? format(data.start, "EEEE, MMMM d, yyyy") : undefined },
    { k: "datetime", label: "Time", value: data.start ? `${format(data.start, "h:mm a")} ${data.timeZoneLabel}` : undefined },
    { k: "details", label: "Patient", value: data.patientName },
  ];
  return (
    <dl className="divide-y rounded-lg border bg-white">
      {rows.map((r) => (
        <div key={r.label} className="flex items-start gap-3 px-4 py-3 text-sm">
          <dt className="w-20 shrink-0 text-muted-foreground">{r.label}</dt>
          <dd className="min-w-0 flex-1 font-medium">{r.value ?? <span className="text-muted-foreground">Not chosen yet</span>}</dd>
          {onEdit && editable.includes(r.k) && r.value && (
            <button type="button" className="shrink-0 text-xs font-semibold underline underline-offset-2" style={{ color: branding.primaryColor }} onClick={() => onEdit(r.k)}>
              Edit<span className="sr-only"> {r.label.toLowerCase()}</span>
            </button>
          )}
        </div>
      ))}
    </dl>
  );
}
