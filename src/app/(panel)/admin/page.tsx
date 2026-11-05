"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Mail, MessageSquare, RefreshCw, ServerCrash } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { currency } from "@/lib/utils";
import { useAdminClinics, useAdminOverview, useAdminPlans } from "@/lib/api/admin";
import { PageHeader, StatCard } from "@/components/shared/page-header";
import { ErrorState, ListState, LoadingState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { AdminGuard, ResetDemoButton, Section } from "@/components/admin-pages/common";

export default function AdminDashboard() {
  return (
    <AdminGuard perm="admin:access">
      <Dashboard />
    </AdminGuard>
  );
}

function Dashboard() {
  const overview = useAdminOverview();
  const clinics = useAdminClinics();
  const plans = useAdminPlans();
  if (overview.isError) return <ErrorState onRetry={() => overview.refetch()} />;
  if (!overview.data) return <LoadingState label="Loading dashboard…" />;
  const data = overview.data;
  const usage = (clinics.data ?? [])
    .filter((c) => !c.deletedAt && c.status !== "churned")
    .map((c) => ({ name: c.name.split(" ").slice(0, 2).join(" "), id: c.id, sms: c.smsCreditsUsed, credits: plans.data?.find((p) => p.id === c.planId)?.limits.smsCredits ?? 0, emails: c.emailsSent }));

  const alerts = [
    ...(data.alerts.failedMessages ? [{ id: "failed", icon: MessageSquare, tone: "danger" as const, text: `${data.alerts.failedMessages} failed or bounced messages in the last 7 days`, href: "/admin/messaging" }] : []),
    ...data.alerts.syncErrors.map((c) => ({ id: `sync-${c.clinicId}`, icon: ServerCrash, tone: "warning" as const, text: `${c.name}: PMS sync error (${c.error})`, href: "/admin/integrations" })),
    ...data.alerts.zeroBookings.map((c) => ({ id: `zero-${c.clinicId}`, icon: AlertTriangle, tone: "warning" as const, text: `${c.name}: zero bookings in 7 days`, href: `/admin/clinics/${c.clinicId}` })),
  ];
  const pts = (a: number, b: number) => Math.round((a - b) * 10) / 10;

  return (
    <div className="space-y-6">
      <PageHeader title="Platform dashboard" description="Last 30 days compared with the 30 days before." actions={<ResetDemoButton />} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Active clinics" value={data.clinics.active} />
        <StatCard label="Trial" value={data.clinics.trial} />
        <StatCard label="Paused" value={data.clinics.paused + data.clinics.suspended} hint={data.clinics.suspended ? `${data.clinics.suspended} suspended` : undefined} />
        <StatCard label="Churned" value={data.clinics.churned} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Platform bookings" value={data.bookings.current} trend={data.bookings.changePct} hint={`vs ${data.bookings.previous} last period`} />
        <StatCard label="Conversion rate" value={`${data.conversion.current}%`} trend={pts(data.conversion.current, data.conversion.previous)} hint={`vs ${data.conversion.previous}% (pts)`} />
        <StatCard label="Show rate" value={`${data.showRate.current}%`} trend={pts(data.showRate.current, data.showRate.previous)} hint={`vs ${data.showRate.previous}% (pts)`} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="MRR" value={currency(data.revenue.mrr)} hint="Active clinics; trials are $0" />
        <StatCard label="New MRR (30d)" value={currency(data.revenue.newMrr)} />
        <StatCard label="Churned MRR" value={currency(data.revenue.churnedMrr)} />
        <Link href="/admin/billing" className="rounded-lg focus-visible:ring-2">
          <StatCard label="Overdue invoices" value={data.revenue.overdueInvoices} hint={currency(data.revenue.overdueAmount)} />
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Health alerts" description="Failed messages, sync errors and quiet clinics.">
          <ListState items={alerts} emptyTitle="All clear" emptyDescription="No failed messages, sync errors or quiet clinics.">
            {(list) => (
              <ul className="divide-y">
                {list.map((a) => (
                  <li key={a.id}>
                    <Link href={a.href} className="flex items-start gap-3 py-2.5 text-sm hover:underline">
                      <a.icon className={a.tone === "danger" ? "mt-0.5 h-4 w-4 shrink-0 text-destructive" : "mt-0.5 h-4 w-4 shrink-0 text-amber-700"} aria-hidden />
                      {a.text}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </ListState>
          {alerts.length === 0 && (
            <p className="mt-2 flex items-center gap-1 text-xs text-green-800">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Systems healthy
            </p>
          )}
        </Section>

        <Section title="SMS and email usage" description={`SMS credits used this cycle vs plan credits (${data.usage.smsUsed}/${data.usage.smsCredits} platform-wide, ${data.usage.emailsSent} emails).`}>
          <ListState items={usage} emptyTitle="No billable clinics" loading={clinics.isLoading}>
            {(list) => (
              <>
                <div className="h-48" aria-hidden>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={list} margin={{ left: -16 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="sms" name="SMS used" fill="#0f766e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="credits" name="SMS credits" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  {list.map((u) => {
                    const pctUsed = u.credits ? Math.round((u.sms / u.credits) * 100) : 0;
                    return (
                      <li key={u.id} className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">{u.name}</span>
                        <span className="flex items-center gap-1 text-xs"><MessageSquare className="h-3 w-3" aria-hidden />{u.sms}/{u.credits}</span>
                        <Badge variant={pctUsed > 90 ? "danger" : pctUsed > 70 ? "warning" : "success"}>{pctUsed}%</Badge>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3" aria-hidden />{u.emails} emails</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </ListState>
        </Section>
      </div>

      <Section title="Demo data" description="Restore the database to its seeded state (clinics, 60 days of appointments, messages, tickets). DEMO_MODE only.">
        <div className="flex flex-wrap items-center gap-3">
          <ResetDemoButton />
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3" aria-hidden /> Numbers refresh from the database on every visit.
          </span>
        </div>
      </Section>
    </div>
  );
}
