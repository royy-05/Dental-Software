"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SetPasswordForm } from "@/components/shared/set-password-form";

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const [done, setDone] = useState(false);
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-12">
      <Link href="/login" className="text-sm font-bold text-primary">Kivi Health</Link>
      <h1 className="mt-3 text-2xl font-bold">Choose a new password</h1>
      <Card className="mt-6">
        <CardContent className="pt-5">
          {done ? (
            <div className="grid gap-3" role="status">
              <p className="text-sm">Your password was changed and you were signed out everywhere.</p>
              <Button asChild><Link href="/login">Sign in</Link></Button>
            </div>
          ) : (
            <SetPasswordForm cta="Save password" onSubmit={async ({ password }) => { await api("/api/auth/password/reset", { body: { token, password } }); setDone(true); }} />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
