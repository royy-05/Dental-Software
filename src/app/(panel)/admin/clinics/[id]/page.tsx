"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { FeatureKey } from "@/types";
import { FEATURE_LABELS, ROLE_LABELS } from "@/types";
import { featureEnabled } from "@/lib/permissions";
import { currency } from "@/lib/utils";
import { useApp } from "@/store/app";
import { PageHeader, StatCard } from "@/components/shared/page-header";
import { EmptyState, ListState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminGuard, ClinicStatusBadge, ImpersonateButton, Section } from "@/components/admin-pages/common";
import { ClinicActions } from "@/components/admin-pages/clinic-actions";
import { bookingsIn, conversionRate, daysLeftToRestore, lastDays, planPrice, showRate } from "@/components/admin-pages/metrics";

export default function ClinicDetailPage() {
  return (
    <AdminGuard perm="admin:clinics:view">
      <ClinicDetail />
    </AdminGuard>
  );
}

function ClinicDetail() {
  const { id } = useParams<{ id: string }>();
  const db = useApp((s) => s.db);
  const clinic = db.clinics.find((c) => c.id === id);

  const stats = useMemo(() => {
    if (!clinic) return null;
    const p = lastDays(30);
    return {
      bookings: bookingsIn(db.appointments, p, clinic.id).length,
      conversion: conversionRate(db.appointments, db.widgetSessions, p, clinic.id),
      show: showRate(db.appointments, p, clinic.id),
      providers: db.providers.filter((x) => x.clinicId === clinic.id && x.active).length,
      reasons: db.reasons.filter((x) => x.clinicId === clinic.id && x.active).length,
    };
  }, [db, clinic]);
  const users = useMemo(() => db.users.filter((u) => u.clinicIds.includes(id)), [db.users, id]);
  const audit = useMemo(() => db.audit.filter((a) => a.clinicId === id).slice(0, 10), [db.audit, id]);

  if (!clinic || !stats) return <EmptyState title="Clinic not found" action={<Button asChild variant="outline"><Link href="/admin/clinics">Back to clinics</Link></Button>} />;
  const plan = db.plans.find((p) => p.id === clinic.planId);
  const owner = db.users.find((u) => u.id === clinic.ownerUserId);
  const group = db.groups.find((g) => g.id === clinic.groupId);
  const flow = db.flows.find((f) => f.clinicId === clinic.id);

  return (
    <div className="space-y-6">
      <Link href="/admin/clinics" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All clinics
      </Link>
      <PageHeader
        title={clinic.name}
        description={`${clinic.specialty[0].toUpperCase()}${clinic.specialty.slice(1)} · ${clinic.timeZone} · created ${format(new Date(clinic.createdAt), "MMM d, yyyy")}`}
        actions={
          <>
            <ClinicStatusBadge status={clinic.status} deleted={!!clinic.deletedAt} />
            {!clinic.deletedAt && <ImpersonateButton clinicId={clinic.id} clinicName={clinic.name} />}
            <ClinicActions clinic={clinic} showView={false} />
          </>
        }
      />
      {clinic.deletedAt && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">Deleted {formatDistanceToNow(new Date(clinic.deletedAt), { addSuffix: true })}. {daysLeftToRestore(clinic.deletedAt)} days left to restore.</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Bookings (30d)" value={stats.bookings} />
        <StatCard label="Conversion" value={`${stats.conversion}%`} />
        <StatCard label="Show rate" value={`${stats.show}%`} />
        <StatCard label="MRR" value={clinic.status === "active" ? currency(planPrice(db.plans, clinic.planId)) : "$0"} hint={plan?.name} />
        <StatCard label="Providers / reasons" value={`${stats.providers} / ${stats.reasons}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Overview">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Booking link</dt>
            <dd>
              <Link href={`/book/${clinic.slug}`} className="inline-flex items-center gap-1 text-primary hover:underline" target="_blank">
                /book/{clinic.slug} <ExternalLink className="h-3 w-3" aria-hidden />
              </Link>
            </dd>
            <dt className="text-muted-foreground">Owner</dt>
            <dd>{owner ? `${owner.name} (${owner.email})` : "—"}</dd>
            <dt className="text-muted-foreground">Group</dt>
            <dd>{group?.name ?? "—"}</dd>
            <dt className="text-muted-foreground">Contact</dt>
            <dd>{clinic.phone} · {clinic.email}</dd>
            <dt className="text-muted-foreground">Address</dt>
            <dd>{clinic.address}</dd>
            <dt className="text-muted-foreground">Booking flow</dt>
            <dd>v{flow?.publishedVersion ?? 1} published · theme {clinic.branding.theme.replace("_", " ")}</dd>
            <dt className="text-muted-foreground">SMS (10DLC)</dt>
            <dd className="capitalize">{clinic.smsRegistration.replace("_", " ")} · {clinic.smsCreditsUsed}/{plan?.limits.smsCredits ?? 0} credits</dd>
            <dt className="text-muted-foreground">PMS</dt>
            <dd>{clinic.pms.name} {clinic.pms.connected ? "(connected)" : "(not connected)"} {clinic.pms.syncError && <Badge variant="danger">{clinic.pms.syncError}</Badge>}</dd>
            <dt className="text-muted-foreground">Last login</dt>
            <dd>{clinic.lastLoginAt ? formatDistanceToNow(new Date(clinic.lastLoginAt), { addSuffix: true }) : "Never"}</dd>
            {clinic.trialEndsAt && clinic.status === "trial" && (
              <>
                <dt className="text-muted-foreground">Trial ends</dt>
                <dd>{format(new Date(clinic.trialEndsAt), "MMM d, yyyy")}</dd>
              </>
            )}
          </dl>
        </Section>

        <Section title="Feature flags" description="Plan modules plus per-clinic overrides." actions={<Button asChild size="sm" variant="outline"><Link href="/admin/features">Edit flags</Link></Button>}>
          <ul className="divide-y text-sm">
            {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((k) => {
              const on = featureEnabled(clinic, db.plans, k);
              const override = clinic.featureOverrides[k];
              return (
                <li key={k} className="flex items-center justify-between py-2">
                  <span>{FEATURE_LABELS[k]}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{override === undefined ? `from ${plan?.name ?? "plan"}` : "clinic override"}</span>
                    <Badge variant={on ? "success" : "muted"}>{on ? "On" : "Off"}</Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Users with access">
          <ListState items={users} emptyTitle="No users yet">
            {(list) => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>2FA</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>{u.name}<span className="block text-xs text-muted-foreground">{u.email}</span></TableCell>
                      <TableCell>{ROLE_LABELS[u.role]}</TableCell>
                      <TableCell>{u.twoFactor ? <Badge variant="success">On</Badge> : <Badge variant="muted">Off</Badge>}</TableCell>
                      <TableCell>{u.active ? "Active" : "Deactivated"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ListState>
        </Section>
        <Section title="Recent activity" actions={<Button asChild size="sm" variant="outline"><Link href="/admin/audit">Audit log</Link></Button>}>
          <ListState items={audit} emptyTitle="No activity logged">
            {(list) => (
              <ul className="divide-y text-sm">
                {list.map((a) => (
                  <li key={a.id} className="py-2">
                    <p><strong>{a.actorName}</strong> {a.action.toLowerCase()} <span className="text-muted-foreground">· {a.target}</span></p>
                    <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(a.at), { addSuffix: true })} · {a.ip}{a.details ? ` · ${a.details}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </ListState>
        </Section>
      </div>
    </div>
  );
}
