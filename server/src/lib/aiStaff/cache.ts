import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';

/** Small JSON cache in the Setting table (AI results keyed by what they were built from). */

export const hashOf = (v: unknown) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 32);

export const readCache = async <T>(key: string): Promise<T | null> => {
  const row = await prisma.setting.findUnique({ where: { key } });
  return (row?.value as T | undefined) ?? null;
};

export const writeCache = async (key: string, value: unknown) => {
  const v = value as Prisma.InputJsonValue;
  await prisma.setting.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
};

/** Creates the key once; false when it already exists (idempotency flags). */
export const claimFlag = async (key: string, value: unknown = true) => {
  try {
    await prisma.setting.create({ data: { key, value: value as Prisma.InputJsonValue } });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return false;
    throw err;
  }
};
