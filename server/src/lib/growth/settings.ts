import type { Prisma } from '@prisma/client';
import type { ZodTypeAny, z } from 'zod';
import { prisma } from '../../db.js';

/**
 * Settings of the public growth features (start-date calculator, placement map, client referral
 * programme), stored in the Setting table. Reads always fall back to the defaults when a row is
 * missing or malformed, so a half-edited setting can never break the public pages.
 */
export const GROWTH_SETTING_KEYS = {
  calculator: 'growthCalculator',
  map: 'growthMap',
  referral: 'growthReferral',
} as const;

export const readSetting = async <S extends ZodTypeAny>(key: string, schema: S, defaults: z.infer<S>): Promise<z.infer<S>> => {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return defaults;
  const parsed = schema.safeParse(row.value);
  return parsed.success ? (parsed.data as z.infer<S>) : defaults;
};

export const writeSetting = async (key: string, value: unknown) => {
  const json = value as Prisma.InputJsonValue;
  await prisma.setting.upsert({ where: { key }, create: { key, value: json }, update: { value: json } });
};
