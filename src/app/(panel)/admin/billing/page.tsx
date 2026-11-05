"use client";

import { useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { Plus, Send } from "lucide-react";
import type { FeatureKey, Invoice, Plan } from "@/types";
import { FEATURE_LABELS } from "@/types";
import { api } from "@/lib/api/client";
import { qk, useApiMutation } from "@/lib/api/session";
import { useAdminClinics, useAdminCoupons, useAdminInvoices, useAdminPlans } from "@/lib/api/admin";
import { currency } from "@/lib/utils";
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
const ADMIN_KEYS = [qk.admin()];

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
  const plans = useAdminPlans();
  const canEdit = useAdminCan()("admin:plans:edit");
  const [editing, setEditing] = useState<Plan | null>(null);
  return (
    <>
      <ListState items={plans.data ?? []} loading={plans.isLoading} emptyTitle="No plans">
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
  const [v, setV] = useState(structuredClone(plan));
  const save = useApiMutation((body: Plan) => api(`/api/admin/plans/${plan.id}`, { method: "PATCH", body: { name: body.name.trim(), priceMonthly: body.priceMonthly, limits: body.limits } }), {
    invalidate: ADMIN_KEYS,
    success: `${v.name} plan saved`,
    onSuccess: onClose,
  });
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
          <Button disabled={!v.name.trim() || save.isPending} onClick={() => save.mutate(v)}>
            Save plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClinicPlans() {
  const clinicsQ = useAdminClinics();
  const plans = useAdminPlans().data ?? [];
  const canEdit = useAdminCan()("admin:plans:edit");
  const live = useMemo(() => (clinicsQ.data ?? []).filter((c) => !c.deletedAt), [clinicsQ.data]);
  const patch = useApiMutation((v: { id: string; body: Record<string, unknown>; msg: string }) => api(`/api/admin/clinics/${v.id}`, { method: "PATCH", body: v.body }), {
    invalidate: ADMIN_KEYS,
    success: (_r, v) => v.msg,
  });
  return (
    <div className="rounded-lg border bg-card">
      <ListState items={live} loading={clinicsQ.isLoading} emptyTitle="No clinics">
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
                        patch.mutate({ id: c.id, body: { planId }, msg: `${c.name} moved to ${plans.find((p) => p.id === planId)?.name}` });
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
                          onClick={() => patch.mutate({ id: c.id, body: { trialEndsAt: addDays(new Date(c.trialEndsAt ?? Date.now()), 7).toISOString() }, msg: "Trial extended by 7 days" })}
                        >
                          Extend 7 days
                        </Button>
                        <Button
                          size="xs"
                          onClick={() => patch.mutate({ id: c.id, body: { status: "active", trialEndsAt: null }, msg: `${c.name} converted to paid` })}
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
  const invoicesQ = useAdminInvoices();
  const clinics = useAdminClinics().data ?? [];
  const plans = useAdminPlans().data ?? [];
  const canEdit = useAdminCan()("admin:billing");
  const [status, setStatus] = useState<"all" | Invoice["status"]>("all");
  const [creating, setCreating] = useState(false);
  const invoices = useMemo(() => invoicesQ.data ?? [], [invoicesQ.data]);
  const rows = useMemo(() => invoices.filter((i) => status === "all" || i.status === status).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)), [invoices, status]);
  const name = (id: string) => clinics.find((c) => c.id === id)?.name ?? id;
  const dunningM = useApiMutation((inv: Invoice) => api(`/api/admin/invoices/${inv.id}/dunning`, { method: "POST" }), { invalidate: ADMIN_KEYS, success: (_r, inv) => `Dunning email queued for ${name(inv.clinicId)}` });
  const paidM = useApiMutation((inv: Invoice) => api(`/api/admin/invoices/${inv.id}`, { method: "PATCH", body: { status: "paid" } }), { invalidate: ADMIN_KEYS, success: (_r, inv) => `${inv.number} marked paid` });
  const dunning = (inv: Invoice) => dunningM.mutate(inv);

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
        <ListState items={rows} loading={invoicesQ.isLoading} emptyTitle="No invoices">
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
                          <Button size="xs" onClick={() => paidM.mutate(i)}>
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
        />
      )}
    </div>
  );
}

function ManualInvoiceDialog({ onClose, clinics, defaultAmount }: { onClose: () => void; clinics: { id: string; name: string }[]; defaultAmount: (id: string) => number }) {
  const [clinicId, setClinicId] = useState(clinics[0]?.id ?? "");
  const [amount, setAmount] = useState(String(defaultAmount(clinics[0]?.id ?? "")));
  const [due, setDue] = useState(14);
  const create = useApiMutation((body: { clinicId: string; amount: number; dueInDays: number }) => api<Invoice>("/api/admin/invoices", { body }), {
    invalidate: ADMIN_KEYS,
    success: (inv) => `Invoice ${inv.number} created`,
    onSuccess: onClose,
  });
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
            <Field label="Due in (days)" htmlFor="inv-due"><Input id="inv-due" type="number" min={1} max={90} value={due} onChange={(e) => setDue(Number(e.target.value) || 1)} /></Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!clinicId || !(Number(amount) > 0) || create.isPending} onClick={() => create.mutate({ clinicId, amount: Math.round(Number(amount)), dueInDays: Math.max(1, Math.min(90, due)) })}>
            Create invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Coupons() {
  const couponsQ = useAdminCoupons();
  const coupons = couponsQ.data ?? [];
  const canEdit = useAdminCan()("admin:billing");
  const [code, setCode] = useState("");
  const [pct, setPct] = useState("10");
  const dup = coupons.some((c) => c.code === code.trim().toUpperCase());
  const create = useApiMutation((body: { code: string; percentOff: number }) => api("/api/admin/coupons", { body }), { invalidate: ADMIN_KEYS, success: (_r, b) => `Coupon ${b.code} created`, onSuccess: () => setCode("") });
  const toggle = useApiMutation((v: { id: string; active: boolean }) => api(`/api/admin/coupons/${v.id}`, { method: "PATCH", body: { active: v.active } }), { invalidate: ADMIN_KEYS, success: false });
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
            create.mutate({ code: c, percentOff: p });
          }}
        >
          <Field label="Code" htmlFor="cp-code" hint={dup ? "Code already exists." : undefined}><Input id="cp-code" className="h-9 w-40 uppercase" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
          <Field label="% off" htmlFor="cp-pct"><Input id="cp-pct" className="h-9 w-24" type="number" min={1} max={100} value={pct} onChange={(e) => setPct(e.target.value)} /></Field>
          <Button type="submit" size="sm" disabled={!code.trim() || dup}><Plus /> Add coupon</Button>
        </form>
      )}
      <div className="rounded-lg border bg-card">
        <ListState items={coupons} loading={couponsQ.isLoading} emptyTitle="No coupons">
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
                        onCheckedChange={(on) => toggle.mutate({ id: c.id, active: on })}
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
