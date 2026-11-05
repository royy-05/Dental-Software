"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow, format } from "date-fns";
import { ExternalLink, History, Monitor, RotateCcw, Save, Send, Smartphone, Sparkles, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { ClinicFlow, FlowConfig, FormField, StepConfig, StepKey, StepOrder, WidgetTheme } from "@/types";
import { SPECIALTY_LABEL } from "./labels";
import { api } from "@/lib/api/client";
import { clinicPath, useClinicConfig, useStarterTemplates } from "@/lib/api/clinic";
import { qk, useApiMutation, useClinicBundle, useCurrentClinic } from "@/lib/api/session";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, LoadingState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { BookingWidget } from "@/components/widget/booking-widget";
import { ConditionsEditor } from "./conditions-editor";
import { FieldListEditor } from "./field-list-editor";
import { draftFromTemplate, sameConfig } from "./versioning";
import { previewBundle } from "./preview-bundle";

const STEP_LABEL: Record<StepKey, string> = {
  reason: "Reason for visit",
  provider: "Provider",
  datetime: "Date and time",
  details: "Patient details",
  insurance: "Insurance (section of details)",
  intake: "Intake questions (section of details)",
  review: "Review and confirm",
};
const ALWAYS_ON: StepKey[] = ["reason", "datetime", "details"];
const ORDER_LABEL: Record<StepOrder, string> = { reason_first: "Reason first", provider_first: "Provider first", date_first: "Date first" };
const sel = "h-10 w-full rounded-md border border-input bg-card px-3 text-sm";

function NumberField({ id, label, value, onChange, min = 0, max, help }: { id: string; label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; help?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" inputMode="numeric" min={min} max={max} value={value} onChange={(e) => onChange(Math.max(min, Math.min(max ?? Infinity, Number(e.target.value) || 0)))} aria-describedby={help ? `${id}-h` : undefined} />
      {help && <p id={`${id}-h`} className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

export function BookingFlowBuilder() {
  const clinic = useCurrentClinic();
  const bundle = useClinicBundle().data;
  const { config, clinicId, isLoading } = useClinicConfig();
  const rec = config.flow as ClinicFlow | undefined;
  const reasons = config.reasons;
  const starters = useStarterTemplates();
  const templates = starters.data ?? [];
  const [draft, setDraft] = useState<FlowConfig | undefined>();
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [previewTheme, setPreviewTheme] = useState<WidgetTheme | "clinic">("clinic");
  const [previewKey, setPreviewKey] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishNote, setPublishNote] = useState("");
  const [rollbackTo, setRollbackTo] = useState<number | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [addReasons, setAddReasons] = useState(false);
  const [questionReasonId, setQuestionReasonId] = useState<string>("");

  // The editor state starts from the stored draft once it has loaded.
  const storedDraft = rec?.draft;
  useEffect(() => {
    if (storedDraft && !draft) setDraft(structuredClone(storedDraft));
  }, [storedDraft, draft]);

  const base = clinicPath(clinicId, "/flow");
  const invalidate = [qk.clinic(clinicId)];
  const saveDraftMut = useApiMutation((cfg: FlowConfig) => api<ClinicFlow>(base, { method: "PUT", body: cfg }), { invalidate, success: "Draft saved" });
  const publishMut = useApiMutation(({ config: cfg, note }: { config: FlowConfig; note: string }) => api<ClinicFlow>(`${base}/publish`, { body: { config: cfg, note } }), {
    invalidate,
    success: (f) => `Published version ${f.publishedVersion}. The live widget now uses it.`,
    onSuccess: (f) => {
      setDraft(structuredClone(f.draft));
      setPublishOpen(false);
      setPublishNote("");
    },
  });
  const discardMut = useApiMutation((cfg: FlowConfig) => api<ClinicFlow>(base, { method: "PUT", body: cfg }), {
    invalidate,
    success: false,
    onSuccess: (f) => {
      setDraft(structuredClone(f.published));
      toast.info("Draft discarded. Back to the published version.");
    },
  });
  const rollbackMut = useApiMutation((version: number) => api<ClinicFlow>(`${base}/rollback`, { body: { version } }), {
    invalidate,
    success: (f, version) => `Rolled back to v${version}, published as v${f.publishedVersion}`,
    onSuccess: (f) => {
      setDraft(structuredClone(f.published));
      setRollbackTo(null);
    },
  });
  const addReasonMut = useApiMutation((body: Record<string, unknown>) => api(clinicPath(clinicId, "/reasons"), { body }), { invalidate, success: false });
  const questionsMut = useApiMutation(({ id, questions }: { id: string; questions: FormField[] }) => api(clinicPath(clinicId, `/reasons/${id}`), { method: "PATCH", body: { questions } }), { invalidate, success: false });

  if (isLoading || !clinic || !bundle) return <LoadingState label="Loading booking flow…" />;
  if (!rec || !draft) return <EmptyState title="No booking flow" description="This clinic has no booking flow yet." />;

  const dirty = !sameConfig(draft, rec.draft);
  const unpublished = dirty || !sameConfig(rec.draft, rec.published);
  const otpAvailable = bundle.features.otp;
  const uploadsAvailable = bundle.features.file_uploads;
  const up = (fn: (d: FlowConfig) => void) =>
    setDraft((d) => {
      const n = structuredClone(d!);
      fn(n);
      return n;
    });
  const upStep = (key: StepKey, p: Partial<StepConfig>) => up((d) => void Object.assign(d.steps.find((s) => s.key === key)!, p));

  const saveDraft = () => saveDraftMut.mutate(draft);
  const publish = () => publishMut.mutate({ config: draft, note: publishNote.trim() || "Published from builder" });
  const discard = () => discardMut.mutate(rec.published);
  const rollback = (version: number) => rollbackMut.mutate(version);
  const applyTemplate = () => {
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    setDraft(draftFromTemplate(t, draft));
    if (addReasons) {
      // Default reasons are created inactive and linked to every active provider, so they are not bookable until reviewed.
      const existing = new Set(reasons.map((r) => r.name.toLowerCase()));
      const toAdd = t.defaultReasons.filter((r) => !existing.has(r.name.toLowerCase()));
      const providerIds = config.providers.filter((p) => p.active).map((p) => p.id);
      if (!providerIds.length) toast.error("Add a provider first: a reason needs at least one provider.");
      else {
        for (const r of toAdd) addReasonMut.mutate({ ...r, longDescription: r.description, providerIds, operatoryIds: [], visibility: "online", active: false, questions: [], redirectUrl: "" });
        if (toAdd.length) toast.info(`Added ${toAdd.length} reasons as inactive. Review them in Reasons for visit to make them bookable.`);
      }
    }
    toast.success(`“${t.name}” copied into your draft. Review it, then save or publish.`);
    setTemplateId(null);
    setAddReasons(false);
  };

  const qReason = reasons.find((r) => r.id === (questionReasonId || reasons[0]?.id));
  const setReasonQuestions = (list: FormField[]) => {
    if (!qReason) return;
    questionsMut.mutate({ id: qReason.id, questions: list });
  };

  const publishedTemplates = templates.filter((t) => t.published);
  const allFieldsForRules = [...draft.fields, ...draft.intakeFields];

  return (
    <div>
      <PageHeader
        title="Booking flow & form builder"
        description={`Control every step of ${clinic.name}'s booking widget. Changes go live only when you publish.`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/book/${clinic.slug}`} target="_blank"><ExternalLink /> Open live widget</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={discard} disabled={!unpublished}><Undo2 /> Discard draft</Button>
            <Button variant="secondary" size="sm" onClick={saveDraft} disabled={!dirty}><Save /> Save draft</Button>
            <Button size="sm" onClick={() => setPublishOpen(true)} disabled={!unpublished || publishMut.isPending}><Send /> Publish</Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm" role="status">
        <Badge variant="success">Live: version {rec.publishedVersion}</Badge>
        {dirty ? <Badge variant="warning">Unsaved changes</Badge> : unpublished ? <Badge variant="info">Draft saved{rec.draftUpdatedAt ? ` ${formatDistanceToNow(new Date(rec.draftUpdatedAt), { addSuffix: true })}` : ""}, not published</Badge> : <Badge variant="muted">Draft matches live</Badge>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <Tabs defaultValue="steps" className="min-w-0">
          <TabsList className="flex h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="steps">Steps</TabsTrigger>
            <TabsTrigger value="fields">Fields</TabsTrigger>
            <TabsTrigger value="reason-q">Per-reason questions</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="rules">Booking rules</TabsTrigger>
            <TabsTrigger value="versions">Versions</TabsTrigger>
            <TabsTrigger value="templates">Starter templates</TabsTrigger>
          </TabsList>

          <TabsContent value="steps" className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Order and layout</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <fieldset className="grid gap-2">
                  <legend className="mb-1 text-sm font-medium">Step order</legend>
                  {(Object.keys(ORDER_LABEL) as StepOrder[]).map((o) => (
                    <label key={o} className="flex items-center gap-2 text-sm">
                      <input type="radio" name="step-order" checked={draft.order === o} onChange={() => up((d) => void (d.order = o))} className="h-4 w-4 accent-teal-700" />
                      {ORDER_LABEL[o]}
                    </label>
                  ))}
                  {draft.order === "provider_first" && !draft.steps.find((s) => s.key === "provider")?.enabled && (
                    <p className="text-xs text-amber-800">Turn on the Provider step for provider-first to take effect.</p>
                  )}
                </fieldset>
                <fieldset className="grid gap-2">
                  <legend className="mb-1 text-sm font-medium">How reasons display</legend>
                  {(["sections", "tabs", "list"] as const).map((o) => (
                    <label key={o} className="flex items-center gap-2 text-sm">
                      <input type="radio" name="reason-display" checked={draft.reasonDisplay === o} onChange={() => up((d) => void (d.reasonDisplay = o))} className="h-4 w-4 accent-teal-700" />
                      {o === "sections" ? "Grouped sections (New / Existing)" : o === "tabs" ? "Tabs (New / Existing)" : "One list"}
                    </label>
                  ))}
                </fieldset>
              </CardContent>
            </Card>
            {draft.steps.map((s) => {
              const always = ALWAYS_ON.includes(s.key);
              return (
                <Card key={s.key} className={cn(!s.enabled && !always && "opacity-75")}>
                  <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                    <div>
                      <CardTitle>{STEP_LABEL[s.key]}</CardTitle>
                      {always && <CardDescription>Always on</CardDescription>}
                    </div>
                    {!always && (
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`st-${s.key}-on`} className="text-sm">{s.enabled ? "On" : "Off"}</Label>
                        <Switch id={`st-${s.key}-on`} checked={s.enabled} onCheckedChange={(v) => upStep(s.key, { enabled: v })} aria-label={`${STEP_LABEL[s.key]} step`} />
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor={`st-${s.key}-t`}>Title</Label>
                      <Input id={`st-${s.key}-t`} value={s.title} onChange={(e) => upStep(s.key, { title: e.target.value })} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`st-${s.key}-s`}>Subtitle</Label>
                      <Input id={`st-${s.key}-s`} value={s.subtitle} onChange={(e) => upStep(s.key, { subtitle: e.target.value })} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`st-${s.key}-b`}>Button text</Label>
                      <Input id={`st-${s.key}-b`} value={s.buttonText} onChange={(e) => upStep(s.key, { buttonText: e.target.value })} disabled={s.key === "reason" || s.key === "provider" || s.key === "datetime"} aria-describedby={s.key === "reason" || s.key === "provider" || s.key === "datetime" ? `st-${s.key}-bh` : undefined} />
                      {(s.key === "reason" || s.key === "provider" || s.key === "datetime") && <p id={`st-${s.key}-bh`} className="text-xs text-muted-foreground">Picking an option moves on automatically.</p>}
                    </div>
                    {!always && (
                      <div className="grid gap-1.5 sm:col-span-3">
                        <p className="text-sm font-medium">Show this step only when</p>
                        <ConditionsEditor idPrefix={`st-${s.key}`} conditions={s.conditions} onChange={(c) => upStep(s.key, { conditions: c })} reasons={reasons} fields={allFieldsForRules} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="fields" className="grid gap-6">
            <Card>
              <CardContent className="pt-5">
                <FieldListEditor
                  title="Patient details fields"
                  description="Name, date of birth, phone and email are built in: rename them or make them optional, but they can't be deleted."
                  fields={draft.fields}
                  onChange={(f) => up((d) => void (d.fields = f))}
                  reasons={reasons}
                  conditionFields={allFieldsForRules}
                  fileUploadsAvailable={uploadsAvailable && draft.fileUploadEnabled}
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <FieldListEditor
                  title="Intake questions"
                  description="Shown in the intake section when the Intake step is on."
                  fields={draft.intakeFields}
                  onChange={(f) => up((d) => void (d.intakeFields = f))}
                  reasons={reasons}
                  conditionFields={allFieldsForRules}
                  fileUploadsAvailable={uploadsAvailable && draft.fileUploadEnabled}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reason-q">
            <Card>
              <CardHeader>
                <CardTitle>Per-reason questions</CardTitle>
                <CardDescription>Asked only for one visit type, e.g. “Which tooth is hurting?” for Emergency Exam. These save immediately and apply to the live widget.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {reasons.length === 0 ? (
                  <EmptyState title="No reasons yet" description="Add reasons for visit first." />
                ) : (
                  <>
                    <div className="grid max-w-sm gap-1.5">
                      <Label htmlFor="rq-reason">Reason</Label>
                      <select id="rq-reason" className={sel} value={qReason?.id} onChange={(e) => setQuestionReasonId(e.target.value)}>
                        {reasons.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.questions.length})</option>)}
                      </select>
                    </div>
                    {qReason && (
                      <FieldListEditor
                        key={qReason.id}
                        title={`Questions for ${qReason.name}`}
                        fields={qReason.questions}
                        onChange={setReasonQuestions}
                        reasons={reasons}
                        conditionFields={[...allFieldsForRules, ...qReason.questions]}
                        fileUploadsAvailable={uploadsAvailable && draft.fileUploadEnabled}
                      />
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="messages">
            <Card>
              <CardHeader>
                <CardTitle>Messages and legal</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {([
                  ["patientInfo", "Information for patient", "Shown on the review step."],
                  ["paidAppointmentNote", "Paid appointment note", "Shown on the review step, e.g. deposit details. Leave blank to hide."],
                  ["noInsuranceMessage", "No-insurance message", "Shown when the patient answers No to insurance."],
                  ["consentText", "SMS consent and legal text", "Shown next to the SMS consent checkbox."],
                ] as const).map(([k, label, help]) => (
                  <div key={k} className="grid gap-1.5">
                    <Label htmlFor={`msg-${k}`}>{label}</Label>
                    <Textarea id={`msg-${k}`} rows={2} value={draft.messages[k]} onChange={(e) => up((d) => void (d.messages[k] = e.target.value))} aria-describedby={`msg-${k}-h`} />
                    <p id={`msg-${k}-h`} className="text-xs text-muted-foreground">{help}</p>
                  </div>
                ))}
                <div className="grid gap-4 sm:grid-cols-2">
                  {([
                    ["termsUrl", "Custom Terms URL"],
                    ["privacyUrl", "Custom Privacy Policy URL"],
                  ] as const).map(([k, label]) => (
                    <div key={k} className="grid gap-1.5">
                      <Label htmlFor={`msg-${k}`}>{label}</Label>
                      <Input id={`msg-${k}`} type="url" placeholder="https://… (blank = clinic's built-in page)" value={draft.messages[k]} onChange={(e) => up((d) => void (d.messages[k] = e.target.value))} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rules" className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Booking rules</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <NumberField id="r-notice" label="Minimum notice (hours)" value={draft.rules.minNoticeHours} onChange={(n) => up((d) => void (d.rules.minNoticeHours = n))} />
                <NumberField id="r-window" label="Booking window (days ahead)" value={draft.rules.bookingWindowDays} min={1} max={365} onChange={(n) => up((d) => void (d.rules.bookingWindowDays = n))} />
                <div className="grid gap-1.5">
                  <Label htmlFor="r-interval">Slot interval</Label>
                  <select id="r-interval" className={sel} value={draft.rules.slotInterval} onChange={(e) => up((d) => void (d.rules.slotInterval = Number(e.target.value)))}>
                    {[5, 10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
                  </select>
                </div>
                <NumberField id="r-buffer" label="Buffer between visits (min)" value={draft.rules.bufferMinutes} max={120} onChange={(n) => up((d) => void (d.rules.bufferMinutes = n))} />
                <NumberField id="r-cap" label="Daily booking cap" value={draft.rules.dailyCap} help="0 = no limit" onChange={(n) => up((d) => void (d.rules.dailyCap = n))} />
                <NumberField id="r-cancel" label="Cancellation window (hours)" value={draft.rules.cancellationWindowHours} help="Patients can't change online inside this window." onChange={(n) => up((d) => void (d.rules.cancellationWindowHours = n))} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Accepting patients</CardTitle>
                  <CardDescription>Pause online booking without unpublishing the widget.</CardDescription>
                </div>
                <Switch checked={draft.rules.acceptingPatients} onCheckedChange={(v) => up((d) => void (d.rules.acceptingPatients = v))} aria-label="Accepting patients" />
              </CardHeader>
              <CardContent className="grid gap-1.5">
                <Label htmlFor="r-paused">Message shown while paused</Label>
                <Textarea id="r-paused" rows={2} value={draft.rules.pausedMessage} onChange={(e) => up((d) => void (d.rules.pausedMessage = e.target.value))} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Verification and uploads</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex items-start gap-3">
                  <Switch id="r-otp" checked={draft.otpEnabled} onCheckedChange={(v) => up((d) => void (d.otpEnabled = v))} />
                  <div>
                    <Label htmlFor="r-otp">OTP check of the patient&apos;s mobile</Label>
                    {!otpAvailable && <p className="text-xs text-amber-800">Not included in your plan. It stays hidden on the widget until Kivi turns on the OTP feature.</p>}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Switch id="r-files" checked={draft.fileUploadEnabled} onCheckedChange={(v) => up((d) => void (d.fileUploadEnabled = v))} />
                  <div>
                    <Label htmlFor="r-files">Allow file uploads</Label>
                    {!uploadsAvailable && <p className="text-xs text-amber-800">Not included in your plan. File fields stay hidden until Kivi turns on File uploads.</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="versions">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><History className="h-4 w-4" aria-hidden /> Version history</CardTitle>
                <CardDescription>Rolling back publishes the old version again as a new version, so nothing is lost.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Version</TableHead>
                      <TableHead>Published</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...rec.versions].sort((a, b) => b.version - a.version).map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium">v{v.version} {v.version === rec.publishedVersion && <Badge variant="success" className="ml-1">Live</Badge>}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{format(new Date(v.publishedAt), "MMM d, yyyy h:mm a")}</TableCell>
                        <TableCell className="text-xs">{v.publishedBy}</TableCell>
                        <TableCell className="text-xs">{v.note}</TableCell>
                        <TableCell className="text-right">
                          {v.version !== rec.publishedVersion && (
                            <Button size="xs" variant="outline" onClick={() => setRollbackTo(v.version)}><RotateCcw /> Roll back</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates">
            <div className="grid gap-4 sm:grid-cols-2">
              {publishedTemplates.length === 0 && <EmptyState title="No starter templates" description="Kivi hasn't published any templates yet." />}
              {publishedTemplates.map((t) => (
                <Card key={t.id} className={cn(t.specialty === clinic.specialty && "border-primary")}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" aria-hidden /> {t.name}</CardTitle>
                    <CardDescription>{SPECIALTY_LABEL[t.specialty]}{t.specialty === clinic.specialty ? " · matches your specialty" : ""}</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 text-sm">
                    <p>{t.description}</p>
                    <p className="text-xs text-muted-foreground">Default reasons: {t.defaultReasons.map((r) => r.name).join(", ")}</p>
                    <Button variant="outline" size="sm" onClick={() => setTemplateId(t.id)}>Copy into draft</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <section aria-label="Live preview" className="xl:sticky xl:top-20 xl:self-start">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto font-semibold">Live preview</h2>
            <div role="group" aria-label="Preview device" className="inline-flex rounded-md border p-0.5">
              <Button size="xs" variant={device === "mobile" ? "secondary" : "ghost"} aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}><Smartphone /> Mobile</Button>
              <Button size="xs" variant={device === "desktop" ? "secondary" : "ghost"} aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}><Monitor /> Desktop</Button>
            </div>
            <label htmlFor="pv-theme" className="sr-only">Preview theme</label>
            <select id="pv-theme" className="h-8 rounded-md border bg-card px-2 text-xs" value={previewTheme} onChange={(e) => setPreviewTheme(e.target.value as WidgetTheme | "clinic")}>
              <option value="clinic">Clinic theme</option>
              <option value="compact">Compact</option>
              <option value="full_page">Full Page</option>
              <option value="reason_first">Reason First</option>
            </select>
            <Button size="xs" variant="ghost" onClick={() => setPreviewKey((k) => k + 1)} aria-label="Restart preview"><RotateCcw /></Button>
          </div>
          <div className={cn("mx-auto overflow-hidden border bg-white shadow-inner", device === "mobile" ? "w-[390px] max-w-full rounded-[2rem] border-8 border-slate-800" : "w-full rounded-lg")}>
            <div className="h-[720px] overflow-y-auto">
              <BookingWidget key={previewKey} bundle={previewBundle(clinic, config, draft, { otp: otpAvailable, file_uploads: uploadsAvailable })} slug={clinic.slug} flowOverride={draft} mode="preview" forceMobile={device === "mobile"} themeOverride={previewTheme === "clinic" ? undefined : previewTheme} embedded />
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">Preview uses your draft. It doesn&apos;t create bookings, send messages or log analytics.</p>
        </section>
      </div>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish version {rec.publishedVersion + 1}?</DialogTitle>
            <DialogDescription>Patients will see these changes right away. You can roll back any time.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="pub-note">What changed? (optional)</Label>
            <Input id="pub-note" value={publishNote} onChange={(e) => setPublishNote(e.target.value)} placeholder="e.g. Added referral question" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishOpen(false)}>Cancel</Button>
            <Button onClick={publish}><Send /> Publish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={rollbackTo !== null} onOpenChange={(o) => !o && setRollbackTo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Roll back to version {rollbackTo}?</DialogTitle>
            <DialogDescription>This publishes v{rollbackTo} as a new version and replaces your current draft.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackTo(null)}>Cancel</Button>
            <Button onClick={() => rollbackTo !== null && rollback(rollbackTo)}><RotateCcw /> Roll back</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={templateId !== null} onOpenChange={(o) => !o && setTemplateId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy “{templates.find((t) => t.id === templateId)?.name}” into your draft?</DialogTitle>
            <DialogDescription>Your draft steps, fields, messages and rules are replaced. The live widget doesn&apos;t change until you publish.</DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3">
            <Checkbox id="tpl-reasons" checked={addReasons} onCheckedChange={(c) => setAddReasons(c === true)} />
            <Label htmlFor="tpl-reasons" className="leading-snug">Also add the template&apos;s default reasons (added as inactive until you assign providers)</Label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateId(null)}>Cancel</Button>
            <Button onClick={applyTemplate}>Copy into draft</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
