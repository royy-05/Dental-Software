import { describe, expect, it } from "vitest";
import type { Appointment } from "@/types";
import { EMPTY_FILTERS, filterAppointments, paginate, sortAppointments } from "./filter";

function a(id: string, p: Partial<Appointment> = {}): Appointment {
  return {
    id, clinicId: "c", createdAt: `2026-11-0${id}T10:00:00Z`, start: `2026-11-1${id}T09:00`, end: `2026-11-1${id}T09:30`,
    reasonId: "r1", providerId: "p1", patientType: "new",
    patient: { firstName: "Avery", lastName: `Z${id}`, dob: "", phone: "(555) 0101-1234", email: `a${id}@example.com` },
    bookingForSomeoneElse: false, insurance: { hasInsurance: false }, answers: {}, files: [], source: "website", utm: {},
    status: "confirmed", statusHistory: [], notes: [], smsConsent: { given: true }, bookedBy: "patient", token: "t", ...p,
  };
}

const list = [a("1"), a("2", { status: "declined" }), a("3", { providerId: "p2", source: "google_ads", patientType: "existing" })];

describe("appointment filters", () => {
  it("splits Appointments and Declined tabs", () => {
    expect(filterAppointments(list, EMPTY_FILTERS, "appointments").map((x) => x.id)).toEqual(["1", "3"]);
    expect(filterAppointments(list, EMPTY_FILTERS, "declined").map((x) => x.id)).toEqual(["2"]);
  });
  it("searches name, email and phone digits", () => {
    expect(filterAppointments(list, { ...EMPTY_FILTERS, q: "z3" }, "appointments").map((x) => x.id)).toEqual(["3"]);
    expect(filterAppointments(list, { ...EMPTY_FILTERS, q: "a1@example" }, "appointments").map((x) => x.id)).toEqual(["1"]);
    expect(filterAppointments(list, { ...EMPTY_FILTERS, q: "0101 1234" }, "appointments")).toHaveLength(2);
  });
  it("filters by provider, source, patient type and date", () => {
    expect(filterAppointments(list, { ...EMPTY_FILTERS, providerId: "p2" }, "appointments")).toHaveLength(1);
    expect(filterAppointments(list, { ...EMPTY_FILTERS, source: "google_ads", patientType: "existing" }, "appointments")).toHaveLength(1);
    expect(filterAppointments(list, { ...EMPTY_FILTERS, from: "2026-11-12", to: "2026-11-13" }, "appointments").map((x) => x.id)).toEqual(["3"]);
  });
  it("sorts and paginates", () => {
    const names = { provider: (id: string) => id, reason: (id: string) => id };
    expect(sortAppointments(list, "start", "desc", names).map((x) => x.id)).toEqual(["3", "2", "1"]);
    expect(sortAppointments(list, "provider", "asc", names)[2].id).toBe("3");
    const p = paginate([1, 2, 3, 4, 5], 9, 2);
    expect(p).toEqual({ rows: [5], pages: 3, page: 3 });
  });
});
