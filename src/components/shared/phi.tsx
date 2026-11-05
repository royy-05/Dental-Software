"use client";

import { useUi } from "@/store/ui";

/**
 * Wrap any patient name, phone number or email. When the Hide PHI switch is on it
 * renders a fixed mask so nothing leaks in screen shares (spec section 2).
 */
export function Phi({ children, className }: { children: React.ReactNode; className?: string }) {
  const hide = useUi((s) => s.hidePhi);
  if (!hide) return <span className={className}>{children}</span>;
  return (
    <span className={className} aria-label="Hidden (PHI)" title="Hidden while Hide PHI is on">
      <span aria-hidden className="tracking-widest text-muted-foreground">••••••</span>
    </span>
  );
}

export function usePhiText() {
  const hide = useUi((s) => s.hidePhi);
  return (s: string | undefined | null) => (hide ? "••••••" : (s ?? ""));
}
