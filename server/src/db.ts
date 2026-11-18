import { PrismaClient } from '@prisma/client';
import { historyExtension } from './lib/history/capture.js';
import { impersonationWriteGuard } from './lib/privacy/impersonationContext.js';

const base = new PrismaClient();

/**
 * The shared client. The extensions only add query hooks, so the extended client behaves exactly like a
 * PrismaClient and is typed as one (an extended client's type is not assignable to Prisma.TransactionClient,
 * which the codebase passes around).
 *  - impersonationWriteGuard (lib/privacy/impersonationContext.ts): "view as client" is read-only — any write
 *    inside an impersonated request throws 403 IMPERSONATION_READ_ONLY (bookkeeping / audit models excepted).
 *    Added first, so it runs before every later hook (Prisma calls query hooks in the order they were added):
 *    the field-history hook writes through `base`, which must never be reached for a refused write.
 *  - historyExtension (lib/history/capture.ts): field-level change history.
 */
export const prisma = base.$extends(impersonationWriteGuard).$extends(historyExtension(base)) as unknown as PrismaClient;
