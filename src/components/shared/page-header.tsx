import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, className }: { title: string; description?: string; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, trend }: { label: string; value: React.ReactNode; hint?: string; trend?: number }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {(hint || trend !== undefined) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {trend !== undefined && (
            <span className={cn("mr-1 font-semibold", trend > 0 ? "text-green-800" : trend < 0 ? "text-red-800" : "")}>
              {trend > 0 ? "▲" : trend < 0 ? "▼" : "•"} {Math.abs(trend)}%
            </span>
          )}
          {hint}
        </p>
      )}
    </div>
  );
}
