import { z } from 'zod';
import { prisma } from '../../db.js';

/**
 * Document currencies (EUR, AZN, TRY) — the pure part plus the admin-set exchange rates.
 *
 *  - Amounts are always integer minor units (cent / qəpik / kuruş: 1/100 of the unit for all three).
 *  - Every document (client invoice, payment plan, package order, company invoice) carries ONE currency chosen at
 *    creation; a document never mixes currencies.
 *  - Totals and reports never add different currencies together: they are grouped by currency
 *    (`groupByCurrency`). Only the profitability view converts to EUR, with the rates of Setting `exchangeRates`
 *    (1 EUR = x units, with the date they were set); a currency without a rate is left out of the EUR figures and
 *    reported as "unconverted" instead of being guessed.
 *  - Display: German number format on documents (the invoices are German) with the symbol (€, ₼, ₺) in e-mails /
 *    the UI. PDFs: DejaVu Sans (client invoices) has € and ₺ but no ₼ (U+20BC), the standard Helvetica of the
 *    company invoices only € — there the ISO code is printed instead ("1.234,56 AZN").
 */

export const CURRENCIES = ['EUR', 'AZN', 'TRY'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const currencySchema = z.enum(CURRENCIES);

export const isCurrency = (v: unknown): v is Currency => (CURRENCIES as readonly string[]).includes(String(v));
export const asCurrency = (v: unknown, fallback: Currency = 'EUR'): Currency => (isCurrency(v) ? v : fallback);

export const SYMBOL: Record<Currency, string> = { EUR: '€', AZN: '₼', TRY: '₺' };

/** Which glyphs a PDF font can draw: 'dejavu' (client invoices / receipts), 'winansi' (Helvetica, company invoices). */
export type PdfFontKind = 'dejavu' | 'winansi';
const PDF_SYMBOL_OK: Record<PdfFontKind, Currency[]> = { dejavu: ['EUR', 'TRY'], winansi: ['EUR'] };

const num = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Integer minor units → "1.234,56 €" / "1.234,56 ₼" / "1.234,56 ₺" (German number format, symbol after the
 * amount with a normal space). `display: 'code'` → "1.234,56 AZN"; `pdf` picks symbol or code by the font.
 */
export const formatMoney = (cents: number, currency: string | null | undefined = 'EUR', opts: { display?: 'symbol' | 'code'; pdf?: PdfFontKind } = {}) => {
  const cur = asCurrency(currency);
  const amount = num.format(cents / 100).replace(/[  ]/g, ' ');
  const useCode = opts.display === 'code' || (opts.pdf ? !PDF_SYMBOL_OK[opts.pdf].includes(cur) : false);
  return `${amount} ${useCode ? cur : SYMBOL[cur]}`;
};

/** Money formatter bound to a currency and a PDF font. */
export const pdfMoney = (currency: string | null | undefined, font: PdfFontKind) => (cents: number) => formatMoney(cents, currency, { pdf: font });

// ─── Grouping ────────────────────────────────────────────────────────

/** Sums rows per currency (never across currencies). Currencies in CURRENCIES order, then unknown codes. */
export const groupByCurrency = <T, K extends string>(rows: T[], currencyOf: (r: T) => string | null | undefined, pick: (r: T) => Record<K, number>) => {
  const map = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const cur = (currencyOf(r) || 'EUR').toUpperCase();
    const acc = map.get(cur) ?? { count: 0 };
    for (const [k, v] of Object.entries(pick(r)) as [string, number][]) acc[k] = (acc[k] ?? 0) + v;
    acc.count += 1;
    map.set(cur, acc);
  }
  const order = (c: string) => {
    const i = (CURRENCIES as readonly string[]).indexOf(c);
    return i < 0 ? 99 : i;
  };
  return [...map.entries()].sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0])).map(([currency, v]) => ({ currency, ...(v as Record<K, number> & { count: number }) }));
};

// ─── Exchange rates (Setting `exchangeRates`) ────────────────────────

export const EXCHANGE_RATES_KEY = 'exchangeRates';

const rate = z.coerce.number().positive().max(100_000).nullable().default(null);
export const exchangeRatesSchema = z.object({
  /** 1 EUR = x units of the currency. */
  rates: z.object({ AZN: rate, TRY: rate }).default({ AZN: null, TRY: null }),
  /** Date the rates were set (YYYY-MM-DD; the conversion uses one rate per currency, not a daily history). */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  note: z.string().trim().max(300).default(''),
});
export type ExchangeRates = z.infer<typeof exchangeRatesSchema>;
export const EXCHANGE_DEFAULTS: ExchangeRates = exchangeRatesSchema.parse({});

export const getExchangeRates = async (): Promise<ExchangeRates> => {
  const row = await prisma.setting.findUnique({ where: { key: EXCHANGE_RATES_KEY } });
  const parsed = exchangeRatesSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : EXCHANGE_DEFAULTS;
};

export const saveExchangeRates = async (input: unknown) => {
  const value = exchangeRatesSchema.parse(input);
  await prisma.setting.upsert({ where: { key: EXCHANGE_RATES_KEY }, create: { key: EXCHANGE_RATES_KEY, value }, update: { value } });
  return value;
};

/** EUR minor units for an amount, or null when the currency has no rate (never guessed). */
export const convertToEur = (cents: number, currency: string | null | undefined, rates: Pick<ExchangeRates, 'rates'>): number | null => {
  const cur = asCurrency(currency, 'EUR');
  if (cur === 'EUR' || !currency) return cents;
  const r = rates.rates[cur];
  return r && r > 0 ? Math.round(cents / r) : null;
};
