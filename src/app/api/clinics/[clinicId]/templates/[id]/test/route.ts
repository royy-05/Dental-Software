import { handler, idParams } from "@/server/http";
import { withTenant } from "@/server/db";
import { audit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { renderTemplate, templateVars } from "@/lib/notify";
import { loadClinic } from "@/server/services/clinic";
import { enqueueMessages } from "@/server/jobs/queue";
import { sampleAppointment } from "@/components/config/template-preview";
import { listProviders, listReasons } from "@/server/services/config";
import { toWall } from "@/lib/time";

/** Test sends go to the signed-in user's email, or the clinic's alternate SMS number / phone (docs/assumptions.md). */
export const POST = handler({ summary: "Send a test of this template with sample data to yourself (email) or the clinic number (SMS)", access: { kind: "clinic", permission: "templates:manage" }, params: idParams("id") }, async ({ clinicId, params, actor, auth }) => {
  const jobs = await withTenant(clinicId, async (tx) => {
    const t = await tx.messageTemplate.findUnique({ where: { id: params.id } });
    if (!t) throw notFound("Template");
    const [clinic, reasons, providers] = await Promise.all([loadClinic(tx, clinicId), listReasons(tx), listProviders(tx)]);
    const start = toWall(new Date(Date.now() + 2 * 86400000)).slice(0, 11) + "10:00";
    const appt = sampleAppointment(clinicId, reasons[0]?.id ?? "", providers[0]?.id ?? "", start);
    const vars = templateVars(clinic, appt, reasons[0], providers[0], process.env.APP_BASE_URL);
    const to = t.channel === "email" ? auth.email : clinic.settings.notifications.alternateSmsNumber || clinic.phone;
    const row = await tx.messageLog.create({
      data: { clinicId, channel: t.channel, direction: "outbound", recipientType: "clinic", to, event: "test", subject: t.channel === "email" ? `[Test] ${renderTemplate(t.subject, vars)}` : null, body: renderTemplate(t.body, vars), status: "queued" },
    });
    await audit(tx, actor, { action: `Sent test ${t.channel.toUpperCase()} template`, category: "template", target: "Templates", clinicId });
    return [{ messageId: row.id }];
  });
  await enqueueMessages(jobs);
  return { ok: true, messageId: jobs[0].messageId };
});
