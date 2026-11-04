import type {
  ClinicSettings,
  FlowConfig,
  FormField,
  InsuranceSettings,
  LegalTemplate,
  MessageTemplate,
  Specialty,
  StepConfig,
  TemplateEvent,
  WeeklyHours,
} from "@/types";

export function weeklyHours(start = "08:00", end = "17:00", days: number[] = [1, 2, 3, 4, 5]): WeeklyHours {
  const h = {} as WeeklyHours;
  for (let d = 0; d < 7; d++) h[d as 0] = { enabled: days.includes(d), start, end };
  return h;
}

export function defaultClinicSettings(clinicEmail: string): ClinicSettings {
  return {
    widget: { redirectDelaySec: 5 },
    confirmation: {
      confirmedStatuses: ["confirmed", "complete"],
      sendConfirmPrompt: true,
      pmsWritebackStatuses: ["confirmed", "cancelled"],
    },
    legal: {
      privacyEnabled: true,
      privacyText: DEFAULT_PRIVACY,
      termsEnabled: true,
      termsText: DEFAULT_TERMS,
      termsVersion: "2026-01",
    },
    scheduling: { autoSync: false, blockScheduling: false, blockoutsToSkip: [], unarchivePatientOnBooking: true },
    notifications: {
      smsAlertsToClinic: true,
      notifyPatientAfterBooking: true,
      remindersEnabled: true,
      reminderFirstHours: 24,
      reminderSecondHours: 2,
      extraAlertEmails: [],
      leaveReasonOutOfSms: false,
      dailySummary: true,
      clinicAlertEmail: clinicEmail,
    },
    reports: { monthlyEmail: false, recipients: [clinicEmail] },
    payment: { stripeConnected: false },
  };
}

export function defaultInsuranceSettings(): InsuranceSettings {
  return {
    acceptOtherInsurance: true,
    optionalFields: false,
    extraQuestions: [],
    warnings: {
      other:
        "We'll verify your plan before your visit. If we can't, our team will call you to discuss options.",
      outOfNetwork:
        "We are out of network with this plan. You can still be seen; your plan may reimburse part of the cost.",
      notAccepted: "We don't accept this plan. You're welcome to book as a self-pay patient.",
    },
  };
}

export const DEFAULT_PRIVACY = `Privacy Policy (demo)

We collect the information you enter to schedule your appointment. We use it only to provide care and contact you about your visit. We never sell your data and never send health information to advertising or analytics platforms.`;

export const DEFAULT_TERMS = `Terms of Use (demo)

By booking you agree to arrive 10 minutes early and to give at least 24 hours notice if you need to cancel. Message and data rates may apply to SMS. Reply STOP to opt out, HELP for help.`;

export const LEGAL_TEMPLATES: LegalTemplate[] = [
  { id: "legal_privacy", kind: "privacy", title: "Privacy Policy", body: DEFAULT_PRIVACY, version: "2026-01" },
  { id: "legal_terms", kind: "terms", title: "Terms of Use", body: DEFAULT_TERMS, version: "2026-01" },
];

function builtIn(id: string, builtInKey: FormField["builtIn"], label: string, type: FormField["type"], width: "half" | "full", required = true): FormField {
  return { id, type, label, required, hidden: false, width, builtIn: builtInKey, conditions: [], placeholder: "" };
}

export function defaultDetailFields(): FormField[] {
  return [
    builtIn("f_first", "firstName", "First name", "short_text", "half"),
    builtIn("f_last", "lastName", "Last name", "short_text", "half"),
    builtIn("f_dob", "dob", "Date of birth", "date", "half"),
    builtIn("f_phone", "phone", "Mobile phone", "phone", "half"),
    builtIn("f_email", "email", "Email", "email", "full"),
    builtIn("f_message", "message", "Message for the clinic", "long_text", "full", false),
  ];
}

export function defaultSteps(): StepConfig[] {
  return [
    { key: "reason", enabled: true, title: "Reason for visit", subtitle: "What brings you in?", buttonText: "Continue", conditions: [] },
    { key: "provider", enabled: false, title: "Choose a provider", subtitle: "Pick someone or take the first available.", buttonText: "Continue", conditions: [] },
    { key: "datetime", enabled: true, title: "Date and time", subtitle: "Choose a time that works for you.", buttonText: "Continue", conditions: [] },
    { key: "details", enabled: true, title: "Your details", subtitle: "Tell us who the appointment is for.", buttonText: "Continue", conditions: [] },
    { key: "insurance", enabled: true, title: "Insurance", subtitle: "Do you have dental or medical insurance?", buttonText: "Continue", conditions: [] },
    { key: "intake", enabled: true, title: "A few questions", subtitle: "Helps us prepare for your visit.", buttonText: "Continue", conditions: [] },
    { key: "review", enabled: true, title: "Review and confirm", subtitle: "Check everything looks right.", buttonText: "Book appointment", conditions: [] },
  ];
}

