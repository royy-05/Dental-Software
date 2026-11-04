import type { FormField, Operatory, Provider, Reason, User, WeeklyHours } from "@/types";
import { CLINIC_IDS } from "./clinics";
import { weeklyHours } from "./defaults";

const C = CLINIC_IDS;

function prov(
  id: string,
  clinicId: string,
  displayName: string,
  role: Provider["role"],
  hours: WeeklyHours,
  operatoryIds: string[],
  color: string,
  bio: string,
): Provider {
  return {
    id,
    clinicId,
    displayName,
    externalId: `PMS-${id.slice(-3).toUpperCase()}`,
    role,
    bio,
    weeklyHours: hours,
    breaks: [{ id: `brk_${id}`, weekday: "all", start: "12:00", end: "13:00", label: "Lunch" }],
    timeOff: [],
    operatoryIds,
    reasonIds: [],
    showOnline: true,
    active: true,
    color,
  };
}

export function buildProviders(today: Date): Provider[] {
  const list: Provider[] = [
    // Bright Smile Dental
    prov("p_patel", C.dental, "Dr. Maya Patel", "Doctor", { ...weeklyHours("08:00", "17:00", [1, 2, 3, 4]), 6: { enabled: true, start: "09:00", end: "13:00" } }, ["op_d1", "op_d2"], "#0f766e", "Dr. Patel has 12 years of experience in family and cosmetic dentistry."),
    prov("p_okafor", C.dental, "Dr. James Okafor", "Doctor", weeklyHours("10:00", "18:00", [2, 3, 4, 5]), ["op_d2", "op_d3"], "#b45309", "Dr. Okafor focuses on emergency care and restorative work."),
    prov("p_lin", C.dental, "Sarah Lin, RDH", "Hygienist", weeklyHours("08:00", "16:00", [1, 2, 3, 4, 5]), ["op_h1"], "#7c3aed", "Sarah makes cleanings gentle and thorough."),
    prov("p_reyes", C.dental, "Tom Reyes, RDH", "Hygienist", weeklyHours("09:00", "18:00", [1, 3, 5]), ["op_h2"], "#be123c", "Tom is great with kids and nervous patients."),
    // Motion Physio
    prov("p_morgan", C.physio, "Alex Morgan, DPT", "Doctor", weeklyHours("07:00", "15:00"), ["op_pa", "op_gym"], "#1d4ed8", "Sports physiotherapist working with local running clubs."),
    prov("p_shah", C.physio, "Priya Shah, DPT", "Doctor", weeklyHours("11:00", "19:00"), ["op_pb", "op_gym"], "#047857", "Specialist in post-surgery and spinal rehab."),
    prov("p_carter", C.physio, "Ben Carter", "Assistant", weeklyHours("09:00", "17:00", [1, 2, 3, 4]), ["op_gym"], "#c2410c", "Rehab assistant running supervised exercise sessions."),
    // Clear Skin Dermatology
    prov("p_ruiz", C.derm, "Dr. Elena Ruiz", "Doctor", weeklyHours("09:00", "17:00", [1, 2, 3, 4]), ["op_e1", "op_proc"], "#6d28d9", "Board-certified dermatologist, skin cancer screening."),
    prov("p_brooks", C.derm, "Dr. Kevin Brooks", "Doctor", weeklyHours("09:00", "17:00", [2, 3, 4, 5]), ["op_e2", "op_proc"], "#0369a1", "Medical and cosmetic dermatology."),
    prov("p_park", C.derm, "Nina Park, PA", "Assistant", weeklyHours("09:00", "15:00", [1, 3, 5]), ["op_e2"], "#9d174d", "Physician assistant for follow-ups and acne care."),
    // Riverside (paused clinic)
    prov("p_hale", C.riverside, "Dr. Grace Hale", "Doctor", weeklyHours(), ["op_r1"], "#0f766e", "General dentist."),
  ];
  // A week of time off for Dr. Okafor starting 10 days from now (demonstrates time off).
  const off = new Date(today.getTime() + 10 * 86400000);
  const offEnd = new Date(today.getTime() + 14 * 86400000);
  const d = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  list[1].timeOff = [{ id: "to_1", start: d(off), end: d(offEnd), reason: "Conference" }];
  return list;
}

