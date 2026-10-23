import type { Role } from '@prisma/client';
import { prisma } from '../../db.js';

/** Who may merge duplicate clients (Admin → Dublikatlar). Reviewing / "not a duplicate" is always ADMIN+. */
export interface DuplicateSettings {
  mergeMinRole: Extract<Role, 'ADMIN' | 'SUPER_ADMIN'>;
}

export const DUPLICATE_SETTINGS_KEY = 'duplicates';
const DEFAULTS: DuplicateSettings = { mergeMinRole: 'SUPER_ADMIN' };

export const getDuplicateSettings = async (): Promise<DuplicateSettings> => {
  const row = await prisma.setting.findUnique({ where: { key: DUPLICATE_SETTINGS_KEY } });
  const v = (row?.value ?? {}) as Partial<DuplicateSettings>;
  return { mergeMinRole: v.mergeMinRole === 'ADMIN' ? 'ADMIN' : DEFAULTS.mergeMinRole };
};

export const saveDuplicateSettings = async (s: DuplicateSettings) => {
  const value = { mergeMinRole: s.mergeMinRole };
  await prisma.setting.upsert({ where: { key: DUPLICATE_SETTINGS_KEY }, update: { value }, create: { key: DUPLICATE_SETTINGS_KEY, value } });
  return value;
};
