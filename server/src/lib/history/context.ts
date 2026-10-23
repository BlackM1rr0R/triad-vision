import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Where a change came from (shown as a chip in the history timeline). */
export type ChangeSource = 'admin' | 'client' | 'system' | 'ai' | 'automation' | 'revert';
export const CHANGE_SOURCES: ChangeSource[] = ['admin', 'client', 'system', 'ai', 'automation', 'revert'];

export interface HistoryContext {
  actorId: string | null;
  actorRole: string | null;
  source: ChangeSource;
  /** Groups every change of one request / batch ("revert all changes of this action"). */
  requestId: string;
  /** Set while a revert runs: `${entity}:${entityId}:${field}` → id of the change being undone. */
  revertOf?: Map<string, string>;
}

const store = new AsyncLocalStorage<HistoryContext>();

/** The current context, or undefined outside a request (jobs, scripts, tests writing directly). */
export const historyContext = () => store.getStore();

const STAFF_ROLES = new Set(['STAFF', 'ADMIN', 'SUPER_ADMIN']);

/**
 * Express middleware (mounted right after loadUser): every Prisma update made while handling the
 * request records the signed-in user as the actor. Staff are "admin", everyone else "client".
 */
export const historyMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId = (res.locals as { requestId?: string }).requestId ?? crypto.randomUUID();
  const ctx: HistoryContext = {
    actorId: req.user?.id ?? null,
    actorRole: req.user?.role ?? null,
    source: req.user ? (STAFF_ROLES.has(req.user.role) ? 'admin' : 'client') : 'system',
    requestId,
  };
  store.run(ctx, next);
};

/**
 * Runs `fn` with a different source (and optionally actor) — e.g. `withHistory({ source: 'ai' }, …)` around an AI
 * action, `{ source: 'automation' }` in automation rules. A fresh request id groups the changes of the batch
 * unless `requestId` is given.
 */
export const withHistory = <T>(patch: Partial<HistoryContext>, fn: () => Promise<T>): Promise<T> => {
  const current = store.getStore();
  const next: HistoryContext = {
    actorId: current?.actorId ?? null,
    actorRole: current?.actorRole ?? null,
    source: current?.source ?? 'system',
    requestId: current?.requestId ?? crypto.randomUUID(),
    ...(current?.revertOf ? { revertOf: current.revertOf } : {}),
    ...patch,
  };
  // Prisma queries are lazy (they run on .then): await inside the context so they see it.
  return store.run(next, async () => await fn());
};
