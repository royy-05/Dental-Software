"use client";

import { createContext, forwardRef, useContext } from "react";
import type { Branding, WidgetTheme } from "@/types";
import { cn } from "@/lib/utils";

export interface WidgetUi {
  branding: Branding;
  theme: WidgetTheme;
  /** Force the narrow (phone) layout, e.g. in the builder's mobile preview. */
  mobile: boolean;
}

const Ctx = createContext<WidgetUi | null>(null);
export const WidgetUiProvider = Ctx.Provider;

export function useWidgetUi(): WidgetUi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWidgetUi outside widget");
  return v;
}

/** Responsive class helper: drop breakpoint classes when the mobile layout is forced. */
export function useR() {
  const { mobile } = useWidgetUi();
  return (base: string, wide?: string) => cn(base, !mobile && wide);
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost"; size?: "md" | "lg" | "sm" };

/** Buttons painted with the clinic's primary / secondary colours. */
export const BrandButton = forwardRef<HTMLButtonElement, BtnProps>(function BrandButton({ variant = "primary", size = "md", className, style, ...props }, ref) {
  const { branding } = useWidgetUi();
  const s: React.CSSProperties =
    variant === "primary"
      ? { backgroundColor: branding.primaryColor, color: "#fff" }
      : variant === "secondary"
        ? { backgroundColor: branding.secondaryColor, color: branding.primaryColor, borderColor: branding.primaryColor }
        : { color: branding.primaryColor };
  return (
    <button
      ref={ref}
      style={{ ...s, ...style }}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4",
        variant === "primary" && "hover:brightness-110",
        variant === "secondary" && "border hover:brightness-95",
        variant === "ghost" && "underline-offset-4 hover:underline",
        size === "lg" && "h-12 px-6 text-base",
        size === "md" && "h-11 px-5 text-sm",
        size === "sm" && "h-9 px-3 text-sm",
        className,
      )}
      {...props}
    />
  );
});
