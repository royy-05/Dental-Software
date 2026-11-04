"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Download, RotateCcw, Search } from "lucide-react";
import type { Appointment, AppointmentStatus, Source } from "@/types";
import { SOURCE_LABELS, STATUS_LABELS } from "@/types";
import { useApp } from "@/store/app";
import { downloadCsv } from "@/lib/utils";
import { fromWall } from "@/lib/time";
import { Phi, usePhiText } from "@/components/shared/phi";
import { useCan } from "@/components/shared/guards";
import { ListState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EMPTY_FILTERS, filterAppointments, paginate, sortAppointments, type ApptFilters, type ApptTab, type SortDir, type SortKey } from "./filter";
import type { ClinicData } from "./use-clinic-data";

type ColumnKey = SortKey;
const COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "createdAt", label: "Date scheduled" },
  { key: "patientType", label: "Patient type" },
  { key: "provider", label: "Provider" },
  { key: "patient", label: "Patient" },
  { key: "reason", label: "Reason" },
  { key: "source", label: "Source" },
  { key: "start", label: "Appointment" },
  { key: "status", label: "Status" },
];

const STATUSES: AppointmentStatus[] = ["unconfirmed", "confirmed", "complete", "cancelled", "no_show"];
const SOURCES = Object.keys(SOURCE_LABELS) as Source[];

