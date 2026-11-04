"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ExternalLink, Phone } from "lucide-react";
import { toast } from "sonner";
import type { Clinic, WidgetTheme } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { FieldError, SettingsCard, useSaveClinic } from "./common";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #0f766e");
const schema = z.object({
  name: z.string().trim().min(2, "Practice name is required"),
  phone: z.string().trim().min(7, "Enter a phone number"),
  email: z.string().trim().email("Enter a valid email"),
  address: z.string().trim().min(5, "Enter the address"),
  description: z.string().max(300, "Keep it under 300 characters"),
  logoUrl: z.string().optional(),
  theme: z.enum(["compact", "full_page", "reason_first"]),
  headerColor: hex,
  primaryColor: hex,
  secondaryColor: hex,
});
type Values = z.infer<typeof schema>;

const THEMES: { value: WidgetTheme; label: string; body: string }[] = [
  { value: "compact", label: "Compact", body: "Single card, ideal for embeds and small screens." },
  { value: "full_page", label: "Full Page", body: "Branded header with a booking summary sidebar." },
  { value: "reason_first", label: "Reason First", body: "Large reason cards up front, then the rest." },
];

/** Relative luminance contrast vs white, to warn when a color fails WCAG AA for button text. */
function contrastWithWhite(color: string): number {
  const c = color.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return Math.round((1.05 / (l + 0.05)) * 10) / 10;
}

