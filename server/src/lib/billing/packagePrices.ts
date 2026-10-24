import { z } from 'zod';
import { prisma } from '../../db.js';
import { CURRENCIES, asCurrency, isCurrency, type Currency } from './currency.js';

/**
 * Optional prices of a service package in other currencies (Setting `packagePrices`:
 * { [packageId]: { EUR?, AZN?, TRY? } } in minor units). The package's own priceCents / currency stay the base
 * price; an extra price is a fixed price set by an admin (never converted). The public page shows the visitor's
 * currency where a price exists (az → AZN, tr → TRY, others → EUR) and falls back to the base price; an order is
 * placed — and its contract, plan and invoices issued — in the currency it was shown in.
 */

export const PACKAGE_PRICES_KEY = 'packagePrices';

const cents = z.coerce.number().int().min(100).max(100_000_000).nullable().optional();
export const packagePricesSchema = z.object({ EUR: cents, AZN: cents, TRY: cents }).partial().default({});
export type PackagePriceInput = z.infer<typeof packagePricesSchema>;
export type PriceMap = Partial<Record<Currency, number>>;

type Stored = Record<string, PriceMap>;

const clean = (v: unknown): PriceMap => {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const out: PriceMap = {};
  for (const c of CURRENCIES) {
    const n = Number(o[c]);
    if (Number.isInteger(n) && n > 0) out[c] = n;
  }
  return out;
};

export const getPackagePrices = async (): Promise<Stored> => {
  const row = await prisma.setting.findUnique({ where: { key: PACKAGE_PRICES_KEY } });
  const o = (row?.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value : {}) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, clean(v)]));
};

/** Stores the extra prices of one package (the base currency's entry is dropped: priceCents is the source). */
export const setPackagePrices = async (packageId: string, baseCurrency: string, input: PackagePriceInput | null | undefined) => {
  const all = await getPackagePrices();
  const next = clean(input ?? {});
  delete next[asCurrency(baseCurrency)];
  if (Object.keys(next).length) all[packageId] = next;
  else delete all[packageId];
  await prisma.setting.upsert({ where: { key: PACKAGE_PRICES_KEY }, create: { key: PACKAGE_PRICES_KEY, value: all }, update: { value: all } });
  return next;
};

export const removePackagePrices = async (packageId: string) => {
  const all = await getPackagePrices();
  if (!(packageId in all)) return;
  delete all[packageId];
  await prisma.setting.upsert({ where: { key: PACKAGE_PRICES_KEY }, create: { key: PACKAGE_PRICES_KEY, value: all }, update: { value: all } });
};

/** Every price of a package: the base price plus the extra ones. */
export const pricesOf = (pkg: { id: string; priceCents: number; currency: string }, all: Stored): PriceMap => ({ ...(all[pkg.id] ?? {}), [asCurrency(pkg.currency)]: pkg.priceCents });

/** Site language → preferred display currency. */
export const visitorCurrency = (locale: string | null | undefined): Currency => (locale === 'az' ? 'AZN' : locale === 'tr' ? 'TRY' : 'EUR');

/** Price in the wanted currency when the package has one, else the base price. */
export const priceFor = (pkg: { id: string; priceCents: number; currency: string }, all: Stored, wanted: string | null | undefined) => {
  const prices = pricesOf(pkg, all);
  if (wanted && isCurrency(wanted) && prices[wanted]) return { priceCents: prices[wanted]!, currency: wanted as Currency };
  return { priceCents: pkg.priceCents, currency: asCurrency(pkg.currency) };
};
