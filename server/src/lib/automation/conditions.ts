import { prisma } from '../../db.js';
import type { AutoContext } from './context.js';
import type { Condition, Trigger } from './schema.js';

/**
 * Trigger filters (WHEN … from X to Y, stage, …), conditions (IF, all must hold) and the "only if still true"
 * re-check of delayed actions. Pure reads, so the dry run uses exactly the same code.
 */

export interface CheckResult {
  ok: boolean;
  reason?: string;
}

const inList = <T>(op: 'in' | 'not_in', values: readonly T[], v: T | null | undefined) => {
  const hit = v !== null && v !== undefined && values.includes(v);
  return op === 'in' ? hit : !hit;
};

/** Does this event occurrence match the trigger's own filters? */
export const matchTrigger = (trigger: Trigger, ctx: AutoContext): CheckResult => {
  const p = ctx.payload;
  switch (trigger.type) {
    case 'CASE_STATUS_CHANGED': {
      const from = p.from as string | undefined;
      const to = p.to as string | undefined;
      if (from === to) return { ok: false, reason: 'STATUS_NOT_CHANGED' };
      if (trigger.from.length && !(trigger.from as readonly string[]).includes(from ?? '')) return { ok: false, reason: 'FROM_STATUS_MISMATCH' };
      if (trigger.to.length && !(trigger.to as readonly string[]).includes(to ?? '')) return { ok: false, reason: 'TO_STATUS_MISMATCH' };
      return { ok: true };
    }
    case 'DOCUMENT_UPLOADED':
      if (trigger.byClientOnly && ctx.case && ctx.document?.uploadedById !== ctx.case.clientId) return { ok: false, reason: 'NOT_UPLOADED_BY_CLIENT' };
    // falls through
    case 'DOCUMENT_ACCEPTED':
    case 'DOCUMENT_REJECTED':
      if (trigger.stages.length && !(trigger.stages as readonly string[]).includes(ctx.document?.stage ?? '')) return { ok: false, reason: 'STAGE_MISMATCH' };
      return { ok: true };
    case 'APPOINTMENT_SET':
      if (!trigger.includeReschedule && p.rescheduled === true) return { ok: false, reason: 'RESCHEDULE_EXCLUDED' };
      return { ok: true };
    case 'APPLICATION_STATUS_CHANGED':
      if (trigger.to.length && !(trigger.to as readonly string[]).includes(String(p.to ?? ctx.application?.status ?? ''))) return { ok: false, reason: 'TO_STATUS_MISMATCH' };
      return { ok: true };
    case 'INQUIRY_CREATED':
      if (trigger.kinds.length && !(trigger.kinds as readonly string[]).includes(ctx.inquiry?.kind ?? '')) return { ok: false, reason: 'KIND_MISMATCH' };
      return { ok: true };
    default:
      return { ok: true };
  }
};

/** One condition; `detail` explains the value seen (shown in the dry run). */
export const checkCondition = async (cond: Condition, ctx: AutoContext): Promise<CheckResult & { seen?: string | null }> => {
  const c = ctx.case;
  if (cond.type === 'CLIENT_LANGUAGE') {
    const loc = ctx.recipient?.locale ?? null;
    return { ok: inList(cond.op, cond.values, loc), seen: loc };
  }
  if (cond.type === 'CLIENT_NATIONALITY') {
    const nat = (c?.client.nationality ?? '').trim().toLowerCase();
    const hit = !!nat && cond.values.some((v) => v.trim().toLowerCase() === nat);
    return { ok: cond.op === 'in' ? hit : !hit, seen: c?.client.nationality ?? null };
  }
  if (!c) return { ok: false, reason: 'NO_CASE', seen: null };
  switch (cond.type) {
    case 'VISA_TYPE':
      return { ok: inList(cond.op, cond.values, c.visaType), seen: c.visaType };
    case 'VISA_CATEGORY':
      return { ok: inList(cond.op, cond.values, c.visaCategoryId), seen: c.visaCategoryId };
    case 'CASE_STATUS':
      return { ok: inList(cond.op, cond.values, c.status), seen: c.status };
    case 'ASSIGNED_STAFF': {
      const s = c.assignedStaffId;
      const ok = cond.op === 'set' ? !!s : cond.op === 'not_set' ? !s : cond.op === 'is' ? !!s && cond.values.includes(s) : !s || !cond.values.includes(s);
      return { ok, seen: s };
    }
    case 'COMPANY': {
      const co = c.companyId;
      const ok = cond.op === 'set' ? !!co : cond.op === 'not_set' ? !co : inList(cond.op, cond.values, co);
      return { ok, seen: co };
    }
    case 'REQUIREMENT': {
      const reqs = await prisma.documentRequirement.findMany({ where: { caseId: c.id, key: cond.key }, select: { documents: { select: { status: true } } } });
      const fulfilled = reqs.some((r) => r.documents.some((d) => d.status === 'ACCEPTED'));
      const missing = reqs.length > 0 && reqs.every((r) => !r.documents.some((d) => d.status !== 'REJECTED'));
      return { ok: cond.op === 'fulfilled' ? fulfilled : missing, seen: !reqs.length ? 'NONE' : fulfilled ? 'FULFILLED' : missing ? 'MISSING' : 'UPLOADED' };
    }
  }
};

