"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Source } from "@/types";
import { SOURCE_LABELS } from "@/types";
import { useAdminAnalytics } from "@/lib/api/admin";
import { currency, downloadCsv } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/shared/page-header";
import { ErrorState, ListState, LoadingState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminGuard, NativeSelect, Section } from "@/components/admin-pages/common";
import { round1 } from "@/components/admin-pages/metrics";

const SOURCES: Source[] = ["google_ads", "gbp", "rwg", "website", "custom", "direct", "staff"];
const SOURCE_COLORS: Record<Source, string> = { google_ads: "#0f766e", gbp: "#1d4ed8", rwg: "#ca8a04", website: "#7c3aed", custom: "#be123c", direct: "#64748b", staff: "#94a3b8" };

export default function AnalyticsPage() {
  return (
    <AdminGuard perm="admin:analytics">
      <Analytics />
    </AdminGuard>
  );
}

function Analytics() {
  const [days, setDays] = useState(30);
  const q = useAdminAnalytics(days);

  const compare = useMemo(
    () =>
      (q.data?.compare ?? [])
        .filter((c) => c.bookings > 0 || c.visits > 0)
        .map((c) => ({
          id: c.clinicId,
          name: c.name,
          bookings: c.bookings,
          conversion: c.conversion,
          show: c.showRate,
          adSpend: c.adSpend,
          costPerBooking: c.adCostPerBooking ?? 0,
          ...Object.fromEntries(SOURCES.map((s) => [s, c.sourceMix[s] ?? 0])),
        }) as { id: string; name: string; bookings: number; conversion: number; show: number; adSpend: number; costPerBooking: number } & Record<Source, number>),
    [q.data],
  );
  const growth = useMemo(() => (q.data?.growth ?? []).map((g) => ({ ...g, label: `${g.month.slice(5)}/${g.month.slice(2, 4)}` })), [q.data]);
  const allClinics = q.data?.compare ?? [];
  const retained = allClinics.filter((c) => c.status !== "churned").length;

  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform analytics"
        description="Compare clinics side by side and track platform growth. Computed in SQL on the server."
        actions={
          <>
            <NativeSelect aria-label="Period" className="h-9" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
            </NativeSelect>
            <Button
              variant="outline"
              disabled={!compare.length}
              onClick={() =>
                downloadCsv(
                  `platform-analytics-${days}d.csv`,
                  compare.map((c) => ({
                    clinic: c.name,
                    bookings: c.bookings,
                    conversion_pct: c.conversion,
                    show_rate_pct: c.show,
                    ad_spend: c.adSpend,
                    ad_cost_per_booking: c.costPerBooking,
                    ...Object.fromEntries(SOURCES.map((s) => [`source_${s}`, c[s]])),
                  })),
                )
              }
            >
              Export CSV
            </Button>
          </>
        }
      />

      {q.isLoading && <LoadingState label="Loading analytics…" />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Clinics on platform" value={allClinics.length} />
        <StatCard label="Logo retention" value={`${allClinics.length ? round1((retained / allClinics.length) * 100) : 0}%`} hint="Clinics not churned" />
        <StatCard label={`Bookings (${days}d)`} value={compare.reduce((s, c) => s + c.bookings, 0)} />
        <StatCard label="Bookings per clinic" value={compare.length ? Math.round(compare.reduce((s, c) => s + c.bookings, 0) / compare.length) : 0} />
      </div>

      <Section title="Clinics side by side">
        <ListState items={compare} loading={q.isLoading} emptyTitle="No clinic activity">
          {(list) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clinic</TableHead>
                  <TableHead className="text-right">Bookings</TableHead>
                  <TableHead className="text-right">Conversion</TableHead>
                  <TableHead className="text-right">Show rate</TableHead>
                  <TableHead className="text-right">Ad spend</TableHead>
                  <TableHead className="text-right">Ad cost / booking</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.bookings}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.conversion}%</TableCell>
                    <TableCell className="text-right tabular-nums">{c.show}%</TableCell>
                    <TableCell className="text-right tabular-nums">{currency(c.adSpend)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.costPerBooking ? currency(c.costPerBooking) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ListState>
        <p className="mt-2 text-xs text-muted-foreground">Ad cost per booking = pro-rated monthly ad spend ÷ bookings from paid sources (Google Ads + custom campaigns).</p>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Source mix" description="Bookings by source per clinic.">
          <div className="h-72" role="img" aria-label="Stacked bar chart of bookings by source for each clinic">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compare} margin={{ left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} tickFormatter={(n: string) => n.split(" ").slice(0, 2).join(" ")} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {SOURCES.map((s) => <Bar key={s} dataKey={s} name={SOURCE_LABELS[s]} stackId="src" fill={SOURCE_COLORS[s]} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Bookings per clinic" description="Monthly bookings created, averaged over active clinics.">
          <div className="h-72" role="img" aria-label="Line chart of monthly bookings per clinic">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={growth} margin={{ left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="bookings" name="Platform bookings" stroke="#0f766e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="bookingsPerClinic" name="Per clinic" stroke="#1d4ed8" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      <Section title="Growth and retention" description="New clinics per month and the share of clinics retained.">
        <div className="h-64" role="img" aria-label="New clinics per month and retention">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={growth} margin={{ left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="l" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="l" dataKey="newClinics" name="New clinics" fill="#0f766e" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="r" dataKey="retention" name="Retention %" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>
    </div>
  );
}
