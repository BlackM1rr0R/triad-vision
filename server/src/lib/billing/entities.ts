import { z } from 'zod';
import { prisma } from '../../db.js';
import type { SellerInfo } from '../invoicePdf.js';
import { CURRENCIES, asCurrency, currencySchema, type Currency } from './currency.js';

/**
 * Issuing entity of a client document (Setting `billingEntities`). Kept deliberately simple:
 *
 *  - DE = the German company. Seller data from the legal settings, bank from the invoicing settings, VAT from the
 *    client billing settings (STANDARD 19 % / § 19 small business / exempt) — exactly as before this setting existed.
 *  - AZ = the Baku office as a separate legal entity (optional, off by default): its own legal data (VÖEN), bank
 *    account, VAT (STANDARD with its own rate, 18 % by default, or NONE) and its own number range TV-AZ-YYYY-NNNN.
 *  - `byCurrency` picks the entity from the document currency (default: every currency → DE; e.g. AZN → AZ).
 *
 * The entity of an issued invoice is fixed by its number prefix (TV-KR = DE, TV-AZ = AZ), so changing this setting
 * later never changes an issued invoice; drafts follow the current setting. Company invoices (B2B in Germany) are
 * always issued by the German entity.
 */

export const BILLING_ENTITIES_KEY = 'billingEntities';
export const ENTITIES = ['DE', 'AZ'] as const;
export type BillingEntity = (typeof ENTITIES)[number];
export const NUMBER_PREFIX: Record<BillingEntity, string> = { DE: 'TV-KR', AZ: 'TV-AZ' };

const s = (max: number) => z.string().trim().max(max).default('');

export const azEntitySchema = z.object({
  enabled: z.boolean().default(false),
  name: s(160),
  street: s(200),
  zipCity: s(160),
  country: z.string().trim().max(80).default('Azərbaycan'),
  /** VÖEN (Azerbaijani tax identification number) */
  taxNumber: s(40),
  vatId: s(40),
  register: s(160),
  managingDirector: s(160),
  email: s(160),
  phone: s(60),
  website: s(160),
  vatMode: z.enum(['STANDARD', 'NONE']).default('NONE'),
  vatRate: z.coerce.number().int().min(0).max(100).default(18),
  exemptionNote: z.string().trim().max(500).default('ƏDV tutulmur / No VAT charged.'),
  bank: z.object({ accountHolder: s(160), iban: s(42), bic: s(11), bank: s(160) }).default({}),
});

export const billingEntitiesSchema = z.object({
  az: azEntitySchema.default({}),
  byCurrency: z.object({ EUR: z.enum(ENTITIES).default('DE'), AZN: z.enum(ENTITIES).default('DE'), TRY: z.enum(ENTITIES).default('DE') }).default({}),
  /** Currency preselected for new client invoices and payment plans. */
  defaultCurrency: currencySchema.default('EUR'),
});
export type BillingEntitiesSettings = z.infer<typeof billingEntitiesSchema>;
export const ENTITY_DEFAULTS: BillingEntitiesSettings = billingEntitiesSchema.parse({});

export const getBillingEntities = async (): Promise<BillingEntitiesSettings> => {
  const row = await prisma.setting.findUnique({ where: { key: BILLING_ENTITIES_KEY } });
  const parsed = billingEntitiesSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : ENTITY_DEFAULTS;
};

export const saveBillingEntities = async (input: unknown) => {
  const value = billingEntitiesSchema.parse(input);
  await prisma.setting.upsert({ where: { key: BILLING_ENTITIES_KEY }, create: { key: BILLING_ENTITIES_KEY, value }, update: { value } });
  return value;
};

/** Entity for a document currency under the given settings (AZ only when the Baku entity is enabled). */
export const entityForCurrency = (currency: string | null | undefined, s: BillingEntitiesSettings): BillingEntity => {
  const e = s.byCurrency[asCurrency(currency)];
  return e === 'AZ' && s.az.enabled ? 'AZ' : 'DE';
};

/** Entity of an existing invoice: issued ones by number prefix, drafts by the current setting. */
export const entityOfInvoice = (inv: { number: string; status: string; currency: string }, s: BillingEntitiesSettings): BillingEntity => {
  if (inv.status === 'DRAFT') return entityForCurrency(inv.currency, s);
  return inv.number.startsWith(`${NUMBER_PREFIX.AZ}-`) ? 'AZ' : 'DE';
};

export const azSeller = (az: BillingEntitiesSettings['az']): SellerInfo => ({
  name: az.name,
  street: az.street,
  zipCity: az.zipCity,
  country: az.country,
  vatId: az.vatId,
  taxNumber: az.taxNumber,
  register: az.register,
  managingDirector: az.managingDirector,
  email: az.email,
  phone: az.phone,
  website: az.website,
});

export const supportedCurrencies = (): Currency[] => [...CURRENCIES];
