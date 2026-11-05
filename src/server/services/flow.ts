import type { ClinicFlow, FlowConfig } from "@/types";
import type { Tx } from "../db";
import { badRequest, notFound } from "../errors";
import { json, toClinicFlow } from "../mappers";

/** Step and form builder persistence (section 4): draft, versions, publish, roll back, starter templates. */

export async function loadFlow(tx: Tx, clinicId: string): Promise<ClinicFlow> {
  const [flow, versions] = await Promise.all([tx.clinicFlow.findUnique({ where: { clinicId } }), tx.flowVersion.findMany({ where: { clinicId } })]);
  if (!flow) throw notFound("Booking flow");
  return toClinicFlow(flow, versions);
}

export async function saveDraft(tx: Tx, clinicId: string, config: FlowConfig): Promise<ClinicFlow> {
  await tx.clinicFlow.update({ where: { clinicId }, data: { draft: json(config), draftUpdatedAt: new Date() } });
  return loadFlow(tx, clinicId);
}

export async function publishFlow(tx: Tx, clinicId: string, config: FlowConfig, by: string, note: string): Promise<{ flow: ClinicFlow; version: number }> {
  const max = (await tx.flowVersion.aggregate({ where: { clinicId }, _max: { version: true } }))._max.version ?? 0;
  const version = max + 1;
  await tx.flowVersion.create({ data: { clinicId, version, publishedBy: by, note, config: json(config) } });
  await tx.clinicFlow.update({ where: { clinicId }, data: { draft: json(config), publishedVersion: version, draftUpdatedAt: null } });
  return { flow: await loadFlow(tx, clinicId), version };
}

/** Roll back = publish the old config again as a new version, so history is never lost. */
export async function rollbackFlow(tx: Tx, clinicId: string, version: number, by: string) {
  const v = await tx.flowVersion.findUnique({ where: { clinicId_version: { clinicId, version } } });
  if (!v) throw notFound("Flow version");
  return publishFlow(tx, clinicId, v.config as unknown as FlowConfig, by, `Rolled back to v${version}`);
}

export async function draftFromStarter(tx: Tx, clinicId: string, templateId: string): Promise<ClinicFlow> {
  const t = await tx.starterTemplate.findUnique({ where: { id: templateId } });
  if (!t || !t.published) throw badRequest("That starter template is not available.");
  const current = await loadFlow(tx, clinicId);
  const next = structuredClone(t.flow as unknown as FlowConfig);
  next.rules.acceptingPatients = current.draft.rules.acceptingPatients;
  next.rules.pausedMessage = current.draft.rules.pausedMessage;
  return saveDraft(tx, clinicId, next);
}