export const OPERATORIES: Operatory[] = [
  { id: "op_d1", clinicId: C.dental, name: "Operatory 1", active: true, providerIds: [], reasonIds: [] },
  { id: "op_d2", clinicId: C.dental, name: "Operatory 2", active: true, providerIds: [], reasonIds: [] },
  { id: "op_d3", clinicId: C.dental, name: "Operatory 3", active: true, providerIds: [], reasonIds: [] },
  { id: "op_h1", clinicId: C.dental, name: "Hygiene Room 1", active: true, providerIds: [], reasonIds: [] },
  { id: "op_h2", clinicId: C.dental, name: "Hygiene Room 2", active: true, providerIds: [], reasonIds: [] },
  { id: "op_pa", clinicId: C.physio, name: "Treatment Room A", active: true, providerIds: [], reasonIds: [] },
  { id: "op_pb", clinicId: C.physio, name: "Treatment Room B", active: true, providerIds: [], reasonIds: [] },
  { id: "op_gym", clinicId: C.physio, name: "Rehab Gym", active: true, providerIds: [], reasonIds: [] },
  { id: "op_e1", clinicId: C.derm, name: "Exam Room 1", active: true, providerIds: [], reasonIds: [] },
  { id: "op_e2", clinicId: C.derm, name: "Exam Room 2", active: true, providerIds: [], reasonIds: [] },
  { id: "op_proc", clinicId: C.derm, name: "Procedure Room", active: true, providerIds: [], reasonIds: [] },
  { id: "op_r1", clinicId: C.riverside, name: "Operatory 1", active: true, providerIds: [], reasonIds: [] },
];

function q(id: string, label: string, type: FormField["type"], options?: string[], required = false): FormField {
  return { id, type, label, required, hidden: false, width: "full", options, conditions: [] };
}

type R = Omit<Reason, "order" | "questions" | "longDescription"> & { questions?: FormField[]; longDescription?: string };
function reasons(list: R[]): Reason[] {
  return list.map((r, i) => ({
    longDescription: `${r.description} Your visit typically lasts about ${r.duration} minutes. Please bring a photo ID and your insurance card if you have one.`,
    questions: [],
    ...r,
    order: i,
  }));
}

