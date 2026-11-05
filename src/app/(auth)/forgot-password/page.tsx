"use client";

import Link from "next/link";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/auth/password/forgot", { body: { email } });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-12">
      <Link href="/login" className="text-sm font-bold text-primary">Kivi Health</Link>
      <h1 className="mt-3 text-2xl font-bold">Reset your password</h1>
      <Card className="mt-6">
        <CardContent className="pt-5">
          {sent ? (
            <p role="status" className="text-sm">If an account exists for <strong>{email}</strong>, we sent a link to reset the password. It works once, for 1 hour.</p>
          ) : (
            <form onSubmit={submit} className="grid gap-4">
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <div className="grid gap-1.5">
                <Label htmlFor="fp-email">Email</Label>
                <Input id="fp-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <Button type="submit" disabled={!email}>Send reset link</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
