import { format } from "date-fns";

export interface CalendarEvent {
  title: string;
  start: Date; // clinic wall-clock
  end: Date;
  location: string;
  description: string;
  uid: string;
}

const icsDate = (d: Date) => format(d, "yyyyMMdd'T'HHmmss");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\;");

/** iCalendar file. Times are floating (clinic local), which calendar apps show at the clinic's wall-clock time. */
export function buildIcs(e: CalendarEvent): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kivi Health//Booking//EN",
    "BEGIN:VEVENT",
    `UID:${e.uid}@kivihealth.example.com`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(e.start)}`,
    `DTEND:${icsDate(e.end)}`,
    `SUMMARY:${esc(e.title)}`,
    `LOCATION:${esc(e.location)}`,
    `DESCRIPTION:${esc(e.description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function googleCalendarUrl(e: CalendarEvent, timeZone: string): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${icsDate(e.start)}/${icsDate(e.end)}`,
    ctz: timeZone,
    location: e.location,
    details: e.description,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

export function directionsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
