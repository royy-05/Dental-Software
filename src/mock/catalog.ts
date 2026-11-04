import type {
  AdSpend,
  Announcement,
  ClinicInsurance,
  Coupon,
  InsuranceCarrier,
  Invoice,
  Plan,
  PlatformSettings,
  Referrer,
  StarterTemplate,
  Ticket,
} from "@/types";
import { CLINIC_IDS } from "./clinics";
import { defaultFlow } from "./defaults";

const C = CLINIC_IDS;

export const INSURANCE_CARRIERS: InsuranceCarrier[] = [
  "Aetna", "Ameritas", "Anthem", "Blue Cross Blue Shield", "Cigna", "Delta Dental", "Guardian", "Humana",
  "Kaiser Permanente", "Medicaid", "Medicare", "MetLife", "Principal", "Tricare", "UnitedHealthcare",
].map((name, i) => ({ id: `ins_${i + 1}`, name }));

const byName = (n: string) => INSURANCE_CARRIERS.find((c) => c.name === n)!;
function ci(clinicId: string, name: string, status: ClinicInsurance["status"], custom = false): ClinicInsurance {
  const carrier = custom ? undefined : byName(name);
  return { id: `ci_${clinicId}_${name.replace(/\W/g, "").toLowerCase()}`, clinicId, carrierId: carrier?.id, name, status, custom };
}

export const CLINIC_INSURANCES: ClinicInsurance[] = [
  ci(C.dental, "Delta Dental", "in_network"),
  ci(C.dental, "MetLife", "in_network"),
  ci(C.dental, "Cigna", "in_network"),
  ci(C.dental, "Guardian", "out_of_network"),
  ci(C.dental, "Aetna", "out_of_network"),
  ci(C.dental, "Medicaid", "not_accepted"),
  ci(C.dental, "Maine Dental Cooperative", "in_network", true),
  ci(C.physio, "Blue Cross Blue Shield", "in_network"),
  ci(C.physio, "UnitedHealthcare", "in_network"),
  ci(C.physio, "Aetna", "in_network"),
  ci(C.physio, "Humana", "out_of_network"),
  ci(C.physio, "Medicare", "in_network"),
  ci(C.derm, "Blue Cross Blue Shield", "in_network"),
  ci(C.derm, "Anthem", "in_network"),
  ci(C.derm, "Kaiser Permanente", "not_accepted"),
  ci(C.derm, "Cigna", "out_of_network"),
];

export function buildReferrers(): Referrer[] {
  const out: Referrer[] = [];
  for (const [clinicId, site] of [
    [C.dental, "https://brightsmile.example.com"],
    [C.physio, "https://motionphysio.example.com"],
    [C.derm, "https://clearskin.example.com"],
  ] as const) {
    out.push(
      { id: "1", clinicId, name: "Google Ads - Search", sourceType: "google_ads", redirectUrl: `${site}/thank-you?src=ads` },
      { id: "2", clinicId, name: "Google Business Profile", sourceType: "gbp" },
      { id: "3", clinicId, name: "Reserve with Google", sourceType: "rwg" },
      { id: "4", clinicId, name: "Website booking button", sourceType: "website" },
      { id: "5", clinicId, name: "Facebook spring campaign", sourceType: "custom", redirectUrl: `${site}/thanks-fb` },
    );
  }
  return out;
}

export const PLANS: Plan[] = [
  { id: "plan_starter", name: "Starter", priceMonthly: 99, limits: { locations: 1, providers: 3, smsCredits: 500, modules: ["file_uploads"] } },
  { id: "plan_growth", name: "Growth", priceMonthly: 199, limits: { locations: 3, providers: 10, smsCredits: 2000, modules: ["performance", "file_uploads", "otp"] } },
  { id: "plan_pro", name: "Pro", priceMonthly: 349, limits: { locations: 10, providers: 40, smsCredits: 6000, modules: ["performance", "rwg", "payments", "otp", "file_uploads", "custom_domain"] } },
];

