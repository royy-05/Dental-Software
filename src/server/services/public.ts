import type { Clinic, ClinicInsurance, FlowConfig, Provider, Reason, Referrer } from "@/types";
import { bookableReasons } from "@/lib/flow";
import { clinicIdForSlug, withTenant, type Tx } from "../db";
import { notFound } from "../errors";
import { providerInclude, reasonInclude, toClinicInsurance, toProvider, toReason, toReferrer } from "../mappers";
import { loadClinicBundle } from "./clinic";
import { publishedFlow } from "./booking";
import { platformSettings } from "./notify";

/**
 * What the booking widget and patient pages may see (section 3). No staff data, no notification addresses,
 * no usage counters; just what the public page renders.
 */
export function publicClinic(c: Clinic): Clinic {
  return {
    ...c,
    ownerUserId: "",
    groupId: undefined,
    settings: {
      ...c.settings,
      notifications: { ...c.settings.notifications, extraAlertEmails: [], alternateSmsNumber: undefined, clinicAlertEmail: "" },
      reports: { monthlyEmail: false, recipients: [] },
      scheduling: { ...c.settings.scheduling, blockoutsToSkip: [] },
    },
    blockouts: [],
    holidays: [],
    pms: { name: "", connected: false },
    smsCreditsUsed: 0,
    emailsSent: 0,
    smsRegistration: "not_started",
    customDomain: undefined,
    retentionDays: undefined,
    lastLoginAt: undefined,
  };
}

export function publicProvider(p: Provider): Provider {
  return { ...p, externalId: "", breaks: [], timeOff: [], weeklyHours: p.weeklyHours };
}

export interface PublicBundle {
  clinic: Clinic;
  flow: FlowConfig;
  reasons: Reason[];
  providers: Provider[];
  insurances: ClinicInsurance[];
  referrers: Referrer[];
  features: { otp: boolean; file_uploads: boolean };
  platform: { maintenanceMode: boolean; poweredByText: string };
}

export async function resolveClinicSlug(slug: string): Promise<string> {
  const id = await clinicIdForSlug(slug);
  if (!id) throw notFound("Booking page");
  return id;
}

export async function publicBundle(tx: Tx, clinicId: string): Promise<PublicBundle> {
  const [{ clinic, features }, flow, reasonRows, providerRows, insuranceRows, referrerRows, platform] = await Promise.all([
    loadClinicBundle(tx, clinicId),
    publishedFlow(tx, clinicId),
    tx.reason.findMany({ include: reasonInclude, orderBy: { order: "asc" } }),
    tx.provider.findMany({ include: providerInclude, orderBy: { order: "asc" } }),
    tx.clinicInsurance.findMany({ orderBy: { name: "asc" } }),
    tx.referrer.findMany({ orderBy: { publicId: "asc" } }),
    platformSettings(tx),
  ]);
  if (!flow) throw notFound("Booking page");
  const providers = providerRows.map(toProvider).filter((p) => p.active);
  const reasons = bookableReasons(reasonRows.map(toReason), providers);
  return {
    clinic: publicClinic(clinic),
    flow,
    reasons,
    providers: providers.filter((p) => p.showOnline).map(publicProvider),
    insurances: insuranceRows.map(toClinicInsurance),
    referrers: referrerRows.map(toReferrer),
    features: { otp: features.otp, file_uploads: features.file_uploads },
    platform: { maintenanceMode: platform?.maintenanceMode ?? false, poweredByText: platform?.branding.poweredByText ?? "Powered by Kivi Health" },
  };
}

export async function publicBundleForSlug(slug: string): Promise<PublicBundle & { clinicId: string }> {
  const clinicId = await resolveClinicSlug(slug);
  const b = await withTenant(clinicId, (tx) => publicBundle(tx, clinicId));
  return { ...b, clinicId };
}