const INTAKE: Record<Specialty, FormField[]> = {
  dental: [
    { id: "q_last_visit", type: "dropdown", label: "When was your last dental visit?", required: false, hidden: false, width: "half", options: ["Within 6 months", "6-12 months", "1-2 years", "More than 2 years", "Never"], conditions: [{ type: "patient_type", value: "new" }] },
    { id: "q_anxiety", type: "radio", label: "Do you feel nervous about dental visits?", required: false, hidden: false, width: "half", options: ["No", "A little", "Very"], conditions: [] },
    { id: "q_xray", type: "file", label: "Upload recent X-rays", required: false, hidden: false, width: "full", conditions: [{ type: "patient_type", value: "new" }], helpText: "PDF or image, up to 10 MB." },
  ],
  physio: [
    { id: "q_pain", type: "number", label: "Pain level today (0-10)", required: false, hidden: false, width: "half", conditions: [] },
    { id: "q_referral", type: "radio", label: "Do you have a doctor's referral?", required: false, hidden: false, width: "half", options: ["Yes", "No"], conditions: [] },
    { id: "q_referral_doc", type: "file", label: "Upload referral", required: false, hidden: false, width: "full", conditions: [{ type: "answer", fieldId: "q_referral", value: "Yes" }] },
  ],
  dermatology: [
    { id: "q_concern", type: "long_text", label: "Describe your skin concern", required: false, hidden: false, width: "full", conditions: [] },
    { id: "q_photo", type: "file", label: "Upload a photo", required: false, hidden: false, width: "full", conditions: [], helpText: "Helps the doctor prepare." },
  ],
};

export function defaultFlow(specialty: Specialty): FlowConfig {
  return {
    steps: defaultSteps(),
    order: "reason_first",
    reasonDisplay: specialty === "physio" ? "tabs" : "sections",
    fields: defaultDetailFields(),
    intakeFields: structuredClone(INTAKE[specialty]),
    messages: {
      patientInfo: "Please arrive 10 minutes early and bring a photo ID.",
      paidAppointmentNote: "",
      noInsuranceMessage: "No insurance? No problem. Ask us about our self-pay pricing and membership plan.",
      consentText: "I agree to receive appointment text messages. Message and data rates may apply. Reply STOP to opt out.",
      termsUrl: "",
      privacyUrl: "",
    },
    rules: {
      minNoticeHours: 2,
      bookingWindowDays: 60,
      slotInterval: 15,
      bufferMinutes: 0,
      dailyCap: 0,
      cancellationWindowHours: 24,
      acceptingPatients: true,
      pausedMessage: "We're not taking online bookings right now. Please call us to book.",
    },
    otpEnabled: false,
    fileUploadEnabled: true,
  };
}

