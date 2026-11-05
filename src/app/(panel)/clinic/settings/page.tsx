"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FeatureKey } from "@/types";
import type { Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useCurrentClinic } from "@/lib/api/session";
import { RequirePermission, useCan, useFeature } from "@/components/shared/guards";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingState } from "@/components/shared/states";
import { AppearanceSettings } from "@/components/settings/appearance";
import { WidgetSettings } from "@/components/settings/widgets";
import { BookingSchedulingSettings, ConfirmationSettings, LegalSettings } from "@/components/settings/policies";
import { NotificationSettings } from "@/components/settings/notifications";
import { ReferrerSettings } from "@/components/settings/referrers";
import { DomainSettings, PaymentSettings, RwgSettings } from "@/components/settings/integrations";
import { BillingView, UsersSettings } from "@/components/settings/users-billing";

type SectionKey = "appearance" | "widgets" | "confirmation" | "legal" | "booking" | "notifications" | "referrers" | "rwg" | "payment" | "domain" | "users" | "billing";

const SECTIONS: { key: SectionKey; label: string; perm?: Permission; feature?: FeatureKey }[] = [
  { key: "appearance", label: "Appearance" },
  { key: "widgets", label: "Widgets" },
  { key: "confirmation", label: "Confirmation" },
  { key: "legal", label: "Legal & compliance" },
  { key: "booking", label: "Booking flow & scheduling" },
  { key: "notifications", label: "Notifications" },
  { key: "referrers", label: "Referrers" },
  { key: "rwg", label: "Reserve with Google", feature: "rwg" },
  { key: "payment", label: "Payment", feature: "payments" },
  { key: "domain", label: "Custom domain", feature: "custom_domain" },
  { key: "users", label: "Users", perm: "users:manage" },
  { key: "billing", label: "Billing", perm: "billing:view" },
];

function SettingsInner() {
  const clinic = useCurrentClinic();
  const can = useCan();
  const flags: Record<FeatureKey, boolean> = {
    rwg: useFeature("rwg"),
    payments: useFeature("payments"),
    custom_domain: useFeature("custom_domain"),
    performance: true,
    otp: true,
    file_uploads: true,
  };
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const visible = SECTIONS.filter((s) => (!s.perm || can(s.perm)) && (!s.feature || flags[s.feature]));
  const requested = params.get("section") as SectionKey | null;
  const active = visible.find((s) => s.key === requested)?.key ?? "appearance";

  if (!clinic) return <LoadingState />;

  const go = (key: SectionKey) => router.replace(`${pathname}?section=${key}`, { scroll: false });
  const k = `${clinic.id}-${active}`;

  return (
    <>
      <PageHeader title="Settings" description={`Settings for ${clinic.name}. Changes save to this clinic only and are written to the audit log.`} />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-20 lg:self-start">
          <label htmlFor="settings-section" className="sr-only">
            Settings section
          </label>
          <select id="settings-section" className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm lg:hidden" value={active} onChange={(e) => go(e.target.value as SectionKey)}>
            {visible.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <ul className="hidden flex-col gap-0.5 lg:flex">
            {visible.map((s) => (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => go(s.key)}
                  aria-current={active === s.key ? "page" : undefined}
                  className={cn("w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent", active === s.key && "bg-secondary font-medium text-secondary-foreground")}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <section aria-label={SECTIONS.find((s) => s.key === active)?.label} className="min-w-0">
          {active === "appearance" && <AppearanceSettings key={k} clinic={clinic} />}
          {active === "widgets" && <WidgetSettings key={k} clinic={clinic} />}
          {active === "confirmation" && <ConfirmationSettings key={k} clinic={clinic} />}
          {active === "legal" && <LegalSettings key={k} clinic={clinic} />}
          {active === "booking" && <BookingSchedulingSettings key={k} clinic={clinic} />}
          {active === "notifications" && <NotificationSettings key={k} clinic={clinic} />}
          {active === "referrers" && <ReferrerSettings key={k} clinic={clinic} />}
          {active === "rwg" && <RwgSettings key={k} clinic={clinic} />}
          {active === "payment" && <PaymentSettings key={k} clinic={clinic} />}
          {active === "domain" && <DomainSettings key={k} clinic={clinic} />}
          {active === "users" && <UsersSettings key={k} clinic={clinic} />}
          {active === "billing" && <BillingView key={k} clinic={clinic} />}
        </section>
      </div>
    </>
  );
}

export default function SettingsPage() {
  return (
    <RequirePermission perm="settings:manage">
      <SettingsInner />
    </RequirePermission>
  );
}
