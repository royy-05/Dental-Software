import type { Clinic, ClinicGroup } from "@/types";
import { defaultClinicSettings, defaultInsuranceSettings, weeklyHours } from "./defaults";

export const CLINIC_IDS = {
  dental: "c_brightsmile",
  physio: "c_motion",
  derm: "c_clearskin",
  riverside: "c_riverside",
  northside: "c_northside",
} as const;

function base(partial: Omit<Clinic, "settings" | "insuranceSettings" | "holidays" | "blockouts" | "featureOverrides" | "smsCreditsUsed" | "emailsSent">): Clinic {
  return {
    ...partial,
    settings: defaultClinicSettings(partial.email),
    insuranceSettings: defaultInsuranceSettings(),
    holidays: [],
    blockouts: [],
    featureOverrides: {},
    smsCreditsUsed: 0,
    emailsSent: 0,
  };
}

/** Clinics are created relative to "today" so the demo always looks current. */
export function buildClinics(today: Date): Clinic[] {
  const iso = (daysAgo: number) => new Date(today.getTime() - daysAgo * 86400000).toISOString();
  const y = today.getFullYear();
  const clinics: Clinic[] = [
    base({
      id: CLINIC_IDS.dental,
      name: "Bright Smile Dental",
      slug: "bright-smile-dental",
      specialty: "dental",
      status: "active",
      planId: "plan_pro",
      groupId: "g_brightsmile",
      ownerUserId: "u_owner",
      timeZone: "America/New_York",
      phone: "(555) 010-2000",
      email: "frontdesk@brightsmile.example.com",
      address: "120 Harbor Street, Suite 4, Portland, ME 04101",
      description: "Family and cosmetic dentistry with evening hours.",
      branding: { headerColor: "#0f766e", primaryColor: "#0f766e", secondaryColor: "#e6f4f2", theme: "full_page" },
      hours: { ...weeklyHours("08:00", "18:00", [1, 2, 3, 4, 5]), 6: { enabled: true, start: "09:00", end: "13:00" } },
      smsRegistration: "approved",
      rwg: { enabled: true, websiteUrl: "https://brightsmile.example.com", feedStatus: "healthy" },
      pms: { name: "OpenDental", connected: false },
      createdAt: iso(400),
      lastLoginAt: iso(0),
    }),
    base({
      id: CLINIC_IDS.physio,
      name: "Motion Physio & Rehab",
      slug: "motion-physio",
      specialty: "physio",
      status: "active",
      planId: "plan_growth",
      ownerUserId: "u_owner",
      timeZone: "America/Chicago",
      phone: "(555) 010-3000",
      email: "hello@motionphysio.example.com",
      address: "88 Lakeview Avenue, Chicago, IL 60601",
      description: "Sports injury, post-surgery rehab and manual therapy.",
      branding: { headerColor: "#1d4ed8", primaryColor: "#1d4ed8", secondaryColor: "#e0e7ff", theme: "compact" },
      hours: weeklyHours("07:00", "19:00", [1, 2, 3, 4, 5]),
      smsRegistration: "approved",
      rwg: { enabled: false, websiteUrl: "https://motionphysio.example.com", feedStatus: "off" },
      pms: { name: "None", connected: false },
      createdAt: iso(220),
      lastLoginAt: iso(1),
    }),
    base({
      id: CLINIC_IDS.derm,
      name: "Clear Skin Dermatology",
      slug: "clearskin-derm",
      specialty: "dermatology",
      status: "trial",
      planId: "plan_starter",
      ownerUserId: "u_owner",
      timeZone: "America/Los_Angeles",
      phone: "(555) 010-4000",
      email: "care@clearskin.example.com",
      address: "450 Sunset Blvd, Floor 2, Los Angeles, CA 90028",
      description: "Medical and cosmetic dermatology.",
      branding: { headerColor: "#7c3aed", primaryColor: "#6d28d9", secondaryColor: "#f3e8ff", theme: "reason_first" },
      hours: weeklyHours("09:00", "17:00", [1, 2, 3, 4, 5]),
      smsRegistration: "pending",
      rwg: { enabled: false, websiteUrl: "https://clearskin.example.com", feedStatus: "off" },
      pms: { name: "None", connected: false },
      createdAt: iso(60),
      lastLoginAt: iso(2),
      trialEndsAt: new Date(today.getTime() + 9 * 86400000).toISOString(),
    }),
    base({
      id: CLINIC_IDS.riverside,
      name: "Riverside Family Dental",
      slug: "riverside-family-dental",
      specialty: "dental",
      status: "paused",
      planId: "plan_growth",
      groupId: "g_brightsmile",
      ownerUserId: "u_owner",
      timeZone: "America/New_York",
      phone: "(555) 010-5000",
      email: "office@riverside.example.com",
      address: "9 Mill Road, Brunswick, ME 04011",
      description: "Second location of the Bright Smile group (paused for renovation).",
      branding: { headerColor: "#0f766e", primaryColor: "#0f766e", secondaryColor: "#e6f4f2", theme: "compact" },
      hours: weeklyHours("08:00", "17:00"),
      smsRegistration: "approved",
      rwg: { enabled: false, websiteUrl: "", feedStatus: "off" },
      pms: { name: "Dentrix", connected: true, lastSyncAt: iso(3), syncError: "Authentication expired" },
      createdAt: iso(300),
      lastLoginAt: iso(20),
    }),
    base({
      id: CLINIC_IDS.northside,
      name: "Northside Orthodontics",
      slug: "northside-ortho",
      specialty: "dental",
      status: "churned",
      planId: "plan_starter",
      ownerUserId: "u_owner_north",
      timeZone: "America/Denver",
      phone: "(555) 010-6000",
      email: "info@northside.example.com",
      address: "300 Pine Street, Denver, CO 80202",
      description: "Former customer (churned).",
      branding: { headerColor: "#334155", primaryColor: "#334155", secondaryColor: "#e2e8f0", theme: "compact" },
      hours: weeklyHours("08:00", "16:00"),
      smsRegistration: "not_started",
      rwg: { enabled: false, websiteUrl: "", feedStatus: "off" },
      pms: { name: "Eaglesoft", connected: false },
      createdAt: iso(500),
      lastLoginAt: iso(95),
    }),
  ];
  // Holidays & blockouts for the dental clinic (demonstrates slot rules).
  const dental = clinics[0];
  dental.holidays = [
    { id: "hol_1", date: `${y}-12-25`, name: "Christmas Day" },
    { id: "hol_2", date: `${y + 1}-01-01`, name: "New Year's Day" },
  ];
  dental.featureOverrides = { otp: true };
  clinics[2].featureOverrides = { file_uploads: true };
  return clinics;
}

export const CLINIC_GROUPS: ClinicGroup[] = [
  { id: "g_brightsmile", name: "Bright Smile Group", ownerUserId: "u_owner", clinicIds: [CLINIC_IDS.dental, CLINIC_IDS.riverside] },
];
