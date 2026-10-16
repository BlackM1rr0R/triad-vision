import type { TranslationService, TranslationUrgency } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';

/**
 * Price list for translation / apostille orders, kept in Setting `translationPricing` (edited in
 * Admin → Translations → Prices). The client wizard only shows an estimate computed from it; the
 * staff quote is the binding price.
 */

export const PRICING_KEY = 'translationPricing';

export const SERVICES = ['TRANSLATION', 'APOSTILLE', 'TRANSLATION_APOSTILLE', 'NOTARY'] as const satisfies readonly TranslationService[];

export interface TranslationPricing {
  currency: string;
  perPage: Record<TranslationService, number>; // cents per page
  expressSurchargePct: number;
  languages: string[];
  documentTypes: string[];
}

export const DEFAULT_PRICING: TranslationPricing = {
  currency: 'EUR',
  perPage: { TRANSLATION: 3500, APOSTILLE: 4500, TRANSLATION_APOSTILLE: 7500, NOTARY: 2500 },
  expressSurchargePct: 50,
  languages: ['az', 'de', 'en', 'ru', 'tr', 'uk'],
  documentTypes: ['DIPLOMA', 'BIRTH_CERT', 'MARRIAGE_CERT', 'POLICE_CLEARANCE', 'DRIVING_LICENCE', 'EMPLOYMENT_REFERENCE', 'OTHER'],
};

const cents = z.coerce.number().int().min(0).max(10_000_000);
const code = z.string().trim().min(1).max(40);

/** Each field is validated on its own, so a partly broken setting still falls back field by field. */
const fieldSchemas = {
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((s) => s.toUpperCase()),
  perPage: z.object({ TRANSLATION: cents, APOSTILLE: cents, TRANSLATION_APOSTILLE: cents, NOTARY: cents }).partial(),
  expressSurchargePct: z.coerce.number().min(0).max(500),
  languages: z.array(code.regex(/^[a-z]{2,8}$/i).transform((s) => s.toLowerCase())).min(2).max(60),
  documentTypes: z.array(code).min(1).max(60),
};

/** Merges a stored (free-form) value with the defaults. Never throws. */
export const normalizePricing = (raw: unknown): TranslationPricing => {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = <K extends keyof typeof fieldSchemas>(k: K) => {
    const r = fieldSchemas[k].safeParse(v[k]);
    return r.success ? (r.data as z.infer<(typeof fieldSchemas)[K]>) : undefined;
  };
  const perPage = pick('perPage') ?? {};
  return {
    currency: pick('currency') ?? DEFAULT_PRICING.currency,
    perPage: { ...DEFAULT_PRICING.perPage, ...Object.fromEntries(Object.entries(perPage).filter(([, x]) => x !== undefined)) },
    expressSurchargePct: pick('expressSurchargePct') ?? DEFAULT_PRICING.expressSurchargePct,
    languages: [...new Set(pick('languages') ?? DEFAULT_PRICING.languages)],
    documentTypes: [...new Set(pick('documentTypes') ?? DEFAULT_PRICING.documentTypes)],
  };
};

export const loadPricing = async (): Promise<TranslationPricing> => {
  const row = await prisma.setting.findUnique({ where: { key: PRICING_KEY } });
  return normalizePricing(row?.value);
};

/** Services that translate text need two different languages; apostille / notary copies may not. */
export const needsDistinctLanguages = (service: TranslationService) => service === 'TRANSLATION' || service === 'TRANSLATION_APOSTILLE';

/** Estimate in cents: price per page × pages, plus the express surcharge (rounded to whole cents). */
export const estimatePrice = (
  pricing: Pick<TranslationPricing, 'perPage' | 'expressSurchargePct'>,
  input: { service: TranslationService; pages: number; urgency: TranslationUrgency },
) => {
  const pages = Math.max(1, Math.floor(input.pages));
  const base = (pricing.perPage[input.service] ?? 0) * pages;
  const surcharge = input.urgency === 'EXPRESS' ? Math.round((base * pricing.expressSurchargePct) / 100) : 0;
  return { baseCents: base, surchargeCents: surcharge, totalCents: base + surcharge };
};
