"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import type { Clinic, DeliveryStatus, MessageLog, PlatformSettings } from "@/types";
import { api } from "@/lib/api/client";
import { qk, useApiMutation } from "@/lib/api/session";
import { useAdminClinics, useAdminMessages, useAdminOptOuts, useAdminPlans, useAdminSettings } from "@/lib/api/admin";
import { PageHeader } from "@/components/shared/page-header";
import { ListState, LoadingState } from "@/components/shared/states";
import { usePhiText } from "@/components/shared/phi";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SmsSimulator } from "@/components/messaging/sms-simulator";
import { AdminGuard, Field, NativeSelect, Section, useAdminCan } from "@/components/admin-pages/common";
import { ReadOnlyNotice } from "@/components/admin/shell";

const REG_VARIANT: Record<Clinic["smsRegistration"], BadgeProps["variant"]> = { approved: "success", pending: "warning", rejected: "danger", not_started: "muted" };
const DELIVERY_VARIANT: Record<DeliveryStatus, BadgeProps["variant"]> = { queued: "muted", scheduled: "info", sent: "secondary", delivered: "success", opened: "violet", failed: "danger", bounced: "warning", skipped: "muted" };
const ADMIN_KEYS = [qk.admin()];

export default function MessagingPage() {
  return (
    <AdminGuard perm="admin:messaging:view">
      <PageHeader title="Messaging" description="Email goes through the configured email driver; SMS uses the mock driver until a provider is chosen (Phase 2B)." />
      <ReadOnlyNotice perm="admin:messaging:edit" />
      <Tabs defaultValue="log">
        <TabsList>
          <TabsTrigger value="log">Delivery log</TabsTrigger>
          <TabsTrigger value="simulator">Two-way SMS</TabsTrigger>
          <TabsTrigger value="clinics">10DLC & credits</TabsTrigger>
          <TabsTrigger value="optouts">Bounces & opt-outs</TabsTrigger>
          <TabsTrigger value="providers">Providers & quiet hours</TabsTrigger>
        </TabsList>
        <TabsContent value="log">
          <Section title="Delivery log" description="Every booking, cancel and reschedule writes email and SMS entries. Click a row for the full message.">
            <PlatformDeliveryLog />
          </Section>
        </TabsContent>
        <TabsContent value="simulator"><Simulator /></TabsContent>
        <TabsContent value="clinics"><ClinicRegistration /></TabsContent>
        <TabsContent value="optouts"><OptOuts /></TabsContent>
        <TabsContent value="providers"><ProviderSettings /></TabsContent>
      </Tabs>
    </AdminGuard>
  );
}

