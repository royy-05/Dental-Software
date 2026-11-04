"use client";

import { useMemo, useState } from "react";
import { Bar as RBar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Source } from "@/types";
import { RequirePermission } from "@/components/shared/guards";
import { PageHeader, StatCard } from "@/components/shared/page-header";
import { RangePicker } from "@/components/shared/range-picker";
import { ListState, useDemoState, ErrorState, LoadingState } from "@/components/shared/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/utils";
import {
  dropOffByReason,
  dropOffByStep,
  filterSessions,
  formTotals,
  heatmap,
  hourLabel,
  peakDay,
  peaks,
  WEEKDAYS,
} from "@/components/reports/aggregate";
import { Bar, HeatmapTable, SourceFilter, useRange, useReportScope } from "@/components/reports/ui";

function FormAnalytics() {
  const { sessions, reasons } = useReportScope();
  const { value, setValue, range } = useRange("last30");
  const [source, setSource] = useState<Source | "all">("all");
  const demo = useDemoState();

  const filtered = useMemo(() => filterSessions(sessions, range, source), [sessions, range, source]);
  const totals = useMemo(() => formTotals(filtered), [filtered]);
  const steps = useMemo(() => dropOffByStep(filtered), [filtered]);
  const byReason = useMemo(() => dropOffByReason(filtered, reasons), [filtered, reasons]);
  const visitsGrid = useMemo(() => heatmap(filtered), [filtered]);
  const bookingsGrid = useMemo(() => heatmap(filtered, true), [filtered]);

  const peakText = (grid: ReturnType<typeof heatmap>, noun: string) => {
    const top = peaks(grid, 3);
    const day = peakDay(grid);
    if (!top.length) return `No ${noun} in this period.`;
    return `Busiest day: ${day ? WEEKDAYS[day.weekday] : "-"}. Peak times: ${top.map((p) => `${WEEKDAYS[p.weekday]} ${hourLabel(p.hour)} (${p.count})`).join(", ")}.`;
  };

  return (
    <>
      <PageHeader
        title="Form Analytics"
        description="How patients move through your booking widget. Built from anonymous step events; no patient data is used."
        actions={
          <>
            <RangePicker value={value} onChange={setValue} />
            <SourceFilter value={source} onChange={setSource} />
          </>
        }
      />
      {demo === "loading" ? (
        <LoadingState />
      ) : demo === "error" ? (
        <ErrorState onRetry={() => window.location.assign(window.location.pathname)} />
      ) : (
        <div className="grid gap-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Form visits" value={totals.visits} />
            <StatCard label="Appointments booked" value={totals.booked} />
            <StatCard label="Drop-offs" value={totals.dropOffs} />
            <StatCard label="Conversion rate" value={`${totals.conversion}%`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Drop-off by step</CardTitle>
                <CardDescription>Where visitors left without booking (% of all visits).</CardDescription>
              </CardHeader>
              <CardContent>
                <ListState items={totals.visits ? steps : []} emptyTitle="No visits in this period">
                  {(rows) => (
                    <>
                      <div className="h-48" aria-hidden>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={rows} margin={{ left: -20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} tickFormatter={(l: string) => l.split(" ")[0]} />
                            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                            <Tooltip />
                            <RBar dataKey="dropped" name="Dropped" fill="#b45309" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Step</TableHead>
                            <TableHead className="text-right">Reached</TableHead>
                            <TableHead className="text-right">Dropped</TableHead>
                            <TableHead className="text-right">%</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((r) => (
                            <TableRow key={r.step}>
                              <TableCell>{r.label}</TableCell>
                              <TableCell className="text-right tabular-nums">{r.reached}</TableCell>
                              <TableCell className="text-right tabular-nums">{r.dropped}</TableCell>
                              <TableCell className="text-right tabular-nums">{r.dropPct}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </>
                  )}
                </ListState>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle>Drop-off by reason</CardTitle>
                  <CardDescription>Visits, bookings and drop-offs for each reason.</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCsv("form-analytics-by-reason.csv", byReason.map(({ reasonId: _r, ...r }) => r))}
                >
                  Export CSV
                </Button>
              </CardHeader>
              <CardContent>
                <ListState items={byReason} emptyTitle="No visits in this period">
                  {(rows) => (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Reason</TableHead>
                          <TableHead className="text-right">Visits</TableHead>
                          <TableHead className="text-right">Booked</TableHead>
                          <TableHead className="text-right">Dropped</TableHead>
                          <TableHead className="w-28">Drop %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r) => (
                          <TableRow key={r.reasonId}>
                            <TableCell className="max-w-[200px]">{r.name}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.visits}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.booked}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.dropped}</TableCell>
                            <TableCell>
                              <span className="text-xs tabular-nums">{r.dropPct}%</span>
                              <Bar value={r.dropPct} className="bg-amber-600" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </ListState>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Visit heatmap</CardTitle>
              <CardDescription>{peakText(visitsGrid, "visits")}</CardDescription>
            </CardHeader>
            <CardContent>
              <HeatmapTable grid={visitsGrid} caption="Form visits by weekday and hour (clinic time)" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Booking heatmap</CardTitle>
              <CardDescription>{peakText(bookingsGrid, "bookings")}</CardDescription>
            </CardHeader>
            <CardContent>
              <HeatmapTable grid={bookingsGrid} caption="Bookings by weekday and hour (clinic time)" />
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

export default function FormAnalyticsPage() {
  return (
    <RequirePermission perm="reports:view">
      <FormAnalytics />
    </RequirePermission>
  );
}
