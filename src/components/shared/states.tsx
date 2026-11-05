"use client";

import { AlertTriangle, Inbox, Loader2, RefreshCw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LoadingState({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col gap-3 p-6", className)}>
      <span className="sr-only">{label}</span>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-9 animate-pulse rounded-md bg-muted" style={{ opacity: 1 - i * 0.18 }} />
      ))}
    </div>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  description,
  action,
  icon: Icon = Inbox,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-12 text-center", className)}>
      <div className="rounded-full bg-muted p-3">
        <Icon className="h-6 w-6 text-muted-foreground" aria-hidden />
      </div>
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Couldn't load data", message = "Something went wrong loading this data.", onRetry, className }: { title?: string; message?: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center gap-2 px-6 py-12 text-center", className)}>
      <div className="rounded-full bg-red-100 p-3">
        <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
      </div>
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      )}
    </div>
  );
}

export type DemoState = "ready" | "loading" | "empty" | "error";

/**
 * Lets reviewers force list states with ?demo=loading|empty|error on any list screen.
 * Real loading state is shown while the store rehydrates.
 */
export function useDemoState(): DemoState {
  const params = useSearchParams();
  const v = params.get("demo");
  return v === "loading" || v === "empty" || v === "error" ? v : "ready";
}

/** Renders loading / error / empty / children for list screens. */
export function ListState<T>({
  items,
  loading,
  emptyTitle,
  emptyDescription,
  emptyAction,
  children,
}: {
  items: T[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  children: (items: T[]) => React.ReactNode;
}) {
  const demo = useDemoState();
  if (loading || demo === "loading") return <LoadingState />;
  if (demo === "error") return <ErrorState onRetry={() => window.location.assign(window.location.pathname)} />;
  const list = demo === "empty" ? [] : items;
  if (!list.length) return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  return <>{children(list)}</>;
}