function PlatformDeliveryLog() {
  const clinics = useAdminClinics().data ?? [];
  const [clinicId, setClinicId] = useState("");
  const [channel, setChannel] = useState<"" | "email" | "sms">("");
  const [status, setStatus] = useState("");
  const q = useAdminMessages({ clinicId: clinicId || undefined, channel: channel || undefined, status: status || undefined, limit: 300 });
  const [open, setOpen] = useState<MessageLog | null>(null);
  const phi = usePhiText();
  const name = (id: string) => clinics.find((c) => c.id === id)?.name ?? id;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <NativeSelect aria-label="Clinic" className="h-9" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
          <option value="">All clinics</option>
          {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Channel" className="h-9" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
          <option value="">Email and SMS</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
        </NativeSelect>
        <NativeSelect aria-label="Status" className="h-9" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {(Object.keys(DELIVERY_VARIANT) as DeliveryStatus[]).map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </NativeSelect>
      </div>
      <ListState items={q.data ?? []} loading={q.isLoading} emptyTitle="No messages match">
        {(list) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Clinic</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((m) => (
                <TableRow key={m.id} className="cursor-pointer" onClick={() => setOpen(m)}>
                  <TableCell className="whitespace-nowrap text-xs">{format(new Date(m.createdAt), "MMM d, h:mm a")}</TableCell>
                  <TableCell className="text-sm">{name(m.clinicId)}</TableCell>
                  <TableCell className="text-xs uppercase">{m.channel}{m.direction === "inbound" ? " (in)" : ""}</TableCell>
                  <TableCell className="text-xs">{m.recipientType === "patient" ? phi(m.to) : m.to}</TableCell>
                  <TableCell className="text-xs">{m.event.replace(/_/g, " ")}</TableCell>
                  <TableCell>
                    <Badge variant={DELIVERY_VARIANT[m.status]} className="capitalize">{m.status}</Badge>
                    {m.error && <span className="block max-w-[200px] truncate text-xs text-muted-foreground">{m.error}</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ListState>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{open?.subject ?? open?.event.replace(/_/g, " ")}</DialogTitle></DialogHeader>
          {open && (
            <div className="grid gap-2 text-sm">
              <p className="text-xs text-muted-foreground">{open.channel.toUpperCase()} · to {open.recipientType === "patient" ? phi(open.to) : open.to} · {format(new Date(open.createdAt), "MMM d, yyyy h:mm a")} · {open.status}{open.scheduledFor ? ` · scheduled ${format(new Date(open.scheduledFor), "MMM d, h:mm a")}` : ""}</p>
              <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{open.recipientType === "patient" ? phi(open.body) : open.body}</pre>
              {open.error && <p className="text-xs text-destructive">{open.error}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Simulator() {
  const clinicsQ = useAdminClinics();
  const live = useMemo(() => (clinicsQ.data ?? []).filter((c) => !c.deletedAt && c.status !== "churned"), [clinicsQ.data]);
  const [clinicId, setClinicId] = useState("");
  const selected = clinicId || live[0]?.id || "";
  return (
    <Section title="Two-way SMS simulator" description="Act as a patient replying to a reminder (DEMO_MODE only). Reply C confirms the appointment; STOP and HELP are handled automatically. Production uses the same handler behind the SMS provider webhook.">
      <div className="mb-4 max-w-xs">
        <Field label="Clinic" htmlFor="sim-clinic">
          <NativeSelect id="sim-clinic" value={selected} onChange={(e) => setClinicId(e.target.value)}>
            {live.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
      </div>
      {clinicsQ.isLoading && <LoadingState />}
      {selected && <SmsSimulator key={selected} clinicId={selected} />}
    </Section>
  );
}

function ClinicRegistration() {
  const clinicsQ = useAdminClinics();
  const plans = useAdminPlans().data ?? [];
  const canEdit = useAdminCan()("admin:messaging:edit");
  const live = useMemo(() => (clinicsQ.data ?? []).filter((c) => !c.deletedAt), [clinicsQ.data]);
  const regM = useApiMutation((v: { id: string; name: string; value: Clinic["smsRegistration"] }) => api(`/api/admin/clinics/${v.id}`, { method: "PATCH", body: { smsRegistration: v.value } }), {
    invalidate: ADMIN_KEYS,
    success: (_r, v) => `${v.name}: 10DLC ${v.value.replace("_", " ")}`,
  });
  return (
    <Section title="SMS registration (US 10DLC) and credits" description="Credit limits come from the plan; usage resets each billing cycle.">
      <ListState items={live} loading={clinicsQ.isLoading} emptyTitle="No clinics">
        {(list) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clinic</TableHead>
                <TableHead>10DLC status</TableHead>
                <TableHead>SMS used / limit</TableHead>
                <TableHead>Emails sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((c) => {
                const limit = plans.find((p) => p.id === c.planId)?.limits.smsCredits ?? 0;
                const pct = limit ? Math.round((c.smsCreditsUsed / limit) * 100) : 0;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      {canEdit ? (
                        <NativeSelect aria-label={`10DLC status for ${c.name}`} className="h-8 text-xs" value={c.smsRegistration} onChange={(e) => regM.mutate({ id: c.id, name: c.name, value: e.target.value as Clinic["smsRegistration"] })}>
                          <option value="not_started">Not started</option>
                          <option value="pending">Pending</option>
                          <option value="approved">Approved</option>
                          <option value="rejected">Rejected</option>
                        </NativeSelect>
                      ) : (
                        <Badge variant={REG_VARIANT[c.smsRegistration]} className="capitalize">{c.smsRegistration.replace("_", " ")}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.name} SMS credit usage`}>
                          <div className={pct > 90 ? "h-full bg-destructive" : "h-full bg-primary"} style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <span className="text-xs tabular-nums">{c.smsCreditsUsed}/{limit}</span>
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">{c.emailsSent}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </ListState>
    </Section>
  );
}

function OptOuts() {
  const optOutsQ = useAdminOptOuts();
  const bouncesQ = useAdminMessages({ status: "bounced", limit: 50 });
  const clinics = useAdminClinics().data ?? [];
  const canEdit = useAdminCan()("admin:messaging:edit");
  const phi = usePhiText();
  const name = (id: string) => clinics.find((c) => c.id === id)?.name ?? id;
  const removeM = useApiMutation((id: string) => api(`/api/admin/opt-outs/${id}`, { method: "DELETE" }), { invalidate: ADMIN_KEYS, success: "Removed from opt-out list" });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title="SMS opt-outs" description="Numbers that replied STOP. Texts to them are blocked.">
        <ListState items={optOutsQ.data ?? []} loading={optOutsQ.isLoading} emptyTitle="No opt-outs">
          {(list) => (
            <ul className="divide-y text-sm">
              {list.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {phi(o.phone)} <span className="text-xs text-muted-foreground">· {name(o.clinicId)} · {format(new Date(o.at), "MMM d")} · {o.kind.replace("_", " ")}</span>
                  </span>
                  {canEdit && (
                    <Button size="xs" variant="ghost" aria-label="Remove from opt-out list" onClick={() => removeM.mutate(o.id)}>
                      <Trash2 />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ListState>
      </Section>
      <Section title="Email bounces" description="Bounced messages from the delivery log.">
        <ListState items={bouncesQ.data ?? []} loading={bouncesQ.isLoading} emptyTitle="No bounces">
          {(list) => (
            <ul className="divide-y text-sm">
              {list.map((m) => (
                <li key={m.id} className="py-2">
                  {phi(m.to)} <span className="text-xs text-muted-foreground">· {name(m.clinicId)} · {format(new Date(m.createdAt), "MMM d")} · {m.error}</span>
                </li>
              ))}
            </ul>
          )}
        </ListState>
      </Section>
    </div>
  );
}

function ProviderSettings() {
  const settings = useAdminSettings();
  if (!settings.data) return <LoadingState />;
  return <ProviderSettingsForm key={JSON.stringify(settings.data.messaging)} messaging={settings.data.messaging} />;
}

function ProviderSettingsForm({ messaging }: { messaging: PlatformSettings["messaging"] }) {
  const canEdit = useAdminCan()("admin:messaging:edit");
  const [v, setV] = useState<PlatformSettings["messaging"]>(messaging);
  const [pool, setPool] = useState(messaging.smsNumberPool.join(", "));
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const saveM = useApiMutation((body: PlatformSettings["messaging"]) => api("/api/admin/settings", { method: "PATCH", body: { messaging: body } }), { invalidate: ADMIN_KEYS, success: "Messaging settings saved" });
  return (
    <Section title="SMS and email providers" description="Email: Resend driver in production (EMAIL_DRIVER). SMS: mock driver until the provider is chosen; Twilio and MSG91 adapters are Phase 2B stubs.">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          saveM.mutate({ ...v, smsNumberPool: pool.split(",").map((s) => s.trim()).filter(Boolean) });
        }}
      >
        <fieldset disabled={!canEdit} className="contents">
          <Field label="Email provider" htmlFor="m-email">
            <NativeSelect id="m-email" value={v.emailProvider} onChange={(e) => setV({ ...v, emailProvider: e.target.value as typeof v.emailProvider })}>
              <option>SendGrid</option>
              <option>Amazon SES</option>
            </NativeSelect>
          </Field>
          <Field label="SMS provider" htmlFor="m-sms">
            <NativeSelect id="m-sms" value={v.smsProvider} onChange={() => undefined}>
              <option>Twilio</option>
            </NativeSelect>
          </Field>
          <Field label="Email sender name" htmlFor="m-sender"><Input id="m-sender" value={v.emailSenderName} onChange={(e) => setV({ ...v, emailSenderName: e.target.value })} /></Field>
          <Field label="Email from address" htmlFor="m-from"><Input id="m-from" type="email" value={v.emailFrom} onChange={(e) => setV({ ...v, emailFrom: e.target.value })} /></Field>
          <Field label="SMS number pool" htmlFor="m-pool" hint="Comma-separated sender numbers shared across clinics."><Input id="m-pool" value={pool} onChange={(e) => setPool(e.target.value)} /></Field>
          <Field label="Default SMS credit limit" htmlFor="m-credits"><Input id="m-credits" type="number" min={0} value={v.smsCreditLimitDefault} onChange={(e) => setV({ ...v, smsCreditLimitDefault: Number(e.target.value) || 0 })} /></Field>
          <Field label="Quiet hours start" htmlFor="m-qs" hint="No patient SMS from this hour (patient local time).">
            <NativeSelect id="m-qs" value={v.quietHoursStart} onChange={(e) => setV({ ...v, quietHoursStart: Number(e.target.value) })}>
              {hours.map((h) => <option key={h} value={h}>{h}:00</option>)}
            </NativeSelect>
          </Field>
          <Field label="Quiet hours end" htmlFor="m-qe" hint="Deferred texts are sent at this hour.">
            <NativeSelect id="m-qe" value={v.quietHoursEnd} onChange={(e) => setV({ ...v, quietHoursEnd: Number(e.target.value) })}>
              {hours.map((h) => <option key={h} value={h}>{h}:00</option>)}
            </NativeSelect>
          </Field>
          {canEdit && <Button type="submit" className="justify-self-start" disabled={saveM.isPending}>Save settings</Button>}
        </fieldset>
      </form>
    </Section>
  );
}
