"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { signOut } from "next-auth/react";
import { IDLE_TIMEOUT_MS } from "@/server/auth/session-constants";

/**
 * Client side of the 30-minute idle timeout (section 8). The server revokes an unused session after 30 minutes;
 * this mirrors it in the browser so a screen left open does not keep showing patient data. Any user activity
 * (pointer, keyboard, scroll, visibility) resets the timer; background polls do not count.
 */
export function IdleTimeout() {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const expire = async () => {
      qc.clear();
      await signOut({ redirectTo: `/login?reason=expired&next=${encodeURIComponent(window.location.pathname + window.location.search)}` });
    };
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(expire, IDLE_TIMEOUT_MS);
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    document.addEventListener("visibilitychange", reset);
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      document.removeEventListener("visibilitychange", reset);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [qc]);
  return null;
}
