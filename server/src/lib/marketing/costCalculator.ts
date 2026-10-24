import { z } from 'zod';
import { prisma } from '../../db.js';
import { readSetting, writeSetting } from '../growth/settings.js';
import { loadPricing } from '../translations/pricing.js';

/**
 * Client cost calculator (/cost-calculator): an itemised, indicative budget for a visa category.
 *
 * Fees live in Setting `costCalculator` (Admin → Sayt alətləri → Xərclər): one set of defaults plus
 * optional per-category overrides (by VisaCategory slug). Translation and apostille prices per document
 * come from the translation price list (Setting `translationPricing`, lib/translations/pricing.ts) unless
 * the admin enters own prices here. All amounts are EUR; AZN / TRY / UAH are shown with admin-set rates.
 *
 * One-time costs and the refundable blocked account (Sperrkonto) are kept apart: the blocked account is
 * the applicant's own money, paid out monthly in Germany, not a cost.
 */

export const COST_CALCULATOR_KEY = 'costCalculator';
export const CURRENCIES = ['AZN', 'TRY', 'UAH'] as const;
export type Currency = (typeof CURRENCIES)[number];

const eur = z.number().min(0).max(1_000_000);
const count = z.number().int().min(0).max(50);

export const feesSchema = z.object({
  /** National visa fee (embassy) per adult / per child. */
  visaFeeAdult: eur,
  visaFeeChild: eur,
  /** Typical number of documents to translate / to apostille (the visitor can change both). */
  translationDocs: count,
  apostilleDocs: count,
  /** Recognition of the qualification (Anerkennung) fee; `recognitionDefault` = needed by default. */
  recognition: eur,
  recognitionDefault: z.boolean(),
  /** Language course and exam (main applicant). */
  languageCourse: eur,
  languageExam: eur,
  /** Blocked account (Sperrkonto) amount; 0 = not required for this visa. Refundable. */
  blockedAccount: eur,
  /** Health / travel insurance for the first months, per person. */
  healthInsurance: eur,
  /** Flight per person. */
  flight: eur,
  /** Our service fee: min = max → fixed. */
  serviceFeeMin: eur,
  serviceFeeMax: eur,
});
export type Fees = z.infer<typeof feesSchema>;

export const costCalculatorSchema = z
  .object({
    enabled: z.boolean().default(true),
    /** null = take the price from the translation price list (TRANSLATION / APOSTILLE per page). */
    translationPrice: eur.nullable().default(null),
    apostillePrice: eur.nullable().default(null),
    /** Blocked account amount used for Chancenkarte / Ausbildung / study categories without an own value. */
    blockedAccountAmount: eur.default(11904),
    defaults: feesSchema,
    /** Per visa category slug: only the fields that differ from the defaults. */
    categories: z.record(z.string().max(120), feesSchema.partial()).default({}),
    /** 1 EUR = x in the local currency (approximate, shown with a hint). */
    rates: z.object({ AZN: z.number().min(0).max(1_000_000), TRY: z.number().min(0).max(1_000_000), UAH: z.number().min(0).max(1_000_000) }),
    ratesUpdatedAt: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default(''),
  })
  .refine((s) => s.defaults.serviceFeeMin <= s.defaults.serviceFeeMax, 'SERVICE_FEE_RANGE')
  .refine((s) => Object.values(s.categories).every((c) => (c.serviceFeeMin ?? s.defaults.serviceFeeMin) <= (c.serviceFeeMax ?? s.defaults.serviceFeeMax)), 'SERVICE_FEE_RANGE');
export type CostSettings = z.infer<typeof costCalculatorSchema>;

/** Starting values — indicative, to be verified by the team. */
export const COST_DEFAULTS: CostSettings = {
  enabled: true,
  translationPrice: null,
  apostillePrice: null,
  blockedAccountAmount: 11904,
  defaults: {
    visaFeeAdult: 75,
    visaFeeChild: 37.5,
    translationDocs: 6,
    apostilleDocs: 3,
    recognition: 400,
    recognitionDefault: false,
    languageCourse: 600,
    languageExam: 250,
    blockedAccount: 0,
    healthInsurance: 150,
    flight: 250,
    serviceFeeMin: 800,
    serviceFeeMax: 1500,
  },
  categories: {},
  rates: { AZN: 1.9, TRY: 45, UAH: 48 },
  ratesUpdatedAt: '',
};

export const getCostSettings = () => readSetting(COST_CALCULATOR_KEY, costCalculatorSchema, COST_DEFAULTS);
export const saveCostSettings = (s: CostSettings) => writeSetting(COST_CALCULATOR_KEY, s);

/** Heuristic for categories without an own value: Chancenkarte (§20a), Ausbildung (§16a), study (§16b) need a blocked account. */
export const needsBlockedAccount = (visaLabel: string) => /20\s*a|16\s*a|16\s*b|chancen|ausbildung|stud/i.test(visaLabel);

/** Effective fees of one category: defaults overlaid with the category's own values. */
export const feesFor = (cat: { slug: string; visaLabel: string }, s: CostSettings): Fees => {
  const own = s.categories[cat.slug] ?? {};
  const blockedAccount = own.blockedAccount ?? (s.defaults.blockedAccount || (needsBlockedAccount(cat.visaLabel) ? s.blockedAccountAmount : 0));
  return { ...s.defaults, ...own, blockedAccount };
};

