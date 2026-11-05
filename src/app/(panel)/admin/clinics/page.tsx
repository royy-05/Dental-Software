"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import type { ClinicStatus } from "@/types";
import { useAdminClinics } from "@/lib/api/admin";
import { downloadCsv } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { ListState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminGuard, ClinicStatusBadge, ImpersonateButton, NativeSelect, useAdminCan } from "@/components/admin-pages/common";
import { AddClinicWizard } from "@/components/admin-pages/add-clinic-wizard";
import { ClinicActions } from "@/components/admin-pages/clinic-actions";
import { daysLeftToRestore } from "@/components/admin-pages/metrics";
import { ReadOnlyNotice } from "@/components/admin/shell";

type Filter = "all" | ClinicStatus | "deleted";

export default function ClinicsPage() {
  return (
    <AdminGuard perm="admin:clinics:view">
      <ClinicsList />
    </AdminGuard>
  );
}

function ClinicsList() {
  const query = useAdminClinics();
  const clinics = useMemo(() => query.data ?? [], [query.data]);
  const allow = useAdminCan();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(
    () =>
      clinics
        .filter((c) => (filter === "deleted" ? !!c.deletedAt : !c.deletedAt && (filter === "all" || c.status === filter)))
        .filter((c) => !q || `${c.name} ${c.slug} ${c.email}`.toLowerCase().includes(q.toLowerCase()))
        .map((c) => ({ clinic: c, plan: c.planName, owner: c.owner?.name ?? "—", bookings: c.bookingsThisMonth })),
    [clinics, q, filter],
  );

  return (
    <div>
      <PageHeader
        title="Clinics"
        description="Every clinic on the platform. Bookings count appointments created this month."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv(
                  "clinics.csv",
                  rows.map((r) => ({ name: r.clinic.name, slug: r.clinic.slug, plan: r.plan, status: r.clinic.status, owner: r.owner, created: r.clinic.createdAt, bookings_this_month: r.bookings, last_login: r.clinic.lastLoginAt ?? "" })),
                )
              }
            >
              Export CSV
            </Button>
            {allow("admin:clinics:edit") && <AddClinicWizard />}
          </>
        }
      />
      <ReadOnlyNotice perm="admin:clinics:edit" />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="h-9 w-full sm:w-64" placeholder="Search name, slug or email" aria-label="Search clinics" value={q} onChange={(e) => setQ(e.target.value)} />
        <NativeSelect aria-label="Status filter" className="h-9" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="all">All statuses</option>
          {(["active", "trial", "paused", "suspended", "churned"] as const).map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          <option value="deleted">Deleted (restorable)</option>
        </NativeSelect>
      </div>
      <div className="rounded-lg border bg-card">
        <ListState items={rows} loading={query.isLoading} emptyTitle="No clinics match" emptyDescription="Try another filter or add a clinic.">
          {(list) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Bookings (month)</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map(({ clinic: c, plan, owner, bookings }) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/admin/clinics/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                      <span className="block text-xs text-muted-foreground">/book/{c.slug}</span>
                    </TableCell>
                    <TableCell>{plan}</TableCell>
                    <TableCell>
                      <ClinicStatusBadge status={c.status} deleted={!!c.deletedAt} />
                      {c.deletedAt && <span className="block text-xs text-muted-foreground">{daysLeftToRestore(c.deletedAt)} days to restore</span>}
                    </TableCell>
                    <TableCell>{owner}</TableCell>
                    <TableCell className="whitespace-nowrap">{format(new Date(c.createdAt), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-right tabular-nums">{bookings}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{c.lastLoginAt ? formatDistanceToNow(new Date(c.lastLoginAt), { addSuffix: true }) : "Never"}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {!c.deletedAt && <ImpersonateButton clinicId={c.id} clinicName={c.name} size="xs" variant="ghost" />}
                        <ClinicActions clinic={c} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ListState>
      </div>
    </div>
  );
}
