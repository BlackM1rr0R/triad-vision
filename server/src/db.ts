import { PrismaClient } from '@prisma/client';
import { historyExtension } from './lib/history/capture.js';

const base = new PrismaClient();

/**
 * The shared client. The field-history extension (lib/history/capture.ts) only adds query hooks, so the
 * extended client behaves exactly like a PrismaClient and is typed as one (an extended client's type is not
 * assignable to Prisma.TransactionClient, which the codebase passes around).
 */
export const prisma = base.$extends(historyExtension(base)) as unknown as PrismaClient;
