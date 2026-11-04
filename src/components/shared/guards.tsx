"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import type { FeatureKey } from "@/types";
import { can, featureEnabled, type Permission } from "@/lib/permissions";
import { useApp, useCurrentClinic, useEffectiveRole } from "@/store/app";
import { Button } from "@/components/ui/button";

export function useCan() {
  const role = useEffectiveRole();
  return (p: Permission) => can(role, p);
}

export function useFeature(key: FeatureKey): boolean {
  const clinic = useCurrentClinic();
  const plans = useApp((s) => s.db.plans);
  return featureEnabled(clinic, plans, key);
}

export function NoAccess({ title = "You don't have access to this page", body }: { title?: string; body?: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <div className="rounded-full bg-muted p-3">
        <Lock className="h-6 w-6 text-muted-foreground" aria-hidden />
      </div>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{body ?? "Your role doesn't include this module. Ask your clinic owner or switch role on the login page."}</p>
      <Button asChild variant="outline">
        <Link href="/login">Switch role</Link>
      </Button>
    </div>
  );
}

/** Page-level guard: renders children only when the current role has the permission (and the feature is on). */
export function RequirePermission({ perm, feature, children }: { perm: Permission; feature?: FeatureKey; children: React.ReactNode }) {
  const allowed = useCan()(perm);
  const featureOn = useFeature(feature ?? "file_uploads");
  if (!allowed) return <NoAccess />;
  if (feature && !featureOn)
    return <NoAccess title="This module is not enabled" body="Your plan doesn't include this module. The platform team can turn it on in Feature flags." />;
  return <>{children}</>;
}
