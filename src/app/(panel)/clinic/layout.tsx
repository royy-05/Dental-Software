import { ClinicShell } from "@/components/clinic/shell";
import { IdleTimeout } from "@/components/shared/idle-timeout";

export default function ClinicLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClinicShell>
      <IdleTimeout />
      {children}
    </ClinicShell>
  );
}