export const checkConditions = async (conditions: Condition[], ctx: AutoContext) => {
  const results: { index: number; type: Condition['type']; ok: boolean; reason?: string; seen?: string | null }[] = [];
  for (const [index, cond] of conditions.entries()) results.push({ index, type: cond.type, ...(await checkCondition(cond, ctx)) });
  return { ok: results.every((r) => r.ok), results };
};

/**
 * "Only if still true": the state the trigger described must still hold at execution time
 * (e.g. the case is still in the status it moved to, the document is still rejected, the client is still idle).
 */
export const triggerStillTrue = (trigger: Trigger, ctx: AutoContext): CheckResult => {
  const p = ctx.payload;
  const c = ctx.case;
  switch (trigger.type) {
    case 'CASE_STATUS_CHANGED':
      return c && c.status === p.to ? { ok: true } : { ok: false, reason: 'STATUS_CHANGED_SINCE' };
    case 'CASE_CREATED':
      return c ? { ok: true } : { ok: false, reason: 'CASE_GONE' };
    case 'DOCUMENT_UPLOADED':
      return ctx.document && ctx.document.status !== 'REJECTED' ? { ok: true } : { ok: false, reason: 'DOCUMENT_REJECTED_SINCE' };
    case 'DOCUMENT_ACCEPTED':
      return ctx.document?.status === 'ACCEPTED' ? { ok: true } : { ok: false, reason: 'DOCUMENT_CHANGED_SINCE' };
    case 'DOCUMENT_REJECTED':
      return ctx.document?.status === 'REJECTED' ? { ok: true } : { ok: false, reason: 'DOCUMENT_CHANGED_SINCE' };
    case 'CONTRACT_SIGNED':
      return c?.contract?.signedAt ? { ok: true } : { ok: false, reason: 'CONTRACT_NOT_SIGNED' };
    case 'APPOINTMENT_SET':
      return c?.appointmentAt && c.appointmentAt.toISOString() === p.at ? { ok: true } : { ok: false, reason: 'APPOINTMENT_CHANGED_SINCE' };
    case 'CLIENT_INACTIVE':
      return c && p.lastActivityAt === p.currentLastActivityAt && !['APPROVED', 'REJECTED', 'CANCELLED'].includes(c.status) ? { ok: true } : { ok: false, reason: 'CLIENT_ACTIVE_SINCE' };
    case 'STATUS_DURATION':
      return c && c.status === trigger.status && p.since === p.currentSince ? { ok: true } : { ok: false, reason: 'STATUS_CHANGED_SINCE' };
    case 'APPLICATION_STATUS_CHANGED':
      return ctx.application && ctx.application.status === p.to ? { ok: true } : { ok: false, reason: 'APPLICATION_CHANGED_SINCE' };
    case 'BOOKING_CREATED':
      return ctx.booking?.status === 'BOOKED' ? { ok: true } : { ok: false, reason: 'BOOKING_CHANGED_SINCE' };
    case 'INQUIRY_CREATED':
      return ctx.inquiry?.status === 'NEW' ? { ok: true } : { ok: false, reason: 'INQUIRY_HANDLED_SINCE' };
  }
};