export function AppearanceSettings({ clinic }: { clinic: Clinic }) {
  const save = useSaveClinic();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: clinic.name,
      phone: clinic.phone,
      email: clinic.email,
      address: clinic.address,
      description: clinic.description,
      logoUrl: clinic.branding.logoUrl ?? "",
      theme: clinic.branding.theme,
      headerColor: clinic.branding.headerColor,
      primaryColor: clinic.branding.primaryColor,
      secondaryColor: clinic.branding.secondaryColor,
    },
  });
  const v = form.watch();
  const e = form.formState.errors;
  const contrast = /^#[0-9a-fA-F]{6}$/.test(v.primaryColor) ? contrastWithWhite(v.primaryColor) : 0;

  const onSubmit = (d: Values) =>
    save("Updated appearance", (c) => {
      c.name = d.name;
      c.phone = d.phone;
      c.email = d.email;
      c.address = d.address;
      c.description = d.description;
      c.branding = { ...c.branding, logoUrl: d.logoUrl || undefined, theme: d.theme, headerColor: d.headerColor, primaryColor: d.primaryColor, secondaryColor: d.secondaryColor };
    });

  const onLogo = (file?: File) => {
    if (!file) return;
    if (file.size > 200_000) {
      toast.error("Logo must be under 200 KB in the prototype (it's stored in your browser).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => form.setValue("logoUrl", String(reader.result), { shouldDirty: true });
    reader.readAsDataURL(file);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <SettingsCard
        title="Appearance"
        description="Practice details and branding shown on your booking page."
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => form.reset()}>
              Discard
            </Button>
            <Button type="submit">Save appearance</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="ap-name">Practice name</Label>
            <Input id="ap-name" aria-invalid={!!e.name} {...form.register("name")} />
            <FieldError msg={e.name?.message} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ap-phone">Phone</Label>
            <Input id="ap-phone" type="tel" aria-invalid={!!e.phone} {...form.register("phone")} />
            <FieldError msg={e.phone?.message} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ap-email">Email</Label>
            <Input id="ap-email" type="email" aria-invalid={!!e.email} {...form.register("email")} />
            <FieldError msg={e.email?.message} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="ap-address">Address</Label>
            <Input id="ap-address" aria-invalid={!!e.address} {...form.register("address")} />
            <FieldError msg={e.address?.message} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="ap-desc">Description</Label>
            <Textarea id="ap-desc" rows={2} aria-invalid={!!e.description} {...form.register("description")} />
            <FieldError msg={e.description?.message} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="ap-logo">Logo</Label>
            <div className="flex flex-wrap items-center gap-3">
              {v.logoUrl ? <img src={v.logoUrl} alt="Current logo" className="h-10 w-auto rounded border bg-white p-1" /> : <span className="text-xs text-muted-foreground">No logo, the practice initial is shown.</span>}
              <Input id="ap-logo" type="file" accept="image/*" className="max-w-xs" onChange={(ev) => onLogo(ev.target.files?.[0])} />
              {v.logoUrl && (
                <Button type="button" variant="ghost" size="sm" onClick={() => form.setValue("logoUrl", "", { shouldDirty: true })}>
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Theme</legend>
          <RadioGroup value={v.theme} onValueChange={(t) => form.setValue("theme", t as WidgetTheme, { shouldDirty: true })} className="grid gap-2 sm:grid-cols-3">
            {THEMES.map((t) => (
              <label key={t.value} htmlFor={`theme-${t.value}`} className={cn("flex cursor-pointer gap-2 rounded-md border p-3", v.theme === t.value && "border-primary bg-secondary/40")}>
                <RadioGroupItem id={`theme-${t.value}`} value={t.value} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">{t.label}</span>
                  <span className="block text-xs text-muted-foreground">{t.body}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ["headerColor", "Header color"],
              ["primaryColor", "Primary button color"],
              ["secondaryColor", "Secondary button color"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="grid gap-1.5">
              <Label htmlFor={`ap-${key}`}>{label}</Label>
              <div className="flex gap-2">
                <input type="color" aria-label={`${label} picker`} className="h-10 w-12 cursor-pointer rounded border bg-card" value={/^#[0-9a-fA-F]{6}$/.test(v[key]) ? v[key] : "#000000"} onChange={(ev) => form.setValue(key, ev.target.value, { shouldDirty: true, shouldValidate: true })} />
                <Input id={`ap-${key}`} aria-invalid={!!e[key]} {...form.register(key)} />
              </div>
              <FieldError msg={e[key]?.message} />
            </div>
          ))}
        </div>
        {contrast > 0 && contrast < 4.5 && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-950">
            White text on this primary color has a contrast ratio of {contrast}:1, below the WCAG AA minimum of 4.5:1. Choose a darker color.
          </p>
        )}
      </SettingsCard>

      <div className="grid content-start gap-3">
        <p className="text-sm font-medium">Live preview</p>
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm" aria-label="Booking page preview">
          <div className="flex items-center gap-2 px-4 py-3 text-white" style={{ backgroundColor: v.headerColor }}>
            {v.logoUrl ? (
              <img src={v.logoUrl} alt="" className="h-8 w-8 rounded bg-white object-contain p-0.5" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded bg-white/20 font-bold">{v.name.charAt(0)}</span>
            )}
            <span className="font-semibold">{v.name || "Practice name"}</span>
          </div>
          <div className="grid gap-3 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{THEMES.find((t) => t.value === v.theme)?.label} theme</p>
            <p className="font-semibold text-slate-900">Reason for visit</p>
            {["New patient exam", "Emergency visit"].map((r, i) => (
              <div key={r} className="rounded-lg border p-3 text-sm" style={i === 0 ? { borderColor: v.primaryColor, backgroundColor: v.secondaryColor } : undefined}>
                {r}
              </div>
            ))}
            <div className="flex gap-2">
              <span className="rounded-md px-3 py-2 text-sm font-medium" style={{ backgroundColor: v.secondaryColor, color: "#0f172a" }}>
                Back
              </span>
              <span className="flex-1 rounded-md px-3 py-2 text-center text-sm font-medium text-white" style={{ backgroundColor: v.primaryColor }}>
                Continue
              </span>
            </div>
            <p className="flex items-center gap-1 border-t pt-2 text-[11px] text-slate-500">
              <Phone className="h-3 w-3" aria-hidden /> {v.phone} · {v.address}
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/book/${clinic.settings.widget.customSlug || clinic.slug}?theme=${v.theme}`} target="_blank">
            Open booking page <ExternalLink />
          </Link>
        </Button>
        <p className="text-xs text-muted-foreground">The full page shows saved settings. Save first to see changes there.</p>
      </div>
    </form>
  );
}
