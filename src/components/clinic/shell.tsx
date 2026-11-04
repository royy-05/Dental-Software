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
import type { FeatureKey } from "@/types";
import { ROLE_LABELS } from "@/types";
import { can, featureEnabled, isPlatformRole, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useAccessibleClinics, useApp, useCurrentClinic, useCurrentUser, useEffectiveRole } from "@/store/app";
import { useHydrated } from "@/components/shared/hydration";
import { LoadingState } from "@/components/shared/states";
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
  const clinic = useCurrentClinic();
  const plans = useApp((s) => s.db.plans);
  const items = CLINIC_NAV.filter((i) => can(role, i.perm) && (!i.feature || featureEnabled(clinic, plans, i.feature)));
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
  const clinicId = useApp((s) => s.session.clinicId);
  const all = useApp((s) => s.db.notifications);
  const mutate = useApp((s) => s.mutate);
  const items = all.filter((n) => n.clinicId === clinicId).slice(0, 15);
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
            onClick={() => mutate((db) => db.notifications.forEach((n) => n.clinicId === clinicId && (n.read = true)))}
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
                onClick={() => mutate((db) => void (db.notifications.find((x) => x.id === n.id)!.read = true))}
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
  const role = useEffectiveRole();
  const logout = useApp((s) => s.logout);
  const router = useRouter();
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
        {isPlatformRole(user.role) && (
          <DropdownMenuItem onSelect={() => router.push("/admin")}>
            <ShieldAlert className="h-4 w-4" /> Super admin panel
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => router.push("/login")}>
          <UserCog className="h-4 w-4" /> Switch role
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            logout();
            router.push("/login");
          }}
        >
          <LogOut className="h-4 w-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Banners() {
  const imp = useApp((s) => s.session.impersonation);
  const stop = useApp((s) => s.stopImpersonation);
  const clinic = useCurrentClinic();
  const announcements = useApp((s) => s.db.announcements);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const router = useRouter();
  const visible = announcements.filter(
    (a) => a.active && !dismissed.includes(a.id) && clinic && (a.clinicIds === "all" || a.clinicIds.includes(clinic.id)),
  );
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
            onClick={() => {
              stop();
              router.push("/admin/clinics");
            }}
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
  const hydrated = useHydrated();
  const user = useCurrentUser();
  const imp = useApp((s) => s.session.impersonation);
  const clinics = useAccessibleClinics();
  const clinicId = useApp((s) => s.session.clinicId);
  const setClinic = useApp((s) => s.setClinic);
  const hidePhi = useApp((s) => s.session.hidePhi);
  const setHidePhi = useApp((s) => s.setHidePhi);
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const platformWithoutImp = user && isPlatformRole(user.role) && !imp;

  useEffect(() => {
    if (!hydrated) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (platformWithoutImp) router.replace("/admin/clinics");
  }, [hydrated, user, platformWithoutImp, router, pathname]);

  useEffect(() => {
    if (hydrated && clinics.length && !clinics.some((c) => c.id === clinicId)) setClinic(clinics[0].id);
  }, [hydrated, clinics, clinicId, setClinic]);

  if (!hydrated || !user || platformWithoutImp) return <LoadingState label="Loading clinic panel…" className="mx-auto max-w-3xl pt-20" />;

  const sidebar = (
    <div className="flex h-full flex-col gap-4">
      <Link href="/clinic" className="flex items-center gap-2 px-3 pt-1 font-bold text-primary">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm text-primary-foreground">K</span>
        Kivi Health
      </Link>
      <NavList onNavigate={() => setMobileOpen(false)} />
      <p className="mt-auto px-3 text-[11px] text-muted-foreground">Prototype · demo data only</p>
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
              <Select value={clinicId} onValueChange={setClinic} disabled={!!imp || clinics.length < 2}>
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
