/**
 * Shared domain types for the Kivi Health booking prototype.
 * Field names follow the Scope of Work (docs/spec.txt). All data is fake.
 *
 * Time convention: every date-time stored on a clinic record is a "clinic wall-clock"
 * ISO string without offset, e.g. "2026-11-04T09:30". It is interpreted in the
 * clinic's `timeZone`. Audit/log timestamps (`at`, `createdAt`) are real UTC ISO strings.
 */

// ---------- Roles & permissions (section 2) ----------
export type Role = "super_admin" | "support_agent" | "clinic_owner" | "clinic_manager" | "front_desk";
export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  support_agent: "Support Agent",
  clinic_owner: "Clinic Owner",
  clinic_manager: "Clinic Manager",
  front_desk: "Front Desk",
};

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  clinicIds: string[]; // empty for platform users (they see all)
  groupId?: string;
  lastLoginAt?: string;
  twoFactor: boolean;
  forceTwoFactor?: boolean;
  active: boolean;
  invitedAt?: string;
}

// ---------- Clinic ----------
export type Specialty = "dental" | "physio" | "dermatology";
export type ClinicStatus = "active" | "trial" | "paused" | "suspended" | "churned";
export type WidgetTheme = "compact" | "full_page" | "reason_first";
export type FeatureKey = "performance" | "rwg" | "payments" | "otp" | "file_uploads" | "custom_domain";
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  performance: "Performance",
  rwg: "Reserve with Google",
  payments: "Payments",
  otp: "OTP verification",
  file_uploads: "File uploads",
  custom_domain: "Custom domain",
};

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday
export interface DayHours {
  enabled: boolean;
  start: string; // "08:00"
  end: string; // "17:00"
}
export type WeeklyHours = Record<Weekday, DayHours>;

export interface Holiday {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
}

export interface Blockout {
  id: string;
  label: string;
  start: string; // wall-clock ISO
  end: string;
  providerId?: string; // undefined = whole clinic
  operatoryId?: string;
}

export interface Branding {
  logoUrl?: string;
  headerColor: string;
  primaryColor: string;
  secondaryColor: string;
  theme: WidgetTheme;
}

export interface ClinicSettings {
  widget: {
    customSlug?: string;
    redirectUrl?: string;
    redirectDelaySec: number; // 0..20
  };
  confirmation: {
    confirmedStatuses: AppointmentStatus[];
    sendConfirmPrompt: boolean;
    pmsWritebackStatuses: AppointmentStatus[];
  };
  legal: {
    privacyEnabled: boolean;
    privacyText: string;
    privacyUrl?: string;
    termsEnabled: boolean;
    termsText: string;
    termsUrl?: string;
    termsVersion: string;
  };
  scheduling: {
    autoSync: boolean;
    blockScheduling: boolean;
    blockoutsToSkip: string[];
    unarchivePatientOnBooking: boolean;
  };
  notifications: {
    smsAlertsToClinic: boolean;
    notifyPatientAfterBooking: boolean;
    remindersEnabled: boolean;
    reminderFirstHours: number; // default 24
    reminderSecondHours: number; // default 2
    extraAlertEmails: string[];
    alternateSmsNumber?: string;
    leaveReasonOutOfSms: boolean;
    dailySummary: boolean;
    clinicAlertEmail: string;
  };
  reports: {
    monthlyEmail: boolean;
    recipients: string[];
  };
  payment: {
    stripeConnected: boolean;
  };
}

export interface InsuranceSettings {
  acceptOtherInsurance: boolean;
  optionalFields: boolean; // when true, subscriber fields are optional
  extraQuestions: string[];
  warnings: {
    other: string;
    outOfNetwork: string;
    notAccepted: string;
  };
}

export interface Clinic {
  id: string;
  name: string;
  slug: string;
  specialty: Specialty;
  status: ClinicStatus;
  planId: string;
  groupId?: string;
  ownerUserId: string;
  timeZone: string;
  phone: string;
  email: string;
  address: string;
  description: string;
  branding: Branding;
  hours: WeeklyHours;
  holidays: Holiday[];
  blockouts: Blockout[];
  settings: ClinicSettings;
  insuranceSettings: InsuranceSettings;
  featureOverrides: Partial<Record<FeatureKey, boolean>>;
  smsRegistration: "approved" | "pending" | "rejected" | "not_started";
  smsCreditsUsed: number;
  emailsSent: number;
  rwg: { enabled: boolean; websiteUrl: string; feedStatus: "healthy" | "warning" | "error" | "off" };
  pms: { name: string; connected: boolean; lastSyncAt?: string; syncError?: string };
  customDomain?: string;
  createdAt: string;
  lastLoginAt?: string;
  trialEndsAt?: string;
  deletedAt?: string; // soft delete, restorable for 30 days
}

