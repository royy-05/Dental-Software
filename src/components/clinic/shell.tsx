"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardList,
  Clock,
  EyeOff,
  FileText,
  Home,
  LifeBuoy,
  LogOut,
  Menu,
  Settings,
  ShieldAlert,
  Stethoscope,
  TrendingUp,
  UserCog,
  Wallet,
  X,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { signOut } from "next-auth/react";
import type { AppNotification, Announcement, FeatureKey } from "@/types";
import { ROLE_LABELS } from "@/types";
import { can, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { qk, useAccessibleClinics, useApiMutation, useClinicBundle, useClinicId, useCurrentClinic, useCurrentUser, useEffectiveRole, useMe } from "@/lib/api/session";
import { useUi } from "@/store/ui";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { RaiseTicketDialog } from "./raise-ticket";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  perm: Permission;
  feature?: FeatureKey;
}

/** The 11 clinic panel modules (section 5). */
export const CLINIC_NAV: NavItem[] = [
  { href: "/clinic", label: "Home", icon: Home, perm: "clinic:home" },
  { href: "/clinic/appointments", label: "Appointments", icon: CalendarDays, perm: "appointments:view" },
  { href: "/clinic/reasons", label: "Reasons for visit", icon: ClipboardList, perm: "reasons:manage" },
  { href: "/clinic/providers", label: "Providers", icon: Stethoscope, perm: "providers:manage" },
  { href: "/clinic/schedule", label: "Schedule & operatories", icon: Clock, perm: "schedule:manage" },
  { href: "/clinic/insurances", label: "Insurances", icon: Wallet, perm: "insurances:manage" },
  { href: "/clinic/templates", label: "Templates", icon: FileText, perm: "templates:manage" },
  { href: "/clinic/form-analytics", label: "Form Analytics", icon: BarChart3, perm: "reports:view" },
  { href: "/clinic/performance", label: "Performance", icon: TrendingUp, perm: "reports:view", feature: "performance" },
  { href: "/clinic/settings", label: "Settings", icon: Settings, perm: "settings:manage" },
  { href: "/clinic/support", label: "Support", icon: LifeBuoy, perm: "support:raise" },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const role = useEffectiveRole();
  const features = useClinicBundle().data?.features;
  const items = CLINIC_NAV.filter((i) => can(role, i.perm) && (!i.feature || !!features?.[i.feature]));
  return (
    <nav aria-label="Clinic modules" className="flex flex-col gap-0.5">
      {items.map((i) => {
        const active = i.href === "/clinic" ? pathname === "/clinic" : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-accent hover:text-accent-foreground",
              active && "bg-secondary text-secondary-foreground",
            )}
          >
            <i.icon className="h-4 w-4" aria-hidden />
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

function NotificationsBell() {
  const clinicId = useClinicId();
  const { data } = useQuery({
    queryKey: qk.clinicRes(clinicId, "notifications"),
    queryFn: () => api<AppNotification[]>(`/api/clinics/${clinicId}/notifications`, { background: true }),
    enabled: !!clinicId,
    refetchInterval: 60_000,
  });
  const markRead = useApiMutation((body: { ids?: string[]; all?: boolean }) => api(`/api/clinics/${clinicId}/notifications`, { body }), {
    invalidate: [qk.clinicRes(clinicId, "notifications")],
    errorToast: false,
  });
  const items = (data ?? []).slice(0, 15);
  const unread = items.filter((n) => !n.read).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications, ${unread} unread`} className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          <Button
            variant="link"
            size="xs"
            onClick={() => markRead.mutate({ all: true })}
          >
            Mark all read
          </Button>
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {items.length === 0 && <li className="p-4 text-sm text-muted-foreground">You&apos;re all caught up.</li>}
          {items.map((n) => (
            <li key={n.id} className={cn("border-b last:border-0", !n.read && "bg-secondary/50")}>
              <Link
                href={n.href ?? "/clinic"}
                className="block px-4 py-2.5 hover:bg-muted"
                onClick={() => !n.read && markRead.mutate({ ids: [n.id] })}
              >
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.body}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(n.at), { addSuffix: true })}</p>
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function UserMenu() {
  const user = useCurrentUser();
  const me = useMe().data;
  const role = useEffectiveRole();
  const router = useRouter();
  const qc = useQueryClient();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2" aria-label="User menu">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {user.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}
          </span>
          <span className="hidden text-left text-xs leading-tight lg:block">
            <span className="block font-medium">{user.name}</span>
            <span className="block text-muted-foreground">{role ? ROLE_LABELS[role] : ""}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {can(role, "users:manage") && (
          <DropdownMenuItem onSelect={() => router.push("/clinic/settings?section=users")}>
            <UserCog className="h-4 w-4" /> Staff users
          </DropdownMenuItem>
        )}
        {me?.platformRole && !me.impersonation && (
          <DropdownMenuItem onSelect={() => router.push("/admin")}>
            <ShieldAlert className="h-4 w-4" /> Super admin panel
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => router.push("/account/security")}>
          <UserCog className="h-4 w-4" /> Account security
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={async () => {
            qc.clear();
            await signOut({ redirectTo: "/login" });
          }}
        >
          <LogOut className="h-4 w-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Banners() {
  const imp = useMe().data?.impersonation;
  const clinic = useCurrentClinic();
  const clinicId = useClinicId();
  const { data: announcements } = useQuery({
    queryKey: qk.clinicRes(clinicId, "announcements"),
    queryFn: () => api<Announcement[]>(`/api/clinics/${clinicId}/announcements`, { background: true }),
    enabled: !!clinicId,
    staleTime: 5 * 60_000,
  });
  const [dismissed, setDismissed] = useState<string[]>([]);
  const router = useRouter();
  const qc = useQueryClient();
  const stop = async () => {
    await api("/api/admin/impersonation", { method: "DELETE" });
    qc.clear();
    router.push("/admin/clinics");
  };
  const visible = (announcements ?? []).filter((a) => !dismissed.includes(a.id));
  return (
    <>
      {imp && (
        <div role="status" className="flex flex-wrap items-center justify-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-950">
          <ShieldAlert className="h-4 w-4" aria-hidden />
          <span>
            You are viewing <strong>{clinic?.name}</strong> as support. Reason logged: “{imp.reason}”
          </span>
          <Button
            size="xs"
            variant="outline"
            onClick={stop}
          >
            Exit impersonation
          </Button>
        </div>
      )}
      {visible.map((a) => (
        <div key={a.id} role="status" className={cn("flex items-center justify-center gap-3 px-4 py-2 text-sm", a.tone === "warning" ? "bg-amber-50 text-amber-950" : "bg-sky-50 text-sky-950")}>
          <span>{a.message}</span>
          <button className="rounded p-0.5 hover:bg-black/5" aria-label="Dismiss announcement" onClick={() => setDismissed((d) => [...d, a.id])}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {clinic?.status === "trial" && clinic.trialEndsAt && (
        <div className="bg-violet-50 px-4 py-1.5 text-center text-xs text-violet-950">
          Trial ends {formatDistanceToNow(new Date(clinic.trialEndsAt), { addSuffix: true })}.
        </div>
      )}
    </>
  );
}

export function ClinicShell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const imp = me.data?.impersonation;
  const clinics = useAccessibleClinics();
  const clinicId = useClinicId();
  const setClinic = useUi((s) => s.setClinicId);
  const hidePhi = useUi((s) => s.hidePhi);
  const setHidePhi = useUi((s) => s.setHidePhi);
  const qc = useQueryClient();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Support agents only reach clinics through impersonation; platform users without clinics go to the admin panel.
  const noClinicAccess = me.data && clinics.length === 0;

  useEffect(() => {
    if (noClinicAccess && me.data?.platformRole) router.replace("/admin/clinics");
  }, [noClinicAccess, me.data?.platformRole, router]);

  if (me.isError) return <ErrorState className="mx-auto max-w-3xl pt-20" onRetry={() => me.refetch()} />;
  if (!me.data || noClinicAccess) {
    if (me.data && !me.data.platformRole) return <ErrorState className="mx-auto max-w-3xl pt-20" title="No clinic access" message="Your account is not linked to a clinic yet. Ask your clinic owner to invite you." />;
    return <LoadingState label="Loading clinic panel…" className="mx-auto max-w-3xl pt-20" />;
  }

  const sidebar = (
    <div className="flex h-full flex-col gap-4">
      <Link href="/clinic" className="flex items-center gap-2 px-3 pt-1 font-bold text-primary">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm text-primary-foreground">K</span>
        Kivi Health
      </Link>
      <NavList onNavigate={() => setMobileOpen(false)} />
      <p className="mt-auto px-3 text-[11px] text-muted-foreground">Kivi Health</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Banners />
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r bg-card p-3 lg:block">{sidebar}</aside>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-72 p-3">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            {sidebar}
          </SheetContent>
        </Sheet>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur sm:px-4">
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <div className="w-40 sm:w-60">
              <Select value={clinicId} onValueChange={(v) => { setClinic(v); qc.removeQueries({ queryKey: ["clinic"] }); }} disabled={!!imp || clinics.length < 2}>
                <SelectTrigger aria-label="Select clinic" className="h-9">
                  <SelectValue placeholder="Select clinic" />
                </SelectTrigger>
                <SelectContent>
                  {clinics.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto flex items-center gap-1 sm:gap-3">
              <div className="flex items-center gap-2">
                <Switch id="hide-phi" checked={hidePhi} onCheckedChange={setHidePhi} />
                <Label htmlFor="hide-phi" className="flex cursor-pointer items-center gap-1 text-xs">
                  <EyeOff className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">Hide PHI</span>
                  <span className="sr-only sm:hidden">Hide PHI</span>
                </Label>
              </div>
              <RaiseTicketDialog />
              <NotificationsBell />
              <UserMenu />
            </div>
          </header>
          <main id="main" className="mx-auto w-full max-w-7xl p-4 sm:p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