export const REASONS: Reason[] = [
  ...reasons([
    { id: "r_d_newexam", clinicId: C.dental, name: "New Patient Exam & Cleaning", description: "Full exam, X-rays and a cleaning for new patients.", duration: 60, patientType: "new", providerIds: ["p_patel", "p_okafor"], operatoryIds: ["op_d1", "op_d2", "op_d3"], color: "#0f766e", estimatedValue: 320, visibility: "online", active: true },
    { id: "r_d_emergency", clinicId: C.dental, name: "Emergency Exam", description: "Tooth pain, swelling or a broken tooth.", duration: 30, patientType: "both", providerIds: ["p_patel", "p_okafor"], operatoryIds: ["op_d1", "op_d2", "op_d3"], color: "#b91c1c", estimatedValue: 180, visibility: "online", active: true, noticeOverrideHours: 0, questions: [q("rq_tooth", "Which tooth is hurting?", "dropdown", ["Upper left", "Upper right", "Lower left", "Lower right", "Not sure"], true), q("rq_swelling", "Is there any swelling?", "radio", ["Yes", "No"])] },
    { id: "r_d_cleaning", clinicId: C.dental, name: "Teeth Cleaning", description: "Routine hygiene visit for existing patients.", duration: 45, patientType: "existing", providerIds: ["p_lin", "p_reyes"], operatoryIds: ["op_h1", "op_h2"], color: "#7c3aed", estimatedValue: 140, visibility: "online", active: true },
    { id: "r_d_invisalign", clinicId: C.dental, name: "Invisalign Consultation", description: "Find out if clear aligners are right for you.", duration: 30, patientType: "new", providerIds: ["p_patel"], operatoryIds: ["op_d1", "op_d2"], color: "#0369a1", estimatedValue: 450, visibility: "online", active: true, redirectUrl: "https://brightsmile.example.com/invisalign-thanks" },
    { id: "r_d_whitening", clinicId: C.dental, name: "Teeth Whitening", description: "In-office whitening, about one hour.", duration: 60, patientType: "both", providerIds: ["p_patel", "p_okafor"], operatoryIds: ["op_d1", "op_d2", "op_d3"], color: "#ca8a04", estimatedValue: 400, visibility: "online", active: true },
    { id: "r_d_child", clinicId: C.dental, name: "Child's First Visit", description: "A gentle first visit for children under 6.", duration: 30, patientType: "new", providerIds: ["p_reyes"], operatoryIds: ["op_h2"], color: "#db2777", estimatedValue: 110, visibility: "online", active: true },
    { id: "r_d_filling", clinicId: C.dental, name: "Filling / Crown Prep", description: "Restorative visit scheduled by our team.", duration: 60, patientType: "existing", providerIds: ["p_patel", "p_okafor"], operatoryIds: ["op_d1", "op_d2", "op_d3"], color: "#475569", estimatedValue: 600, visibility: "staff_only", active: true },
  ]),
  ...reasons([
    { id: "r_p_initial", clinicId: C.physio, name: "Initial Assessment", description: "Full assessment and first treatment.", duration: 60, patientType: "new", providerIds: ["p_morgan", "p_shah"], operatoryIds: ["op_pa", "op_pb"], color: "#1d4ed8", estimatedValue: 150, visibility: "online", active: true },
    { id: "r_p_followup", clinicId: C.physio, name: "Follow-up Treatment", description: "Continue your treatment plan.", duration: 45, patientType: "existing", providerIds: ["p_morgan", "p_shah"], operatoryIds: ["op_pa", "op_pb"], color: "#047857", estimatedValue: 110, visibility: "online", active: true },
    { id: "r_p_sports", clinicId: C.physio, name: "Sports Injury Assessment", description: "Sprains, strains and overuse injuries.", duration: 60, patientType: "both", providerIds: ["p_morgan"], operatoryIds: ["op_pa"], color: "#c2410c", estimatedValue: 160, visibility: "online", active: true, questions: [q("rq_area", "Which body area is injured?", "dropdown", ["Knee", "Ankle", "Shoulder", "Back", "Hip", "Other"], true), q("rq_when", "When did the injury happen?", "date")] },
    { id: "r_p_postsurg", clinicId: C.physio, name: "Post-surgery Rehab", description: "Guided recovery after surgery.", duration: 45, patientType: "existing", providerIds: ["p_shah"], operatoryIds: ["op_pb"], color: "#6d28d9", estimatedValue: 130, visibility: "online", active: true },
    { id: "r_p_gym", clinicId: C.physio, name: "Supervised Exercise Session", description: "Small-group rehab in our gym.", duration: 30, patientType: "existing", providerIds: ["p_carter"], operatoryIds: ["op_gym"], color: "#0891b2", estimatedValue: 60, visibility: "online", active: true },
  ]),
  ...reasons([
    { id: "r_s_consult", clinicId: C.derm, name: "New Patient Skin Consultation", description: "Discuss any skin concern with a dermatologist.", duration: 45, patientType: "new", providerIds: ["p_ruiz", "p_brooks"], operatoryIds: ["op_e1", "op_e2"], color: "#6d28d9", estimatedValue: 220, visibility: "online", active: true },
    { id: "r_s_check", clinicId: C.derm, name: "Full Body Skin Check", description: "Head-to-toe mole and skin cancer screening.", duration: 30, patientType: "both", providerIds: ["p_ruiz", "p_brooks"], operatoryIds: ["op_e1", "op_e2"], color: "#0369a1", estimatedValue: 180, visibility: "online", active: true },
    { id: "r_s_acne", clinicId: C.derm, name: "Acne Treatment", description: "Treatment plans for teens and adults.", duration: 30, patientType: "both", providerIds: ["p_brooks", "p_park"], operatoryIds: ["op_e2"], color: "#be185d", estimatedValue: 150, visibility: "online", active: true },
    { id: "r_s_mole", clinicId: C.derm, name: "Mole Removal Consult", description: "Evaluate a mole for removal.", duration: 30, patientType: "both", providerIds: ["p_ruiz"], operatoryIds: ["op_proc"], color: "#92400e", estimatedValue: 260, visibility: "online", active: true, questions: [q("rq_mole_change", "Has the mole changed in size or color?", "radio", ["Yes", "No", "Not sure"], true)] },
    { id: "r_s_botox", clinicId: C.derm, name: "Botox Consultation", description: "Cosmetic consultation. A $50 deposit is credited to treatment.", duration: 30, patientType: "new", providerIds: ["p_brooks"], operatoryIds: ["op_proc"], color: "#0f766e", estimatedValue: 500, visibility: "online", active: true },
    { id: "r_s_followup", clinicId: C.derm, name: "Follow-up Visit", description: "Check-in on an existing treatment.", duration: 15, patientType: "existing", providerIds: ["p_ruiz", "p_brooks", "p_park"], operatoryIds: ["op_e1", "op_e2"], color: "#475569", estimatedValue: 90, visibility: "online", active: true },
  ]),
  ...reasons([
    { id: "r_r_exam", clinicId: C.riverside, name: "Dental Exam", description: "Routine exam.", duration: 45, patientType: "both", providerIds: ["p_hale"], operatoryIds: ["op_r1"], color: "#0f766e", estimatedValue: 150, visibility: "online", active: true },
  ]),
];

