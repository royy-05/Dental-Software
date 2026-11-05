"use client";

import { useMemo } from "react";
import { useAppointments, useClinicConfig, type AppointmentWindow } from "@/lib/api/clinic";
import { useClinicBundle, useClinicId } from "@/lib/api/session";
import { nowInZone } from "@/lib/time";

/**
 * Everything the appointments/home screens need for the clinic selected in the top bar: the configuration
 * bundle (reasons, providers, operatories, referrers, insurances, flow) plus the appointments in a date window
 * (default 60 days back, 90 days ahead). Lists are filtered client-side inside that window, as in Phase 1.
 */
export function useClinicData(window: AppointmentWindow = {}) {
  const clinicId = useClinicId();
  const bundle = useClinicBundle();
  const cfg = useClinicConfig();
  const appts = useAppointments(window);
  const clinic = bundle.data?.clinic;
  const config = cfg.config;
  const appointments = appts.data;

  return useMemo(() => {
    const providers = config.providers;
    const reasons = [...config.reasons].sort((a, b) => a.order - b.order);
    const providerName = (id: string) => providers.find((p) => p.id === id)?.displayName ?? "Unknown";
    const reasonName = (id: string) => reasons.find((r) => r.id === id)?.name ?? "Unknown";
    return {
      clinicId,
      clinic,
      providers,
      reasons,
      appointments: appointments ?? [],
      referrers: config.referrers,
      flow: config.flow,
      insurances: config.insurances,
      operatories: config.operatories,
      providerName,
      reasonName,
      clinicNow: () => (clinic ? nowInZone(clinic.timeZone) : new Date()),
      isLoading: bundle.isLoading || cfg.isLoading || appts.isLoading,
      isError: bundle.isError || cfg.isError || appts.isError,
      refetch: () => Promise.all([bundle.refetch(), cfg.refetch(), appts.refetch()]),
    };
  }, [clinicId, clinic, config, appointments, bundle, cfg, appts]);
}

export type ClinicData = ReturnType<typeof useClinicData>;
