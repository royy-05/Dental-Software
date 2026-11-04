"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Clinic, PlatformSettings } from "@/types";
import { useApp } from "@/store/app";
import { PageHeader } from "@/components/shared/page-header";
import { ListState } from "@/components/shared/states";
import { usePhiText } from "@/components/shared/phi";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeliveryLog } from "@/components/messaging/delivery-log";
import { SmsSimulator } from "@/components/messaging/sms-simulator";
import { AdminGuard, Field, NativeSelect, Section, useAdminCan } from "@/components/admin-pages/common";
import { ReadOnlyNotice } from "@/components/admin/shell";

const REG_VARIANT: Record<Clinic["smsRegistration"], BadgeProps["variant"]> = { approved: "success", pending: "warning", rejected: "danger", not_started: "muted" };

export default function MessagingPage() {
  return (
    <AdminGuard perm="admin:messaging:view">
      <PageHeader title="Messaging" description="Simulated email and SMS. Nothing is actually sent in the prototype." />
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
            <DeliveryLog showClinic />
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

function Simulator() {
  const clinics = useApp((s) => s.db.clinics);
  const live = useMemo(() => clinics.filter((c) => !c.deletedAt && c.status !== "churned"), [clinics]);
  const [clinicId, setClinicId] = useState(live[0]?.id ?? "");
  return (
    <Section title="Two-way SMS simulator" description="Act as a patient replying to a reminder. Reply C confirms the appointment; STOP and HELP are handled automatically.">
      <div className="mb-4 max-w-xs">
        <Field label="Clinic" htmlFor="sim-clinic">
          <NativeSelect id="sim-clinic" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
            {live.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
      </div>
      {clinicId && <SmsSimulator key={clinicId} clinicId={clinicId} />}
    </Section>
  );
}

function ClinicRegistration() {
  const clinics = useApp((s) => s.db.clinics);
  const plans = useApp((s) => s.db.plans);
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const canEdit = useAdminCan()("admin:messaging:edit");
  const live = useMemo(() => clinics.filter((c) => !c.deletedAt), [clinics]);
  return (
    <Section title="SMS registration (US 10DLC) and credits" description="Credit limits come from the plan; usage resets each billing cycle.">
      <ListState items={live} emptyTitle="No clinics">
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
                        <NativeSelect
                          aria-label={`10DLC status for ${c.name}`}
                          className="h-8 text-xs"
                          value={c.smsRegistration}
                          onChange={(e) => {
                            const v = e.target.value as Clinic["smsRegistration"];
                            mutate((d) => void (d.clinics.find((x) => x.id === c.id)!.smsRegistration = v));
                            logAudit({ action: `Set 10DLC status: ${v}`, category: "settings", target: c.name, clinicId: c.id });
                            toast.success(`${c.name}: 10DLC ${v.replace("_", " ")}`);
                          }}
                        >
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
  const optOuts = useApp((s) => s.db.optOuts);
  const messages = useApp((s) => s.db.messages);
  const clinics = useApp((s) => s.db.clinics);
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const canEdit = useAdminCan()("admin:messaging:edit");
  const phi = usePhiText();
  const bounces = useMemo(() => messages.filter((m) => m.status === "bounced"), [messages]);
  const name = (id: string) => clinics.find((c) => c.id === id)?.name ?? id;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title="SMS opt-outs" description="Numbers that replied STOP. Texts to them are blocked.">
        <ListState items={optOuts} emptyTitle="No opt-outs">
          {(list) => (
            <ul className="divide-y text-sm">
              {list.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {phi(o.phone)} <span className="text-xs text-muted-foreground">· {name(o.clinicId)} · {format(new Date(o.at), "MMM d")} · {o.kind.replace("_", " ")}</span>
                  </span>
                  {canEdit && (
                    <Button
                      size="xs"
                      variant="ghost"
                      aria-label="Remove from opt-out list"
                      onClick={() => {
                        mutate((d) => void (d.optOuts = d.optOuts.filter((x) => x.id !== o.id)));
                        logAudit({ action: "Removed opt-out", category: "settings", target: "SMS opt-out list", clinicId: o.clinicId });
                        toast.success("Removed from opt-out list");
                      }}
                    >
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
        <ListState items={bounces} emptyTitle="No bounces">
          {(list) => (
            <ul className="divide-y text-sm">
              {list.slice(0, 50).map((m) => (
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
  const messaging = useApp((s) => s.db.platform.messaging);
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const canEdit = useAdminCan()("admin:messaging:edit");
  const [v, setV] = useState<PlatformSettings["messaging"]>(messaging);
  const [pool, setPool] = useState(messaging.smsNumberPool.join(", "));
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return (
    <Section title="SMS and email providers" description="Production uses SendGrid or Amazon SES for email and Twilio for SMS (phase 2).">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const next = { ...v, smsNumberPool: pool.split(",").map((s) => s.trim()).filter(Boolean) };
          mutate((d) => void (d.platform.messaging = next));
          logAudit({ action: "Updated messaging settings", category: "settings", target: "Platform messaging" });
          toast.success("Messaging settings saved");
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
          {canEdit && <Button type="submit" className="justify-self-start">Save settings</Button>}
        </fieldset>
      </form>
    </Section>
  );
}
