"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Mail, MessageSquare, RefreshCw, ServerCrash } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp } from "@/store/app";
import { currency } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/shared/page-header";
import { ListState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { AdminGuard, ResetDemoButton, Section } from "@/components/admin-pages/common";
import { bookingsIn, churnedMrr, conversionRate, lastDays, mrr, newMrr, pctChange, showRate } from "@/components/admin-pages/metrics";

export default function AdminDashboard() {
  return (
    <AdminGuard perm="admin:access">
      <Dashboard />
    </AdminGuard>
  );
}

function Dashboard() {
  const db = useApp((s) => s.db);
  const data = useMemo(() => {
    const now = new Date();
    const cur = lastDays(30, now);
    const prev = lastDays(30, now, 1);
    const live = db.clinics.filter((c) => !c.deletedAt);
    const counts = { active: 0, trial: 0, paused: 0, churned: 0, suspended: 0 };
    for (const c of live) counts[c.status]++;
    const bookCur = bookingsIn(db.appointments, cur).length;
    const bookPrev = bookingsIn(db.appointments, prev).length;
    const convCur = conversionRate(db.appointments, db.widgetSessions, cur);
    const convPrev = conversionRate(db.appointments, db.widgetSessions, prev);
    const showCur = showRate(db.appointments, cur);
    const showPrev = showRate(db.appointments, prev);
    const overdue = db.invoices.filter((i) => i.status === "overdue");
    const usage = live
      .filter((c) => c.status !== "churned")
      .map((c) => {
        const plan = db.plans.find((p) => p.id === c.planId);
        return { name: c.name.split(" ").slice(0, 2).join(" "), id: c.id, sms: c.smsCreditsUsed, credits: plan?.limits.smsCredits ?? 0, emails: c.emailsSent };
      });
    const weekAgo = now.getTime() - 7 * 86400000;
    const failed = db.messages.filter((m) => (m.status === "failed" || m.status === "bounced") && new Date(m.createdAt).getTime() >= weekAgo);
    const syncErrors = live.filter((c) => c.pms.syncError);
    const zero = live.filter((c) => c.status !== "churned" && !db.appointments.some((a) => a.clinicId === c.id && new Date(a.createdAt).getTime() >= weekAgo));
    return {
      counts,
      bookCur,
      bookPrev,
      convCur,
      convPrev,
      showCur,
      showPrev,
      mrr: mrr(db.clinics, db.plans),
      newMrr: newMrr(db.clinics, db.plans, now),
      churned: churnedMrr(db.clinics, db.plans),
      overdue,
      usage,
      failed,
      syncErrors,
      zero,
    };
  }, [db]);

  const alerts = [
    ...(data.failed.length
      ? [{ id: "failed", icon: MessageSquare, tone: "danger" as const, text: `${data.failed.length} failed or bounced messages in the last 7 days`, href: "/admin/messaging" }]
      : []),
    ...data.syncErrors.map((c) => ({ id: `sync-${c.id}`, icon: ServerCrash, tone: "warning" as const, text: `${c.name}: PMS sync error (${c.pms.syncError})`, href: "/admin/integrations" })),
    ...data.zero.map((c) => ({ id: `zero-${c.id}`, icon: AlertTriangle, tone: "warning" as const, text: `${c.name}: zero bookings in 7 days`, href: `/admin/clinics/${c.id}` })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Platform dashboard" description="Last 30 days compared with the 30 days before." actions={<ResetDemoButton />} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Active clinics" value={data.counts.active} />
        <StatCard label="Trial" value={data.counts.trial} />
        <StatCard label="Paused" value={data.counts.paused + data.counts.suspended} hint={data.counts.suspended ? `${data.counts.suspended} suspended` : undefined} />
        <StatCard label="Churned" value={data.counts.churned} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Platform bookings" value={data.bookCur} trend={pctChange(data.bookCur, data.bookPrev)} hint={`vs ${data.bookPrev} last period`} />
        <StatCard label="Conversion rate" value={`${data.convCur}%`} trend={Math.round((data.convCur - data.convPrev) * 10) / 10} hint={`vs ${data.convPrev}% (pts)`} />
        <StatCard label="Show rate" value={`${data.showCur}%`} trend={Math.round((data.showCur - data.showPrev) * 10) / 10} hint={`vs ${data.showPrev}% (pts)`} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="MRR" value={currency(data.mrr)} hint="Active clinics; trials are $0" />
        <StatCard label="New MRR (30d)" value={currency(data.newMrr)} />
        <StatCard label="Churned MRR" value={currency(data.churned)} />
        <Link href="/admin/billing" className="rounded-lg focus-visible:ring-2">
          <StatCard label="Overdue invoices" value={data.overdue.length} hint={currency(data.overdue.reduce((s, i) => s + i.amount, 0))} />
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

        <Section title="SMS and email usage" description="SMS credits used this cycle vs plan credits.">
          <ListState items={data.usage} emptyTitle="No billable clinics">
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

      <Section title="Demo data" description="Step 8: restore the prototype to its seeded state (clinics, 60 days of appointments, messages, tickets).">
        <div className="flex flex-wrap items-center gap-3">
          <ResetDemoButton />
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3" aria-hidden /> Seeded {new Date(db.seededAt).toLocaleString()}
          </span>
        </div>
      </Section>
    </div>
  );
}
