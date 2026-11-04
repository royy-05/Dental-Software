"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Check, Minus, ShieldCheck } from "lucide-react";
import type { Role } from "@/types";
import { ROLE_LABELS } from "@/types";
import { isPlatformRole, PERMISSIONS, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useApp } from "@/store/app";
import { useHydrated } from "@/components/shared/hydration";
import { LoadingState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ROLES: { role: Role; layer: string; summary: string }[] = [
  { role: "super_admin", layer: "Super admin panel", summary: "All clinics, plans, features, users, global settings, impersonation." },
  { role: "support_agent", layer: "Super admin panel", summary: "View clinics, tickets, logs; impersonate with a logged reason. No billing, plan/feature changes or deletes." },
  { role: "clinic_owner", layer: "Clinic panel", summary: "Everything in their clinic(s), staff users, billing view, all reports." },
  { role: "clinic_manager", layer: "Clinic panel", summary: "Reasons, providers, insurances, templates, settings, appointments, reports. No billing." },
  { role: "front_desk", layer: "Clinic panel", summary: "Appointments (view, confirm, reschedule, cancel) and patient details only." },
];

const MATRIX: { label: string; perm: Permission }[] = [
  { label: "Appointments", perm: "appointments:manage" },
  { label: "Reasons, providers, schedule", perm: "reasons:manage" },
  { label: "Templates", perm: "templates:manage" },
  { label: "Reports (Analytics, Performance)", perm: "reports:view" },
  { label: "Settings", perm: "settings:manage" },
  { label: "Staff users", perm: "users:manage" },
  { label: "Billing view", perm: "billing:view" },
  { label: "Super admin panel", perm: "admin:access" },
  { label: "Impersonate clinics", perm: "admin:impersonate" },
  { label: "Plans & billing (admin)", perm: "admin:billing" },
  { label: "Feature flag changes", perm: "admin:features:edit" },
  { label: "Delete clinics", perm: "admin:clinics:delete" },
];

export default function LoginPage() {
  const hydrated = useHydrated();
  const users = useApp((s) => s.db.users);
  const clinics = useApp((s) => s.db.clinics);
  const login = useApp((s) => s.login);
  const current = useApp((s) => s.session.userId);
  const router = useRouter();
  const params = useSearchParams();
  const [role, setRole] = useState<Role>("clinic_owner");
  const roleUsers = users.filter((u) => u.role === role && u.active);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const selected = roleUsers.find((u) => u.id === userId) ?? roleUsers[0];

  if (!hydrated) return <LoadingState className="mx-auto max-w-xl pt-20" />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    login(selected.id);
    const next = params.get("next");
    const target = isPlatformRole(selected.role) ? (next?.startsWith("/admin") ? next : "/admin") : next?.startsWith("/clinic") ? next : "/clinic";
    router.push(target);
  };

  return (
    <main id="main" className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1fr_1.1fr]">
      <div>
        <Link href="/" className="text-sm font-bold text-primary">Kivi Health</Link>
        <h1 className="mt-3 text-2xl font-bold">Sign in to the demo</h1>
        <p className="mt-1 text-sm text-muted-foreground">Fake login. Pick a role to see what it can do. Email and password are not checked.</p>
        <Card className="mt-6">
          <form onSubmit={submit}>
            <CardContent className="grid gap-5 pt-5">
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">Role</legend>
                <RadioGroup value={role} onValueChange={(v) => { setRole(v as Role); setUserId(undefined); }} className="gap-2">
                  {ROLES.map((r) => (
                    <label key={r.role} htmlFor={`role-${r.role}`} className={cn("flex cursor-pointer gap-3 rounded-md border p-3 hover:bg-muted/50", role === r.role && "border-primary bg-secondary/40")}>
                      <RadioGroupItem id={`role-${r.role}`} value={r.role} className="mt-0.5" />
                      <span>
                        <span className="block text-sm font-medium">{ROLE_LABELS[r.role]} <span className="font-normal text-muted-foreground">· {r.layer}</span></span>
                        <span className="block text-xs text-muted-foreground">{r.summary}</span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </fieldset>
              <div className="grid gap-1.5">
                <Label htmlFor="login-user">Demo user</Label>
                <select
                  id="login-user"
                  className="h-10 rounded-md border border-input bg-card px-3 text-sm"
                  value={selected?.id ?? ""}
                  onChange={(e) => setUserId(e.target.value)}
                >
                  {roleUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} {u.clinicIds.length ? `(${u.clinicIds.map((id) => clinics.find((c) => c.id === id)?.name).join(", ")})` : "(all clinics)"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="login-email">Email</Label>
                  <Input id="login-email" readOnly value={selected?.email ?? ""} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="login-pw">Password</Label>
                  <Input id="login-pw" type="password" defaultValue="demo-password" autoComplete="off" />
                </div>
              </div>
              <Button type="submit" size="lg" disabled={!selected}>
                <ShieldCheck /> Sign in as {ROLE_LABELS[role]}
              </Button>
              {current && <p className="text-center text-xs text-muted-foreground">Currently signed in as {users.find((u) => u.id === current)?.name}.</p>}
            </CardContent>
          </form>
        </Card>
      </div>
      <Card className="self-start">
        <CardHeader>
          <CardTitle>Permission matrix</CardTitle>
          <CardDescription>Enforced in navigation, page guards and action buttons (spec section 2).</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Capability</TableHead>
                {ROLES.map((r) => (
                  <TableHead key={r.role} className="text-center normal-case">{ROLE_LABELS[r.role].replace(" ", " ")}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {MATRIX.map((m) => (
                <TableRow key={m.perm}>
                  <TableCell className="text-sm">{m.label}</TableCell>
                  {ROLES.map((r) => {
                    const ok = PERMISSIONS[r.role].includes(m.perm);
                    return (
                      <TableCell key={r.role} className="text-center">
                        {ok ? <Check className="mx-auto h-4 w-4 text-green-700" aria-label="Allowed" /> : <Minus className="mx-auto h-4 w-4 text-slate-400" aria-label="Not allowed" />}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="p-4 text-xs text-muted-foreground">Support Agents act as a Clinic Manager (no billing) while impersonating; Super Admins act as the Clinic Owner.</p>
        </CardContent>
      </Card>
    </main>
  );
}
