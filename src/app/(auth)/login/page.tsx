"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { signIn } from "next-auth/react";
import { Check, KeyRound, Minus, ShieldCheck } from "lucide-react";
import type { Role } from "@/types";
import { ROLE_LABELS } from "@/types";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const ERRORS: Record<string, string> = {
  invalid: "Email or password is not right.",
  "2fa_invalid": "That 2FA code is not right. Check the time on your phone and try again.",
  locked: "Too many failed attempts. Your account is locked for 15 minutes.",
  rate_limited: "Too many sign-in attempts. Please wait a few minutes and try again.",
};

interface DemoInfo {
  users: { email: string; name: string; platformRole: string | null; twoFactor: boolean }[];
  password: string;
  totpCode: string;
  totpSecret: string;
}

export default function LoginPage() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reason = params.get("reason");
  const demo = useQuery({ queryKey: ["demo-accounts"], queryFn: () => api<DemoInfo>("/api/auth/demo"), retry: false, refetchInterval: 20_000 });

  useEffect(() => {
    if (reason === "expired") setError("You were signed out after 30 minutes without activity. Please sign in again.");
  }, [reason]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn("credentials", { email, password, code: needCode ? code : "", redirect: false });
    setBusy(false);
    if (!res || res.error) {
      const c = res?.code ?? "invalid";
      if (c === "2fa_required") {
        setNeedCode(true);
        setError(null);
        return;
      }
      setError(ERRORS[c] ?? ERRORS.invalid);
      return;
    }
    const me = await api<{ platformRole: string | null; needsTwoFactorSetup: boolean }>("/api/me").catch(() => null);
    const next = params.get("next");
    const target = me?.needsTwoFactorSetup
      ? "/account/security?setup=1"
      : me?.platformRole
        ? next?.startsWith("/admin") ? next : "/admin"
        : next?.startsWith("/clinic") ? next : "/clinic";
    window.location.assign(target);
  };

  const fillDemo = (u: DemoInfo["users"][number]) => {
    setEmail(u.email);
    setPassword(demo.data?.password ?? "");
    setNeedCode(u.twoFactor);
    setCode(u.twoFactor ? (demo.data?.totpCode ?? "") : "");
    setError(null);
  };

  return (
    <main id="main" className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1fr_1.1fr]">
      <div>
        <Link href="/" className="text-sm font-bold text-primary">Kivi Health</Link>
        <h1 className="mt-3 text-2xl font-bold">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Clinic staff and platform team. Patients book without an account.</p>
        <Card className="mt-6">
          <form onSubmit={submit} noValidate>
            <CardContent className="grid gap-4 pt-5">
              {error && (
                <p role="alert" className="rounded-md border border-destructive/30 bg-red-50 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="login-email">Email</Label>
                <Input id="login-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="login-pw">Password</Label>
                  <Link href="/forgot-password" className="text-xs text-primary underline-offset-2 hover:underline">Forgot password?</Link>
                </div>
                <Input id="login-pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {needCode && (
                <div className="grid gap-1.5">
                  <Label htmlFor="login-code">Authenticator code</Label>
                  <Input id="login-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                  <p className="text-xs text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
                </div>
              )}
              <Button type="submit" size="lg" disabled={busy || !email || !password}>
                <ShieldCheck /> {busy ? "Signing in…" : "Sign in"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">Sessions end after 30 minutes without activity.</p>
            </CardContent>
          </form>
        </Card>
        {demo.data && (
          <Card className="mt-6 border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" aria-hidden /> Demo accounts</CardTitle>
              <CardDescription>
                Shown because DEMO_MODE is on. Password for all: <code>{demo.data.password}</code>. Accounts with 2FA use the demo authenticator secret <code>{demo.data.totpSecret}</code> (current code <code>{demo.data.totpCode}</code>).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-1.5">
              {demo.data.users.map((u) => (
                <button key={u.email} type="button" onClick={() => fillDemo(u)} className="flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted">
                  <span>
                    <span className="font-medium">{u.name}</span> <span className="text-muted-foreground">{u.email}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{u.platformRole ? ROLE_LABELS[u.platformRole as Role] : "Clinic staff"}{u.twoFactor ? " · 2FA" : ""}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
      <Card className="self-start">
        <CardHeader>
          <CardTitle>Permission matrix</CardTitle>
          <CardDescription>Enforced by every API route on the server, and mirrored in navigation and buttons (spec section 2).</CardDescription>
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
