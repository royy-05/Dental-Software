"use client";

import { useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { Plus, Send } from "lucide-react";
import { toast } from "sonner";
import type { FeatureKey, Invoice, MessageLog, Plan } from "@/types";
import { FEATURE_LABELS } from "@/types";
import { useApp } from "@/store/app";
import { currency, uid } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { ListState } from "@/components/shared/states";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminGuard, ClinicStatusBadge, Field, NativeSelect, Section, useAdminCan } from "@/components/admin-pages/common";

const INVOICE_VARIANT: Record<Invoice["status"], BadgeProps["variant"]> = { paid: "success", open: "info", overdue: "danger", void: "muted" };

export default function BillingPage() {
  return (
    <AdminGuard perm="admin:billing">
      <Billing />
    </AdminGuard>
  );
}

function Billing() {
  return (
    <div>
      <PageHeader title="Plans & billing" description="Billing through Stripe is a later phase; manual invoicing until then. All amounts are demo data." />
      <Tabs defaultValue="plans">
        <TabsList>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="clinics">Clinic plans & trials</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="coupons">Coupons</TabsTrigger>
        </TabsList>
        <TabsContent value="plans"><Plans /></TabsContent>
        <TabsContent value="clinics"><ClinicPlans /></TabsContent>
        <TabsContent value="invoices"><Invoices /></TabsContent>
        <TabsContent value="coupons"><Coupons /></TabsContent>
      </Tabs>
    </div>
  );
}

