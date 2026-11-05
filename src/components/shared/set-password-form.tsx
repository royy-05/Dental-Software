"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const PASSWORD_HELP = "At least 12 characters, with 3 of: lower-case, upper-case, number, symbol.";

/** New password + confirmation. Server enforces the same rules (src/server/auth/password.ts). */
export function SetPasswordForm({ onSubmit, cta, withName, defaultName }: { onSubmit: (v: { password: string; name?: string }) => Promise<void>; cta: string; withName?: boolean; defaultName?: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState(defaultName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ password, name: withName ? name : undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-4">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {withName && (
        <div className="grid gap-1.5">
          <Label htmlFor="sp-name">Your name</Label>
          <Input id="sp-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="sp-pw">New password</Label>
        <Input id="sp-pw" type="password" autoComplete="new-password" aria-describedby="sp-help" value={password} onChange={(e) => setPassword(e.target.value)} />
        <p id="sp-help" className="text-xs text-muted-foreground">{PASSWORD_HELP}</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sp-confirm">Confirm password</Label>
        <Input id="sp-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <Button type="submit" disabled={busy || !password}>{busy ? "Saving…" : cta}</Button>
    </form>
  );
}
