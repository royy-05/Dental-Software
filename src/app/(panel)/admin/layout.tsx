import { AdminShell } from "@/components/admin/shell";
import { IdleTimeout } from "@/components/shared/idle-timeout";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminShell>
      <IdleTimeout />
      {children}
    </AdminShell>
  );
}