export function buildInvoices(today: Date): Invoice[] {
  const out: Invoice[] = [];
  const amounts: Record<string, number> = { [C.dental]: 349, [C.physio]: 199, [C.riverside]: 199, [C.northside]: 99 };
  let n = 1000;
  for (const [clinicId, amount] of Object.entries(amounts)) {
    for (let m = 5; m >= 0; m--) {
      const issued = new Date(today.getFullYear(), today.getMonth() - m, 1);
      const due = new Date(issued.getTime() + 14 * 86400000);
      let status: Invoice["status"] = "paid";
      if (m === 0) status = due > today ? "open" : "overdue";
      if (clinicId === C.riverside && m <= 1) status = "overdue";
      if (clinicId === C.northside && m <= 2) status = m === 2 ? "overdue" : "void";
      out.push({
        id: `inv_${n}`,
        clinicId,
        number: `KV-${n++}`,
        amount,
        issuedAt: issued.toISOString(),
        dueAt: due.toISOString(),
        status,
        dunningEmailsSent: status === "overdue" ? 2 : 0,
      });
    }
  }
  return out;
}

export const COUPONS: Coupon[] = [
  { id: "cp_1", code: "LAUNCH20", percentOff: 20, active: true, redemptions: 4 },
  { id: "cp_2", code: "DSO-PARTNER", percentOff: 15, active: true, redemptions: 1 },
  { id: "cp_3", code: "BLACKFRIDAY", percentOff: 30, active: false, redemptions: 9 },
];

export function buildAdSpend(today: Date): AdSpend[] {
  const out: AdSpend[] = [];
  const spend: Record<string, [number, number]> = { [C.dental]: [1800, 400], [C.physio]: [900, 250], [C.derm]: [1200, 600] };
  for (const [clinicId, [ads, custom]] of Object.entries(spend)) {
    for (let m = 2; m >= 0; m--) {
      const d = new Date(today.getFullYear(), today.getMonth() - m, 1);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      out.push({ id: `ad_${clinicId}_${month}_ga`, clinicId, month, source: "google_ads", amount: ads + m * 75 });
      out.push({ id: `ad_${clinicId}_${month}_cu`, clinicId, month, source: "custom", amount: custom });
    }
  }
  return out;
}

export function buildStarterTemplates(): StarterTemplate[] {
  return [
    {
      id: "st_dental",
      specialty: "dental",
      name: "General dentistry",
      description: "New patient exam, emergency, cleaning and cosmetic consults. Insurance step on.",
      published: true,
      flow: defaultFlow("dental"),
      defaultReasons: [
        { name: "New Patient Exam & Cleaning", description: "Full exam, X-rays and cleaning.", duration: 60, patientType: "new", color: "#0f766e", estimatedValue: 320 },
        { name: "Emergency Exam", description: "Tooth pain or a broken tooth.", duration: 30, patientType: "both", color: "#b91c1c", estimatedValue: 180 },
        { name: "Teeth Cleaning", description: "Routine hygiene visit.", duration: 45, patientType: "existing", color: "#7c3aed", estimatedValue: 140 },
      ],
    },
    {
      id: "st_physio",
      specialty: "physio",
      name: "Physiotherapy clinic",
      description: "Assessment, follow-ups and sports injuries with pain and referral questions.",
      published: true,
      flow: defaultFlow("physio"),
      defaultReasons: [
        { name: "Initial Assessment", description: "Assessment and first treatment.", duration: 60, patientType: "new", color: "#1d4ed8", estimatedValue: 150 },
        { name: "Follow-up Treatment", description: "Continue your plan.", duration: 45, patientType: "existing", color: "#047857", estimatedValue: 110 },
      ],
    },
    {
      id: "st_derm",
      specialty: "dermatology",
      name: "Dermatology practice",
      description: "Consults, skin checks and cosmetic visits with photo upload.",
      published: true,
      flow: defaultFlow("dermatology"),
      defaultReasons: [
        { name: "New Patient Skin Consultation", description: "Discuss any skin concern.", duration: 45, patientType: "new", color: "#6d28d9", estimatedValue: 220 },
        { name: "Full Body Skin Check", description: "Mole and skin cancer screening.", duration: 30, patientType: "both", color: "#0369a1", estimatedValue: 180 },
      ],
    },
  ];
}

