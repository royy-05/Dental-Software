"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { SetPasswordForm } from "@/components/shared/set-password-form";

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const [done, setDone] = useState(false);
  const invite = useQuery({ queryKey: ["invite", token], queryFn: () => api<{ email: string; name: string }>(`/api/auth/invite/${token}`), retry: false });
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-12">
      <Link href="/login" className="text-sm font-bold text-primary">Kivi Health</Link>
      <h1 className="mt-3 text-2xl font-bold">Accept your invite</h1>
      <Card className="mt-6">
        <CardContent className="pt-5">
          {invite.isLoading && <LoadingState />}
          {invite.isError && <ErrorState title="Invite not valid" message="This invite link is invalid, already used or expired. Ask for a new invite." />}
          {invite.data && !done && (
            <>
              <p className="mb-4 text-sm text-muted-foreground">Set a password for <strong>{invite.data.email}</strong>.</p>
              <SetPasswordForm withName defaultName={invite.data.name} cta="Create account" onSubmit={async (v) => { await api(`/api/auth/invite/${token}`, { body: v }); setDone(true); }} />
            </>
          )}
          {done && (
            <div className="grid gap-3" role="status">
              <p className="text-sm">Your account is ready.</p>
              <Button asChild><Link href="/login">Sign in</Link></Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
