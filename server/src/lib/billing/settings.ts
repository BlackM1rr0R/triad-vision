import { z } from 'zod';
import { prisma } from '../../db.js';
import { readInvoicing, readLegal } from '../invoicePdf.js';
import { readSetting, writeSetting } from '../growth/settings.js';

/**
 * Settings of client billing (Setting `clientBilling`). The seller data (name, address, Steuernummer /
 * USt-IdNr.) comes from the legal settings and the bank account from the invoicing settings — the same as on
 * company invoices — so they are maintained in one place.
 *
 * VAT modes:
 *  - STANDARD: the rate below (19 % by default) on every taxable line;
 *  - SMALL_BUSINESS: no VAT, § 19 UStG note on the invoice (Kleinunternehmerregelung);
 *  - EXEMPT: no VAT, the configurable exemption note on the invoice (e.g. a service not taxable in Germany).
 * Embassy fees are passed on without VAT in every mode.
 */

export const CLIENT_BILLING_KEY = 'clientBilling';
export const VAT_MODES = ['STANDARD', 'SMALL_BUSINESS', 'EXEMPT'] as const;
export type VatMode = (typeof VAT_MODES)[number];

export const clientBillingSchema = z.object({
  vatMode: z.enum(VAT_MODES).default('STANDARD'),
  vatRate: z.coerce.number().int().min(0).max(100).default(19),
  exemptionNote: z.string().trim().max(500).default('Steuerfreie Leistung / VAT exempt service.'),
  paymentTermsDays: z.coerce.number().int().min(0).max(120).default(14),
  /** days after the due date for the first / second reminder; after the second a staff task is created */
  reminder1Days: z.coerce.number().int().min(1).max(60).default(3),
  reminder2Days: z.coerce.number().int().min(2).max(120).default(10),
  /** extra text printed under the payment details (e.g. "Cash payments at the Baku office") */
  footer: z.string().trim().max(500).default(''),
});
export type ClientBillingSettings = z.infer<typeof clientBillingSchema>;

export const CLIENT_BILLING_DEFAULTS: ClientBillingSettings = clientBillingSchema.parse({});

export const getClientBillingSettings = async (): Promise<ClientBillingSettings> => {
  const row = await prisma.setting.findUnique({ where: { key: CLIENT_BILLING_KEY } });
  if (!row) {
    // First use: follow the company invoicing setting (§ 19 small business → no VAT here either).
    const inv = readInvoicing((await prisma.setting.findUnique({ where: { key: 'invoicing' } }))?.value);
    return { ...CLIENT_BILLING_DEFAULTS, vatMode: inv.smallBusiness ? 'SMALL_BUSINESS' : 'STANDARD', vatRate: inv.defaultVatRate, paymentTermsDays: inv.paymentTermsDays };
  }
  return readSetting(CLIENT_BILLING_KEY, clientBillingSchema, CLIENT_BILLING_DEFAULTS);
};

export const saveClientBillingSettings = async (s: ClientBillingSettings) => {
  if (s.reminder2Days <= s.reminder1Days) s.reminder2Days = s.reminder1Days + 1;
  await writeSetting(CLIENT_BILLING_KEY, s);
  return s;
};

/** VAT rate an invoice gets in the current mode. */
export const effectiveVatRate = (s: Pick<ClientBillingSettings, 'vatMode' | 'vatRate'>) => (s.vatMode === 'STANDARD' ? s.vatRate : 0);

/** Everything a client invoice / receipt needs: billing settings, seller (legal), bank (invoicing). */
export const loadBillingContext = async () => {
  const rows = await prisma.setting.findMany({ where: { key: { in: ['invoicing', 'legal'] } } });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const invoicing = readInvoicing(byKey.invoicing);
  const { seller, missing } = readLegal(byKey.legal);
  return {
    billing: await getClientBillingSettings(),
    seller,
    legalMissing: missing,
    bank: { accountHolder: invoicing.accountHolder || seller.name, iban: invoicing.iban, bic: invoicing.bic, bank: invoicing.bank },
  };
};
export type BillingContext = Awaited<ReturnType<typeof loadBillingContext>>;