export function AppointmentsTable({ data, tab, onOpen, loading }: { data: ClinicData; tab: ApptTab; onOpen: (id: string) => void; loading?: boolean }) {
  const [filters, setFilters] = useState<ApptFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "start", dir: "desc" });
  const [hidden, setHidden] = useState<ColumnKey[]>([]);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const can = useCan();
  const phi = usePhiText();
  const logAudit = useApp((s) => s.logAudit);

  const rows = useMemo(
    () => sortAppointments(filterAppointments(data.appointments, filters, tab), sort.key, sort.dir, { provider: data.providerName, reason: data.reasonName }),
    [data, filters, tab, sort],
  );
  const pg = paginate(rows, page, pageSize);
  const visible = COLUMNS.filter((c) => !hidden.includes(c.key));
  const set = <K extends keyof ApptFilters>(k: K, v: ApptFilters[K]) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };
  const active = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  const exportCsv = () => {
    downloadCsv(
      `appointments-${tab}-${format(new Date(), "yyyy-MM-dd")}.csv`,
      rows.map((a) => ({
        date_scheduled: a.createdAt,
        patient_type: a.patientType,
        provider: data.providerName(a.providerId),
        patient: phi(`${a.patient.firstName} ${a.patient.lastName}`),
        phone: phi(a.patient.phone),
        email: phi(a.patient.email),
        reason: data.reasonName(a.reasonId),
        source: SOURCE_LABELS[a.source],
        referrer_id: a.referrerId ?? "",
        utm_source: a.utm.source ?? "",
        utm_medium: a.utm.medium ?? "",
        utm_campaign: a.utm.campaign ?? "",
        appointment_start: a.start,
        status: STATUS_LABELS[a.status],
        decline_reason: a.declineReason ?? "",
      })),
    );
    logAudit({ action: `Exported ${rows.length} appointments (CSV)`, category: "export", target: tab === "declined" ? "Declined appointments" : "Appointments", clinicId: data.clinicId });
  };

  const cell = (a: Appointment, key: ColumnKey) => {
    switch (key) {
      case "createdAt":
        return <span className="whitespace-nowrap text-xs">{format(new Date(a.createdAt), "MMM d, yyyy")}</span>;
      case "patientType":
        return <Badge variant={a.patientType === "new" ? "secondary" : "outline"}>{a.patientType === "new" ? "New" : "Returning"}</Badge>;
      case "provider":
        return <span className="whitespace-nowrap">{data.providerName(a.providerId)}</span>;
      case "patient":
        return (
          <span className="block min-w-[10rem]">
            <Phi className="font-medium">{`${a.patient.firstName} ${a.patient.lastName}`}</Phi>
            <Phi className="block text-xs text-muted-foreground">{a.patient.phone}</Phi>
          </span>
        );
      case "reason":
        return <span className="block min-w-[9rem]">{data.reasonName(a.reasonId)}</span>;
      case "source":
        return <span className="whitespace-nowrap text-xs">{SOURCE_LABELS[a.source]}</span>;
      case "start":
        return (
          <span className="whitespace-nowrap">
            {format(fromWall(a.start), "EEE, MMM d")}
            <span className="block text-xs text-muted-foreground">{format(fromWall(a.start), "h:mm a")}</span>
          </span>
        );
      case "status":
        return <StatusBadge status={a.status} />;
    }
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input className="h-9 pl-8" placeholder="Search name, phone or email" aria-label="Search by name, phone or email" value={filters.q} onChange={(e) => set("q", e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="f-from" className="text-xs">From</Label>
          <Input id="f-from" type="date" className="h-9 w-36" value={filters.from ?? ""} onChange={(e) => set("from", e.target.value || undefined)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="f-to" className="text-xs">To</Label>
          <Input id="f-to" type="date" className="h-9 w-36" value={filters.to ?? ""} onChange={(e) => set("to", e.target.value || undefined)} />
        </div>
        {tab === "appointments" && (
          <FilterSelect label="Status" value={filters.status} onChange={(v) => set("status", v as ApptFilters["status"])} options={STATUSES.map((s) => [s, STATUS_LABELS[s]])} />
        )}
        <FilterSelect label="Provider" value={filters.providerId} onChange={(v) => set("providerId", v)} options={data.providers.map((p) => [p.id, p.displayName])} />
        <FilterSelect label="Reason" value={filters.reasonId} onChange={(v) => set("reasonId", v)} options={data.reasons.map((r) => [r.id, r.name])} />
        <FilterSelect label="Source" value={filters.source} onChange={(v) => set("source", v as ApptFilters["source"])} options={SOURCES.map((s) => [s, SOURCE_LABELS[s]])} />
        <FilterSelect label="Patient type" value={filters.patientType} onChange={(v) => set("patientType", v as ApptFilters["patientType"])} options={[["new", "New"], ["existing", "Returning"]]} />
        {active && (
          <Button variant="ghost" size="sm" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }}>
            <RotateCcw /> Reset
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm"><Columns3 /> Columns</Button>
            </PopoverTrigger>
            <PopoverContent className="w-56">
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">Show columns</legend>
                {COLUMNS.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={!hidden.includes(c.key)}
                      onCheckedChange={(on) => setHidden((h) => (on ? h.filter((k) => k !== c.key) : h.length < COLUMNS.length - 1 ? [...h, c.key] : h))}
                    />
                    {c.label}
                  </label>
                ))}
              </fieldset>
            </PopoverContent>
          </Popover>
          {can("appointments:export") && (
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
              <Download /> CSV
            </Button>
          )}
        </div>
      </div>

      <ListState
        items={pg.rows}
        loading={loading}
        emptyTitle={active ? "No appointments match these filters" : tab === "declined" ? "No declined requests" : "No appointments yet"}
        emptyDescription={active ? "Try clearing a filter or widening the date range." : "Online and manual bookings will appear here."}
      >
        {(list) => (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  {visible.map((c) => {
                    const sorted = sort.key === c.key;
                    return (
                      <TableHead key={c.key} aria-sort={sorted ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                        <button
                          className="inline-flex items-center gap-1 uppercase hover:text-foreground"
                          onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === "desc" ? "asc" : "desc" }))}
                        >
                          {c.label}
                          {sorted ? sort.dir === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden /> : <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden />}
                        </button>
                      </TableHead>
                    );
                  })}
                  <TableHead><span className="sr-only">Open</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((a) => (
                  <TableRow key={a.id} className="cursor-pointer" onClick={() => onOpen(a.id)}>
                    {visible.map((c) => <TableCell key={c.key}>{cell(a, c.key)}</TableCell>)}
                    <TableCell>
                      <Button variant="link" size="xs" onClick={(e) => { e.stopPropagation(); onOpen(a.id); }} aria-label="View appointment details">
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </ListState>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground" aria-live="polite">
          {rows.length === 0 ? "0 results" : `${(pg.page - 1) * pageSize + 1}–${Math.min(pg.page * pageSize, rows.length)} of ${rows.length}`}
        </p>
        <div className="flex items-center gap-2">
          <Label htmlFor="page-size" className="text-xs">Per page</Label>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
            <SelectTrigger id="page-size" className="h-8 w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[10, 25, 50].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setPage(pg.page - 1)} disabled={pg.page <= 1}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {pg.page} of {pg.pages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(pg.page + 1)} disabled={pg.page >= pg.pages}>Next</Button>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-40" aria-label={`Filter by ${label.toLowerCase()}`}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