/** Per-document translation / apostille prices: own setting, else the translation price list (EUR only). */
export const documentPrices = async (s: CostSettings) => {
  if (s.translationPrice != null && s.apostillePrice != null) return { translation: s.translationPrice, apostille: s.apostillePrice };
  const pricing = await loadPricing();
  const fromList = pricing.currency === 'EUR';
  return {
    translation: s.translationPrice ?? (fromList ? pricing.perPage.TRANSLATION / 100 : 35),
    apostille: s.apostillePrice ?? (fromList ? pricing.perPage.APOSTILLE / 100 : 45),
  };
};

export const ITEM_KEYS = ['visaFee', 'translation', 'apostille', 'recognition', 'language', 'healthInsurance', 'flight', 'serviceFee', 'blockedAccount'] as const;
export type ItemKey = (typeof ITEM_KEYS)[number];

export type Money = [number, number];

export interface CostItem {
  key: ItemKey;
  /** [min, max] in EUR (equal unless it is a range, e.g. the service fee) */
  amount: Money;
  /** units behind the amount: people, documents */
  qty: number;
  unitPrice: number | null;
  refundable: boolean;
}

export interface CostInput {
  adults: number;
  children: number;
  documents: number;
  apostilles: number;
  recognition: boolean;
  language: boolean;
}

export const costInputSchema = z.object({
  adults: z.coerce.number().int().min(1).max(10).default(1),
  children: z.coerce.number().int().min(0).max(10).default(0),
  documents: z.coerce.number().int().min(0).max(50).optional(),
  apostilles: z.coerce.number().int().min(0).max(50).optional(),
  recognition: z.enum(['1', '0']).optional(),
  language: z.enum(['1', '0']).optional(),
});

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pure cost breakdown (unit tested). */
export const computeCost = (fees: Fees, prices: { translation: number; apostille: number }, input: CostInput, rates: CostSettings['rates']) => {
  const people = input.adults + input.children;
  const items: CostItem[] = [];
  const push = (key: ItemKey, amount: number | Money, qty: number, unitPrice: number | null, refundable = false) => {
    const a: Money = Array.isArray(amount) ? [round2(amount[0]), round2(amount[1])] : [round2(amount), round2(amount)];
    if (a[1] <= 0) return;
    items.push({ key, amount: a, qty, unitPrice, refundable });
  };
  push('visaFee', input.adults * fees.visaFeeAdult + input.children * fees.visaFeeChild, people, null);
  push('translation', input.documents * prices.translation, input.documents, prices.translation);
  push('apostille', input.apostilles * prices.apostille, input.apostilles, prices.apostille);
  if (input.recognition) push('recognition', fees.recognition, 1, fees.recognition);
  if (input.language) push('language', fees.languageCourse + fees.languageExam, 1, null);
  push('healthInsurance', people * fees.healthInsurance, people, fees.healthInsurance);
  push('flight', people * fees.flight, people, fees.flight);
  push('serviceFee', [fees.serviceFeeMin, Math.max(fees.serviceFeeMin, fees.serviceFeeMax)], 1, null);
  push('blockedAccount', fees.blockedAccount, 1, fees.blockedAccount, true);

  const sum = (list: CostItem[], i: 0 | 1) => round2(list.reduce((a, x) => a + x.amount[i], 0));
  const oneTimeItems = items.filter((x) => !x.refundable);
  const refundableItems = items.filter((x) => x.refundable);
  const oneTime: Money = [sum(oneTimeItems, 0), sum(oneTimeItems, 1)];
  const refundable: Money = [sum(refundableItems, 0), sum(refundableItems, 1)];
  const total: Money = [round2(oneTime[0] + refundable[0]), round2(oneTime[1] + refundable[1])];
  const convert = (m: Money) =>
    Object.fromEntries(CURRENCIES.map((c) => [c, [Math.round(m[0] * rates[c]), Math.round(m[1] * rates[c])] as Money])) as Record<Currency, Money>;
  return {
    currency: 'EUR' as const,
    items,
    oneTime,
    refundable,
    total,
    converted: { oneTime: convert(oneTime), refundable: convert(refundable), total: convert(total) },
  };
};
export type CostBreakdown = ReturnType<typeof computeCost>;

/** Published categories with their effective fees (public config + admin preview). */
export const costCategories = async (s: CostSettings) => {
  const cats = await prisma.visaCategory.findMany({
    where: { published: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, slug: true, title: true, visaLabel: true, icon: true, germanLevel: true },
  });
  return cats.map((c) => {
    const fees = feesFor(c, s);
    return { ...c, fees, configured: !!s.categories[c.slug], languageDefault: !!c.germanLevel?.trim() };
  });
};

/** Full estimate for a category + visitor inputs (missing inputs take the category defaults). */
export const estimateCost = async (
  category: { slug: string; visaLabel: string; germanLevel: string | null },
  raw: z.infer<typeof costInputSchema>,
  s: CostSettings,
) => {
  const fees = feesFor(category, s);
  const prices = await documentPrices(s);
  const input: CostInput = {
    adults: raw.adults,
    children: raw.children,
    documents: raw.documents ?? fees.translationDocs,
    apostilles: raw.apostilles ?? fees.apostilleDocs,
    recognition: raw.recognition ? raw.recognition === '1' : fees.recognitionDefault,
    language: raw.language ? raw.language === '1' : !!category.germanLevel?.trim(),
  };
  return { input, prices, ...computeCost(fees, prices, input, s.rates), ratesUpdatedAt: s.ratesUpdatedAt || null };
};