/** Fill in the reverse links (provider.reasonIds, operatory.providerIds/reasonIds) from reasons. */
export function linkStaff(providers: Provider[], operatories: Operatory[], reasonList: Reason[]) {
  for (const p of providers) p.reasonIds = reasonList.filter((r) => r.providerIds.includes(p.id)).map((r) => r.id);
  for (const o of operatories) {
    o.providerIds = providers.filter((p) => p.operatoryIds.includes(o.id)).map((p) => p.id);
    o.reasonIds = reasonList.filter((r) => r.operatoryIds.includes(o.id)).map((r) => r.id);
  }
}

export function buildUsers(today: Date): User[] {
  const ago = (d: number) => new Date(today.getTime() - d * 86400000 - 3600000 * 3).toISOString();
  return [
    { id: "u_super", name: "Jordan Avery", email: "jordan@kivihealth.example.com", role: "super_admin", clinicIds: [], twoFactor: true, active: true, lastLoginAt: ago(0) },
    { id: "u_super2", name: "Robin Hale", email: "robin@kivihealth.example.com", role: "super_admin", clinicIds: [], twoFactor: true, active: true, lastLoginAt: ago(4) },
    { id: "u_support", name: "Sam Rivera", email: "sam@kivihealth.example.com", role: "support_agent", clinicIds: [], twoFactor: true, active: true, lastLoginAt: ago(0) },
    { id: "u_support2", name: "Kim Osei", email: "kim@kivihealth.example.com", role: "support_agent", clinicIds: [], twoFactor: false, active: true, lastLoginAt: ago(2) },
    { id: "u_owner", name: "Olivia Chen", email: "olivia@brightsmile.example.com", role: "clinic_owner", clinicIds: [C.dental, C.physio, C.derm, C.riverside], groupId: "g_brightsmile", twoFactor: true, active: true, lastLoginAt: ago(0) },
    { id: "u_manager", name: "Marcus Lee", email: "marcus@brightsmile.example.com", role: "clinic_manager", clinicIds: [C.dental, C.physio], twoFactor: false, active: true, lastLoginAt: ago(1) },
    { id: "u_frontdesk", name: "Fiona Diaz", email: "fiona@brightsmile.example.com", role: "front_desk", clinicIds: [C.dental], twoFactor: false, active: true, lastLoginAt: ago(0) },
    { id: "u_fd_physio", name: "Theo Grant", email: "theo@motionphysio.example.com", role: "front_desk", clinicIds: [C.physio], twoFactor: false, active: true, lastLoginAt: ago(1) },
    { id: "u_mgr_derm", name: "Isla Moreno", email: "isla@clearskin.example.com", role: "clinic_manager", clinicIds: [C.derm], twoFactor: true, active: true, lastLoginAt: ago(3) },
    { id: "u_fd_derm", name: "Noah Becker", email: "noah@clearskin.example.com", role: "front_desk", clinicIds: [C.derm], twoFactor: false, active: false, lastLoginAt: ago(40) },
    { id: "u_owner_north", name: "Hugo Laine", email: "hugo@northside.example.com", role: "clinic_owner", clinicIds: [C.northside], twoFactor: false, active: false, lastLoginAt: ago(95) },
  ];
}
