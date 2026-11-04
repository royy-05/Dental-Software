"use client";

import { useMemo } from "react";
import { useApp } from "@/store/app";
import { nowInZone } from "@/lib/time";

/** Everything the appointments/home screens need for the clinic selected in the top bar. */
export function useClinicData() {
  const clinicId = useApp((s) => s.session.clinicId);
  const clinics = useApp((s) => s.db.clinics);
  const providersAll = useApp((s) => s.db.providers);
  const reasonsAll = useApp((s) => s.db.reasons);
  const appointmentsAll = useApp((s) => s.db.appointments);
  const referrersAll = useApp((s) => s.db.referrers);
  const flows = useApp((s) => s.db.flows);
  const insurancesAll = useApp((s) => s.db.clinicInsurances);
  const operatoriesAll = useApp((s) => s.db.operatories);

  return useMemo(() => {
    const clinic = clinics.find((c) => c.id === clinicId);
    const providers = providersAll.filter((p) => p.clinicId === clinicId);
    const reasons = reasonsAll.filter((r) => r.clinicId === clinicId).sort((a, b) => a.order - b.order);
    const appointments = appointmentsAll.filter((a) => a.clinicId === clinicId);
    const referrers = referrersAll.filter((r) => r.clinicId === clinicId);
    const flow = flows.find((f) => f.clinicId === clinicId);
    const insurances = insurancesAll.filter((i) => i.clinicId === clinicId);
    const operatories = operatoriesAll.filter((o) => o.clinicId === clinicId);
    const providerName = (id: string) => providers.find((p) => p.id === id)?.displayName ?? "Unknown";
    const reasonName = (id: string) => reasons.find((r) => r.id === id)?.name ?? "Unknown";
    return {
      clinicId,
      clinic,
      providers,
      reasons,
      appointments,
      referrers,
      flow,
      insurances,
      operatories,
      providerName,
      reasonName,
      clinicNow: () => (clinic ? nowInZone(clinic.timeZone) : new Date()),
    };
  }, [clinicId, clinics, providersAll, reasonsAll, appointmentsAll, referrersAll, flows, insurancesAll, operatoriesAll]);
}

export type ClinicData = ReturnType<typeof useClinicData>;
