import { z } from 'zod';
import type { Company, Invoice } from '@prisma/client';
import { prisma } from '../../db.js';
import { conflict } from '../http.js';
import { readInvoicing, readLegal, type InvoiceLine } from '../invoicePdf.js';
import { formatInvoiceDate } from '../invoiceTexts.js';
import { buildXRechnung, xrechnungFileName } from './xrechnung.js';

/**
 * E-Rechnung for company invoices (B2B in Germany): XRechnung XML (UBL) per issued invoice — download in the
 * invoice list and, per company, optionally attached to the invoice e-mail next to the PDF.
 * The Company model has no field for the Leitweg-ID, so the e-invoice data per company lives in Setting
 * `companyEInvoice`: { [companyId]: { leitwegId, buyerReference, email, attachXml } }.
 * ZUGFeRD / Factur-X (PDF/A-3 with the XML embedded) is not produced: the PDFs use the non-embedded standard
 * fonts and pdf-lib cannot write PDF/A conformance (XMP, output intent), so a hybrid file would not validate.
 */

export const COMPANY_EINVOICE_KEY = 'companyEInvoice';

export const companyEInvoiceSchema = z.object({
  /** Leitweg-ID of a public-sector buyer (e.g. 991-12345-67) — goes into BT-10 Buyer reference. */
  leitwegId: z.string().trim().max(46).regex(/^$|^[0-9A-Za-z]{2,12}(-[0-9A-Za-z]{1,30})?-[0-9A-Za-z]{2}$/, 'INVALID_LEITWEG_ID').default(''),
  /** Reference the buyer asked for (order number, cost centre …) when there is no Leitweg-ID. */
  buyerReference: z.string().trim().max(100).default(''),
  /** Electronic address of the buyer (BT-49); default the company's e-mail. */
  email: z.union([z.string().trim().toLowerCase().email().max(190), z.literal('')]).default(''),
  /** Attach the XRechnung XML to the invoice e-mail. */
  attachXml: z.boolean().default(false),
});
export type CompanyEInvoice = z.infer<typeof companyEInvoiceSchema>;
const EMPTY: CompanyEInvoice = companyEInvoiceSchema.parse({});

const readAll = async (): Promise<Record<string, CompanyEInvoice>> => {
  const row = await prisma.setting.findUnique({ where: { key: COMPANY_EINVOICE_KEY } });
  const o = (row?.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value : {}) as Record<string, unknown>;
  const out: Record<string, CompanyEInvoice> = {};
  for (const [k, v] of Object.entries(o)) {
    const p = companyEInvoiceSchema.safeParse(v);
    if (p.success) out[k] = p.data;
  }
  return out;
};

export const getCompanyEInvoice = async (companyId: string): Promise<CompanyEInvoice> => (await readAll())[companyId] ?? EMPTY;

export const saveCompanyEInvoice = async (companyId: string, input: unknown) => {
  const value = companyEInvoiceSchema.parse(input);
  const all = await readAll();
  if (!value.leitwegId && !value.buyerReference && !value.email && !value.attachXml) delete all[companyId];
  else all[companyId] = value;
  await prisma.setting.upsert({ where: { key: COMPANY_EINVOICE_KEY }, create: { key: COMPANY_EINVOICE_KEY, value: all }, update: { value: all } });
  return value;
};

const lines = (items: unknown): InvoiceLine[] =>
  Array.isArray(items)
    ? items
        .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
        .map((l) => ({ description: String(l.description ?? ''), quantity: Number(l.quantity ?? 0), unitPriceCents: Math.round(Number(l.unitPriceCents ?? 0)), servicePeriod: (l.servicePeriod as InvoiceLine['servicePeriod']) ?? null }))
    : [];

/** XRechnung of an issued company invoice. Drafts have no number yet; a cancelled invoice is no payable invoice. */
export const companyXRechnung = async (invoice: Invoice & { company: Company }) => {
  if (invoice.status === 'DRAFT') throw conflict('INVOICE_IS_DRAFT');
  if (invoice.status === 'CANCELLED') throw conflict('INVOICE_CANCELLED');
  const rows = await prisma.setting.findMany({ where: { key: { in: ['invoicing', 'legal'] } } });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const invoicing = readInvoicing(byKey.invoicing);
  const { seller } = readLegal(byKey.legal);
  const meta = await getCompanyEInvoice(invoice.companyId);
  const c = invoice.company;
  const built = buildXRechnung({
    invoice: { ...invoice, items: lines(invoice.items) },
    seller,
    bank: { iban: invoicing.iban, bic: invoicing.bic, accountHolder: invoicing.accountHolder || seller.name, bank: invoicing.bank },
    smallBusiness: invoicing.smallBusiness,
    paymentTermsText: `Zahlbar ohne Abzug bis ${formatInvoiceDate(invoice.dueDate)}. Verwendungszweck: ${invoice.number}`,
    buyer: { name: c.name, address: c.address, city: c.city, vatId: c.vatId, email: meta.email || c.email, contactName: c.contactName, phone: c.phone },
    buyerReference: meta.leitwegId || meta.buyerReference || null,
  });
  return { ...built, fileName: xrechnungFileName(invoice.number), attachXml: meta.attachXml };
};
