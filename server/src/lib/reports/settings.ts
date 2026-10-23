import { z } from 'zod';
import { prisma } from '../../db.js';

/**
 * Report builder settings (Setting `reports`): the allow-list of e-mail addresses outside the team that
 * scheduled reports may be sent to (e.g. the accountant). Entries are full addresses or "@domain.tld".
 * Only SUPER_ADMIN edits it; the list is checked again at every delivery.
 */

export const REPORT_SETTING_KEY = 'reports';

const entry = z
  .string()
  .trim()
  .toLowerCase()
  .max(191)
  .refine((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || /^@[^\s@]+\.[^\s@]+$/.test(s), 'EMAIL_OR_DOMAIN');

export const reportSettingsSchema = z.object({ externalAllowList: z.array(entry).max(100) });
export type ReportSettings = z.infer<typeof reportSettingsSchema>;

export const getReportSettings = async (): Promise<ReportSettings> => {
  const row = await prisma.setting.findUnique({ where: { key: REPORT_SETTING_KEY } });
  const parsed = reportSettingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? { externalAllowList: [...new Set(parsed.data.externalAllowList)] } : { externalAllowList: [] };
};

export const saveReportSettings = async (s: ReportSettings) => {
  const value = { externalAllowList: [...new Set(s.externalAllowList)] };
  await prisma.setting.upsert({ where: { key: REPORT_SETTING_KEY }, create: { key: REPORT_SETTING_KEY, value }, update: { value } });
  return value;
};

export const isAllowedExternal = (email: string, list: string[]) => {
  const e = email.trim().toLowerCase();
  const domain = e.slice(e.lastIndexOf('@'));
  return list.includes(e) || list.includes(domain);
};
