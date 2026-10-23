import type { AutomationEvent, AutomationRule, AutomationStep, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { executeAction, type ActionOutcome, type RuleRef } from './actions.js';
import { checkConditions, matchTrigger, triggerStillTrue } from './conditions.js';
import { buildContext, type AutoContext } from './context.js';
import { automationScope, type EntityType } from './events.js';
import { delayMs, ENTITY_RATE_LIMIT, ENTITY_RATE_WINDOW_MS, MAX_DEPTH, parseStoredRule, TIME_TRIGGERS, type Action, type Trigger, type TriggerType } from './schema.js';
import { clientActivity, statusSince } from './time.js';

/**
 * Automation engine (off the request path):
 *  - `runAutomationQueue` claims queued AutomationEvents, matches enabled rules (trigger filters, then conditions)
 *    and starts runs; it also executes delayed steps that became due;
 *  - `runTimeTriggers` (every 15 min) fires CLIENT_INACTIVE / STATUS_DURATION rules;
 *  - each rule firing is one AutomationRun, unique per rule + entity + trigger occurrence (idempotent), with one
 *    AutomationStep per action (runAt = trigger time + delay). Delayed steps marked "only if still true" re-check
 *    the trigger state and the conditions first.
 * Loop protection: a rule never reacts to events its own actions caused (chain), chains stop at MAX_DEPTH, and an
 * entity gets at most ENTITY_RATE_LIMIT runs per hour. Failures are logged on the step, never thrown.
 */

const ruleRef = (r: AutomationRule): RuleRef => ({ id: r.id, name: r.name, createdById: r.createdById, updatedById: r.updatedById });

interface RunContext {
  payload: Record<string, unknown>;
  actions: Action[];
  occurredAt: string;
}

/** For time triggers the "still true" check needs the current state next to the snapshot. */
const withCurrentState = async (trigger: Trigger, ctx: AutoContext) => {
  if (!ctx.case) return ctx;
  if (trigger.type === 'CLIENT_INACTIVE') {
    const last = (await clientActivity({ caseIds: [ctx.case.id] })).get(ctx.case.id);
    return { ...ctx, payload: { ...ctx.payload, currentLastActivityAt: last?.toISOString() ?? null } };
  }
  if (trigger.type === 'STATUS_DURATION') {
    const since = (await statusSince({ caseIds: [ctx.case.id] })).get(ctx.case.id);
    return { ...ctx, payload: { ...ctx.payload, currentSince: since?.toISOString() ?? null } };
  }
  return ctx;
};

const finalizeRun = async (runId: string) => {
  const steps = await prisma.automationStep.findMany({ where: { runId }, select: { status: true, reason: true } });
  const n = (s: string) => steps.filter((x) => x.status === s).length;
  const open = n('PENDING') + n('RUNNING');
  const failed = n('FAILED');
  const succeeded = n('SUCCEEDED');
  const status = open ? 'WAITING' : failed && !succeeded ? 'FAILED' : failed || (succeeded && n('SKIPPED')) ? 'PARTIAL' : succeeded ? 'SUCCEEDED' : 'SKIPPED';
  const reason = status === 'SKIPPED' || status === 'FAILED' ? steps.find((s) => s.reason)?.reason ?? null : null;
  await prisma.automationRun.update({ where: { id: runId }, data: { status, reason, finishedAt: open ? null : new Date() } });
};

const executeStep = async (step: AutomationStep) => {
  // Claim (two drains can never run the same step).
  const claimed = await prisma.automationStep.updateMany({ where: { id: step.id, status: 'PENDING' }, data: { status: 'RUNNING' } });
  if (!claimed.count) return;
  let outcome: ActionOutcome;
  try {
    const run = await prisma.automationRun.findUniqueOrThrow({ where: { id: step.runId }, include: { rule: true } });
    const rc = (run.context ?? {}) as unknown as RunContext;
    const action = rc.actions?.[step.index];
    const parsed = parseStoredRule(run.rule);
    if (!action || !parsed) outcome = { status: 'FAILED', reason: 'INVALID_RULE' };
    else if (!run.rule.enabled) outcome = { status: 'SKIPPED', reason: 'RULE_DISABLED' };
    else {
      let ctx = await buildContext({ triggerType: run.triggerType as TriggerType, entityType: run.entityType as EntityType, entityId: run.entityId, caseId: run.caseId, payload: rc.payload, occurredAt: new Date(rc.occurredAt) });
      if (!ctx) outcome = { status: 'SKIPPED', reason: 'ENTITY_GONE' };
      else {
        let still = { ok: true, reason: undefined as string | undefined };
        if (step.onlyIfStillTrue) {
          ctx = await withCurrentState(parsed.trigger, ctx);
          const t = triggerStillTrue(parsed.trigger, ctx);
          const c = t.ok ? await checkConditions(parsed.conditions, ctx) : null;
          still = !t.ok ? { ok: false, reason: t.reason } : !c!.ok ? { ok: false, reason: 'CONDITIONS_NO_LONGER_MET' } : still;
        }
        const context = ctx;
        outcome = !still.ok
          ? { status: 'SKIPPED', reason: `NO_LONGER_TRUE:${still.reason}` }
          : await automationScope({ chain: [...((run.chain as string[] | null) ?? []), run.ruleId], depth: run.depth + 1 }, () => executeAction(action, context, ruleRef(run.rule)));
      }
    }
  } catch (err) {
    outcome = { status: 'FAILED', reason: ((err as Error).message ?? String(err)).slice(0, 500) };
  }
  await prisma.automationStep.update({
    where: { id: step.id },
    data: { status: outcome.status, reason: outcome.reason ?? null, result: (outcome.result ?? undefined) as Prisma.InputJsonValue | undefined, executedAt: new Date() },
  });
  if (outcome.status === 'FAILED') console.error(`[automation] step ${step.id} (${step.actionType}) failed: ${outcome.reason}`);
  await finalizeRun(step.runId);
};

/**
 * Starts one run of `rule` for a trigger occurrence. Returns the run id, or null when it did not fire (trigger
 * filter mismatch, duplicate occurrence).
 */
export const startRun = async (
  rule: AutomationRule,
  ctx: AutoContext,
  occ: { key: string; eventId?: string | null; depth?: number; chain?: string[] },
  now = new Date(),
) => {
  const parsed = parseStoredRule(rule);
  if (!parsed) return null;
  if (!matchTrigger(parsed.trigger, ctx).ok) return null;
  const idempotencyKey = `${rule.id}:${ctx.entityType}:${ctx.entityId}:${occ.key}`.slice(0, 191);
  const base = {
    ruleId: rule.id,
    idempotencyKey,
    triggerType: rule.triggerType,
    entityType: ctx.entityType,
    entityId: ctx.entityId,
    caseId: ctx.case?.id ?? null,
    eventId: occ.eventId ?? null,
    depth: occ.depth ?? 0,
    chain: occ.chain ?? [],
    context: { payload: ctx.payload, actions: parsed.actions, occurredAt: ctx.occurredAt.toISOString() } as unknown as Prisma.InputJsonValue,
  };
  const create = async (data: Partial<Prisma.AutomationRunUncheckedCreateInput>) => {
    try {
      return await prisma.automationRun.create({ data: { ...base, ...data } });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') return null; // this occurrence already ran (idempotency)
      throw err;
    }
  };
  // Loop protection: the rule's own actions never retrigger it; chains stop at MAX_DEPTH.
  if (occ.chain?.includes(rule.id)) return (await create({ status: 'SKIPPED', reason: 'LOOP_PREVENTED', finishedAt: now }))?.id ?? null;
  if ((occ.depth ?? 0) >= MAX_DEPTH) return (await create({ status: 'SKIPPED', reason: 'MAX_DEPTH', finishedAt: now }))?.id ?? null;
  const recent = await prisma.automationRun.count({ where: { entityId: ctx.entityId, createdAt: { gte: new Date(now.getTime() - ENTITY_RATE_WINDOW_MS) }, status: { not: 'SKIPPED' } } });
  if (recent >= ENTITY_RATE_LIMIT) return (await create({ status: 'SKIPPED', reason: 'RATE_LIMITED', finishedAt: now }))?.id ?? null;
  const cond = await checkConditions(parsed.conditions, ctx);
  if (!cond.ok) {
    // Time triggers re-check every 15 minutes, so a miss is not logged (it may fire once the conditions hold).
    if (TIME_TRIGGERS.includes(rule.triggerType as TriggerType)) return null;
    const failedIdx = cond.results.find((r) => !r.ok);
    return (await create({ status: 'SKIPPED', reason: `CONDITION_NOT_MET:${failedIdx?.type ?? ''}${failedIdx?.reason ? `:${failedIdx.reason}` : ''}`, finishedAt: now }))?.id ?? null;
  }
  const run = await create({ status: 'RUNNING' });
  if (!run) return null;
  const startAt = TIME_TRIGGERS.includes(rule.triggerType as TriggerType) ? now : ctx.occurredAt;
  await prisma.automationStep.createMany({
    data: parsed.actions.map((a, index) => ({
      runId: run.id,
      index,
      actionType: a.type,
      runAt: new Date(startAt.getTime() + delayMs(a)),
      onlyIfStillTrue: !!a.onlyIfStillTrue && delayMs(a) > 0,
    })),
  });
  await prisma.automationRule.update({ where: { id: rule.id }, data: { runCount: { increment: 1 }, lastRunAt: now } });
  const due = await prisma.automationStep.findMany({ where: { runId: run.id, runAt: { lte: now } }, orderBy: { index: 'asc' } });
  for (const s of due) await executeStep(s);
  await finalizeRun(run.id);
  return run.id;
};

const dispatchEvent = async (ev: AutomationEvent) => {
  const rules = await prisma.automationRule.findMany({ where: { enabled: true, triggerType: ev.type }, orderBy: { createdAt: 'asc' } });
  if (!rules.length) return;
  const ctx = await buildContext({ triggerType: ev.type as TriggerType, entityType: ev.entityType as EntityType, entityId: ev.entityId, caseId: ev.caseId, payload: (ev.payload ?? {}) as Record<string, unknown>, occurredAt: ev.createdAt });
  if (!ctx) return;
  for (const rule of rules) {
    try {
      await startRun(rule, ctx, { key: `ev:${ev.id}`, eventId: ev.id, depth: ev.depth, chain: (ev.chain as string[] | null) ?? [] });
    } catch (err) {
      console.error(`[automation] rule ${rule.id} failed on event ${ev.id}`, err);
    }
  }
};

/** Executes delayed steps whose time has come. */
export const runDueSteps = async (now = new Date(), limit = 100) => {
  const steps = await prisma.automationStep.findMany({ where: { status: 'PENDING', runAt: { lte: now } }, orderBy: [{ runAt: 'asc' }, { index: 'asc' }], take: limit });
  for (const s of steps) {
    try {
      await executeStep(s);
    } catch (err) {
      console.error('[automation] step failed', s.id, err);
    }
  }
  return steps.length;
};

let draining: Promise<unknown> | null = null;
let again = false;

/**
 * Processes queued events (oldest first) and due steps. Safe to call concurrently: a call during a running drain
 * joins it and makes it look at the queue once more before finishing (events emitted meanwhile are not left behind).
 */
export const runAutomationQueue = async (opts: { limit?: number; now?: Date } = {}) => {
  if (draining) {
    again = true;
    return draining as Promise<{ events: number; steps: number }>;
  }
  draining = (async () => {
    let events = 0;
    try {
      for (;;) {
        again = false;
        const batch = await prisma.automationEvent.findMany({ where: { processedAt: null }, orderBy: { createdAt: 'asc' }, take: opts.limit ?? 100 });
        if (!batch.length) break;
        for (const ev of batch) {
          const claimed = await prisma.automationEvent.updateMany({ where: { id: ev.id, processedAt: null }, data: { processedAt: new Date() } });
          if (!claimed.count) continue;
          events += 1;
          try {
            await dispatchEvent(ev);
          } catch (err) {
            console.error('[automation] event failed', ev.id, err);
          }
        }
        if (batch.length < (opts.limit ?? 100) && !again) break;
      }
      const steps = await runDueSteps(opts.now ?? new Date());
      return { events, steps };
    } finally {
      draining = null;
    }
  })();
  return draining as Promise<{ events: number; steps: number }>;
};

/** CLIENT_INACTIVE / STATUS_DURATION rules (job every 15 minutes). */
export const runTimeTriggers = async (now = new Date()) => {
  const rules = await prisma.automationRule.findMany({ where: { enabled: true, triggerType: { in: TIME_TRIGGERS } } });
  let started = 0;
  for (const rule of rules) {
    const parsed = parseStoredRule(rule);
    if (!parsed) continue;
    try {
      const t = parsed.trigger;
      const threshold = now.getTime() - (t.type === 'CLIENT_INACTIVE' || t.type === 'STATUS_DURATION' ? t.days : 0) * 86_400_000;
      const hits: { caseId: string; key: string; payload: Record<string, unknown> }[] = [];
      if (t.type === 'CLIENT_INACTIVE') {
        for (const [caseId, last] of await clientActivity({ statuses: t.statuses })) {
          if (last.getTime() <= threshold) hits.push({ caseId, key: `idle:${last.toISOString()}`, payload: { days: t.days, lastActivityAt: last.toISOString() } });
        }
      } else if (t.type === 'STATUS_DURATION') {
        for (const [caseId, since] of await statusSince({ status: t.status })) {
          if (since.getTime() <= threshold) hits.push({ caseId, key: `status:${t.status}:${since.toISOString()}`, payload: { days: t.days, status: t.status, since: since.toISOString() } });
        }
      }
      for (const h of hits.slice(0, 500)) {
        const key = `${rule.id}:case:${h.caseId}:${h.key}`.slice(0, 191);
        if (await prisma.automationRun.count({ where: { idempotencyKey: key } })) continue;
        const ctx = await buildContext({ triggerType: rule.triggerType as TriggerType, entityType: 'case', entityId: h.caseId, caseId: h.caseId, payload: h.payload, occurredAt: now });
        if (!ctx) continue;
        if (await startRun(rule, ctx, { key: h.key }, now)) started += 1;
      }
    } catch (err) {
      console.error(`[automation] time rule ${rule.id} failed`, err);
    }
  }
  return started;
};
