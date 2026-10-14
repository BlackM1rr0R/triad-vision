import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

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
  }
};
