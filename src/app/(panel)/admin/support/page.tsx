"use client";

import { useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Megaphone, Paperclip } from "lucide-react";
import type { Announcement, Ticket, TicketPriority, TicketStatus } from "@/types";
import { isPlatformRole } from "@/lib/permissions";
import { api } from "@/lib/api/client";
import { qk, useApiMutation, useCurrentUser } from "@/lib/api/session";
import { useAdminAnnouncements, useAdminClinics, useAdminTickets, useAdminUsers } from "@/lib/api/admin";
import { PageHeader } from "@/components/shared/page-header";
import { ListState } from "@/components/shared/states";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AdminGuard, Field, NativeSelect, Section } from "@/components/admin-pages/common";
import { fmtDuration, responseMinutes } from "@/components/admin-pages/metrics";

const TICKET_STATUS_VARIANT: Record<TicketStatus, BadgeProps["variant"]> = { open: "danger", pending: "warning", resolved: "success", closed: "muted" };
const PRIORITY_VARIANT: Record<TicketPriority, BadgeProps["variant"]> = { low: "muted", normal: "secondary", high: "warning", urgent: "danger" };
const ADMIN_KEYS = [qk.admin()];

export default function SupportDeskPage() {
  return (
    <AdminGuard perm="admin:support">
      <PageHeader title="Support desk" description="Tickets raised from clinic panels, plus announcement banners." />
      <Tabs defaultValue="tickets">
        <TabsList>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
        </TabsList>
        <TabsContent value="tickets"><Tickets /></TabsContent>
        <TabsContent value="announcements"><Announcements /></TabsContent>
      </Tabs>
    </AdminGuard>
  );
}

