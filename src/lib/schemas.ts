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
