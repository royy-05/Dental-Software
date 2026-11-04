"use client";

import { useMemo, useState } from "react";
import { format, subMonths } from "date-fns";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  Bar as RBar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Source } from "@/types";
import { SOURCE_LABELS } from "@/types";
import { useApp } from "@/store/app";
import { previousRange } from "@/lib/range";
import { change, currency, downloadCsv } from "@/lib/utils";
import { RequirePermission } from "@/components/shared/guards";
import { PageHeader, StatCard } from "@/components/shared/page-header";
import { RangePicker } from "@/components/shared/range-picker";
import { ErrorState, ListState, LoadingState, useDemoState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  adRoi,
  avgLeadTimeHours,
  byProvider,
  byReason,
  bySource,
  fillRate,
  newPatientCount,
  overview,
  patientTrend,
} from "@/components/reports/aggregate";
import { Bar, useRange, useReportScope } from "@/components/reports/ui";

const SPEND_SOURCES: Source[] = ["google_ads", "gbp", "rwg", "website", "custom"];

function Section({ title, description, children, action }: { title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="break-inside-avoid">
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function AdSpendEditor() {
  const { clinic, appts, spend } = useReportScope();
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const months = useMemo(() => {
    const now = new Date();
    return [0, 1, 2].map((i) => format(subMonths(now, i), "yyyy-MM"));
  }, []);
  const [month, setMonth] = useState(months[0]);
  const rows = useMemo(() => adRoi(appts, spend).filter((r) => r.month === month), [appts, spend, month]);
  if (!clinic) return null;

  const setAmount = (source: Source, amount: number) => {
    mutate((db) => {
      const row = db.adSpend.find((s) => s.clinicId === clinic.id && s.month === month && s.source === source);
      if (row) row.amount = amount;
      else db.adSpend.push({ id: `ad_${clinic.id}_${month}_${source}`, clinicId: clinic.id, month, source, amount });
    });
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="roi-month">Month</Label>
        <select id="roi-month" className="h-9 rounded-md border border-input bg-card px-2 text-sm" value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => (
            <option key={m} value={m}>
              {format(new Date(`${m}-01T00:00`), "MMMM yyyy")}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">Enter monthly spend per source (clinic or agency). Changes save automatically.</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Source</TableHead>
            <TableHead>Spend</TableHead>
            <TableHead className="text-right">Bookings</TableHead>
            <TableHead className="text-right">Completed</TableHead>
            <TableHead className="text-right">Cost / booking</TableHead>
            <TableHead className="text-right">Cost / completed visit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {SPEND_SOURCES.map((source) => {
            const r = rows.find((x) => x.source === source);
            const list = appts.filter((a) => a.source === source && format(new Date(a.createdAt), "yyyy-MM") === month && a.status !== "declined");
            const completed = list.filter((a) => a.status === "complete").length;
            const amount = r?.spend ?? 0;
            return (
              <TableRow key={source}>
                <TableCell>{SOURCE_LABELS[source]}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step={50}
                    className="h-8 w-28"
                    aria-label={`${SOURCE_LABELS[source]} spend`}
                    value={amount}
                    onChange={(e) => setAmount(source, Math.max(0, Number(e.target.value) || 0))}
                    onBlur={() => logAudit({ action: `Updated ad spend ${month}`, category: "settings", target: SOURCE_LABELS[source], clinicId: clinic.id })}
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums">{list.length}</TableCell>
                <TableCell className="text-right tabular-nums">{completed}</TableCell>
                <TableCell className="text-right tabular-nums">{amount && list.length ? currency(amount / list.length) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{amount && completed ? currency(amount / completed) : "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function MonthlyReport() {
  const { clinic } = useReportScope();
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const [recipients, setRecipients] = useState(clinic?.settings.reports.recipients.join(", ") ?? "");
  if (!clinic) return null;
  const r = clinic.settings.reports;
  return (
    <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
      <div className="flex items-center gap-2">
        <Switch
          id="monthly-report"
          checked={r.monthlyEmail}
          onCheckedChange={(v) => {
            mutate((db) => void (db.clinics.find((c) => c.id === clinic.id)!.settings.reports.monthlyEmail = v));
            logAudit({ action: `${v ? "Enabled" : "Disabled"} monthly report email`, category: "settings", target: "Performance", clinicId: clinic.id });
            toast.success(v ? "Monthly report scheduled for the 1st of each month" : "Monthly report turned off");
          }}
        />
        <Label htmlFor="monthly-report">Email a monthly report</Label>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="report-recipients">Recipients (comma-separated)</Label>
        <Input id="report-recipients" value={recipients} onChange={(e) => setRecipients(e.target.value)} />
      </div>
      <Button
        variant="outline"
        onClick={() => {
          const list = recipients.split(",").map((s) => s.trim()).filter(Boolean);
          if (list.some((e) => !/^\S+@\S+\.\S+$/.test(e))) {
            toast.error("Check the email addresses");
            return;
          }
          mutate((db) => void (db.clinics.find((c) => c.id === clinic.id)!.settings.reports.recipients = list));
          logAudit({ action: "Updated monthly report recipients", category: "settings", target: "Performance", clinicId: clinic.id });
          toast.success("Recipients saved");
        }}
      >
        Save recipients
      </Button>
    </div>
  );
}

function Performance() {
  const { clinic, appts, sessions, reasons, providers, now } = useReportScope();
  const { value, setValue, range } = useRange("month");
  const demo = useDemoState();
  const prev = useMemo(() => previousRange(range), [range]);

  const ov = useMemo(() => overview(appts, range), [appts, range]);
  const ovPrev = useMemo(() => overview(appts, prev), [appts, prev]);
  const sources = useMemo(() => bySource(appts, sessions, range), [appts, sessions, range]);
  const trend = useMemo(() => patientTrend(appts, range), [appts, range]);
  const newNow = useMemo(() => newPatientCount(appts, range), [appts, range]);
  const newPrev = useMemo(() => newPatientCount(appts, prev), [appts, prev]);
  const reasonRows = useMemo(() => byReason(appts, reasons, range, now), [appts, reasons, range, now]);
  const providerRows = useMemo(() => (clinic ? byProvider(appts, providers, clinic, range, now) : []), [appts, providers, clinic, range, now]);
  const lead = useMemo(() => avgLeadTimeHours(appts, range), [appts, range]);
  const fill7 = useMemo(() => (clinic ? fillRate(appts, providers, clinic, now, 7) : 0), [appts, providers, clinic, now]);
  const fill14 = useMemo(() => (clinic ? fillRate(appts, providers, clinic, now, 14) : 0), [appts, providers, clinic, now]);

  const exportCsv = () => {
    const rows: Record<string, unknown>[] = [];
    const add = (section: string, item: string, metric: string, v: unknown) => rows.push({ section, item, metric, value: v });
    const label = `${format(range.from, "yyyy-MM-dd")} to ${format(range.to, "yyyy-MM-dd")}`;
    for (const [k, v] of Object.entries(ov)) add("Overview", label, k, v);
    for (const s of sources) {
      add("By source", s.label, "visits", s.visits);
      add("By source", s.label, "bookings", s.bookings);
      add("By source", s.label, "conversion_pct", s.conversion);
    }
    for (const r of reasonRows) {
      add("Reasons", r.name, "bookings", r.bookings);
      add("Reasons", r.name, "completion_rate_pct", r.completionRate);
      add("Reasons", r.name, "estimated_value", r.estimatedValue);
    }
    for (const p of providerRows) {
      add("Providers", p.name, "bookings", p.bookings);
      add("Providers", p.name, "utilization_pct", p.utilization);
      add("Providers", p.name, "completion_rate_pct", p.completionRate);
    }
    add("Timing", label, "avg_lead_time_hours", lead);
    add("Timing", "next 7 days", "fill_rate_pct", fill7);
    add("Timing", "next 14 days", "fill_rate_pct", fill14);
    downloadCsv(`performance-${clinic?.slug ?? "clinic"}.csv`, rows);
    useApp.getState().logAudit({ action: "Exported Performance CSV", category: "export", target: "Performance", clinicId: clinic?.id });
  };

  return (
    <>
      <style>{`@media print { aside, header, [data-noprint] { display: none !important; } main { max-width: none !important; padding: 0 !important; } .recharts-responsive-container { break-inside: avoid; } }`}</style>
      <PageHeader
        title="Performance"
        description={`${format(range.from, "MMM d")} – ${format(range.to, "MMM d, yyyy")} · compared with the previous period of the same length`}
        actions={
          <div data-noprint className="flex flex-wrap items-center gap-2">
            <RangePicker value={value} onChange={setValue} />
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download /> CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                useApp.getState().logAudit({ action: "Exported Performance PDF", category: "export", target: "Performance", clinicId: clinic?.id });
                window.print();
              }}
            >
              <Printer /> PDF
            </Button>
          </div>
        }
      />
      {demo === "loading" ? (
        <LoadingState />
      ) : demo === "error" ? (
        <ErrorState onRetry={() => window.location.assign(window.location.pathname)} />
      ) : (
        <div className="grid gap-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="Bookings" value={ov.bookings} trend={change(ov.bookings, ovPrev.bookings)} hint="vs previous" />
            <StatCard label="Completed" value={ov.completed} trend={change(ov.completed, ovPrev.completed)} hint="vs previous" />
            <StatCard label="Cancelled" value={ov.cancelled} trend={change(ov.cancelled, ovPrev.cancelled)} hint="vs previous" />
            <StatCard label="No-shows" value={ov.noShows} trend={change(ov.noShows, ovPrev.noShows)} hint="vs previous" />
            <StatCard label="Show rate" value={`${ov.showRate}%`} hint={`was ${ovPrev.showRate}%`} />
          </div>

          <Section title="By source" description="Widget visits and bookings made in this period, by marketing source.">
            <ListState items={sources.filter((s) => s.visits || s.bookings)} emptyTitle="No bookings in this period">
              {(rows) => (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="h-64" aria-hidden>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={rows} margin={{ left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} tickFormatter={(l: string) => l.split(" ")[0]} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <RBar dataKey="visits" name="Visits" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                        <RBar dataKey="bookings" name="Bookings" fill="#0f766e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Visits</TableHead>
                        <TableHead className="text-right">Bookings</TableHead>
                        <TableHead className="text-right">Conversion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((s) => (
                        <TableRow key={s.source}>
                          <TableCell>{s.label}</TableCell>
                          <TableCell className="text-right tabular-nums">{s.source === "staff" ? "—" : s.visits}</TableCell>
                          <TableCell className="text-right tabular-nums">{s.bookings}</TableCell>
                          <TableCell className="text-right tabular-nums">{s.source === "staff" ? "—" : `${s.conversion}%`}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </ListState>
          </Section>

          <Section title="Ad ROI" description="Cost per booking and per completed visit from the spend you enter.">
            <AdSpendEditor />
          </Section>

          <Section title="Patients" description={`New patients this period: ${newNow} (${change(newNow, newPrev) >= 0 ? "+" : ""}${change(newNow, newPrev)}% vs previous period).`}>
            <ListState items={trend.some((t) => t.newPatients || t.returning) ? trend : []} emptyTitle="No visits in this period">
              {(rows) => (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rows} margin={{ left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="newPatients" name="New" stroke="#0f766e" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="returning" name="Returning" stroke="#6d28d9" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ListState>
          </Section>

          <div className="grid gap-6 xl:grid-cols-2">
            <Section title="Reasons" description="Completion rate counts visits already past.">
              <ListState items={reasonRows.filter((r) => r.bookings)} emptyTitle="No bookings in this period">
                {(rows) => (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reason</TableHead>
                        <TableHead className="text-right">Bookings</TableHead>
                        <TableHead className="text-right">Completion</TableHead>
                        <TableHead className="text-right">Est. value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.reasonId}>
                          <TableCell>{r.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.bookings}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.completionRate}%</TableCell>
                          <TableCell className="text-right tabular-nums">{currency(r.estimatedValue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ListState>
            </Section>
            <Section title="Providers" description="Utilization = booked hours ÷ available hours (working hours minus breaks and time off).">
              <ListState items={providerRows} emptyTitle="No active providers">
                {(rows) => (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Provider</TableHead>
                        <TableHead className="text-right">Bookings</TableHead>
                        <TableHead className="w-40">Utilization</TableHead>
                        <TableHead className="text-right">Completion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((p) => (
                        <TableRow key={p.providerId}>
                          <TableCell>{p.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{p.bookings}</TableCell>
                          <TableCell>
                            <span className="text-xs tabular-nums">
                              {p.utilization}% · {p.bookedHours}/{p.availableHours} h
                            </span>
                            <Bar value={p.utilization} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{p.completionRate}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ListState>
            </Section>
          </div>

          <Section title="Timing">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard label="Average lead time" value={lead >= 48 ? `${Math.round((lead / 24) * 10) / 10} days` : `${lead} h`} hint="from booking to visit" />
              <StatCard label="Fill rate, next 7 days" value={`${fill7}%`} hint="booked vs available hours" />
              <StatCard label="Fill rate, next 14 days" value={`${fill14}%`} hint="booked vs available hours" />
            </div>
          </Section>

          <div data-noprint>
            <Section title="Scheduled report" description="A PDF summary of this page emailed on the 1st of each month (simulated).">
              <MonthlyReport key={clinic?.id} />
            </Section>
          </div>
        </div>
      )}
    </>
  );
}

export default function PerformancePage() {
  return (
    <RequirePermission perm="reports:view" feature="performance">
      <Performance />
    </RequirePermission>
  );
}
