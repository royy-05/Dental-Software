import type { Specialty } from "@/types";

/** Input of the add-clinic wizard (6.2). Posted to POST /api/admin/clinics, which creates the clinic server-side. */
export interface NewClinicInput {
  name: string;
  slug: string;
  specialty: Specialty;
  timeZone: string;
  phone: string;
  email: string;
  address: string;
  planId: string;
  trial: boolean;
  owner: { mode: "existing"; userId: string } | { mode: "invite"; name: string; email: string };
  starterTemplateId?: string;
  importReasons: Record<string, string>[];
  importProviders: Record<string, string>[];
}

export const TIME_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];