export interface ClinicGroup {
  id: string;
  name: string;
  ownerUserId: string;
  clinicIds: string[];
}

// ---------- Booking configuration ----------
export type PatientType = "new" | "existing";

export interface Reason {
  id: string;
  clinicId: string;
  name: string;
  description: string;
  longDescription: string;
  duration: number; // minutes
  patientType: PatientType | "both";
  providerIds: string[];
  operatoryIds: string[];
  color: string;
  estimatedValue: number;
  visibility: "online" | "staff_only";
  active: boolean;
  order: number;
  questions: FormField[]; // per-reason questions
  redirectUrl?: string;
  noticeOverrideHours?: number;
}

export type ProviderRole = "Doctor" | "Hygienist" | "Assistant";
export interface Break {
  id: string;
  weekday: Weekday | "all";
  start: string;
  end: string;
  label: string;
}
export interface TimeOff {
  id: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD inclusive
  reason: string;
}

export interface Provider {
  id: string;
  clinicId: string;
  displayName: string;
  externalId: string; // "ID" column (PMS id)
  photoUrl?: string;
  role: ProviderRole;
  bio: string;
  weeklyHours: WeeklyHours;
  breaks: Break[];
  timeOff: TimeOff[];
  operatoryIds: string[];
  reasonIds: string[];
  showOnline: boolean;
  active: boolean;
  color: string;
}

export interface Operatory {
  id: string;
  clinicId: string;
  name: string;
  active: boolean;
  providerIds: string[];
  reasonIds: string[];
}

export type NetworkStatus = "in_network" | "out_of_network" | "not_accepted";
export interface InsuranceCarrier {
  id: string;
  name: string;
}
export interface ClinicInsurance {
  id: string;
  clinicId: string;
  carrierId?: string; // undefined for custom carriers
  name: string;
  status: NetworkStatus;
  custom: boolean;
}

export type ReferrerSourceType = "google_ads" | "gbp" | "rwg" | "website" | "custom";
export interface Referrer {
  id: string; // numeric string used in ?referrer_id=
  clinicId: string;
  name: string;
  sourceType: ReferrerSourceType;
  redirectUrl?: string;
}

export type Source = ReferrerSourceType | "direct" | "staff";
export const SOURCE_LABELS: Record<Source, string> = {
  google_ads: "Google Ads",
  gbp: "Google Business Profile",
  rwg: "Reserve with Google",
  website: "Website",
  custom: "Custom referrer",
  direct: "Direct link",
  staff: "Staff (manual)",
};

// ---------- Step & form builder (section 4) ----------
export type FieldType =
  | "short_text"
  | "long_text"
  | "dropdown"
  | "radio"
  | "checkbox"
  | "date"
  | "phone"
  | "email"
  | "number"
  | "file"
  | "consent";
export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  dropdown: "Dropdown",
  radio: "Radio",
  checkbox: "Checkbox",
  date: "Date",
  phone: "Phone",
  email: "Email",
  number: "Number",
  file: "File upload",
  consent: "Consent",
};

export type BuiltInFieldKey = "firstName" | "lastName" | "dob" | "phone" | "email" | "message";

export type Condition =
  | { type: "patient_type"; value: PatientType }
  | { type: "reason"; value: string }
  | { type: "insurance"; value: "yes" | "no" }
  | { type: "answer"; fieldId: string; value: string }
  | { type: "someone_else"; value: boolean };

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  defaultValue?: string;
  hidden: boolean;
  width: "half" | "full";
  options?: string[];
  builtIn?: BuiltInFieldKey;
  conditions: Condition[]; // all must match for the field to show
}

export type StepKey = "reason" | "provider" | "datetime" | "details" | "insurance" | "intake" | "review";
export interface StepConfig {
  key: StepKey;
  enabled: boolean;
  title: string;
  subtitle: string;
  buttonText: string;
  conditions: Condition[];
}
export type StepOrder = "reason_first" | "provider_first" | "date_first";

export interface BookingRules {
  minNoticeHours: number;
  bookingWindowDays: number;
  slotInterval: number; // minutes
  bufferMinutes: number;
  dailyCap: number; // 0 = unlimited
  cancellationWindowHours: number;
  acceptingPatients: boolean;
  pausedMessage: string;
}

