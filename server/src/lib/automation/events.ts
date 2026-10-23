import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import type { TriggerType } from './schema.js';

/**
 * Internal event bus for automation rules. The business code emits domain events at a few clearly marked
 * hooks (caseFlow transitions / case creation, document upload + review, application status, booking, inquiry);
 * `emitAutomationEvent` only queues a row (never throws, never awaited by the request) and the dispatcher in
 * engine.ts evaluates rules off the request path.
 *
 * Loop protection: actions executed by the engine run inside `automationScope`, so events they cause carry the
 * chain of rule ids and the depth; the dispatcher never lets a rule re-trigger itself and stops at MAX_DEPTH.
 */

export type EventType = Exclude<TriggerType, 'CLIENT_INACTIVE' | 'STATUS_DURATION'>;
export type EntityType = 'case' | 'document' | 'application' | 'booking' | 'inquiry';

export interface AutomationEventInput {
  type: EventType;
  entityType: EntityType;
  entityId: string;
  caseId?: string | null;
  payload?: Record<string, unknown>;
}

interface Scope {
  chain: string[];
  depth: number;
}

const als = new AsyncLocalStorage<Scope>();

/** Runs `fn` as the action of `ruleId`; events emitted inside inherit the chain (loop protection). */
export const automationScope = <T>(scope: Scope, fn: () => Promise<T>) => als.run(scope, fn);
export const currentScope = () => als.getStore() ?? null;

// Trigger types with at least one enabled rule (avoids a queue row per case event when nothing listens).
let listening: { at: number; types: Set<string> } | null = null;
const LISTEN_CACHE_MS = 15_000;

export const invalidateAutomationCache = () => {
  listening = null;
};

const listens = async (type: string) => {
  if (typeof (prisma as { automationRule?: { findMany?: unknown } }).automationRule?.findMany !== 'function') return false; // mocked prisma (unit tests)
  if (!listening || Date.now() - listening.at > LISTEN_CACHE_MS) {
    const rows = await prisma.automationRule.findMany({ where: { enabled: true }, select: { triggerType: true }, distinct: ['triggerType'] });
    listening = { at: Date.now(), types: new Set(rows.map((r) => r.triggerType)) };
  }
  return listening.types.has(type);
};

type Kick = () => void;
let kick: Kick | null = null;
/** engine.ts registers the queue drain here (in tests it is not registered: tests drain explicitly). */
export const setAutomationKick = (fn: Kick | null) => {
  kick = fn;
};

/** Queues a domain event for the automation engine. Never throws; safe to call with `void`. */
export const emitAutomationEvent = async (ev: AutomationEventInput) => {
  try {
    if (!(await listens(ev.type))) return;
    const scope = currentScope();
    await prisma.automationEvent.create({
      data: {
        type: ev.type,
        entityType: ev.entityType,
        entityId: ev.entityId,
        caseId: ev.caseId ?? null,
        payload: (ev.payload ?? {}) as Prisma.InputJsonValue,
        chain: scope?.chain ?? [],
        depth: scope?.depth ?? 0,
      },
    });
    kick?.();
  } catch (err) {
    console.error('[automation] emit failed', ev.type, err);
  }
};
