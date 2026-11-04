import Link from "next/link";
import { ArrowRight, Building2, CalendarCheck, Code2, ShieldCheck } from "lucide-react";
import { CLINIC_IDS } from "@/mock/clinics";

const LINKS = [
  { href: "/login", title: "Log in (role switcher)", body: "Try the clinic panel or super admin panel as any of the five staff roles.", icon: ShieldCheck },
  { href: "/book/bright-smile-dental", title: "Patient booking widget", body: "Bright Smile Dental (Full Page theme). Also try the physio and dermatology clinics below.", icon: CalendarCheck },
  { href: "/embed-demo", title: "Website embed demo", body: "Inline, popup and floating “Book Online” button modes.", icon: Code2 },
  { href: "/admin", title: "Super admin panel", body: "Clinics, plans, feature flags, messaging, support desk and the demo reset button.", icon: Building2 },
];

export default function Home() {
  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-12">
      <p className="text-sm font-semibold uppercase tracking-wider text-primary">Phase 1 · Clickable prototype</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Kivi Health Booking Platform</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Multi-clinic appointment booking with a patient widget, a clinic panel and a super admin panel. Everything runs in your
        browser on fake demo data saved to localStorage. No real patient data is used.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="group rounded-lg border bg-card p-5 shadow-sm transition hover:border-primary hover:shadow-md">
            <l.icon className="h-6 w-6 text-primary" aria-hidden />
            <h2 className="mt-3 flex items-center gap-1 font-semibold">
              {l.title} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{l.body}</p>
          </Link>
        ))}
      </div>
      <h2 className="mt-10 font-semibold">Demo booking links</h2>
      <ul className="mt-2 space-y-1 text-sm">
        <li><Link className="text-primary underline" href="/book/bright-smile-dental?referrer_id=1&utm_source=google&utm_medium=cpc&utm_campaign=demo&gclid=TEST123">Bright Smile Dental via Google Ads (referrer 1, UTM, gclid)</Link></li>
        <li><Link className="text-primary underline" href="/book/motion-physio?referrer_id=2">Motion Physio &amp; Rehab (Compact theme, provider step on)</Link></li>
        <li><Link className="text-primary underline" href="/book/clearskin-derm?referrer_id=5&fbclid=FBTEST">Clear Skin Dermatology (Reason First theme)</Link></li>
      </ul>
      <p className="mt-10 text-xs text-muted-foreground">Clinic ids: {Object.values(CLINIC_IDS).join(", ")}</p>
    </main>
  );
}
