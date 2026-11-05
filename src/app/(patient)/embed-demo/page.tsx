"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Check, Copy, X } from "lucide-react";
import { toast } from "sonner";
import { usePublicClinic } from "@/lib/api/public";
import { LoadingState } from "@/components/shared/states";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { embedSnippets } from "@/components/widget/embed-code";

const DEMO_CLINICS = [
  { slug: "bright-smile-dental", name: "Bright Smile Dental" },
  { slug: "motion-physio", name: "Motion Physio & Rehab" },
  { slug: "clearskin-derm", name: "Clear Skin Dermatology" },
];

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative mt-3">
      <pre className="max-h-48 overflow-auto rounded-md bg-slate-900 p-3 pr-20 text-xs text-slate-100" aria-label={`${label} embed code`}>
        <code>{code}</code>
      </pre>
      <button
        type="button"
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded bg-white/15 px-2 py-1 text-xs text-white hover:bg-white/25"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
          } catch {
            /* clipboard may be blocked in iframes; still show feedback */
          }
          setCopied(true);
          toast.success(`${label} code copied`);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />} {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export default function EmbedDemoPage() {
  const [slug, setSlug] = useState(DEMO_CLINICS[0].slug);
  const bundle = usePublicClinic(slug);
  const [popup, setPopup] = useState(false);
  const [origin, setOrigin] = useState("https://book.kivihealth.example.com");
  useEffect(() => setOrigin(window.location.origin), []);

  const clinic = bundle.data?.clinic;
  if (!clinic) return <LoadingState className="mx-auto max-w-xl pt-16" />;
  const snip = embedSnippets(clinic, origin);
  const src = `/book/${clinic.slug}?embed=1&referrer_id=4`;
  const color = clinic.branding.primaryColor;

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-slate-900 px-4 py-2 text-center text-xs text-slate-200">
        Demo: a fictional clinic website showing the three embed modes. <Link href="/" className="underline">Back to prototype home</Link>
      </div>
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-4">
          <span className="text-lg font-bold" style={{ color }}>{clinic.name}</span>
          <nav aria-label="Demo site" className="hidden gap-4 text-sm text-slate-600 sm:flex">
            <span>About</span><span>Services</span><span>Contact</span>
          </nav>
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Demo clinic</span>
            <select className="h-9 rounded-md border px-2" value={slug} onChange={(e) => setSlug(e.target.value)}>
              {DEMO_CLINICS.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </label>
        </div>
      </header>
      <main id="main" className="mx-auto grid max-w-6xl gap-12 px-4 py-10">
        <section className="rounded-2xl p-8 text-white" style={{ backgroundColor: clinic.branding.headerColor }}>
          <h1 className="text-3xl font-bold">Care that fits your schedule</h1>
          <p className="mt-2 max-w-xl text-white/90">{clinic.description}</p>
          <button type="button" onClick={() => setPopup(true)} className="mt-5 rounded-lg bg-white px-5 py-3 font-semibold" style={{ color }}>
            Book Online (popup mode)
          </button>
        </section>

        <section aria-labelledby="inline-h">
          <h2 id="inline-h" className="text-xl font-semibold">1. Inline embed</h2>
          <p className="text-sm text-muted-foreground">The widget sits inside the page in an iframe.</p>
          <CodeBlock code={snip.inline} label="Inline" />
          <iframe src={src} title={`Book an appointment with ${clinic.name}`} className="mt-4 h-[780px] w-full rounded-xl border" />
        </section>

        <section aria-labelledby="popup-h">
          <h2 id="popup-h" className="text-xl font-semibold">2. Popup</h2>
          <p className="text-sm text-muted-foreground">A button opens the widget in a modal over the page.</p>
          <CodeBlock code={snip.popup} label="Popup" />
          <button type="button" onClick={() => setPopup(true)} className="mt-4 rounded-lg px-5 py-3 font-semibold text-white" style={{ backgroundColor: color }}>
            Book Online
          </button>
        </section>

        <section aria-labelledby="float-h">
          <h2 id="float-h" className="text-xl font-semibold">3. Floating “Book Online” button</h2>
          <p className="text-sm text-muted-foreground">A button fixed to the bottom-right corner of every page (see it on this page).</p>
          <CodeBlock code={snip.floating} label="Floating button" />
        </section>

        <section aria-labelledby="link-h">
          <h2 id="link-h" className="text-xl font-semibold">Hosted booking link</h2>
          <CodeBlock code={snip.link} label="Booking link" />
        </section>
      </main>

      <button
        type="button"
        onClick={() => setPopup(true)}
        aria-label={`Book Online with ${clinic.name}`}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full px-5 py-3.5 font-semibold text-white shadow-xl hover:brightness-110"
        style={{ backgroundColor: color }}
      >
        <CalendarCheck className="h-5 w-5" aria-hidden /> Book Online
      </button>

      <Dialog open={popup} onOpenChange={setPopup}>
        <DialogContent className="h-[92vh] max-w-3xl p-0 [&>button:last-child]:hidden">
          <DialogTitle className="sr-only">Book an appointment with {clinic.name}</DialogTitle>
          <button type="button" onClick={() => setPopup(false)} aria-label="Close booking" className="absolute right-2 top-2 z-10 rounded-full bg-white p-1.5 shadow">
            <X className="h-5 w-5" />
          </button>
          <iframe src={src} title={`Booking for ${clinic.name}`} className="h-full w-full rounded-lg" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
