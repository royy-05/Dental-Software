"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { api, errorMessage } from "@/lib/api/client";
import { useMe, qk } from "@/lib/api/session";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/shared/states";
import { SetPasswordForm } from "@/components/shared/set-password-form";

/** Own account: 2FA enrolment (required for platform users) and password change. */
export default function AccountSecurityPage() {
  const me = useMe();
  const qc = useQueryClient();
  const params = useSearchParams();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [current, setCurrent] = useState("");
  if (!me.data) return <LoadingState className="mx-auto max-w-xl pt-16" />;
  const u = me.data.user;
  const home = me.data.platformRole ? "/admin" : "/clinic";

  const start = async () => {
    try {
      setSetup(await api("/api/auth/2fa/setup", { method: "POST" }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const confirm = async () => {
    try {
      await api("/api/auth/2fa/confirm", { body: { code } });
      toast.success("Two-factor authentication is on");
      setSetup(null);
      await qc.invalidateQueries({ queryKey: qk.me });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <main id="main" className="mx-auto grid max-w-xl gap-6 px-4 py-10">
      <div>
        <Link href={home} className="text-sm font-bold text-primary">← Back</Link>
        <h1 className="mt-3 text-2xl font-bold">Account security</h1>
        <p className="text-sm text-muted-foreground">{u.name} · {u.email}</p>
      </div>
      {(params.get("setup") || me.data.needsTwoFactorSetup) && !u.twoFactor && (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">Your account requires two-factor authentication. Set it up to continue.</p>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" aria-hidden /> Two-factor authentication</CardTitle>
          <CardDescription>{u.twoFactor ? "On. You'll be asked for a code from your authenticator app at every sign-in." : "Off. Use an authenticator app (Google Authenticator, 1Password, Authy)."}</CardDescription>
        </CardHeader>
        {!u.twoFactor && (
          <CardContent className="grid gap-3">
            {!setup ? (
              <Button onClick={start}>Set up 2FA</Button>
            ) : (
              <>
                <p className="text-sm">Add this key to your authenticator app, or open the setup link on your phone:</p>
                <code className="break-all rounded bg-muted p-2 text-sm">{setup.secret}</code>
                <a className="break-all text-xs text-primary underline" href={setup.otpauthUrl}>{setup.otpauthUrl}</a>
                <div className="grid gap-1.5">
                  <Label htmlFor="totp-code">Code from the app</Label>
                  <Input id="totp-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                </div>
                <Button onClick={confirm} disabled={code.length !== 6}>Turn on 2FA</Button>
              </>
            )}
          </CardContent>
        )}
      </Card>
      {!me.data.needsTwoFactorSetup && (
        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="cur-pw">Current password</Label>
              <Input id="cur-pw" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
            <SetPasswordForm cta="Change password" onSubmit={async ({ password }) => { await api("/api/auth/password/change", { body: { current, next: password } }); setCurrent(""); toast.success("Password changed"); }} />
          </CardContent>
        </Card>
      )}
    </main>
  );
}