export function buildPlatformSettings(today: Date): PlatformSettings {
  return {
    branding: {
      platformName: "Kivi Health",
      primaryColor: "#0f766e",
      poweredByText: "Powered by Kivi Health",
      emailSenderDomain: "mail.kivihealth.example.com",
    },
    dataRetentionDays: 2555,
    backups: { enabled: true, lastBackupAt: new Date(today.getTime() - 5 * 3600000).toISOString(), retentionDays: 30 },
    maintenanceMode: false,
    messaging: {
      emailProvider: "SendGrid",
      smsProvider: "Twilio",
      emailSenderName: "Kivi Health Bookings",
      emailFrom: "bookings@mail.kivihealth.example.com",
      smsNumberPool: ["(555) 019-0001", "(555) 019-0002", "(555) 019-0003"],
      quietHoursStart: 21,
      quietHoursEnd: 8,
      smsCreditLimitDefault: 2000,
    },
    integrations: { ga4MeasurementId: "G-DEMO12345", googleAdsConversionId: "AW-000000000", metaPixelId: "000000000000000", gtmContainerId: "GTM-DEMO123" },
  };
}

export function buildTickets(today: Date): Ticket[] {
  const ago = (h: number) => new Date(today.getTime() - h * 3600000).toISOString();
  return [
    {
      id: "t_1001", clinicId: C.dental, subject: "Can we add a second location to the selector?", category: "question", priority: "normal", status: "resolved",
      createdAt: ago(120), createdBy: "Olivia Chen", assigneeId: "u_support", firstResponseAt: ago(118),
      messages: [
        { id: "tm_1", at: ago(120), authorName: "Olivia Chen", authorRole: "clinic_owner", body: "We're opening Riverside soon. How do we add it?" },
        { id: "tm_2", at: ago(118), authorName: "Sam Rivera", authorRole: "support_agent", body: "Done! Riverside is now in your clinic group and shows in the selector." },
      ],
    },
    {
      id: "t_1002", clinicId: C.physio, subject: "SMS reminders not received by one patient", category: "bug", priority: "high", status: "open",
      createdAt: ago(6), createdBy: "Marcus Lee", screenshotName: "sms-log.png",
      messages: [{ id: "tm_3", at: ago(6), authorName: "Marcus Lee", authorRole: "clinic_manager", body: "A patient says they never got their 24h reminder yesterday." }],
    },
    {
      id: "t_1003", clinicId: C.derm, subject: "Question about trial and plan upgrade", category: "billing", priority: "low", status: "pending",
      createdAt: ago(30), createdBy: "Isla Moreno", assigneeId: "u_super", firstResponseAt: ago(26),
      messages: [
        { id: "tm_4", at: ago(30), authorName: "Isla Moreno", authorRole: "clinic_manager", body: "What happens when our trial ends? We want Performance reports." },
        { id: "tm_5", at: ago(26), authorName: "Jordan Avery", authorRole: "super_admin", body: "Performance is in the Growth plan. Want me to switch you over at trial end?" },
      ],
    },
  ];
}

export function buildAnnouncements(today: Date): Announcement[] {
  return [
    { id: "an_1", message: "New: Reserve with Google bookings now show in Performance by source.", clinicIds: "all", active: true, createdAt: new Date(today.getTime() - 2 * 86400000).toISOString(), tone: "info" },
  ];
}
