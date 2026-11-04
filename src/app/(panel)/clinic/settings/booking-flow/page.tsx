"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useApp } from "@/store/app";
import { RequirePermission } from "@/components/shared/guards";
import { BookingFlowBuilder } from "@/components/builder/booking-flow-builder";

export default function BookingFlowPage() {
  const clinicId = useApp((s) => s.session.clinicId);
  return (
    <RequirePermission perm="settings:manage">
      <Link href="/clinic/settings" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Settings
      </Link>
      <BookingFlowBuilder key={clinicId} />
    </RequirePermission>
  );
}