export interface FlowMessages {
  patientInfo: string;
  paidAppointmentNote: string;
  noInsuranceMessage: string;
  consentText: string;
  termsUrl: string;
  privacyUrl: string;
}

export interface FlowConfig {
  steps: StepConfig[];
  order: StepOrder;
  reasonDisplay: "sections" | "tabs" | "list";
  fields: FormField[]; // details + intake fields (built-ins included)
  intakeFields: FormField[];
  messages: FlowMessages;
  rules: BookingRules;
  otpEnabled: boolean;
  fileUploadEnabled: boolean;
}

export interface FlowVersion {
  id: string;
  clinicId: string;
  version: number;
  publishedAt: string;
  publishedBy: string;
  note: string;
  config: FlowConfig;
}

export interface ClinicFlow {
  clinicId: string;
  draft: FlowConfig;
  published: FlowConfig;
  publishedVersion: number;
  draftUpdatedAt?: string;
  versions: FlowVersion[];
}

export interface StarterTemplate {
  id: string;
  specialty: Specialty;
  name: string;
  description: string;
  published: boolean;
  flow: FlowConfig;
  defaultReasons: Pick<Reason, "name" | "description" | "duration" | "patientType" | "color" | "estimatedValue">[];
}

// ---------- Appointments ----------
export type AppointmentStatus = "unconfirmed" | "confirmed" | "complete" | "cancelled" | "no_show" | "declined";
export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  unconfirmed: "Unconfirmed",
  confirmed: "Confirmed",
  complete: "Complete",
  cancelled: "Cancelled",
  no_show: "No-show",
  declined: "Declined",
};

