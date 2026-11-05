"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Bold, Italic, Link2, Mail, MessageSquare, RotateCcw, Save, Send } from "lucide-react";
import type { Channel, MessageTemplate, TemplateEvent } from "@/types";
import { TEMPLATE_EVENT_LABELS } from "@/types";
import { api } from "@/lib/api/client";
import { clinicPath, useTemplates } from "@/lib/api/clinic";
import { qk, useApiMutation, useCurrentUser } from "@/lib/api/session";
import { renderTemplate, smsSegments, templateVars } from "@/lib/notify";
import { nowInZone, toWall } from "@/lib/time";
import { cn } from "@/lib/utils";
import { TEMPLATE_PLACEHOLDERS } from "@/mock/defaults";
import { RequirePermission } from "@/components/shared/guards";
import { PageHeader } from "@/components/shared/page-header";
import { ListState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClinicConfig } from "@/components/config/common";
import { insertAt, renderRichText, sampleAppointment, stripRichText, wrapSelection } from "@/components/config/template-preview";

const EVENTS = Object.keys(TEMPLATE_EVENT_LABELS) as TemplateEvent[];

function TemplatesModule() {
  const { clinic, clinicId, reasons, providers } = useClinicConfig();
  const tq = useTemplates();
  const templates = useMemo(() => tq.data ?? [], [tq.data]);
  const user = useCurrentUser();
  const base = clinicPath(clinicId, "/templates");
  const invalidate = [qk.clinicRes(clinicId, "templates"), qk.clinicRes(clinicId, "messages")];
  const patch = useApiMutation(({ id, body }: { id: string; body: { subject?: string; body?: string; enabled?: boolean }; msg: string }) => api<MessageTemplate>(`${base}/${id}`, { method: "PATCH", body }), { invalidate, success: (_r, v) => v.msg });
  const resetMut = useApiMutation((id: string) => api<MessageTemplate>(`${base}/${id}/reset`, { method: "POST" }), {
    invalidate,
    success: "Reset to the platform default",
    onSuccess: (t) => {
      setSubject(t.subject);
      setBody(t.body);
    },
  });
  const testMut = useApiMutation(({ id }: { id: string; to: string }) => api(`${base}/${id}/test`, { method: "POST" }), {
    invalidate,
    success: (_r, v) => `Test ${channel === "email" ? "email" : "SMS"} queued to ${v.to}`,
  });
  const [event, setEvent] = useState<TemplateEvent>("booked_new");
  const [channel, setChannel] = useState<Channel>("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Clinic copies with the global defaults filling any gap (resolved by the server).
  const find = (e: TemplateEvent, c: Channel) => templates.find((t) => t.event === e && t.channel === c);
  const current = find(event, channel);
  const currentId = current?.id;
  const currentSubject = current?.subject;
  const currentBody = current?.body;

  useEffect(() => {
    setSubject(currentSubject ?? "");
    setBody(currentBody ?? "");
  }, [currentId, currentSubject, currentBody]);

  const vars = useMemo(() => {
    if (!clinic) return {} as Record<string, string>;
    const start = toWall(new Date(nowInZone(clinic.timeZone).setHours(24 + 10, 30, 0, 0)));
    const appt = sampleAppointment(clinicId, reasons[0]?.id ?? "", providers[0]?.id ?? "", start);
    const v = templateVars(clinic, appt, reasons[0], providers[0], typeof window !== "undefined" ? window.location.origin : undefined);
    if (channel === "sms" && clinic.settings.notifications.leaveReasonOutOfSms) v.rfv_name = "appointment";
    return v;
  }, [clinic, clinicId, reasons, providers, channel]);

  if (!clinic) return null;
  const dirty = !!current && (current.subject !== subject || current.body !== body);
  const renderedBody = renderTemplate(channel === "sms" ? stripRichText(body) : body, vars);
  const seg = smsSegments(renderedBody);

  const apply = (fn: (v: string, s: number, e: number) => { value: string; caret: number }) => {
    const el = ref.current;
    const s = el?.selectionStart ?? body.length;
    const e = el?.selectionEnd ?? body.length;
    const r = fn(body, s, e);
    setBody(r.value);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(r.caret, r.caret);
    });
  };

  const save = () => {
    if (!current) return;
    if (channel === "email" && !subject.trim()) return void toast.error("Email templates need a subject.");
    if (!body.trim()) return void toast.error("The message can't be empty.");
    patch.mutate({ id: current.id, body: { subject, body }, msg: "Template saved" });
  };

  const toggle = (t: MessageTemplate, v: boolean) => patch.mutate({ id: t.id, body: { enabled: v }, msg: `${TEMPLATE_EVENT_LABELS[t.event]} ${t.channel.toUpperCase()} ${v ? "on" : "off"}` });

  const reset = () => current && resetMut.mutate(current.id);

  /** Sends the saved version of the template through the real queue (see the delivery log in Settings > Notifications). */
  const sendTest = () => {
    if (!current) return;
    if (dirty) return void toast.error("Save the template first, then send a test.");
    const to = channel === "email" ? (user?.email ?? clinic.email) : clinic.settings.notifications.alternateSmsNumber || clinic.phone;
    testMut.mutate({ id: current.id, to });
  };

  return (
    <>
      <PageHeader title="Templates" description="Email and SMS sent for each booking event. Placeholders fill in automatically." />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Events</CardTitle>
            <CardDescription>Turn each channel on or off per event.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ListState items={EVENTS} loading={tq.isLoading} emptyTitle="No templates">
              {(list) => (
                <ul className="divide-y border-t">
                  {list.map((e) => {
                    const em = find(e, "email");
                    const sms = find(e, "sms");
                    return (
                      <li key={e} className={cn("flex items-center gap-2 px-4 py-2", e === event && "bg-secondary/50")}>
                        <button type="button" className="flex-1 text-left text-sm font-medium hover:underline" aria-current={e === event} onClick={() => setEvent(e)}>
                          {TEMPLATE_EVENT_LABELS[e]}
                        </button>
                        {em && (
                          <span className="flex items-center gap-1" title="Email on/off">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                            <Switch className="scale-75" aria-label={`${TEMPLATE_EVENT_LABELS[e]} email`} checked={em.enabled} onCheckedChange={(v) => toggle(em, v)} />
                          </span>
                        )}
                        {sms && (
                          <span className="flex items-center gap-1" title="SMS on/off">
                            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                            <Switch className="scale-75" aria-label={`${TEMPLATE_EVENT_LABELS[e]} SMS`} checked={sms.enabled} onCheckedChange={(v) => toggle(sms, v)} />
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </ListState>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{TEMPLATE_EVENT_LABELS[event]}</CardTitle>
              <CardDescription>
                {current ? (current.enabled ? <Badge variant="success">On</Badge> : <Badge variant="muted">Off</Badge>) : null} Editing the {channel === "email" ? "email" : "SMS"} version.
              </CardDescription>
            </div>
            <Tabs value={channel} onValueChange={(v) => setChannel(v as Channel)}>
              <TabsList>
                <TabsTrigger value="email"><Mail className="mr-1 h-4 w-4" aria-hidden /> Email</TabsTrigger>
                <TabsTrigger value="sms"><MessageSquare className="mr-1 h-4 w-4" aria-hidden /> SMS</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="grid gap-4">
            {!current ? (
              <p className="text-sm text-muted-foreground">No template for this event yet.</p>
            ) : (
              <>
                {channel === "email" && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="tpl-subject">Subject</Label>
                    <Input id="tpl-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label htmlFor="tpl-body">Message</Label>
                  {channel === "email" && (
                    <div className="flex gap-1 rounded-t-md border border-b-0 bg-muted/50 p-1" role="toolbar" aria-label="Formatting">
                      <Button type="button" variant="ghost" size="xs" aria-label="Bold" onClick={() => apply((v, s, e) => wrapSelection(v, s, e, "**"))}><Bold /></Button>
                      <Button type="button" variant="ghost" size="xs" aria-label="Italic" onClick={() => apply((v, s, e) => wrapSelection(v, s, e, "_"))}><Italic /></Button>
                      <Button type="button" variant="ghost" size="xs" aria-label="Link" onClick={() => apply((v, s, e) => wrapSelection(v, s, e, "[", "](https://)", "link text"))}><Link2 /></Button>
                    </div>
                  )}
                  <Textarea id="tpl-body" ref={ref} rows={channel === "email" ? 9 : 5} className={cn(channel === "email" && "rounded-t-none")} value={body} onChange={(e) => setBody(e.target.value)} />
                  {channel === "sms" && (
                    <p className={cn("text-xs", seg.segments > 1 ? "text-amber-800" : "text-muted-foreground")} aria-live="polite">
                      {seg.chars} characters after placeholders · {seg.segments} SMS segment{seg.segments > 1 ? "s" : ""} (160 per segment)
                    </p>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <p className="text-sm font-medium">Insert placeholder</p>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATE_PLACEHOLDERS.map((p) => (
                      <Button key={p} type="button" variant="secondary" size="xs" className="font-mono" onClick={() => apply((v, s, e) => insertAt(v, s, e, p))}>
                        {p}
                      </Button>
                    ))}
                  </div>
                </div>
                <section aria-labelledby="preview-h" className="grid gap-2">
                  <h3 id="preview-h" className="text-sm font-medium">Preview (sample patient)</h3>
                  {channel === "email" ? (
                    <div className="rounded-md border bg-white p-4 text-sm">
                      <p className="mb-2 border-b pb-2 font-semibold">{renderTemplate(subject, vars)}</p>
                      <div dangerouslySetInnerHTML={{ __html: renderRichText(renderedBody) }} />
                    </div>
                  ) : (
                    <div className="max-w-sm rounded-2xl bg-slate-100 p-3 text-sm shadow-inner">
                      <p className="whitespace-pre-wrap rounded-2xl bg-white px-3 py-2 shadow-sm">{renderedBody}</p>
                    </div>
                  )}
                </section>
                <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                  <Button variant="ghost" onClick={reset} disabled={!current || current.clinicId === null}><RotateCcw /> Reset to default</Button>
                  <Button variant="outline" onClick={sendTest} disabled={testMut.isPending}><Send /> Send test</Button>
                  <Button onClick={save} disabled={!dirty}><Save /> Save template</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function TemplatesPage() {
  return (
    <RequirePermission perm="templates:manage">
      <TemplatesModule />
    </RequirePermission>
  );
}
