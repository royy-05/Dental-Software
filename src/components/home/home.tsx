"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowRight } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SOURCE_LABELS } from "@/types";
import { rangeFor, RANGE_LABELS } from "@/lib/range";
import { dayKey, fromWall } from "@/lib/time";
import { useCurrentUser } from "@/lib/api/session";
import { useHomeReport } from "@/lib/api/clinic";
import { PageHeader, StatCard } from "@/components/shared/page-header";
import { RangePicker, type RangeValue } from "@/components/shared/range-picker";
import { ListState, LoadingState, useDemoState, ErrorState } from "@/components/shared/states";
import { Phi } from "@/components/shared/phi";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useClinicData } from "@/components/appointments/use-clinic-data";
import type { HomeMetrics } from "./metrics";

const SPLIT_COLORS = ["#0f766e", "#6d28d9"];

export function ClinicHome() {
  const data = useClinicData();
  const user = useCurrentUser();
  const demo = useDemoState();
  const [range, setRange] = useState<RangeValue>({ preset: "week" });
  const now = data.clinicNow();
  const r = rangeFor(range.preset, now, range.from && range.to ? { from: range.from, to: range.to } : undefined);
  // Metrics are aggregated in SQL on the server for the selected clinic-local day range.
  const report = useHomeReport(data.clinicId ? { from: dayKey(r.from), to: dayKey(r.to) } : undefined);
  const m: HomeMetrics = report.data ?? { total: 0, previous: 0, changePct: 0, trend: [], newCount: 0, returningCount: 0, byStatus: {} };
  const latest = useMemo(() => [...data.appointments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5), [data.appointments]);
  const split = [
    { name: "New", value: m.newCount },
    { name: "Returning", value: m.returningCount },
  ];
  const splitTotal = m.newCount + m.returningCount;

  if ((data.isLoading && !data.clinic) || (report.isLoading && !report.data)) return <LoadingState label="Loading home…" />;

  return (
    <>
      <PageHeader
        title={`Good ${now.getHours() < 12 ? "morning" : now.getHours() < 17 ? "afternoon" : "evening"}${user ? `, ${user.name.split(" ")[0]}` : ""}`}
        description={`${data.clinic?.name ?? ""} · ${format(now, "EEEE, MMMM d")}`}
        actions={<RangePicker value={range} onChange={setRange} presets={["today", "week", "month", "custom"]} />}
      />
      {demo === "error" || report.isError || data.isError ? (
        <ErrorState onRetry={() => { report.refetch(); data.refetch(); }} />
      ) : (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Appointments" value={m.total} trend={m.changePct} hint={`vs previous ${range.preset === "today" ? "day" : "period"} (${m.previous})`} />
            <StatCard label="Confirmed" value={m.byStatus.confirmed ?? 0} hint="incl. upcoming" />
            <StatCard label="Unconfirmed" value={m.byStatus.unconfirmed ?? 0} hint="need follow-up" />
            <StatCard label="Cancelled / no-show" value={(m.byStatus.cancelled ?? 0) + (m.byStatus.no_show ?? 0)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Appointment trend</CardTitle>
                <CardDescription>
                  {m.total} appointments · {RANGE_LABELS[range.preset].toLowerCase()} ·{" "}
                  <span className={m.changePct >= 0 ? "text-green-800" : "text-red-800"}>
                    {m.changePct >= 0 ? "+" : ""}
                    {m.changePct}%
                  </span>{" "}
                  vs previous period
                </CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={m.trend} margin={{ left: -20, right: 8, top: 4 }}>
                    <defs>
                      <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0f766e" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#0f766e" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="current" name="Appointments" stroke="#0f766e" strokeWidth={2} fill="url(#trendFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Patient type</CardTitle>
                <CardDescription>New vs returning in this period</CardDescription>
              </CardHeader>
              <CardContent>
                {splitTotal === 0 ? (
                  <p className="py-16 text-center text-sm text-muted-foreground">No appointments in this period.</p>
                ) : (
                  <>
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={split} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                            {split.map((_, i) => <Cell key={i} fill={SPLIT_COLORS[i]} />)}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="mt-2 grid gap-1 text-sm">
                      {split.map((s, i) => (
                        <li key={s.name} className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-sm" style={{ background: SPLIT_COLORS[i] }} aria-hidden />
                          {s.name}
                          <span className="ml-auto font-medium tabular-nums">
                            {s.value} ({Math.round((s.value / splitTotal) * 100)}%)
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Latest appointments</CardTitle>
                <CardDescription>The 5 most recent bookings</CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/clinic/appointments">View All <ArrowRight /></Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <ListState items={latest} loading={data.isLoading && !data.appointments.length} emptyTitle="No bookings yet" emptyDescription="Share your booking link to start receiving appointments.">
                {(list) => (
                  <ul className="divide-y">
                    {list.map((a) => (
                      <li key={a.id}>
                        <Link href={`/clinic/appointments?open=${a.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-muted/50">
                          <span className="min-w-[10rem] flex-1">
                            <Phi className="font-medium">{`${a.patient.firstName} ${a.patient.lastName}`}</Phi>
                            <span className="block text-xs text-muted-foreground">
                              {data.reasonName(a.reasonId)} · {data.providerName(a.providerId)}
                            </span>
                          </span>
                          <span className="text-sm">
                            {format(fromWall(a.start), "EEE, MMM d · h:mm a")}
                            <span className="block text-xs text-muted-foreground">
                              {SOURCE_LABELS[a.source]} · booked {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                            </span>
                          </span>
                          <StatusBadge status={a.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </ListState>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
