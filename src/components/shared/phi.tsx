"use client";

import { useApp } from "@/store/app";

/**
 * Wrap any patient name, phone number or email. When the Hide PHI switch is on it
 * renders a fixed mask so nothing leaks in screen shares (spec section 2).
 */
export function Phi({ children, className }: { children: React.ReactNode; className?: string }) {
  const hide = useApp((s) => s.session.hidePhi);
  if (!hide) return <span className={className}>{children}</span>;
  return (
    <span className={className} aria-label="Hidden (PHI)" title="Hidden while Hide PHI is on">
      <span aria-hidden className="tracking-widest text-muted-foreground">••••••</span>
    </span>
  );
}

export function usePhiText() {
  const hide = useApp((s) => s.session.hidePhi);
  return (s: string | undefined | null) => (hide ? "••••••" : (s ?? ""));
}
