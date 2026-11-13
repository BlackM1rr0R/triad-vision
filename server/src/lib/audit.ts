import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';

/** Called after every recorded action (security alert rules react to critical ones in real time). Must not throw. */
type AuditListener = (action: string) => void;
const listeners: AuditListener[] = [];
export const onAudit = (fn: AuditListener) => {
  listeners.push(fn);
};

const withImpersonation = (details: Prisma.InputJsonValue | undefined, viewedUserId: string): Prisma.InputJsonValue =>
  details && typeof details === 'object' && !Array.isArray(details)
    ? { ...(details as Prisma.InputJsonObject), impersonating: viewedUserId }
    : { value: details ?? null, impersonating: viewedUserId };

/**
 * Tests only: audit writes still in flight. Routes fire most audits without awaiting them (`void audit(...)`), so
 * a test that counts AuditLog rows right after the response could race the write; in tests the app holds every
 * response until these settle (app.ts). Empty and unused outside tests.
 */
const inFlight = new Set<Promise<void>>();
export const auditsSettled = () => (inFlight.size ? Promise.allSettled([...inFlight]).then(() => undefined) : Promise.resolve());

/**
 * Records a security-relevant action. Never throws: auditing must not break the action itself,
 * so failures are only logged.
 */
export const audit = (
  req: Pick<Request, 'user' | 'ip'> & Partial<Pick<Request, 'impersonator'>>,
  action: string,
  target?: string,
  details?: Prisma.InputJsonValue,
): Promise<void> => {
  const p = writeAudit(req, action, target, details);
  if (config.isTest) {
    inFlight.add(p);
    void p.finally(() => inFlight.delete(p));
  }
  return p;
};

const writeAudit = async (
  req: Pick<Request, 'user' | 'ip'> & Partial<Pick<Request, 'impersonator'>>,
  action: string,
  target?: string,
  details?: Prisma.InputJsonValue,
) => {
  try {
    await prisma.auditLog.create({
      // While an admin views a client's portal the admin is the actor (the viewed user is noted in details).
      data: {
        actorId: req.impersonator?.id ?? req.user?.id ?? null,
        action,
        target: target ?? null,
        details: req.impersonator && req.user ? withImpersonation(details, req.user.id) : details,
        ip: req.ip ?? null,
      },
    });
  } catch (err) {
    console.error('[audit] failed', action, err);
    return;
  }
  for (const fn of listeners) {
    try {
      fn(action);
    } catch (err) {
      console.error('[audit] listener failed', action, err);
    }
  }
};
