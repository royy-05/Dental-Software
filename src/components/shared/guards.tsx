"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import type { FeatureKey } from "@/types";
import type { Permission } from "@/lib/permissions";
import { useCan, useClinicBundle, useFeature, useMe } from "@/lib/api/session";
import { LoadingState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";

export { useCan, useFeature };

export function NoAccess({ title = "You don't have access to this page", body }: { title?: string; body?: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <div className="rounded-full bg-muted p-3">
        <Lock className="h-6 w-6 text-muted-foreground" aria-hidden />
      </div>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{body ?? "Your role doesn't include this module. Ask your clinic owner for access."}</p>
      <Button asChild variant="outline">
        <Link href="/clinic">Back to Home</Link>
      </Button>
    </div>
  );
}

/** Page-level guard: renders children only when the current role has the permission (and the feature is on). The API enforces the same rules. */
export function RequirePermission({ perm, feature, children }: { perm: Permission; feature?: FeatureKey; children: React.ReactNode }) {
  const me = useMe();
  const allowed = useCan()(perm);
  const featureOn = useFeature(feature ?? "file_uploads");
  const bundle = useClinicBundle();
  if (me.isLoading || (feature && bundle.isLoading)) return <LoadingState />;
  if (!allowed) return <NoAccess />;
  if (feature && !featureOn)
    return <NoAccess title="This module is not enabled" body="Your plan doesn't include this module. The platform team can turn it on in Feature flags." />;
  return <>{children}</>;
}
