import { z } from 'zod';
import { prisma } from '../../db.js';
import { getSettings as getSettlementSettings } from '../settlement/service.js';

/**
 * Profitability settings (Setting `profitability`): the default AZN-per-EUR rate for records that carry no rate
 * of their own (invoices, settlements, commissions, translation orders) and as the suggestion for new manual
 * costs, and whether delivered translation orders count as revenue (default, like the finance reports) or as
 * a cost of the case. Without a stored rate the settlement ledger's rate is used.
 */

export const PROFIT_SETTING_KEY = 'profitability';

export const profitSettingsSchema = z.object({
  eurAzn: z.number().positive().max(100),
  translationAs: z.enum(['revenue', 'cost']),
});
export type ProfitSettings = z.infer<typeof profitSettingsSchema>;

export const getProfitSettings = async (): Promise<ProfitSettings & { rateSource: 'profitability' | 'settlement' }> => {
  const row = await prisma.setting.findUnique({ where: { key: PROFIT_SETTING_KEY } });
  const v = (row?.value ?? {}) as Partial<ProfitSettings>;
  const translationAs = v.translationAs === 'cost' ? 'cost' : 'revenue';
  if (typeof v.eurAzn === 'number' && v.eurAzn > 0) return { eurAzn: v.eurAzn, translationAs, rateSource: 'profitability' };
  return { eurAzn: (await getSettlementSettings()).eurAzn, translationAs, rateSource: 'settlement' };
};

export const saveProfitSettings = async (s: ProfitSettings) => {
  const value = { eurAzn: s.eurAzn, translationAs: s.translationAs };
  await prisma.setting.upsert({ where: { key: PROFIT_SETTING_KEY }, create: { key: PROFIT_SETTING_KEY, value }, update: { value } });
  return value;
};

export const CURRENCIES = ['EUR', 'AZN'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Cents in EUR (unrounded). `rate` = AZN per 1 EUR; anything that is not AZN is treated as EUR. */
export const toEur = (cents: number, currency: string | null | undefined, rate: number) => (currency === 'AZN' ? cents / rate : cents);
