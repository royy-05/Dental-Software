"use client";

import { useEffect } from "react";
import { useApp } from "@/store/app";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

/** Rehydrates the persisted demo store from localStorage once on the client. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const done = () => useApp.getState().setHydrated();
    const unsub = useApp.persist.onFinishHydration(done);
    Promise.resolve(useApp.persist.rehydrate()).finally(done);
    return unsub;
  }, []);
  return (
    <TooltipProvider delayDuration={200}>
      {children}
      <Toaster richColors position="top-right" closeButton />
    </TooltipProvider>
  );
}

export function useHydrated() {
  return useApp((s) => s.hydrated);
}
