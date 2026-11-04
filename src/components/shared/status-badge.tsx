import type { AppointmentStatus } from "@/types";
import { STATUS_LABELS } from "@/types";
import { Badge, type BadgeProps } from "@/components/ui/badge";

export const STATUS_VARIANT: Record<AppointmentStatus, BadgeProps["variant"]> = {
  unconfirmed: "warning",
  confirmed: "info",
  complete: "success",
  cancelled: "muted",
  no_show: "danger",
  declined: "violet",
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABELS[status]}</Badge>;
}
