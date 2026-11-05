"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, Mail, MessageSquare } from "lucide-react";
import type { DeliveryStatus, MessageLog } from "@/types";
import { TEMPLATE_EVENT_LABELS } from "@/types";
import { useApp } from "@/store/app";
import { downloadCsv } from "@/lib/utils";
import { usePhiText } from "@/components/shared/phi";
import { ListState } from "@/components/shared/states";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const DELIVERY_BADGE: Record<DeliveryStatus, BadgeProps["variant"]> = {
  queued: "muted",
  scheduled: "info",
  sent: "secondary",
  delivered: "success",
  opened: "violet",
  failed: "danger",
  bounced: "warning",
  skipped: "muted",
};

export function eventLabel(e: MessageLog["event"]): string {
  if (e in TEMPLATE_EVENT_LABELS) return TEMPLATE_EVENT_LABELS[e as keyof typeof TEMPLATE_EVENT_LABELS];
  return { two_way_reply: "Two-way SMS", test: "Test send", daily_summary: "Daily summary", cancellation_alert: "Cancellation alert" }[e as string] ?? e;
}

/**
 * Delivery log (section 7): sent, delivered, failed, opened, plus quiet-hours scheduling.
 * Used in the clinic panel (Settings > Notifications, appointment drawer) and super admin Messaging.
 */
export function DeliveryLog({
  clinicId,
  appointmentId,
  compact = false,
  showClinic = false,
}: {
  clinicId?: string;
  appointmentId?: string;
  compact?: boolean;
  showClinic?: boolean;
}) {
  const messages = useApp((s) => s.db.messages);
  const clinics = useApp((s) => s.db.clinics);
  const phi = usePhiText();
  const [channel, setChannel] = useState<"all" | "email" | "sms">("all");
  const [status, setStatus] = useState<"all" | DeliveryStatus>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<MessageLog | null>(null);
  const [limit, setLimit] = useState(compact ? 50 : 25);

  const rows = useMemo(
    () =>
      messages
        .filter((m) => (!clinicId || m.clinicId === clinicId) && (!appointmentId || m.appointmentId === appointmentId))
        .filter((m) => (channel === "all" || m.channel === channel) && (status === "all" || m.status === status))
        .filter((m) => !q || m.to.toLowerCase().includes(q.toLowerCase()) || m.body.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [messages, clinicId, appointmentId, channel, status, q],
  );

  const counts = useMemo(() => {
    const c: Partial<Record<DeliveryStatus, number>> = {};
    for (const m of rows) c[m.status] = (c[m.status] ?? 0) + 1;
    return c;
  }, [rows]);

  return (
    <div className="flex flex-col gap-3">
      {!compact && (
        <div className="flex flex-wrap items-end gap-2">
          <Input className="h-9 w-full sm:w-56" placeholder="Search recipient or text" aria-label="Search messages" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
            <SelectTrigger className="h-9 w-32" aria-label="Channel"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="h-9 w-36" aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(DELIVERY_BADGE) as DeliveryStatus[]).map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                "delivery-log.csv",
                rows.map((m) => ({ created: m.createdAt, clinic: clinics.find((c) => c.id === m.clinicId)?.name, channel: m.channel, direction: m.direction, event: eventLabel(m.event), to: phi(m.to), status: m.status, scheduled_for: m.scheduledFor ?? "", error: m.error ?? "" })),
              )
            }
          >
            Export CSV
          </Button>
          <div className="ml-auto flex flex-wrap gap-1 text-xs">
            {(Object.keys(counts) as DeliveryStatus[]).map((s) => (
              <Badge key={s} variant={DELIVERY_BADGE[s]} className="capitalize">{s}: {counts[s]}</Badge>
            ))}
          </div>
        </div>
      )}
      <ListState items={rows} emptyTitle="No messages yet" emptyDescription="Booking, cancel and reschedule events write simulated email and SMS entries here.">
        {(list) => (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    {showClinic && <TableHead>Clinic</TableHead>}
                    <TableHead>Channel</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.slice(0, limit).map((m) => (
                    <TableRow key={m.id} className="cursor-pointer" onClick={() => setOpen(m)}>
                      <TableCell className="whitespace-nowrap text-xs">{format(new Date(m.createdAt), "MMM d, h:mm a")}</TableCell>
                      {showClinic && <TableCell className="text-xs">{clinics.find((c) => c.id === m.clinicId)?.name}</TableCell>}
                      <TableCell>
                        <span className="flex items-center gap-1 text-xs">
                          {m.direction === "inbound" ? <ArrowDownLeft className="h-3.5 w-3.5 text-sky-700" aria-label="Inbound" /> : <ArrowUpRight className="h-3.5 w-3.5 text-slate-500" aria-label="Outbound" />}
                          {m.channel === "email" ? <Mail className="h-3.5 w-3.5" aria-hidden /> : <MessageSquare className="h-3.5 w-3.5" aria-hidden />}
                          {m.channel.toUpperCase()}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {eventLabel(m.event)}
                        <span className="block text-muted-foreground">{m.recipientType === "clinic" ? "to clinic" : "to patient"}</span>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs">{phi(m.to)}</TableCell>
                      <TableCell>
                        <Badge variant={DELIVERY_BADGE[m.status]} className="capitalize">{m.status}</Badge>
                        {m.scheduledFor && <span className="block text-[11px] text-muted-foreground">for {m.scheduledFor.replace("T", " ")}</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {list.length > limit && (
              <Button variant="outline" size="sm" className="self-center" onClick={() => setLimit((l) => l + 50)}>
                Show more ({list.length - limit} more)
              </Button>
            )}
          </>
        )}
      </ListState>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{open ? eventLabel(open.event) : ""}</DialogTitle>
          </DialogHeader>
          {open && (
            <div className="grid gap-2 text-sm">
              <p><span className="text-muted-foreground">To:</span> {phi(open.to)} ({open.recipientType})</p>
              <p><span className="text-muted-foreground">Channel:</span> {open.channel.toUpperCase()} · {open.direction}</p>
              <p><span className="text-muted-foreground">Status:</span> <Badge variant={DELIVERY_BADGE[open.status]} className="capitalize">{open.status}</Badge></p>
              {open.scheduledFor && <p><span className="text-muted-foreground">Scheduled for:</span> {open.scheduledFor.replace("T", " ")} (clinic time)</p>}
              {open.error && <p className="text-destructive">{open.error}</p>}
              {open.subject && <p><span className="text-muted-foreground">Subject:</span> {open.subject}</p>}
              <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 font-sans text-sm">{phi(open.body) === "••••••" ? "•••••• (hidden while Hide PHI is on)" : open.body}</pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
