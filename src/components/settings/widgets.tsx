"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import type { Clinic } from "@/types";
import { useApp } from "@/store/app";
import { embedSnippets } from "@/components/widget/embed-code";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { copyText, FieldError, SettingsCard, useSaveClinic } from "./common";

export function useOrigin() {
  const [origin, setOrigin] = useState("https://book.kivihealth.example.com");
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}

export function WidgetSettings({ clinic }: { clinic: Clinic }) {
  const save = useSaveClinic();
  const clinics = useApp((s) => s.db.clinics);
  const origin = useOrigin();
  const [slug, setSlug] = useState(clinic.settings.widget.customSlug ?? "");
  const [redirectUrl, setRedirectUrl] = useState(clinic.settings.widget.redirectUrl ?? "");
  const [delay, setDelay] = useState(clinic.settings.widget.redirectDelaySec);
  const snippets = useMemo(() => embedSnippets(clinic, origin), [clinic, origin]);

  const slugError = useMemo(() => {
    if (!slug) return undefined;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return "Use lowercase letters, numbers and single hyphens.";
    if (clinics.some((c) => c.id !== clinic.id && (c.slug === slug || c.settings.widget.customSlug === slug))) return "That slug is already used by another clinic.";
    return undefined;
  }, [slug, clinics, clinic.id]);
  const urlError = redirectUrl && !/^https?:\/\/\S+\.\S+/.test(redirectUrl) ? "Enter a full URL starting with https://" : undefined;

  return (
    <div className="grid gap-6">
      <SettingsCard
        title="Booking link"
        description="Share this link anywhere, or add ?referrer_id= to track a source."
        footer={
          <Button
            disabled={!!slugError}
            onClick={() =>
              save("Updated booking slug", (c) => {
                c.settings.widget.customSlug = slug || undefined;
              })
            }
          >
            Save link
          </Button>
        }
      >
        <div className="grid gap-1.5">
          <Label htmlFor="w-default">Default link</Label>
          <div className="flex gap-2">
            <Input id="w-default" readOnly value={`${origin}/book/${clinic.slug}`} />
            <Button variant="outline" size="icon" aria-label="Copy default link" onClick={() => copyText(`${origin}/book/${clinic.slug}`, "Link copied")}>
              <Copy />
            </Button>
            <Button variant="outline" size="icon" asChild aria-label="Open booking page">
              <a href={`/book/${clinic.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink />
              </a>
            </Button>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="w-slug">Custom slug</Label>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{origin}/book/</span>
            <Input id="w-slug" placeholder={clinic.slug} value={slug} aria-invalid={!!slugError} aria-describedby="w-slug-help" onChange={(e) => setSlug(e.target.value.trim().toLowerCase())} />
          </div>
          <p id="w-slug-help" className="text-xs text-muted-foreground">
            Optional. When set, embed code uses the custom slug. Prototype note: the hosted page still resolves by the default slug.
          </p>
          <FieldError msg={slugError} />
        </div>
      </SettingsCard>

      <SettingsCard title="Website embed code" description="Paste one of these into your website. Bookings from the embed are tracked as Website (referrer 4).">
        <Tabs defaultValue="inline">
          <TabsList>
            <TabsTrigger value="inline">Inline</TabsTrigger>
            <TabsTrigger value="popup">Popup</TabsTrigger>
            <TabsTrigger value="floating">Floating button</TabsTrigger>
          </TabsList>
          {(["inline", "popup", "floating"] as const).map((k) => (
            <TabsContent key={k} value={k} className="grid gap-2">
              <pre className="max-h-56 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
                <code>{snippets[k]}</code>
              </pre>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => copyText(snippets[k], "Embed code copied")}>
                  <Copy /> Copy code
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <a href="/embed-demo" target="_blank" rel="noreferrer">
                    See it on a demo site <ExternalLink />
                  </a>
                </Button>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </SettingsCard>

      <SettingsCard
        title="After booking"
        description="Show the default confirmation page, or send patients to your own thank-you page (useful for Google Ads, GA4 and Meta conversion tags). Referrer and reason redirect URLs take priority."
        footer={
          <Button
            disabled={!!urlError}
            onClick={() =>
              save("Updated after-booking redirect", (c) => {
                c.settings.widget.redirectUrl = redirectUrl || undefined;
                c.settings.widget.redirectDelaySec = delay;
              })
            }
          >
            Save
          </Button>
        }
      >
        <div className="grid gap-1.5">
          <Label htmlFor="w-redirect">Redirect URL (leave empty for the default confirmation page)</Label>
          <Input id="w-redirect" type="url" placeholder="https://yourpractice.com/thank-you" value={redirectUrl} aria-invalid={!!urlError} onChange={(e) => setRedirectUrl(e.target.value.trim())} />
          <FieldError msg={urlError} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="w-delay">Redirect delay: {delay} seconds</Label>
          <input id="w-delay" type="range" min={0} max={20} step={1} value={delay} onChange={(e) => setDelay(Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]" aria-valuetext={`${delay} seconds`} />
          <p className="text-xs text-muted-foreground">0 to 20 seconds. The confirmation details show during the delay.</p>
        </div>
      </SettingsCard>
    </div>
  );
}
