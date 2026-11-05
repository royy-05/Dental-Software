import { z } from "zod";
import { zDay, zStatus } from "@/lib/schemas";
import { wallToDb } from "../mappers";

/** Query shape shared by the appointment list and the CSV export. */
export const listQuery = z.object({
  /** Appointment-date window (clinic wall-clock days, inclusive). Defaults to 60 days back and 90 days ahead. */
  from: zDay.optional(),
  to: zDay.optional(),
  status: zStatus.optional(),
  providerId: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(5000),
});

export function windowFor(q: { from?: string; to?: string }) {
  const now = new Date();
  const from = q.from ?? new Date(now.getTime() - 60 * 86400000).toISOString().slice(0, 10);
  const to = q.to ?? new Date(now.getTime() + 90 * 86400000).toISOString().slice(0, 10);
  return { gte: wallToDb(`${from}T00:00`), lt: wallToDb(`${to}T23:59`) };
}
