import { prisma } from '../../db.js';
import { badRequest, notFound } from '../http.js';
import { executeAction, type RuleRef } from './actions.js';
import { checkConditions, matchTrigger } from './conditions.js';
import { buildContext, type AutoContext } from './context.js';
import type { EntityType } from './events.js';
import { delayMs, type RuleInput } from './schema.js';
import { clientActivity, statusSince } from './time.js';

/**
 * "Test on a case": evaluates a rule (saved or still being edited) against a real case — or the latest
 * application / booking / inquiry — exactly like the engine would, but every action only describes itself.
 * Nothing is written.
 */

const DAY = 86_400_000;

const synthesize = async (rule: RuleInput, target: { caseId?: string; entityId?: string }): Promise<{ ctx: AutoContext | null; note?: string; triggerOk?: boolean; triggerReason?: string }> => {
  const t = rule.trigger;
  const build = (entityType: EntityType, entityId: string, caseId: string | null, payload: Record<string, unknown>) =>
    buildContext({ triggerType: t.type, entityType, entityId, caseId, payload });

  if (t.type === 'APPLICATION_STATUS_CHANGED' || t.type === 'BOOKING_CREATED' || t.type === 'INQUIRY_CREATED') {
    let id = target.entityId;
    const clientId = target.caseId ? (await prisma.case.findUnique({ where: { id: target.caseId }, select: { clientId: true } }))?.clientId : undefined;
    if (!id && t.type === 'APPLICATION_STATUS_CHANGED') id = (await prisma.vacancyApplication.findFirst({ where: clientId ? { userId: clientId } : {}, orderBy: { updatedAt: 'desc' }, select: { id: true } }))?.id;
    if (!id && t.type === 'BOOKING_CREATED') id = (await prisma.booking.findFirst({ where: clientId ? { userId: clientId } : {}, orderBy: { createdAt: 'desc' }, select: { id: true } }))?.id;
    if (!id && t.type === 'INQUIRY_CREATED') id = (await prisma.inquiry.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } }))?.id;
    if (!id) return { ctx: null, note: 'NO_SAMPLE_ENTITY' };
    const entityType: EntityType = t.type === 'APPLICATION_STATUS_CHANGED' ? 'application' : t.type === 'BOOKING_CREATED' ? 'booking' : 'inquiry';
    const ctx = await build(entityType, id, null, {});
    if (ctx?.application) ctx.payload = { to: ctx.application.status };
    return { ctx };
  }

  if (!target.caseId) throw badRequest('CASE_REQUIRED');
  const c = await prisma.case.findUnique({ where: { id: target.caseId }, select: { id: true, status: true, appointmentAt: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  switch (t.type) {
    case 'CASE_STATUS_CHANGED': {
      const last = await prisma.caseEvent.findFirst({ where: { caseId: c.id, toStatus: c.status, fromStatus: { not: null } }, orderBy: { createdAt: 'desc' }, select: { fromStatus: true } });
      return { ctx: await build('case', c.id, c.id, { from: last?.fromStatus ?? null, to: c.status }) };
    }
    case 'CASE_CREATED':
    case 'CONTRACT_SIGNED':
      return { ctx: await build('case', c.id, c.id, { to: c.status }) };
    case 'APPOINTMENT_SET':
      return { ctx: await build('case', c.id, c.id, { at: c.appointmentAt?.toISOString() ?? null, rescheduled: false }) };
    case 'DOCUMENT_UPLOADED':
    case 'DOCUMENT_ACCEPTED':
    case 'DOCUMENT_REJECTED': {
      const status = t.type === 'DOCUMENT_ACCEPTED' ? 'ACCEPTED' : t.type === 'DOCUMENT_REJECTED' ? 'REJECTED' : undefined;
      const d = await prisma.document.findFirst({ where: { caseId: c.id, ...(status ? { status } : {}), ...(t.stages.length ? { stage: { in: t.stages } } : {}) }, orderBy: { createdAt: 'desc' }, select: { id: true } });
      if (!d) return { ctx: await build('case', c.id, c.id, {}), triggerOk: false, triggerReason: 'NO_MATCHING_DOCUMENT' };
      return { ctx: await build('document', d.id, c.id, {}) };
    }
    case 'CLIENT_INACTIVE': {
      const last = (await clientActivity({ caseIds: [c.id] })).get(c.id);
      const ctx = await build('case', c.id, c.id, { days: t.days, lastActivityAt: last?.toISOString() ?? null });
      const idle = last ? Math.floor((Date.now() - last.getTime()) / DAY) : 0;
      if (!last) return { ctx, triggerOk: false, triggerReason: 'CASE_CLOSED' };
      if (t.statuses.length && !(t.statuses as string[]).includes(c.status)) return { ctx, triggerOk: false, triggerReason: 'STATUS_MISMATCH' };
      return { ctx, triggerOk: idle >= t.days, triggerReason: idle >= t.days ? undefined : `IDLE_ONLY_${idle}_DAYS` };
    }
    case 'STATUS_DURATION': {
      const since = (await statusSince({ caseIds: [c.id] })).get(c.id);
      const ctx = await build('case', c.id, c.id, { days: t.days, status: t.status, since: since?.toISOString() ?? null });
      if (c.status !== t.status) return { ctx, triggerOk: false, triggerReason: 'STATUS_MISMATCH' };
      const days = since ? Math.floor((Date.now() - since.getTime()) / DAY) : 0;
      return { ctx, triggerOk: days >= t.days, triggerReason: days >= t.days ? undefined : `IN_STATUS_ONLY_${days}_DAYS` };
    }
  }
};

export const dryRunRule = async (rule: RuleInput & { id?: string; createdById?: string | null; updatedById?: string | null }, target: { caseId?: string; entityId?: string }) => {
  const { ctx, note, triggerOk, triggerReason } = await synthesize(rule, target);
  if (!ctx) return { matched: false, trigger: { ok: false, reason: note ?? 'ENTITY_NOT_FOUND' }, conditions: [], actions: [], sample: null };
  const trig = triggerOk === undefined ? matchTrigger(rule.trigger, ctx) : { ok: triggerOk, reason: triggerReason };
  const cond = await checkConditions(rule.conditions, ctx);
  const ref: RuleRef = { id: rule.id ?? 'draft', name: rule.name, createdById: rule.createdById ?? null, updatedById: rule.updatedById ?? null };
  const actions = [];
  for (const [index, a] of rule.actions.entries()) {
    const outcome = await executeAction(a, ctx, ref, { dryRun: true });
    actions.push({ index, type: a.type, delayMs: delayMs(a), onlyIfStillTrue: !!a.onlyIfStillTrue, ...outcome });
  }
  return {
    matched: trig.ok && cond.ok,
    trigger: trig,
    conditions: cond.results,
    actions,
    sample: {
      entityType: ctx.entityType,
      entityId: ctx.entityId,
      case: ctx.case ? { id: ctx.case.id, number: ctx.case.number, status: ctx.case.status } : null,
      payload: ctx.payload,
    },
  };
};
