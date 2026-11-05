/**
 * zod schemas for the domain types in src/types. Used by API routes to validate every input.
 * Strings are length-capped; free text is trimmed where it is a name or label.
 */
import { z } from "zod";

export const zText = (max = 200) => z.string().max(max);
export const zName = (max = 120) => z.string().trim().min(1, "Required").max(max);
export const zId = z.string().min(1).max(64);
export const zColor = z.string().regex(/^#[0-9a-fA-F]{3,8}$/, "Use a hex colour");
export const zHm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");
export const zDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const zWall = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Use YYYY-MM-DDTHH:mm").transform((s) => s.slice(0, 16));
export const zUrl = z.union([z.literal(""), z.string().url().max(2048).refine((u) => /^https?:\/\//i.test(u), "Use an http(s) URL")]);
export const zOptUrl = zUrl.optional().transform((v) => (v ? v : undefined));
export const zEmail = z.string().trim().toLowerCase().email().max(254);
export const zPhone = z.string().trim().min(7).max(32).regex(/^[+\d\s().-]+$/, "Use digits, spaces, + ( ) . -");

export const zRole = z.enum(["super_admin", "support_agent", "clinic_owner", "clinic_manager", "front_desk"]);
export const zClinicRole = z.enum(["clinic_owner", "clinic_manager", "front_desk"]);
export const zStatus = z.enum(["unconfirmed", "confirmed", "complete", "cancelled", "no_show", "declined"]);
export const zSource = z.enum(["google_ads", "gbp", "rwg", "website", "custom", "direct", "staff"]);
export const zReferrerSource = z.enum(["google_ads", "gbp", "rwg", "website", "custom"]);
export const zFeatureKey = z.enum(["performance", "rwg", "payments", "otp", "file_uploads", "custom_domain"]);
export const zSpecialty = z.enum(["dental", "physio", "dermatology"]);
export const zClinicStatus = z.enum(["active", "trial", "paused", "suspended", "churned"]);
export const zTheme = z.enum(["compact", "full_page", "reason_first"]);
export const zWeekday = z.number().int().min(0).max(6);
export const zNetwork = z.enum(["in_network", "out_of_network", "not_accepted"]);
export const zPatientType = z.enum(["new", "existing"]);
export const zTemplateEvent = z.enum([
  "booked_new", "booked_returning", "booking_request", "confirmation_request", "declined", "cancelled", "rescheduled",
  "reminder_24h", "reminder_2h", "practice_notification", "form_request", "form_ack", "pms_not_connected",
]);
export const zChannel = z.enum(["email", "sms"]);
export const zStepKey = z.enum(["reason", "provider", "datetime", "details", "insurance", "intake", "review"]);

const dayHours = z.object({ enabled: z.boolean(), start: zHm, end: zHm });
export const zWeeklyHours = z.object({ 0: dayHours, 1: dayHours, 2: dayHours, 3: dayHours, 4: dayHours, 5: dayHours, 6: dayHours });

export const zBranding = z.object({
  logoUrl: z.string().max(300_000).optional(), // data URL capped (~200 KB)
  headerColor: zColor,
  primaryColor: zColor,
  secondaryColor: zColor,
  theme: zTheme,
});

export const zClinicSettings = z.object({
  widget: z.object({
    customSlug: z.string().regex(/^[a-z0-9-]{3,60}$/).optional().or(z.literal("").transform(() => undefined)),
    redirectUrl: zOptUrl,
    redirectDelaySec: z.number().int().min(0).max(20),
  }),
  confirmation: z.object({ confirmedStatuses: z.array(zStatus), sendConfirmPrompt: z.boolean(), pmsWritebackStatuses: z.array(zStatus) }),
  legal: z.object({
    privacyEnabled: z.boolean(),
    privacyText: zText(50_000),
    privacyUrl: zOptUrl,
    termsEnabled: z.boolean(),
    termsText: zText(50_000),
    termsUrl: zOptUrl,
    termsVersion: zText(40),
  }),
  scheduling: z.object({ autoSync: z.boolean(), blockScheduling: z.boolean(), blockoutsToSkip: z.array(zId).max(200), unarchivePatientOnBooking: z.boolean() }),
  notifications: z.object({
    smsAlertsToClinic: z.boolean(),
    notifyPatientAfterBooking: z.boolean(),
    remindersEnabled: z.boolean(),
    reminderFirstHours: z.number().int().min(1).max(168),
    reminderSecondHours: z.number().int().min(1).max(72),
    extraAlertEmails: z.array(zEmail).max(10),
    alternateSmsNumber: zPhone.optional().or(z.literal("").transform(() => undefined)),
    leaveReasonOutOfSms: z.boolean(),
    dailySummary: z.boolean(),
    clinicAlertEmail: zEmail.or(z.literal("")),
  }),
  reports: z.object({ monthlyEmail: z.boolean(), recipients: z.array(zEmail).max(10) }),
  payment: z.object({ stripeConnected: z.boolean() }),
});

export const zInsuranceSettings = z.object({
  acceptOtherInsurance: z.boolean(),
  optionalFields: z.boolean(),
  extraQuestions: z.array(zText(300)).max(20),
  warnings: z.object({ other: zText(1000), outOfNetwork: zText(1000), notAccepted: zText(1000) }),
});

export const zCondition = z.discriminatedUnion("type", [
  z.object({ type: z.literal("patient_type"), value: zPatientType }),
  z.object({ type: z.literal("reason"), value: zId }),
  z.object({ type: z.literal("insurance"), value: z.enum(["yes", "no"]) }),
  z.object({ type: z.literal("answer"), fieldId: zId, value: zText(200) }),
  z.object({ type: z.literal("someone_else"), value: z.boolean() }),
]);

export const zFormField = z.object({
  id: zId,
  type: z.enum(["short_text", "long_text", "dropdown", "radio", "checkbox", "date", "phone", "email", "number", "file", "consent"]),
  label: zText(300),
  placeholder: zText(200).optional(),
  helpText: zText(500).optional(),
  required: z.boolean(),
  defaultValue: zText(500).optional(),
  hidden: z.boolean(),
  width: z.enum(["half", "full"]),
  options: z.array(zText(200)).max(50).optional(),
  builtIn: z.enum(["firstName", "lastName", "dob", "phone", "email", "message"]).optional(),
  conditions: z.array(zCondition).max(10),
});

export const zStepConfig = z.object({
  key: zStepKey,
  enabled: z.boolean(),
  title: zText(120),
  subtitle: zText(300),
  buttonText: zText(60),
  conditions: z.array(zCondition).max(10),
});

export const zBookingRules = z.object({
  minNoticeHours: z.number().int().min(0).max(24 * 60),
  bookingWindowDays: z.number().int().min(1).max(730),
  slotInterval: z.number().int().min(5).max(240),
  bufferMinutes: z.number().int().min(0).max(240),
  dailyCap: z.number().int().min(0).max(1000),
  cancellationWindowHours: z.number().int().min(0).max(24 * 30),
  acceptingPatients: z.boolean(),
  pausedMessage: zText(1000),
});

export const zFlowConfig = z.object({
  steps: z.array(zStepConfig).max(10),
  order: z.enum(["reason_first", "provider_first", "date_first"]),
  reasonDisplay: z.enum(["sections", "tabs", "list"]),
  fields: z.array(zFormField).max(60),
  intakeFields: z.array(zFormField).max(60),
  messages: z.object({
    patientInfo: zText(2000),
    paidAppointmentNote: zText(2000),
    noInsuranceMessage: zText(2000),
    consentText: zText(4000),
    termsUrl: zText(2048),
    privacyUrl: zText(2048),
  }),
  rules: zBookingRules,
  otpEnabled: z.boolean(),
  fileUploadEnabled: z.boolean(),
});

export const zUtm = z.object({
  source: zText(200).optional(),
  medium: zText(200).optional(),
  campaign: zText(200).optional(),
  term: zText(200).optional(),
  content: zText(200).optional(),
});

// ---------- bookings ----------

export const zInsurance = z.object({
  hasInsurance: z.boolean(),
  carrierName: zText(200).optional(),
  networkStatus: z.enum(["in_network", "out_of_network", "not_accepted", "other"]).optional(),
  subscriberName: zText(200).optional(),
  subscriberId: zText(100).optional(),
  subscriberDob: zText(20).optional(),
  extraAnswers: z.record(zText(300), zText(1000)).optional(),
});

export const zPatientDetails = z.object({
  firstName: zName(80),
  lastName: zName(80),
  dob: zDay,
  phone: zPhone.or(z.literal("")),
  email: zEmail.or(z.literal("")),
  message: zText(2000).optional(),
});

export const zAnswers = z.record(zId, z.union([zText(2000), z.boolean()]));
export const zFiles = z.array(z.object({ name: zText(200), size: z.number().int().min(0).max(50_000_000) })).max(10);

export const zSessionId = z.string().regex(/^[\w-]{6,80}$/);

export const zBookingBody = z.object({
  reasonId: zId,
  providerId: zId,
  start: zWall,
  patientType: zPatientType,
  patient: zPatientDetails,
  bookingForSomeoneElse: z.boolean().default(false),
  bookerName: zText(120).optional(),
  insurance: zInsurance,
  answers: zAnswers.default({}),
  files: zFiles.default([]),
  smsConsent: z.boolean().default(false),
  holdId: zId.optional(),
  sessionId: zSessionId.optional(),
  referrerId: z.string().regex(/^\d{1,9}$/).optional(),
  utm: zUtm.default({}),
  gclid: zText(200).optional(),
  fbclid: zText(200).optional(),
  /** Honeypot: real browsers leave it empty. */
  website: z.string().max(200).optional(),
});

// ---------- clinic configuration ----------

export const zReasonBody = z.object({
  name: zName(120),
  description: zText(300),
  longDescription: zText(5000),
  duration: z.number().int().min(5).max(480),
  patientType: z.enum(["new", "existing", "both"]),
  providerIds: z.array(zId).max(100),
  operatoryIds: z.array(zId).max(100),
  color: zColor,
  estimatedValue: z.number().int().min(0).max(1_000_000),
  visibility: z.enum(["online", "staff_only"]),
  active: z.boolean(),
  questions: z.array(zFormField).max(30),
  redirectUrl: zOptUrl,
  noticeOverrideHours: z.number().int().min(0).max(24 * 60).nullable().optional(),
});

export const zBreak = z.object({ id: zId.optional(), weekday: z.union([zWeekday, z.literal("all")]), start: zHm, end: zHm, label: zText(80) });
export const zTimeOff = z.object({ id: zId.optional(), start: zDay, end: zDay, reason: zText(200) });

export const zProviderBody = z.object({
  displayName: zName(120),
  externalId: zText(60),
  photoUrl: z.string().max(220_000).optional().nullable(),
  role: z.enum(["Doctor", "Hygienist", "Assistant"]),
  bio: zText(2000),
  weeklyHours: zWeeklyHours,
  breaks: z.array(zBreak).max(30),
  timeOff: z.array(zTimeOff).max(100),
  operatoryIds: z.array(zId).max(100),
  reasonIds: z.array(zId).max(200),
  showOnline: z.boolean(),
  active: z.boolean(),
  color: zColor,
});

export const zOperatoryBody = z.object({ name: zName(80), active: z.boolean(), providerIds: z.array(zId).max(100), reasonIds: z.array(zId).max(200) });
export const zHoliday = z.object({ date: zDay, name: zName(80) });
export const zBlockout = z.object({ label: zName(80), start: zWall, end: zWall, providerId: zId.optional(), operatoryId: zId.optional() });
export const zReferrerBody = z.object({ name: zName(80), sourceType: zReferrerSource, redirectUrl: zOptUrl });
export const zTemplateBody = z.object({ subject: zText(200).optional(), body: zText(5000).optional(), enabled: z.boolean().optional() });
export const zTicketBody = z.object({ subject: z.string().trim().min(4).max(200), category: z.enum(["bug", "question", "billing", "feature_request", "integrations", "other"]), priority: z.enum(["low", "normal", "high", "urgent"]), body: z.string().trim().min(10).max(5000), screenshotName: zText(200).optional() });
export const zTicketStatus = z.enum(["open", "pending", "resolved", "closed"]);
export const zTicketPriority = z.enum(["low", "normal", "high", "urgent"]);
export const zMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

// ---------- super admin ----------

export const zSlug = z.string().regex(/^[a-z0-9-]{3,60}$/, "Lower-case letters, numbers and dashes");
export const zCsvRows = z.array(z.record(z.string().max(60), z.string().max(500))).max(500);
export const zNewClinicBody = z.object({
  name: zName(),
  slug: zSlug,
  specialty: zSpecialty,
  timeZone: z.string().min(3).max(60),
  phone: zText(40),
  email: zEmail.or(z.literal("")),
  address: zText(300),
  planId: zId,
  trial: z.boolean(),
  owner: z.discriminatedUnion("mode", [z.object({ mode: z.literal("existing"), userId: zId }), z.object({ mode: z.literal("invite"), name: zName(), email: zEmail })]),
  starterTemplateId: zId.optional(),
  importReasons: zCsvRows.default([]),
  importProviders: zCsvRows.default([]),
});
export const zClinicAdminPatch = z
  .object({
    name: zName(),
    slug: zSlug,
    specialty: zSpecialty,
    timeZone: z.string().min(3).max(60),
    phone: zText(40),
    email: zEmail.or(z.literal("")),
    address: zText(300),
    status: zClinicStatus,
    planId: zId,
    groupId: zId.nullable(),
    ownerUserId: zId,
    trialEndsAt: z.string().datetime().nullable(),
    featureOverrides: z.partialRecord(zFeatureKey, z.boolean().nullable()),
    smsRegistration: z.enum(["approved", "pending", "rejected", "not_started"]),
    customDomain: z.string().max(253).nullable(),
    retentionDays: z.number().int().min(30).max(3650).nullable(),
    rwg: z.object({ enabled: z.boolean(), websiteUrl: zText(2048), feedStatus: z.enum(["healthy", "warning", "error", "off"]) }).partial(),
    pms: z.object({ name: zText(60), connected: z.boolean(), lastSyncAt: z.string().datetime().optional(), syncError: zText(300).optional() }).partial(),
  })
  .partial();
export const zPlanPatch = z.object({ name: zName(60), priceMonthly: z.number().int().min(0).max(100_000), limits: z.object({ locations: z.number().int().min(1).max(1000), providers: z.number().int().min(1).max(10_000), smsCredits: z.number().int().min(0).max(10_000_000), modules: z.array(zFeatureKey) }).partial() }).partial();
export const zPlatformSettings = z.object({
  branding: z.object({ platformName: zName(60), logoUrl: z.string().max(300_000).optional(), primaryColor: zColor, poweredByText: zText(80), emailSenderDomain: zText(253) }),
  dataRetentionDays: z.number().int().min(30).max(3650),
  backups: z.object({ enabled: z.boolean(), lastBackupAt: z.string(), retentionDays: z.number().int().min(1).max(3650) }),
  maintenanceMode: z.boolean(),
  messaging: z.object({
    emailProvider: z.enum(["SendGrid", "Amazon SES"]),
    smsProvider: z.literal("Twilio"),
    emailSenderName: zText(80),
    emailFrom: zText(254),
    smsNumberPool: z.array(zText(32)).max(50),
    quietHoursStart: z.number().int().min(0).max(23),
    quietHoursEnd: z.number().int().min(0).max(23),
    smsCreditLimitDefault: z.number().int().min(0).max(10_000_000),
  }),
  integrations: z.object({ ga4MeasurementId: zText(40), googleAdsConversionId: zText(40), metaPixelId: zText(40), gtmContainerId: zText(40) }),
});
