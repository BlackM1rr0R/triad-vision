import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

/** Called after every recorded action (security alert rules react to critical ones in real time). Must not throw. */
type AuditListener = (action: string) => void;
const listeners: AuditListener[] = [];
export const onAudit = (fn: AuditListener) => {
  listeners.push(fn);
};

/**
 * Records a security-relevant action. Never throws: auditing must not break the action itself,
 * so failures are only logged.
 */
export const audit = async (
  req: Pick<Request, 'user' | 'ip'>,
  action: string,
  target?: string,
  details?: Prisma.InputJsonValue,
) => {
  try {
    await prisma.auditLog.create({
      data: { actorId: req.user?.id ?? null, action, target: target ?? null, details, ip: req.ip ?? null },
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