export interface UtmTags {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

export interface AppointmentPatient {
  firstName: string;
  lastName: string;
  dob: string;
  phone: string;
  email: string;
  message?: string;
}

export interface AppointmentInsurance {
  hasInsurance: boolean;
  carrierName?: string;
  networkStatus?: NetworkStatus | "other";
  subscriberName?: string;
  subscriberId?: string;
  subscriberDob?: string;
  extraAnswers?: Record<string, string>;
}

export interface StatusChange {
  status: AppointmentStatus;
  at: string;
  by: string;
  note?: string;
}

export interface InternalNote {
  id: string;
  at: string;
  by: string;
  text: string;
}

export interface Appointment {
  id: string;
  clinicId: string;
  createdAt: string; // "date scheduled" (UTC ISO)
  start: string; // clinic wall-clock ISO
  end: string;
  reasonId: string;
  providerId: string;
  operatoryId?: string;
  patientType: PatientType;
  patient: AppointmentPatient;
  bookingForSomeoneElse: boolean;
  bookerName?: string;
  insurance: AppointmentInsurance;
  answers: Record<string, string | boolean>;
  files: { name: string; size: number }[];
  source: Source;
  referrerId?: string;
  utm: UtmTags;
  gclid?: string;
  fbclid?: string;
  status: AppointmentStatus;
  declineReason?: string;
  statusHistory: StatusChange[];
  notes: InternalNote[];
  smsConsent: { given: boolean; at?: string; termsVersion?: string; ip?: string };
  bookedBy: "patient" | "staff";
  token: string; // reschedule / cancel link token
}

export interface SlotHold {
  id: string;
  clinicId: string;
  providerId: string;
  operatoryId?: string;
  start: string;
  end: string;
  expiresAt: number; // epoch ms
  sessionId: string;
}

// ---------- Analytics (no PHI) ----------
export type WidgetEventName =
  | "widget_opened"
  | "step_viewed"
  | "reason_selected"
  | "provider_selected"
  | "slot_selected"
  | "details_submitted"
  | "booking_completed";

export interface WidgetEvent {
  id: string;
  clinicId: string;
  sessionId: string;
  name: WidgetEventName;
  step?: StepKey;
  reasonId?: string;
  source: Source;
  at: string;
}

/** One booking widget visit, aggregated. Used by Form Analytics. Contains no PHI. */
export interface WidgetSession {
  id: string;
  clinicId: string;
  at: string; // UTC ISO
  localHour: number; // clinic local hour of visit (for heatmap)
  localWeekday: Weekday;
  source: Source;
  reasonId?: string;
  furthestStep: StepKey;
  booked: boolean;
}

// ---------- Messaging (section 7) ----------
export type TemplateEvent =
  | "booked_new"
  | "booked_returning"
  | "booking_request"
  | "confirmation_request"
  | "declined"
  | "cancelled"
  | "rescheduled"
  | "reminder_24h"
  | "reminder_2h"
  | "practice_notification"
  | "form_request"
  | "form_ack"
  | "pms_not_connected";
export const TEMPLATE_EVENT_LABELS: Record<TemplateEvent, string> = {
  booked_new: "Booked (new patient)",
  booked_returning: "Booked (returning)",
  booking_request: "Booking request",
  confirmation_request: "Confirmation request",
  declined: "Declined",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  reminder_24h: "Reminder 24 hours",
  reminder_2h: "Reminder 2 hours",
  practice_notification: "Practice notification",
  form_request: "Patient form request",
  form_ack: "Form acknowledgment",
  pms_not_connected: "PMS not connected alert",
};

export type Channel = "email" | "sms";
export interface MessageTemplate {
  id: string;
  clinicId: string | null; // null = global default (6.7)
  event: TemplateEvent;
  channel: Channel;
  subject: string;
  body: string;
  enabled: boolean;
}

export type DeliveryStatus = "queued" | "scheduled" | "sent" | "delivered" | "failed" | "opened" | "bounced";
export interface MessageLog {
  id: string;
  clinicId: string;
  appointmentId?: string;
  channel: Channel;
  direction: "outbound" | "inbound";
  recipientType: "patient" | "clinic";
  to: string;
  event: TemplateEvent | "two_way_reply" | "test" | "daily_summary" | "cancellation_alert";
  subject?: string;
  body: string;
  status: DeliveryStatus;
  createdAt: string;
  scheduledFor?: string; // set when deferred by quiet hours
  error?: string;
}

export interface OptOut {
  id: string;
  clinicId: string;
  phone: string;
  at: string;
  kind: "sms_stop" | "email_bounce" | "email_unsubscribe";
}

// ---------- Support (5.11 / 6.10) ----------
export type TicketStatus = "open" | "pending" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type TicketCategory = "bug" | "question" | "billing" | "feature_request" | "integrations" | "other";
export interface TicketMessage {
  id: string;
  at: string;
  authorName: string;
  authorRole: Role;
  body: string;
}
export interface Ticket {
  id: string;
  clinicId: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: string;
  createdBy: string;
  assigneeId?: string;
  screenshotName?: string;
  firstResponseAt?: string;
  messages: TicketMessage[];
}

export interface Announcement {
  id: string;
  message: string;
  clinicIds: "all" | string[];
  active: boolean;
  createdAt: string;
  tone: "info" | "warning";
}

// ---------- Billing (6.4) ----------
export interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  limits: { locations: number; providers: number; smsCredits: number; modules: FeatureKey[] };
}
export interface Invoice {
  id: string;
  clinicId: string;
  number: string;
  amount: number;
  issuedAt: string;
  dueAt: string;
  status: "paid" | "open" | "overdue" | "void";
  dunningEmailsSent: number;
}
export interface Coupon {
  id: string;
  code: string;
  percentOff: number;
  active: boolean;
  redemptions: number;
}

// ---------- Performance (5.9) ----------
export interface AdSpend {
  id: string;
  clinicId: string;
  month: string; // YYYY-MM
  source: Source;
  amount: number;
}

// ---------- Platform ----------
export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  actorRole: Role | "patient" | "system";
  action: string;
  category: "login" | "phi_access" | "export" | "settings" | "template" | "impersonation" | "clinic" | "user" | "billing" | "booking";
  target: string;
  clinicId?: string;
  ip: string;
  details?: string;
}

export interface AppNotification {
  id: string;
  clinicId: string;
  at: string;
  title: string;
  body: string;
  read: boolean;
  href?: string;
}

export interface LegalTemplate {
  id: string;
  kind: "privacy" | "terms";
  title: string;
  body: string;
  version: string;
}

export interface PlatformSettings {
  branding: { platformName: string; logoUrl?: string; primaryColor: string; poweredByText: string; emailSenderDomain: string };
  dataRetentionDays: number;
  backups: { enabled: boolean; lastBackupAt: string; retentionDays: number };
  maintenanceMode: boolean;
  messaging: {
    emailProvider: "SendGrid" | "Amazon SES";
    smsProvider: "Twilio";
    emailSenderName: string;
    emailFrom: string;
    smsNumberPool: string[];
    quietHoursStart: number; // 21
    quietHoursEnd: number; // 8
    smsCreditLimitDefault: number;
  };
  integrations: { ga4MeasurementId: string; googleAdsConversionId: string; metaPixelId: string; gtmContainerId: string };
}