function Plans() {
  const plans = useApp((s) => s.db.plans);
  const canEdit = useAdminCan()("admin:plans:edit");
  const [editing, setEditing] = useState<Plan | null>(null);
  return (
    <>
      <ListState items={plans} emptyTitle="No plans">
        {(list) => (
          <div className="grid gap-4 md:grid-cols-3">
            {list.map((p) => (
              <Section key={p.id} title={p.name} description={`${currency(p.priceMonthly)} / month`} actions={canEdit && <Button size="sm" variant="outline" onClick={() => setEditing(p)}>Edit</Button>}>
                <dl className="grid grid-cols-2 gap-1 text-sm">
                  <dt className="text-muted-foreground">Locations</dt><dd>{p.limits.locations}</dd>
                  <dt className="text-muted-foreground">Providers</dt><dd>{p.limits.providers}</dd>
                  <dt className="text-muted-foreground">SMS credits</dt><dd>{p.limits.smsCredits.toLocaleString()}</dd>
                </dl>
                <div className="mt-3 flex flex-wrap gap-1">
                  {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((k) => (
                    <Badge key={k} variant={p.limits.modules.includes(k) ? "secondary" : "muted"} className={p.limits.modules.includes(k) ? "" : "line-through"}>{FEATURE_LABELS[k]}</Badge>
                  ))}
                </div>
              </Section>
            ))}
          </div>
        )}
      </ListState>
      {editing && <PlanDialog plan={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function PlanDialog({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const [v, setV] = useState(structuredClone(plan));
  const num = (s: string) => Math.max(0, Number(s) || 0);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit plan</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="p-name"><Input id="p-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="Price / month (USD)" htmlFor="p-price"><Input id="p-price" type="number" min={0} value={v.priceMonthly} onChange={(e) => setV({ ...v, priceMonthly: num(e.target.value) })} /></Field>
          <Field label="Locations" htmlFor="p-loc"><Input id="p-loc" type="number" min={0} value={v.limits.locations} onChange={(e) => setV({ ...v, limits: { ...v.limits, locations: num(e.target.value) } })} /></Field>
          <Field label="Providers" htmlFor="p-prov"><Input id="p-prov" type="number" min={0} value={v.limits.providers} onChange={(e) => setV({ ...v, limits: { ...v.limits, providers: num(e.target.value) } })} /></Field>
          <Field label="SMS credits" htmlFor="p-sms"><Input id="p-sms" type="number" min={0} value={v.limits.smsCredits} onChange={(e) => setV({ ...v, limits: { ...v.limits, smsCredits: num(e.target.value) } })} /></Field>
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Modules</legend>
          {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={v.limits.modules.includes(k)} onChange={(e) => setV({ ...v, limits: { ...v.limits, modules: e.target.checked ? [...v.limits.modules, k] : v.limits.modules.filter((m) => m !== k) } })} />
              {FEATURE_LABELS[k]}
            </label>
          ))}
        </fieldset>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!v.name.trim()}
            onClick={() => {
              mutate((d) => Object.assign(d.plans.find((p) => p.id === plan.id)!, v));
              logAudit({ action: "Edited plan", category: "billing", target: v.name });
              toast.success(`${v.name} plan saved`);
              onClose();
            }}
          >
            Save plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClinicPlans() {
  const clinics = useApp((s) => s.db.clinics);
  const plans = useApp((s) => s.db.plans);
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const canEdit = useAdminCan()("admin:plans:edit");
  const live = useMemo(() => clinics.filter((c) => !c.deletedAt), [clinics]);
  return (
    <div className="rounded-lg border bg-card">
      <ListState items={live} emptyTitle="No clinics">
        {(list) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clinic</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Trial</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell><ClinicStatusBadge status={c.status} /></TableCell>
                  <TableCell>
                    <NativeSelect
                      aria-label={`Plan for ${c.name}`}
                      className="h-9"
                      disabled={!canEdit}
                      value={c.planId}
                      onChange={(e) => {
                        const planId = e.target.value;
                        mutate((d) => void (d.clinics.find((x) => x.id === c.id)!.planId = planId));
                        logAudit({ action: "Changed clinic plan", category: "billing", target: c.name, clinicId: c.id, details: `Now ${plans.find((p) => p.id === planId)?.name}` });
                        toast.success(`${c.name} moved to ${plans.find((p) => p.id === planId)?.name}`);
                      }}
                    >
                      {plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({currency(p.priceMonthly)})</option>)}
                    </NativeSelect>
                  </TableCell>
                  <TableCell className="text-sm">{c.status === "trial" && c.trialEndsAt ? `Ends ${format(new Date(c.trialEndsAt), "MMM d")}` : "—"}</TableCell>
                  <TableCell className="text-right">
                    {canEdit && c.status === "trial" && (
                      <div className="flex justify-end gap-1">
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            mutate((d) => {
                              const x = d.clinics.find((y) => y.id === c.id)!;
                              x.trialEndsAt = addDays(new Date(x.trialEndsAt ?? Date.now()), 7).toISOString();
                            });
                            logAudit({ action: "Extended trial by 7 days", category: "billing", target: c.name, clinicId: c.id });
                            toast.success("Trial extended by 7 days");
                          }}
                        >
                          Extend 7 days
                        </Button>
                        <Button
                          size="xs"
                          onClick={() => {
                            mutate((d) => {
                              const x = d.clinics.find((y) => y.id === c.id)!;
                              x.status = "active";
                              x.trialEndsAt = undefined;
                            });
                            logAudit({ action: "Converted trial to paid", category: "billing", target: c.name, clinicId: c.id });
                            toast.success(`${c.name} converted to paid`);
                          }}
                        >
                          Convert
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ListState>
    </div>
  );
}

function Invoices() {
  const invoices = useApp((s) => s.db.invoices);
  const clinics = useApp((s) => s.db.clinics);
  const plans = useApp((s) => s.db.plans);
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const addMessages = useApp((s) => s.addMessages);
  const canEdit = useAdminCan()("admin:billing");
  const [status, setStatus] = useState<"all" | Invoice["status"]>("all");
  const [creating, setCreating] = useState(false);
  const rows = useMemo(() => invoices.filter((i) => status === "all" || i.status === status).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)), [invoices, status]);
  const name = (id: string) => clinics.find((c) => c.id === id)?.name ?? id;

  const dunning = (inv: Invoice) => {
    const clinic = clinics.find((c) => c.id === inv.clinicId);
    if (!clinic) return;
    const msg: MessageLog = {
      id: uid("msg"),
      clinicId: clinic.id,
      channel: "email",
      direction: "outbound",
      recipientType: "clinic",
      to: clinic.email,
      event: "test",
      subject: `Payment reminder: invoice ${inv.number} is overdue`,
      body: `Hi ${clinic.name},\n\nInvoice ${inv.number} for ${currency(inv.amount)} was due on ${format(new Date(inv.dueAt), "MMM d, yyyy")}. Please pay to avoid interruption.\n\nKivi Health billing`,
      status: "delivered",
      createdAt: new Date().toISOString(),
    };
    addMessages([msg]);
    mutate((d) => void (d.invoices.find((i) => i.id === inv.id)!.dunningEmailsSent += 1));
    logAudit({ action: "Sent dunning email", category: "billing", target: inv.number, clinicId: clinic.id });
    toast.success(`Dunning email sent to ${clinic.email}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label="Invoice status" className="h-9" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">All invoices</option>
          <option value="open">Open</option>
          <option value="overdue">Overdue</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </NativeSelect>
        {canEdit && <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}><Plus /> Manual invoice</Button>}
      </div>
      <div className="rounded-lg border bg-card">
        <ListState items={rows} emptyTitle="No invoices">
          {(list) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Clinic</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dunning</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs">{i.number}</TableCell>
                    <TableCell>{name(i.clinicId)}</TableCell>
                    <TableCell className="text-right tabular-nums">{currency(i.amount)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{format(new Date(i.issuedAt), "MMM d, yyyy")}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{format(new Date(i.dueAt), "MMM d, yyyy")}</TableCell>
                    <TableCell><Badge variant={INVOICE_VARIANT[i.status]} className="capitalize">{i.status}</Badge></TableCell>
                    <TableCell className="text-xs">{i.dunningEmailsSent} sent</TableCell>
                    <TableCell>
                      {canEdit && (i.status === "open" || i.status === "overdue") && (
                        <div className="flex justify-end gap-1">
                          {i.status === "overdue" && <Button size="xs" variant="outline" onClick={() => dunning(i)}><Send /> Dunning</Button>}
                          <Button
                            size="xs"
                            onClick={() => {
                              mutate((d) => void (d.invoices.find((x) => x.id === i.id)!.status = "paid"));
                              logAudit({ action: "Marked invoice paid", category: "billing", target: i.number, clinicId: i.clinicId });
                              toast.success(`${i.number} marked paid`);
                            }}
                          >
                            Mark paid
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ListState>
      </div>
      {creating && (
        <ManualInvoiceDialog
          onClose={() => setCreating(false)}
          clinics={clinics.filter((c) => !c.deletedAt)}
          defaultAmount={(cid) => plans.find((p) => p.id === clinics.find((c) => c.id === cid)?.planId)?.priceMonthly ?? 0}
          nextNumber={`KV-${1000 + invoices.length + 1}`}
        />
      )}
    </div>
  );
}

function ManualInvoiceDialog({ onClose, clinics, defaultAmount, nextNumber }: { onClose: () => void; clinics: { id: string; name: string }[]; defaultAmount: (id: string) => number; nextNumber: string }) {
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const [clinicId, setClinicId] = useState(clinics[0]?.id ?? "");
  const [amount, setAmount] = useState(String(defaultAmount(clinics[0]?.id ?? "")));
  const [due, setDue] = useState(14);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Create manual invoice</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Field label="Clinic" htmlFor="inv-clinic">
            <NativeSelect id="inv-clinic" value={clinicId} onChange={(e) => { setClinicId(e.target.value); setAmount(String(defaultAmount(e.target.value))); }}>
              {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (USD)" htmlFor="inv-amount"><Input id="inv-amount" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Due in (days)" htmlFor="inv-due"><Input id="inv-due" type="number" min={0} value={due} onChange={(e) => setDue(Number(e.target.value) || 0)} /></Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!clinicId || !(Number(amount) > 0)}
            onClick={() => {
              const now = new Date();
              mutate((d) =>
                void d.invoices.push({ id: uid("inv"), clinicId, number: nextNumber, amount: Number(amount), issuedAt: now.toISOString(), dueAt: addDays(now, due).toISOString(), status: "open", dunningEmailsSent: 0 }),
              );
              logAudit({ action: "Created manual invoice", category: "billing", target: nextNumber, clinicId });
              toast.success(`Invoice ${nextNumber} created`);
              onClose();
            }}
          >
            Create invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Coupons() {
  const coupons = useApp((s) => s.db.coupons);
  const mutate = useApp((s) => s.mutate);
  const logAudit = useApp((s) => s.logAudit);
  const canEdit = useAdminCan()("admin:billing");
  const [code, setCode] = useState("");
  const [pct, setPct] = useState("10");
  const dup = coupons.some((c) => c.code === code.trim().toUpperCase());
  return (
    <div className="space-y-3">
      {canEdit && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const c = code.trim().toUpperCase();
            const p = Number(pct);
            if (!c || dup || !(p > 0 && p <= 100)) return;
            mutate((d) => void d.coupons.push({ id: uid("cp"), code: c, percentOff: p, active: true, redemptions: 0 }));
            logAudit({ action: "Created coupon", category: "billing", target: c });
            toast.success(`Coupon ${c} created`);
            setCode("");
          }}
        >
          <Field label="Code" htmlFor="cp-code" hint={dup ? "Code already exists." : undefined}><Input id="cp-code" className="h-9 w-40 uppercase" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
          <Field label="% off" htmlFor="cp-pct"><Input id="cp-pct" className="h-9 w-24" type="number" min={1} max={100} value={pct} onChange={(e) => setPct(e.target.value)} /></Field>
          <Button type="submit" size="sm" disabled={!code.trim() || dup}><Plus /> Add coupon</Button>
        </form>
      )}
      <div className="rounded-lg border bg-card">
        <ListState items={coupons} emptyTitle="No coupons">
          {(list) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Redemptions</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono">{c.code}</TableCell>
                    <TableCell>{c.percentOff}% off</TableCell>
                    <TableCell>{c.redemptions}</TableCell>
                    <TableCell>
                      <Switch
                        aria-label={`Coupon ${c.code} active`}
                        checked={c.active}
                        disabled={!canEdit}
                        onCheckedChange={(on) => {
                          mutate((d) => void (d.coupons.find((x) => x.id === c.id)!.active = on));
                          logAudit({ action: `${on ? "Enabled" : "Disabled"} coupon`, category: "billing", target: c.code });
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ListState>
      </div>
    </div>
  );
}
