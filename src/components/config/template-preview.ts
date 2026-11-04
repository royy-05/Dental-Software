import type { Appointment } from "@/types";

/** Escape HTML, then render the tiny markup used by the template toolbar: **bold**, _italic_, [text](url). */
export function renderRichText(src: string): string {
  const esc = src.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return esc
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_(.+?)_(?=[\s).,!?]|$)/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline text-primary">$1</a>')
    .replace(/\n/g, "<br />");
}

/** Strip the toolbar markup for SMS (plain text only). */
export function stripRichText(src: string): string {
  return src.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(^|[\s(])_(.+?)_(?=[\s).,!?]|$)/g, "$1$2").replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 $2");
}

/** Insert text at a textarea selection, returning the new value and caret position. */
export function insertAt(value: string, start: number, end: number, text: string): { value: string; caret: number } {
  return { value: value.slice(0, start) + text + value.slice(end), caret: start + text.length };
}

/** Wrap the selection with markers (e.g. ** for bold). */
export function wrapSelection(value: string, start: number, end: number, before: string, after = before, placeholder = "text") {
  const sel = value.slice(start, end) || placeholder;
  return { value: value.slice(0, start) + before + sel + after + value.slice(end), caret: start + before.length + sel.length + after.length };
}

/** A fake appointment used to preview templates. Contains no real data. */
export function sampleAppointment(clinicId: string, reasonId: string, providerId: string, start: string): Appointment {
  return {
    id: "sample",
    clinicId,
    createdAt: new Date().toISOString(),
    start,
    end: start,
    reasonId,
    providerId,
    patientType: "new",
    patient: { firstName: "Alex", lastName: "Sample", dob: "1990-01-01", phone: "(555) 0100-0000", email: "alex.sample@example.com" },
    bookingForSomeoneElse: false,
    insurance: { hasInsurance: false },
    answers: {},
    files: [],
    source: "website",
    utm: {},
    status: "unconfirmed",
    statusHistory: [],
    notes: [],
    smsConsent: { given: true },
    bookedBy: "patient",
    token: "sample-token",
  };
}
