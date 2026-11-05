"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, List } from "lucide-react";
import { RequirePermission, useCan } from "@/components/shared/guards";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppointmentsTable } from "@/components/appointments/table";
import { AppointmentsCalendar } from "@/components/appointments/calendar";
import { AppointmentDrawer } from "@/components/appointments/drawer";
import { ManualBookingDialog } from "@/components/appointments/manual-booking";
import { useClinicData } from "@/components/appointments/use-clinic-data";

function AppointmentsPage() {
  const data = useClinicData();
  const loading = data.isLoading && data.appointments.length === 0;
  const can = useCan();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openId = params.get("open");
  const [mode, setMode] = useState<"list" | "calendar">(params.get("view") === "calendar" ? "calendar" : "list");
  const declinedCount = data.appointments.filter((a) => a.status === "declined").length;

  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("open", id);
    else next.delete("open");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <>
      <PageHeader
        title="Appointments"
        description={data.clinic ? `${data.clinic.name} · all bookings, online and by phone` : undefined}
        actions={
          <>
            <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Layout">
              <Button size="sm" variant={mode === "list" ? "default" : "ghost"} className="h-8" aria-pressed={mode === "list"} onClick={() => setMode("list")}>
                <List /> Table
              </Button>
              <Button size="sm" variant={mode === "calendar" ? "default" : "ghost"} className="h-8" aria-pressed={mode === "calendar"} onClick={() => setMode("calendar")}>
                <CalendarDays /> Calendar
              </Button>
            </div>
            {can("appointments:manage") && <ManualBookingDialog data={data} onBooked={(id) => setOpen(id)} />}
          </>
        }
      />
      {data.isError ? (
        <ErrorState onRetry={() => data.refetch()} />
      ) : mode === "calendar" ? (
        <AppointmentsCalendar data={data} onOpen={setOpen} loading={loading} />
      ) : (
        <Tabs defaultValue="appointments">
          <TabsList>
            <TabsTrigger value="appointments">Appointments</TabsTrigger>
            <TabsTrigger value="declined">Declined{declinedCount ? ` (${declinedCount})` : ""}</TabsTrigger>
          </TabsList>
          <TabsContent value="appointments">
            <AppointmentsTable data={data} tab="appointments" onOpen={setOpen} loading={loading} />
          </TabsContent>
          <TabsContent value="declined">
            <AppointmentsTable data={data} tab="declined" onOpen={setOpen} loading={loading} />
          </TabsContent>
        </Tabs>
      )}
      <AppointmentDrawer appointmentId={openId} data={data} onClose={() => setOpen(null)} />
    </>
  );
}

export default function Page() {
  return (
    <RequirePermission perm="appointments:view">
      <AppointmentsPage />
    </RequirePermission>
  );
}
