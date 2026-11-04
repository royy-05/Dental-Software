"use client";

import { useState } from "react";
import { CreditCard, Globe } from "lucide-react";
import type { Clinic } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, SettingsCard, ToggleRow, useSaveClinic } from "./common";

const FEED_BADGE = { healthy: "success", warning: "warning", error: "danger", off: "muted" } as const;

export function RwgSettings({ clinic }: { clinic: Clinic }) {
  const save = useSaveClinic();
  const [enabled, setEnabled] = useState(clinic.rwg.enabled);
  const [url, setUrl] = useState(clinic.rwg.websiteUrl);
  const urlError = enabled && !/^https?:\/\/\S+\.\S+/.test(url) ? "Reserve with Google needs your website URL" : undefined;
  return (
    <SettingsCard
      title="Reserve with Google"
      description="Let patients book from Google Search and Maps. Live feeds need Google partner approval (later phase); this prototype simulates the feed."
      footer={
        <Button
          disabled={!!urlError}
          onClick={() =>
            save(`${enabled ? "Enabled" : "Disabled"} Reserve with Google`, (c) => {
              c.rwg.enabled = enabled;
              c.rwg.websiteUrl = url;
              c.rwg.feedStatus = enabled ? (c.rwg.feedStatus === "off" ? "healthy" : c.rwg.feedStatus) : "off";
            })
          }
        >
          Save
        </Button>
      }
    >
      <ToggleRow id="rwg-on" label="Reserve with Google" checked={enabled} onChange={setEnabled} />
      <div className="grid gap-1.5">
        <Label htmlFor="rwg-url">Website URL</Label>
        <Input id="rwg-url" type="url" value={url} aria-invalid={!!urlError} onChange={(e) => setUrl(e.target.value.trim())} />
        <FieldError msg={urlError} />
      </div>
      <p className="text-sm">
        Feed status: <Badge variant={FEED_BADGE[clinic.rwg.feedStatus]} className="capitalize">{clinic.rwg.feedStatus}</Badge>
      </p>
    </SettingsCard>
  );
}

export function PaymentSettings({ clinic }: { clinic: Clinic }) {
  return (
    <SettingsCard title="Payment" description="Deposits and paid appointments through Stripe.">
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled aria-describedby="stripe-later">
          <CreditCard /> Connect Stripe
        </Button>
        <Badge variant="muted">{clinic.settings.payment.stripeConnected ? "Connected" : "Not connected"}</Badge>
      </div>
      <p id="stripe-later" className="text-sm text-muted-foreground">
        Stripe connect arrives in a later phase. Until then use the “paid appointment note” in the booking flow to tell patients about deposits.
      </p>
    </SettingsCard>
  );
}

export function DomainSettings({ clinic }: { clinic: Clinic }) {
  const save = useSaveClinic();
  const [domain, setDomain] = useState(clinic.customDomain ?? "");
  const err = domain && !/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain) ? "Enter a domain like book.yourpractice.com" : undefined;
  return (
    <SettingsCard
      title="Custom domain"
      description="Serve your booking page from your own domain."
      footer={
        <Button disabled={!!err} onClick={() => save("Updated custom domain", (c) => void (c.customDomain = domain || undefined))}>
          Save
        </Button>
      }
    >
      <div className="grid gap-1.5">
        <Label htmlFor="cd-domain">Domain</Label>
        <Input id="cd-domain" placeholder="book.yourpractice.com" value={domain} aria-invalid={!!err} onChange={(e) => setDomain(e.target.value.trim().toLowerCase())} />
        <FieldError msg={err} />
      </div>
      {domain && !err && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="flex items-center gap-1 font-medium">
            <Globe className="h-4 w-4" aria-hidden /> DNS record to add
          </p>
          <p className="mt-1 font-mono text-xs">
            CNAME {domain} → clinics.kivihealth.example.com
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Prototype: DNS is not checked. Status shows as pending verification.</p>
        </div>
      )}
    </SettingsCard>
  );
}
