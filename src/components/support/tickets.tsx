"use client";

import { useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, Paperclip, Send } from "lucide-react";
import { toast } from "sonner";
import type { Ticket, TicketPriority, TicketStatus } from "@/types";
import { ROLE_LABELS } from "@/types";
import { useApp, useCurrentUser } from "@/store/app";
import { cn, uid } from "@/lib/utils";
import { TICKET_CATEGORIES } from "@/components/clinic/raise-ticket";
import { ListState } from "@/components/shared/states";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const TICKET_STATUS_BADGE: Record<TicketStatus, BadgeProps["variant"]> = { open: "warning", pending: "info", resolved: "success", closed: "muted" };
export const TICKET_PRIORITY_BADGE: Record<TicketPriority, BadgeProps["variant"]> = { low: "muted", normal: "secondary", high: "warning", urgent: "danger" };

export function categoryLabel(c: Ticket["category"]) {
  return TICKET_CATEGORIES.find((x) => x.value === c)?.label ?? c;
}

/** Status a ticket moves to when the clinic replies: resolved/closed tickets reopen. */
export function statusAfterClinicReply(s: TicketStatus): TicketStatus {
  return s === "resolved" || s === "closed" ? "open" : s === "pending" ? "open" : s;
}

export function TicketList({ tickets, onOpen }: { tickets: Ticket[]; onOpen: (id: string) => void }) {
  return (
    <ListState items={tickets} emptyTitle="No tickets yet" emptyDescription="Raise a ticket and the Kivi support team will reply here.">
      {(rows) => (
        <ul className="divide-y rounded-lg border bg-card">
          {rows.map((t) => {
            const last = t.messages[t.messages.length - 1];
            return (
              <li key={t.id}>
                <button type="button" onClick={() => onOpen(t.id)} className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{t.subject}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t.id} · {categoryLabel(t.category)} · opened {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })} by {t.createdBy}
                      {last && ` · last reply by ${last.authorName}`}
                    </span>
                  </span>
                  <span className="flex gap-1">
                    <Badge variant={TICKET_PRIORITY_BADGE[t.priority]} className="capitalize">
                      {t.priority}
                    </Badge>
                    <Badge variant={TICKET_STATUS_BADGE[t.status]} className="capitalize">
                      {t.status}
                    </Badge>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </ListState>
  );
}

export function TicketThread({ ticket, onBack }: { ticket: Ticket; onBack: () => void }) {
  const user = useCurrentUser();
  const mutate = useApp((s) => s.mutate);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string>();

  const reply = (e: React.FormEvent) => {
    e.preventDefault();
    if (body.trim().length < 2) {
      setError("Write a reply first.");
      return;
    }
    if (!user) return;
    const reopened = ticket.status === "resolved" || ticket.status === "closed";
    mutate((db) => {
      const t = db.tickets.find((x) => x.id === ticket.id);
      if (!t) return;
      t.messages.push({ id: uid("tm"), at: new Date().toISOString(), authorName: user.name, authorRole: user.role, body: body.trim() });
      t.status = statusAfterClinicReply(t.status);
    });
    toast.success(reopened ? "Reply sent and ticket reopened" : "Reply sent");
    setBody("");
    setError(undefined);
  };

  return (
    <div className="grid gap-4">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft /> All tickets
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{ticket.subject}</CardTitle>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{ticket.id}</span>
            <span>· {categoryLabel(ticket.category)}</span>
            <Badge variant={TICKET_PRIORITY_BADGE[ticket.priority]} className="capitalize">
              {ticket.priority}
            </Badge>
            <Badge variant={TICKET_STATUS_BADGE[ticket.status]} className="capitalize">
              {ticket.status}
            </Badge>
            {ticket.screenshotName && (
              <span className="flex items-center gap-1">
                <Paperclip className="h-3 w-3" aria-hidden /> {ticket.screenshotName}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <ol className="grid gap-3" aria-label="Conversation">
            {ticket.messages.map((m) => {
              const staff = m.authorRole === "super_admin" || m.authorRole === "support_agent";
              return (
                <li key={m.id} className={cn("rounded-lg border p-3", staff ? "border-sky-200 bg-sky-50" : "bg-card")}>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{m.authorName}</span> · {staff ? "Kivi support" : ROLE_LABELS[m.authorRole]} · {format(new Date(m.at), "MMM d, h:mm a")}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
                </li>
              );
            })}
          </ol>
          <form onSubmit={reply} className="grid gap-2" noValidate>
            <Label htmlFor="ticket-reply">Reply</Label>
            <Textarea id="ticket-reply" rows={3} value={body} aria-invalid={!!error} onChange={(e) => setBody(e.target.value)} placeholder={ticket.status === "resolved" || ticket.status === "closed" ? "Replying reopens this ticket" : "Add more detail…"} />
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit">
                <Send /> Send reply
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function useClinicTickets(clinicId: string | undefined, status: TicketStatus | "all") {
  const tickets = useApp((s) => s.db.tickets);
  return useMemo(
    () => tickets.filter((t) => t.clinicId === clinicId && (status === "all" || t.status === status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [tickets, clinicId, status],
  );
}
