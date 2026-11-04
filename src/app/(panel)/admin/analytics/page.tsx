"use client";

import { useMemo, useState } from "react";
import { format, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Source } from "@/types";
import { SOURCE_LABELS } from "@/types";
import { useApp } from "@/store/app";
import { currency, downloadCsv } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/shared/page-header";
import { ListState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminGuard, NativeSelect, Section } from "@/components/admin-pages/common";
import { bookingsIn, conversionRate, lastDays, round1, showRate, sourceMix } from "@/components/admin-pages/metrics";

const SOURCES: Source[] = ["google_ads", "gbp", "rwg", "website", "custom", "direct", "staff"];
const SOURCE_COLORS: Record<Source, string> = { google_ads: "#0f766e", gbp: "#1d4ed8", rwg: "#ca8a04", website: "#7c3aed", custom: "#be123c", direct: "#64748b", staff: "#94a3b8" };
const CLINIC_COLORS = ["#0f766e", "#1d4ed8", "#7c3aed", "#b45309", "#be123c"];

export default function AnalyticsPage() {
  return (
    <AdminGuard perm="admin:analytics">
      <Analytics />
    </AdminGuard>
  );
}

function Analytics() {
  const db = useApp((s) => s.db);
  const [days, setDays] = useState(30);

  const compare = useMemo(() => {
    const p = lastDays(days);
    const months = new Set<string>();
    for (let d = new Date(p.from); d <= p.to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.add(format(d, "yyyy-MM"));
    return db.clinics
      .filter((c) => !c.deletedAt && db.appointments.some((a) => a.clinicId === c.id))
      .map((c) => {
        const booked = bookingsIn(db.appointments, p, c.id);
        const adBookings = booked.filter((a) => a.source === "google_ads" || a.source === "custom").length;
        // Ad spend is monthly; pro-rate it to the selected window.
        const spend = db.adSpend.filter((s) => s.clinicId === c.id && months.has(s.month)).reduce((sum, s) => sum + s.amount, 0);
        const proRated = (spend / Math.max(1, months.size)) * (days / 30);
        const mix = sourceMix(booked);
        return {
          id: c.id,
          name: c.name,
          bookings: booked.length,
          conversion: conversionRate(db.appointments, db.widgetSessions, p, c.id),
          show: showRate(db.appointments, p, c.id),
          adSpend: Math.round(proRated),
          costPerBooking: adBookings ? Math.round(proRated / adBookings) : 0,
          ...Object.fromEntries(SOURCES.map((s) => [s, mix[s] ?? 0])),
        } as { id: string; name: string; bookings: number; conversion: number; show: number; adSpend: number; costPerBooking: number } & Record<Source, number>;
      });
  }, [db, days]);

  const growth = useMemo(() => {
    const now = new Date();
    const rows = [];
    for (let i = 11; i >= 0; i--) {
      const m = startOfMonth(subMonths(now, i));
      const end = startOfMonth(subMonths(now, i - 1));
      const created = db.clinics.filter((c) => new Date(c.createdAt) >= m && new Date(c.createdAt) < end).length;
      const existing = db.clinics.filter((c) => new Date(c.createdAt) < end).length;
      // Northside churned ~95 days ago (no logins since): treat churned clinics as lost from their last login month.
      const lost = db.clinics.filter((c) => c.status === "churned" && c.lastLoginAt && new Date(c.lastLoginAt) < end).length;
      rows.push({ month: format(m, "MMM yy"), newClinics: created, retention: existing ? round1(((existing - lost) / existing) * 100) : 100 });
    }
    return rows;
  }, [db.clinics]);

  const weekly = useMemo(() => {
    const main = compare.map((c) => c.id);
    const map = new Map<string, Record<string, number | string>>();
    for (const a of db.appointments) {
      if (!main.includes(a.clinicId)) continue;
      const wk = format(startOfWeek(new Date(a.createdAt), { weekStartsOn: 1 }), "MMM d");
      const key = startOfWeek(new Date(a.createdAt), { weekStartsOn: 1 }).toISOString();
      const row = map.get(key) ?? { week: wk };
      row[a.clinicId] = ((row[a.clinicId] as number) ?? 0) + 1;
      map.set(key, row);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-9, -1).map(([, v]) => v);
  }, [db.appointments, compare]);

  const live = db.clinics.filter((c) => !c.deletedAt);
  const retained = live.filter((c) => c.status !== "churned").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform analytics"
        description="Compare clinics side by side and track platform growth."
        actions={
          <>
            <NativeSelect aria-label="Period" className="h-9" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
            </NativeSelect>
            <Button
              variant="outline"
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Clinics on platform" value={live.length} />
        <StatCard label="Logo retention" value={`${live.length ? round1((retained / live.length) * 100) : 0}%`} hint="Clinics not churned" />
        <StatCard label={`Bookings (${days}d)`} value={compare.reduce((s, c) => s + c.bookings, 0)} />
        <StatCard label="Bookings per clinic" value={compare.length ? Math.round(compare.reduce((s, c) => s + c.bookings, 0) / compare.length) : 0} />
      </div>

      <Section title="Clinics side by side">
        <ListState items={compare} emptyTitle="No clinic activity">
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
        <Section title="Bookings per clinic" description="Weekly bookings created.">
          <div className="h-72" role="img" aria-label="Line chart of weekly bookings per clinic">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weekly} margin={{ left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {compare.map((c, i) => <Line key={c.id} type="monotone" dataKey={c.id} name={c.name} stroke={CLINIC_COLORS[i % CLINIC_COLORS.length]} strokeWidth={2} dot={false} />)}
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
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
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
