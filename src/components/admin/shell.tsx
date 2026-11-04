"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  Blocks,
  Building2,
  CreditCard,
  Flag,
  LayoutDashboard,
  Library,
  LifeBuoy,
  LogOut,
  Menu,
  MessageSquare,
  Network,
  ScrollText,
  Settings2,
  UserCog,
  Users,
} from "lucide-react";
import { ROLE_LABELS } from "@/types";
import { can, isPlatformRole, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useApp, useCurrentUser } from "@/store/app";
import { useHydrated } from "@/components/shared/hydration";
import { LoadingState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

export const ADMIN_NAV: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; perm: Permission }[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, perm: "admin:access" },
  { href: "/admin/clinics", label: "Clinics", icon: Building2, perm: "admin:clinics:view" },
  { href: "/admin/groups", label: "Clinic groups", icon: Network, perm: "admin:clinics:view" },
  { href: "/admin/billing", label: "Plans & billing", icon: CreditCard, perm: "admin:billing" },
  { href: "/admin/features", label: "Feature flags", icon: Flag, perm: "admin:clinics:view" },
  { href: "/admin/users", label: "Users", icon: Users, perm: "admin:users:view" },
  { href: "/admin/libraries", label: "Global libraries", icon: Library, perm: "admin:access" },
  { href: "/admin/messaging", label: "Messaging", icon: MessageSquare, perm: "admin:messaging:view" },
  { href: "/admin/integrations", label: "Integrations", icon: Blocks, perm: "admin:access" },
  { href: "/admin/support", label: "Support desk", icon: LifeBuoy, perm: "admin:support" },
  { href: "/admin/analytics", label: "Platform analytics", icon: BarChart3, perm: "admin:analytics" },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText, perm: "admin:audit" },
  { href: "/admin/system", label: "System & white-label", icon: Settings2, perm: "admin:access" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const user = useCurrentUser();
  const imp = useApp((s) => s.session.impersonation);
  const stopImp = useApp((s) => s.stopImpersonation);
  const logout = useApp((s) => s.logout);
  const openTickets = useApp((s) => s.db.tickets.filter((t) => t.status === "open").length);
  const maintenance = useApp((s) => s.db.platform.maintenanceMode);
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const allowed = user && isPlatformRole(user.role);
  useEffect(() => {
    if (!hydrated) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [hydrated, user, router, pathname]);
  // Coming back to admin ends any impersonation session.
  useEffect(() => {
    if (hydrated && imp) stopImp();
  }, [hydrated, imp, stopImp]);

  if (!hydrated || !user) return <LoadingState label="Loading super admin panel…" className="mx-auto max-w-3xl pt-20" />;
  if (!allowed)
    return (
      <main id="main" className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-lg font-semibold">Super admin panel is for the platform team</h1>
        <p className="mt-2 text-sm text-muted-foreground">You&apos;re signed in as {ROLE_LABELS[user.role]}. Switch to Super Admin or Support Agent to continue.</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button asChild><Link href="/login">Switch role</Link></Button>
          <Button asChild variant="outline"><Link href="/clinic">Go to clinic panel</Link></Button>
        </div>
      </main>
    );

  const nav = (
    <div className="flex h-full flex-col gap-4">
      <Link href="/admin" className="flex items-center gap-2 px-3 pt-1 font-bold text-white">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-teal-500 text-sm text-slate-950">K</span>
        Kivi Admin
      </Link>
      <nav aria-label="Super admin sections" className="flex flex-col gap-0.5">
        {ADMIN_NAV.filter((n) => can(user.role, n.perm)).map((n) => {
          const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setMobileOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white", active && "bg-white/15 font-medium text-white")}
            >
              <n.icon className="h-4 w-4" aria-hidden />
              <span className="flex-1">{n.label}</span>
              {n.href === "/admin/support" && openTickets > 0 && <Badge variant="danger">{openTickets}</Badge>}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-2 px-3 pb-2 text-xs text-slate-400">
        <p className="flex items-center gap-1"><Activity className="h-3 w-3" aria-hidden /> Prototype · demo data</p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 bg-slate-900 p-3 lg:block">{nav}</aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 bg-slate-900 p-3">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          {nav}
        </SheetContent>
      </Sheet>
      <div className="min-w-0 flex-1">
        {maintenance && <div className="bg-amber-100 px-4 py-1.5 text-center text-sm text-amber-950">Maintenance mode is ON. Booking widgets show a maintenance notice.</div>}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur sm:px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <Badge variant={user.role === "super_admin" ? "default" : "info"}>{ROLE_LABELS[user.role]}</Badge>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm sm:inline">{user.name}</span>
            <Button variant="ghost" size="sm" asChild><Link href="/login"><UserCog /> Switch role</Link></Button>
            <Button variant="ghost" size="sm" onClick={() => { logout(); router.push("/login"); }}><LogOut /> <span className="hidden sm:inline">Log out</span></Button>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

/** Use inside admin pages: renders a read-only notice when the role lacks an edit permission. */
export function ReadOnlyNotice({ perm }: { perm: Permission }) {
  const user = useCurrentUser();
  if (can(user?.role, perm)) return null;
  return <p className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">Read-only for Support Agents.</p>;
}
