"use client";

import { RequirePermission } from "@/components/shared/guards";
import { ClinicHome } from "@/components/home/home";

export default function ClinicHomePage() {
  return (
    <RequirePermission perm="clinic:home">
      <ClinicHome />
    </RequirePermission>
  );
}