function Tickets() {
  const ticketsQ = useAdminTickets();
  const tickets = useMemo(() => ticketsQ.data ?? [], [ticketsQ.data]);
  const clinics = useAdminClinics().data ?? [];
  const usersQ = useAdminUsers();
  const users = useMemo(() => usersQ.data ?? [], [usersQ.data]);
  const [status, setStatus] = useState<"all" | "active" | TicketStatus>("active");
  const [priority, setPriority] = useState<"all" | TicketPriority>("all");
  const [assignee, setAssignee] = useState("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const team = useMemo(() => users.filter((u) => isPlatformRole(u.role) && u.active), [users]);
  const rows = useMemo(
    () =>
      tickets
        .filter((t) => (status === "all" ? true : status === "active" ? t.status === "open" || t.status === "pending" : t.status === status))
        .filter((t) => priority === "all" || t.priority === priority)
        .filter((t) => assignee === "all" || (assignee === "none" ? !t.assigneeId : t.assigneeId === assignee))
        .filter((t) => !q || `${t.id} ${t.subject}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [tickets, status, priority, assignee, q],
  );
  const responded = tickets.map((t) => responseMinutes(t.createdAt, t.firstResponseAt)).filter((x): x is number => x !== null);
  const avg = responded.length ? Math.round(responded.reduce((s, x) => s + x, 0) / responded.length) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="h-9 w-full sm:w-56" placeholder="Search tickets" aria-label="Search tickets" value={q} onChange={(e) => setQ(e.target.value)} />
        <NativeSelect aria-label="Status" className="h-9" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="active">Open & pending</option>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="pending">Pending</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </NativeSelect>
        <NativeSelect aria-label="Priority" className="h-9" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
          <option value="all">All priorities</option>
          {(["urgent", "high", "normal", "low"] as const).map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Assignee" className="h-9" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="all">Anyone</option>
          <option value="none">Unassigned</option>
          {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </NativeSelect>
        <span className="ml-auto text-xs text-muted-foreground">Avg first response: {fmtDuration(avg)}</span>
      </div>
      <div className="rounded-lg border bg-card">
        <ListState items={rows} loading={ticketsQ.isLoading} emptyTitle="No tickets" emptyDescription="Tickets raised with “Raise a Ticket” in the clinic panel land here.">
          {(list) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Clinic</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Response time</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((t) => (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => setOpenId(t.id)}>
                    <TableCell>
                      <button type="button" className="text-left font-medium hover:underline" onClick={() => setOpenId(t.id)}>{t.subject}</button>
                      <span className="block text-xs text-muted-foreground">{t.id} · {t.category.replace("_", " ")}</span>
                    </TableCell>
                    <TableCell className="text-sm">{clinics.find((c) => c.id === t.clinicId)?.name}</TableCell>
                    <TableCell><Badge variant={PRIORITY_VARIANT[t.priority]} className="capitalize">{t.priority}</Badge></TableCell>
                    <TableCell><Badge variant={TICKET_STATUS_VARIANT[t.status]} className="capitalize">{t.status}</Badge></TableCell>
                    <TableCell className="text-sm">{users.find((u) => u.id === t.assigneeId)?.name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                    <TableCell className="text-sm">{fmtDuration(responseMinutes(t.createdAt, t.firstResponseAt))}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ListState>
      </div>
      <TicketSheet ticket={tickets.find((t) => t.id === openId) ?? null} team={team} onClose={() => setOpenId(null)} />
    </div>
  );
}

function TicketSheet({ ticket, team, onClose }: { ticket: Ticket | null; team: { id: string; name: string }[]; onClose: () => void }) {
  const clinics = useAdminClinics().data ?? [];
  const user = useCurrentUser();
  const [reply, setReply] = useState("");
  const patchM = useApiMutation((v: { patch: { status?: TicketStatus; priority?: TicketPriority; assigneeId?: string | null }; msg: string }) => api(`/api/admin/tickets/${ticket?.id}`, { method: "PATCH", body: v.patch }), {
    invalidate: ADMIN_KEYS,
    success: (_r, v) => v.msg,
  });
  const replyM = useApiMutation((body: string) => api(`/api/admin/tickets/${ticket?.id}/messages`, { body: { body } }), { invalidate: ADMIN_KEYS, success: "Reply sent to clinic", onSuccess: () => setReply("") });
  const update = (patch: { status?: TicketStatus; priority?: TicketPriority; assigneeId?: string | null }, msg: string) => ticket && patchM.mutate({ patch, msg });

  return (
    <Sheet open={!!ticket} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        {ticket && user && (
          <>
            <SheetHeader>
              <SheetTitle className="text-lg font-semibold">{ticket.subject}</SheetTitle>
              <SheetDescription className="text-sm text-muted-foreground">
                {ticket.id} · {clinics.find((c) => c.id === ticket.clinicId)?.name} · by {ticket.createdBy} · {format(new Date(ticket.createdAt), "MMM d, h:mm a")}
              </SheetDescription>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Status" htmlFor="tk-status">
                <NativeSelect id="tk-status" value={ticket.status} onChange={(e) => update({ status: e.target.value as TicketStatus }, "Status updated")}>
                  {(["open", "pending", "resolved", "closed"] as const).map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Priority" htmlFor="tk-pri">
                <NativeSelect id="tk-pri" value={ticket.priority} onChange={(e) => update({ priority: e.target.value as TicketPriority }, "Priority updated")}>
                  {(["low", "normal", "high", "urgent"] as const).map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Assignee" htmlFor="tk-assign">
                <NativeSelect id="tk-assign" value={ticket.assigneeId ?? ""} onChange={(e) => update({ assigneeId: e.target.value || null }, "Assignee updated")}>
                  <option value="">Unassigned</option>
                  {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </NativeSelect>
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              Category: {ticket.category.replace("_", " ")} · First response: {fmtDuration(responseMinutes(ticket.createdAt, ticket.firstResponseAt))}
              {ticket.screenshotName && (
                <span className="ml-2 inline-flex items-center gap-1"><Paperclip className="h-3 w-3" aria-hidden /> {ticket.screenshotName}</span>
              )}
            </p>
            <ol className="flex flex-col gap-3" aria-label="Conversation">
              {ticket.messages.map((m) => {
                const staff = isPlatformRole(m.authorRole);
                return (
                  <li key={m.id} className={staff ? "ml-6 rounded-lg bg-secondary p-3" : "mr-6 rounded-lg border p-3"}>
                    <p className="text-xs font-medium">{m.authorName} <span className="font-normal text-muted-foreground">· {staff ? "Kivi support" : "Clinic"} · {format(new Date(m.at), "MMM d, h:mm a")}</span></p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
                  </li>
                );
              })}
            </ol>
            <form
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!reply.trim()) return;
                replyM.mutate(reply.trim());
              }}
            >
              <Field label="Reply" htmlFor="tk-reply">
                <Textarea id="tk-reply" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
              </Field>
              <Button type="submit" className="justify-self-end" disabled={!reply.trim() || replyM.isPending}>Send reply</Button>
            </form>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Announcements() {
  const announcementsQ = useAdminAnnouncements();
  const clinicsQ = useAdminClinics();
  const clinics = useMemo(() => clinicsQ.data ?? [], [clinicsQ.data]);
  const createM = useApiMutation((body: { message: string; clinicIds: "all" | string[]; tone: Announcement["tone"] }) => api("/api/admin/announcements", { body }), {
    invalidate: ADMIN_KEYS,
    success: "Announcement published",
    onSuccess: () => {
      setMessage("");
      setSelected([]);
    },
  });
  const toggleM = useApiMutation((v: { id: string; active: boolean }) => api(`/api/admin/announcements/${v.id}`, { method: "PATCH", body: { active: v.active } }), { invalidate: ADMIN_KEYS, success: (_r, v) => (v.active ? "Announcement shown" : "Announcement hidden") });
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<Announcement["tone"]>("info");
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const live = useMemo(() => clinics.filter((c) => !c.deletedAt), [clinics]);
  const valid = message.trim().length > 3 && (audience === "all" || selected.length > 0);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <Section title="New announcement" description="Shows as a banner at the top of the clinic panel.">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            createM.mutate({ message: message.trim(), tone, clinicIds: audience === "all" ? "all" : selected });
          }}
        >
          <Field label="Message" htmlFor="an-msg"><Textarea id="an-msg" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
          <Field label="Style" htmlFor="an-tone">
            <NativeSelect id="an-tone" value={tone} onChange={(e) => setTone(e.target.value as Announcement["tone"])}>
              <option value="info">Info (blue)</option>
              <option value="warning">Warning (amber)</option>
            </NativeSelect>
          </Field>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-sm font-medium">Audience</legend>
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="an-aud" checked={audience === "all"} onChange={() => setAudience("all")} /> All clinics</label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="an-aud" checked={audience === "selected"} onChange={() => setAudience("selected")} /> Selected clinics</label>
            {audience === "selected" && (
              <div className="ml-6 grid gap-1">
                {live.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={selected.includes(c.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))} />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <Button type="submit" className="justify-self-start" disabled={!valid || createM.isPending}><Megaphone /> Publish</Button>
        </form>
      </Section>
      <Section title="Announcements">
        <ListState items={announcementsQ.data ?? []} loading={announcementsQ.isLoading} emptyTitle="No announcements">
          {(list) => (
            <ul className="divide-y">
              {list.map((a) => (
                <li key={a.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{a.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.clinicIds === "all" ? "All clinics" : a.clinicIds.map((id) => clinics.find((c) => c.id === id)?.name).join(", ")} · {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })} · {a.tone}
                    </p>
                  </div>
                  <Switch aria-label="Announcement active" checked={a.active} onCheckedChange={(on) => toggleM.mutate({ id: a.id, active: on })} />
                </li>
              ))}
            </ul>
          )}
        </ListState>
      </Section>
    </div>
  );
}
