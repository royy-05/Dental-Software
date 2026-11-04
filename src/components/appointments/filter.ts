import type { Appointment, AppointmentStatus, PatientType, Source } from "@/types";

export interface ApptFilters {
  q: string;
  status: AppointmentStatus | "all";
  providerId: string | "all";
  reasonId: string | "all";
  source: Source | "all";
  patientType: PatientType | "all";
  from?: string; // YYYY-MM-DD (appointment date)
  to?: string;
}

export const EMPTY_FILTERS: ApptFilters = { q: "", status: "all", providerId: "all", reasonId: "all", source: "all", patientType: "all" };

export type ApptTab = "appointments" | "declined";
export type SortKey = "createdAt" | "patientType" | "provider" | "patient" | "reason" | "source" | "start" | "status";
export type SortDir = "asc" | "desc";

const digits = (s: string) => s.replace(/\D/g, "");

export function matchesSearch(a: Appointment, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  const name = `${a.patient.firstName} ${a.patient.lastName}`.toLowerCase();
  if (name.includes(t) || a.patient.email.toLowerCase().includes(t)) return true;
  const d = digits(t);
  return d.length >= 3 && digits(a.patient.phone).includes(d);
}

export function filterAppointments(list: Appointment[], f: ApptFilters, tab: ApptTab): Appointment[] {
  return list.filter((a) => {
    if (tab === "declined" ? a.status !== "declined" : a.status === "declined") return false;
    if (f.status !== "all" && a.status !== f.status) return false;
    if (f.providerId !== "all" && a.providerId !== f.providerId) return false;
    if (f.reasonId !== "all" && a.reasonId !== f.reasonId) return false;
    if (f.source !== "all" && a.source !== f.source) return false;
    if (f.patientType !== "all" && a.patientType !== f.patientType) return false;
    const day = a.start.slice(0, 10);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    return matchesSearch(a, f.q);
  });
}

export function sortAppointments(
  list: Appointment[],
  key: SortKey,
  dir: SortDir,
  names: { provider: (id: string) => string; reason: (id: string) => string },
): Appointment[] {
  const val = (a: Appointment): string => {
    switch (key) {
      case "createdAt":
        return a.createdAt;
      case "start":
        return a.start;
      case "provider":
        return names.provider(a.providerId);
      case "reason":
        return names.reason(a.reasonId);
      case "patient":
        return `${a.patient.lastName} ${a.patient.firstName}`;
      default:
        return String(a[key]);
    }
  };
  const sorted = [...list].sort((x, y) => val(x).localeCompare(val(y)));
  return dir === "asc" ? sorted : sorted.reverse();
}

export function paginate<T>(list: T[], page: number, size: number): { rows: T[]; pages: number; page: number } {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const p = Math.min(Math.max(1, page), pages);
  return { rows: list.slice((p - 1) * size, p * size), pages, page: p };
}
