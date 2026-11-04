"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import type { AuditEntry } from "@/types";
import { ROLE_LABELS, type Role } from "@/types";
import { useApp } from "@/store/app";
import { downloadCsv } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { ListState } from "@/components/shared/states";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminGuard, NativeSelect } from "@/components/admin-pages/common";

const CATEGORY_LABELS: Record<AuditEntry["category"], string> = {
  login: "Logins",
  phi_access: "Patient data access",
  export: "Exports",
  settings: "Settings",
  template: "Templates",
  impersonation: "Impersonation",
  clinic: "Clinics",
  user: "Users",
  billing: "Billing",
  booking: "Bookings",
};
const CATEGORY_VARIANT: Partial<Record<AuditEntry["category"], BadgeProps["variant"]>> = {
  phi_access: "danger",
  impersonation: "warning",
  export: "violet",
  login: "info",
  billing: "secondary",
};

function roleLabel(r: AuditEntry["actorRole"]) {
  return r === "patient" ? "Patient" : r === "system" ? "System" : ROLE_LABELS[r as Role];
}

export default function AuditPage() {
  return (
    <AdminGuard perm="admin:audit">
      <Audit />
    </AdminGuard>
  );
}

function Audit() {
  const audit = useApp((s) => s.db.audit);
  const clinics = useApp((s) => s.db.clinics);
  const logAudit = useApp((s) => s.logAudit);
  const [category, setCategory] = useState<"all" | AuditEntry["category"]>("all");
  const [clinicId, setClinicId] = useState("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(50);
  const rows = useMemo(
    () =>
      audit
        .filter((a) => category === "all" || a.category === category)
        .filter((a) => clinicId === "all" || a.clinicId === clinicId)
        .filter((a) => !q || `${a.actorName} ${a.action} ${a.target} ${a.ip} ${a.details ?? ""}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.at.localeCompare(a.at)),
    [audit, category, clinicId, q],
  );
  const clinicName = (id?: string) => (id ? clinics.find((c) => c.id === id)?.name ?? id : "Platform");

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Who did what, when, and from which IP. Includes logins, patient record views, exports, setting and template changes."
        actions={
          <Button
            variant="outline"
            onClick={() => {
              downloadCsv(
                "audit-log.csv",
                rows.map((a) => ({ at: a.at, actor: a.actorName, role: roleLabel(a.actorRole), action: a.action, category: a.category, target: a.target, clinic: clinicName(a.clinicId), ip: a.ip, details: a.details ?? "" })),
              );
              logAudit({ action: "Exported audit log CSV", category: "export", target: "Audit log" });
            }}
          >
            Export CSV
          </Button>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="h-9 w-full sm:w-64" placeholder="Search actor, action, target or IP" aria-label="Search audit log" value={q} onChange={(e) => setQ(e.target.value)} />
        <NativeSelect aria-label="Category" className="h-9" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
          <option value="all">All categories</option>
          {(Object.keys(CATEGORY_LABELS) as AuditEntry["category"][]).map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Clinic" className="h-9" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
          <option value="all">All clinics</option>
          {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </NativeSelect>
        <Button variant={category === "phi_access" ? "default" : "outline"} size="sm" className="h-9" aria-pressed={category === "phi_access"} onClick={() => setCategory(category === "phi_access" ? "all" : "phi_access")}>
          Patient data access log
        </Button>
      </div>
      <div className="rounded-lg border bg-card">
        <ListState items={rows} emptyTitle="No audit entries match">
          {(list) => (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Who</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Clinic</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.slice(0, limit).map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap text-xs">{format(new Date(a.at), "MMM d, yyyy h:mm a")}</TableCell>
                      <TableCell className="text-sm">{a.actorName}<span className="block text-xs text-muted-foreground">{roleLabel(a.actorRole)}</span></TableCell>
                      <TableCell className="text-sm">
                        <Badge variant={CATEGORY_VARIANT[a.category] ?? "muted"} className="mb-0.5">{CATEGORY_LABELS[a.category]}</Badge>
                        <span className="block">{a.action}</span>
                        {a.details && <span className="block text-xs text-muted-foreground">{a.details}</span>}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs">{a.target}</TableCell>
                      <TableCell className="text-xs">{clinicName(a.clinicId)}</TableCell>
                      <TableCell className="font-mono text-xs">{a.ip}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {list.length > limit && (
                <div className="p-3 text-center">
                  <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + 100)}>Show more ({list.length - limit} more)</Button>
                </div>
              )}
            </>
          )}
        </ListState>
      </div>
    </div>
  );
}
