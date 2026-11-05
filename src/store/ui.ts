"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * UI-only state (Zustand). Server data lives in TanStack Query (src/lib/api). Persisted per browser:
 * the clinic picked in the top bar and the Hide PHI switch. Contains no patient data.
 */
interface UiState {
  clinicId?: string;
  hidePhi: boolean;
  setClinicId: (id: string | undefined) => void;
  setHidePhi: (v: boolean) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      clinicId: undefined,
      hidePhi: false,
      setClinicId: (clinicId) => set({ clinicId }),
      setHidePhi: (hidePhi) => set({ hidePhi }),
    }),
    { name: "kivi-ui", version: 1, storage: createJSONStorage(() => localStorage) },
  ),
);