// ---------- Default message templates (6.7) ----------
const T: Record<TemplateEvent, { subject: string; email: string; sms: string }> = {
  booked_new: {
    subject: "Welcome! Your appointment at {{practice_name}}",
    email: "Hi {{patient_name}},\n\nThanks for choosing {{practice_name}}. Your {{rfv_name}} with {{provider_name}} is booked for {{apt_date}} at {{start_time}}.\n\nNeed to change it? {{reschedule_link}}\n\nSee you soon!",
    sms: "{{practice_name}}: Hi {{patient_name}}, you're booked for {{rfv_name}} on {{apt_date}} at {{start_time}}. Change: {{reschedule_link}}",
  },
  booked_returning: {
    subject: "Your appointment at {{practice_name}} is booked",
    email: "Hi {{patient_name}},\n\nWelcome back. Your {{rfv_name}} with {{provider_name}} is on {{apt_date}} at {{start_time}}.\n\nReschedule or cancel: {{reschedule_link}}",
    sms: "{{practice_name}}: See you {{apt_date}} at {{start_time}} with {{provider_name}}. Change: {{reschedule_link}}",
  },
  booking_request: {
    subject: "We received your booking request",
    email: "Hi {{patient_name}},\n\nWe received your request for {{rfv_name}} on {{apt_date}} at {{start_time}}. We'll confirm shortly.",
    sms: "{{practice_name}}: We got your request for {{apt_date}} at {{start_time}}. We'll confirm soon.",
  },
  confirmation_request: {
    subject: "Please confirm your appointment",
    email: "Hi {{patient_name}},\n\nPlease confirm your appointment on {{apt_date}} at {{start_time}}.\n\nNeed a different time? {{reschedule_link}}",
    sms: "{{practice_name}}: Reply C to confirm your visit on {{apt_date}} at {{start_time}}. Change: {{reschedule_link}}",
  },
  declined: {
    subject: "About your appointment request",
    email: "Hi {{patient_name}},\n\nUnfortunately we can't accept your request for {{apt_date}} at {{start_time}}. Please call us or pick another time: {{reschedule_link}}",
    sms: "{{practice_name}}: We couldn't accept your request for {{apt_date}}. Please pick another time: {{reschedule_link}}",
  },
  cancelled: {
    subject: "Your appointment was cancelled",
    email: "Hi {{patient_name}},\n\nYour appointment on {{apt_date}} at {{start_time}} has been cancelled. Book again any time: {{reschedule_link}}",
    sms: "{{practice_name}}: Your visit on {{apt_date}} at {{start_time}} is cancelled. Rebook: {{reschedule_link}}",
  },
  rescheduled: {
    subject: "Your appointment has a new time",
    email: "Hi {{patient_name}},\n\nYour {{rfv_name}} is now on {{apt_date}} at {{start_time}} with {{provider_name}}.\n\nChange again: {{reschedule_link}}",
    sms: "{{practice_name}}: Rescheduled to {{apt_date}} at {{start_time}}. Change: {{reschedule_link}}",
  },
  reminder_24h: {
    subject: "Reminder: appointment tomorrow",
    email: "Hi {{patient_name}},\n\nA reminder of your appointment on {{apt_date}} at {{start_time}} with {{provider_name}}.",
    sms: "{{practice_name}}: Reminder, you're booked {{apt_date}} at {{start_time}}. Reply C to confirm.",
  },
  reminder_2h: {
    subject: "See you soon",
    email: "Hi {{patient_name}},\n\nSee you today at {{start_time}}.",
    sms: "{{practice_name}}: See you today at {{start_time}}!",
  },
  practice_notification: {
    subject: "New online booking: {{rfv_name}} on {{apt_date}}",
    email: "New booking\n\nPatient: {{patient_name}}\nReason: {{rfv_name}}\nProvider: {{provider_name}}\nWhen: {{apt_date}} at {{start_time}}",
    sms: "New booking: {{patient_name}}, {{rfv_name}}, {{apt_date}} {{start_time}}",
  },
  form_request: {
    subject: "Please complete your forms before your visit",
    email: "Hi {{patient_name}},\n\nPlease complete your forms before {{apt_date}}.",
    sms: "{{practice_name}}: Please complete your forms before your visit on {{apt_date}}.",
  },
  form_ack: {
    subject: "Thanks, we received your forms",
    email: "Hi {{patient_name}},\n\nThanks for completing your forms. See you on {{apt_date}}.",
    sms: "{{practice_name}}: Thanks, we received your forms.",
  },
  pms_not_connected: {
    subject: "Action needed: practice management system not connected",
    email: "Your PMS connection for {{practice_name}} is not active. New bookings are not syncing.",
    sms: "{{practice_name}}: PMS is not connected; bookings are not syncing.",
  },
};

export function defaultTemplates(clinicId: string | null): MessageTemplate[] {
  const out: MessageTemplate[] = [];
  for (const [event, t] of Object.entries(T) as [TemplateEvent, (typeof T)[TemplateEvent]][]) {
    const prefix = clinicId ?? "global";
    out.push({ id: `tpl_${prefix}_${event}_email`, clinicId, event, channel: "email", subject: t.subject, body: t.email, enabled: true });
    out.push({ id: `tpl_${prefix}_${event}_sms`, clinicId, event, channel: "sms", subject: "", body: t.sms, enabled: event !== "form_ack" });
  }
  return out;
}

export const TEMPLATE_PLACEHOLDERS = [
  "{{patient_name}}",
  "{{practice_name}}",
  "{{rfv_name}}",
  "{{apt_date}}",
  "{{start_time}}",
  "{{provider_name}}",
  "{{reschedule_link}}",
] as const;
