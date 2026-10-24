import type { InvoiceLine, InvoicingSettings, SellerInfo } from '../invoicePdf.js';
import { lineTotalCents } from '../invoicePdf.js';

/**
 * XRechnung 3.0 (UBL 2.1 Invoice, CIUS XRechnung of EN 16931) for company invoices — the pure part.
 * Business terms filled (BT numbers of EN 16931 / XRechnung):
 *  BT-1 number, BT-2 issue date, BT-9 due date, BT-3 type 380, BT-5 currency, BT-10 buyer reference (Leitweg-ID
 *  for public buyers, else the buyer's reference or the invoice number), BT-24 customization, BT-23 profile,
 *  BG-14 invoice period (Leistungszeitraum), BT-22 note;
 *  Seller BG-4: BT-27 name, BT-34 electronic address (e-mail, scheme EM), BG-5 address (BT-35/37/38/40),
 *  BT-31 USt-IdNr. (VAT) / BT-32 Steuernummer (FC), BT-30 register, BG-6 contact (BT-41/42/43);
 *  Buyer BG-7: BT-44 name, BT-49 electronic address, BG-8 address (BT-50/52/53/55), BT-48 USt-IdNr.;
 *  BG-16 payment: means 58 (SEPA credit transfer), BT-83 remittance (= invoice number), BT-84 IBAN, BT-86 BIC;
 *  BT-20 payment terms; BG-23 VAT breakdown (S with rate / E exempt with reason for § 19 UStG or 0 %);
 *  BG-22 totals (BT-106/109/110/112/115); BG-25 lines (BT-126/129/131/146/153 + item VAT category).
 * `missing` lists XRechnung-mandatory data that is not maintained (the XML is still produced so the admin sees it,
 * but a recipient's validator would reject it until the data is filled in).
 */

export interface XRechnungInput {
  invoice: {
    number: string;
    issueDate: Date;
    dueDate: Date;
    currency: string;
    items: InvoiceLine[];
    vatRate: number;
    netCents: number;
    vatCents: number;
    grossCents: number;
    note: string | null;
  };
  seller: SellerInfo;
  bank: Pick<InvoicingSettings, 'iban' | 'bic' | 'accountHolder' | 'bank'>;
  smallBusiness: boolean;
  paymentTermsText: string;
  buyer: {
    name: string;
    address?: string | null;
    city?: string | null;
    vatId?: string | null;
    email?: string | null;
    contactName?: string | null;
    phone?: string | null;
  };
  /** Leitweg-ID (public buyers) or the reference the buyer asked for. */
  buyerReference?: string | null;
}

export const XRECHNUNG_CUSTOMIZATION = 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';
export const XRECHNUNG_PROFILE = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

export const xmlEscape = (s: string) =>
  s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const amt = (cents: number) => (cents / 100).toFixed(2);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** "10115 Berlin" → { zip, city }; also "D-10115 Berlin" and a city alone. */
export const splitZipCity = (s: string | null | undefined) => {
  const t = (s ?? '').trim();
  const m = /^(?:[A-Z]{1,2}-)?(\d{4,6})\s+(.+)$/.exec(t);
  return m ? { zip: m[1], city: m[2].trim() } : { zip: '', city: t };
};

/** Company address (free text, several lines) + city → street, zip, city. */
export const parseBuyerAddress = (address: string | null | undefined, city: string | null | undefined) => {
  const lines = (address ?? '').split(/\r?\n|,\s*/).map((l) => l.trim()).filter(Boolean);
  let street = lines[0] ?? '';
  let zip = '';
  let town = (city ?? '').trim();
  for (const l of lines.slice(1)) {
    const z = splitZipCity(l);
    if (z.zip) {
      zip = z.zip;
      town = town || z.city;
    }
  }
  if (!zip && town) {
    const z = splitZipCity(town);
    if (z.zip) {
      zip = z.zip;
      town = z.city;
    }
  }
  if (lines.length === 1 && splitZipCity(street).zip) {
    const z = splitZipCity(street);
    zip = z.zip;
    town = town || z.city;
    street = '';
  }
  return { street, zip, city: town };
};

const countryCode = (country: string) => {
  const c = country.trim().toLowerCase();
  if (!c || c.startsWith('deutsch') || c === 'germany' || c === 'de') return 'DE';
  if (c.startsWith('azər') || c.startsWith('aserb') || c.startsWith('azerb') || c === 'az') return 'AZ';
  if (c.startsWith('türk') || c.startsWith('turk') || c === 'tr') return 'TR';
  if (/^[a-z]{2}$/.test(c)) return c.toUpperCase();
  return 'DE';
};

export const buildXRechnung = (input: XRechnungInput) => {
  const { invoice, seller, bank, buyer } = input;
  const cur = invoice.currency || 'EUR';
  const e = (s: string | null | undefined) => xmlEscape(String(s ?? ''));
  const missing: string[] = [];
  const need = (v: string | null | undefined, code: string) => {
    if (!v || !String(v).trim()) missing.push(code);
  };
  const sAddr = splitZipCity(seller.zipCity);
  const bAddr = parseBuyerAddress(buyer.address, buyer.city);
  need(seller.name, 'BT-27 seller name');
  need(seller.street, 'BT-35 seller street');
  need(sAddr.city, 'BT-37 seller city');
  need(sAddr.zip, 'BT-38 seller post code');
  if (!seller.vatId && !seller.taxNumber) missing.push('BT-31/BT-32 seller VAT ID or tax number');
  need(seller.email, 'BT-34/BT-43 seller e-mail');
  need(seller.phone, 'BT-42 seller telephone');
  need(buyer.name, 'BT-44 buyer name');
  need(bAddr.city, 'BT-52 buyer city');
  need(bAddr.zip, 'BT-53 buyer post code');
  need(buyer.email, 'BT-49 buyer electronic address');
  need(bank.iban, 'BT-84 IBAN');

  const exempt = invoice.vatRate === 0;
  const cat = exempt ? 'E' : 'S';
  const exemptionReason = input.smallBusiness ? 'Kein Ausweis von Umsatzsteuer, da Kleinunternehmer gemäß § 19 UStG' : 'Steuerfreie Leistung';
  const taxCategory = (tag: 'TaxCategory' | 'ClassifiedTaxCategory', withReason: boolean) =>
    `<cac:${tag}><cbc:ID>${cat}</cbc:ID><cbc:Percent>${invoice.vatRate}</cbc:Percent>${withReason && exempt ? `<cbc:TaxExemptionReason>${e(exemptionReason)}</cbc:TaxExemptionReason>` : ''}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:${tag}>`;

  const period = invoice.items.find((l) => l.servicePeriod)?.servicePeriod;
  const reference = (input.buyerReference || '').trim() || invoice.number;
  const contactName = seller.managingDirector || seller.name;

  const lines = invoice.items.map((l, i) => {
    const total = lineTotalCents(l);
    // EN 16931 BR-27: the price is never negative — a credit line has a negative quantity instead.
    const neg = l.unitPriceCents < 0;
    const qty = neg ? -l.quantity : l.quantity;
    const price = Math.abs(l.unitPriceCents);
    return [
      '<cac:InvoiceLine>',
      `<cbc:ID>${i + 1}</cbc:ID>`,
      `<cbc:InvoicedQuantity unitCode="C62">${Number(qty.toFixed(2))}</cbc:InvoicedQuantity>`,
      `<cbc:LineExtensionAmount currencyID="${e(cur)}">${amt(total)}</cbc:LineExtensionAmount>`,
      `<cac:Item><cbc:Name>${e(l.description.slice(0, 200))}</cbc:Name>${taxCategory('ClassifiedTaxCategory', false)}</cac:Item>`,
      `<cac:Price><cbc:PriceAmount currencyID="${e(cur)}">${amt(price)}</cbc:PriceAmount></cac:Price>`,
      '</cac:InvoiceLine>',
    ].join('');
  });

  const party = (p: { endpoint?: string | null; name: string; street?: string; city?: string; zip?: string; country: string; vatId?: string | null; taxNumber?: string | null; register?: string | null; contact?: { name?: string | null; phone?: string | null; email?: string | null } | null }) =>
    [
      '<cac:Party>',
      p.endpoint ? `<cbc:EndpointID schemeID="EM">${e(p.endpoint)}</cbc:EndpointID>` : '',
      `<cac:PartyName><cbc:Name>${e(p.name)}</cbc:Name></cac:PartyName>`,
      '<cac:PostalAddress>',
      p.street ? `<cbc:StreetName>${e(p.street)}</cbc:StreetName>` : '',
      `<cbc:CityName>${e(p.city)}</cbc:CityName>`,
      `<cbc:PostalZone>${e(p.zip)}</cbc:PostalZone>`,
      `<cac:Country><cbc:IdentificationCode>${p.country}</cbc:IdentificationCode></cac:Country>`,
      '</cac:PostalAddress>',
      p.vatId ? `<cac:PartyTaxScheme><cbc:CompanyID>${e(p.vatId.replace(/\s+/g, ''))}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : '',
      p.taxNumber ? `<cac:PartyTaxScheme><cbc:CompanyID>${e(p.taxNumber)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>FC</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : '',
      `<cac:PartyLegalEntity><cbc:RegistrationName>${e(p.name)}</cbc:RegistrationName>${p.register ? `<cbc:CompanyID>${e(p.register)}</cbc:CompanyID>` : ''}</cac:PartyLegalEntity>`,
      p.contact && (p.contact.name || p.contact.phone || p.contact.email)
        ? `<cac:Contact>${p.contact.name ? `<cbc:Name>${e(p.contact.name)}</cbc:Name>` : ''}${p.contact.phone ? `<cbc:Telephone>${e(p.contact.phone)}</cbc:Telephone>` : ''}${p.contact.email ? `<cbc:ElectronicMail>${e(p.contact.email)}</cbc:ElectronicMail>` : ''}</cac:Contact>`
        : '',
      '</cac:Party>',
    ].join('');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ubl:Invoice xmlns:ubl="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">',
    `<cbc:CustomizationID>${XRECHNUNG_CUSTOMIZATION}</cbc:CustomizationID>`,
    `<cbc:ProfileID>${XRECHNUNG_PROFILE}</cbc:ProfileID>`,
    `<cbc:ID>${e(invoice.number)}</cbc:ID>`,
    `<cbc:IssueDate>${isoDate(invoice.issueDate)}</cbc:IssueDate>`,
    `<cbc:DueDate>${isoDate(invoice.dueDate)}</cbc:DueDate>`,
    '<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>',
    invoice.note ? `<cbc:Note>${e(invoice.note.slice(0, 2000))}</cbc:Note>` : '',
    `<cbc:DocumentCurrencyCode>${e(cur)}</cbc:DocumentCurrencyCode>`,
    `<cbc:BuyerReference>${e(reference)}</cbc:BuyerReference>`,
    period && (period.from || period.to) ? `<cac:InvoicePeriod>${period.from ? `<cbc:StartDate>${period.from}</cbc:StartDate>` : ''}${period.to ? `<cbc:EndDate>${period.to}</cbc:EndDate>` : ''}</cac:InvoicePeriod>` : '',
    '<cac:AccountingSupplierParty>',
    party({
      endpoint: seller.email,
      name: seller.name,
      street: seller.street,
      city: sAddr.city,
      zip: sAddr.zip,
      country: countryCode(seller.country),
      vatId: seller.vatId,
      taxNumber: seller.taxNumber,
      register: seller.register,
      contact: { name: contactName, phone: seller.phone, email: seller.email },
    }),
    '</cac:AccountingSupplierParty>',
    '<cac:AccountingCustomerParty>',
    party({
      endpoint: buyer.email,
      name: buyer.name,
      street: bAddr.street,
      city: bAddr.city,
      zip: bAddr.zip,
      country: 'DE',
      vatId: buyer.vatId,
      contact: buyer.contactName || buyer.phone ? { name: buyer.contactName, phone: buyer.phone, email: buyer.email } : null,
    }),
    '</cac:AccountingCustomerParty>',
    '<cac:PaymentMeans>',
    '<cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>',
    `<cbc:PaymentID>${e(invoice.number)}</cbc:PaymentID>`,
    bank.iban
      ? `<cac:PayeeFinancialAccount><cbc:ID>${e(bank.iban.replace(/\s+/g, ''))}</cbc:ID>${bank.accountHolder ? `<cbc:Name>${e(bank.accountHolder)}</cbc:Name>` : ''}${bank.bic ? `<cac:FinancialInstitutionBranch><cbc:ID>${e(bank.bic)}</cbc:ID></cac:FinancialInstitutionBranch>` : ''}</cac:PayeeFinancialAccount>`
      : '',
    '</cac:PaymentMeans>',
    `<cac:PaymentTerms><cbc:Note>${e(input.paymentTermsText)}</cbc:Note></cac:PaymentTerms>`,
    `<cac:TaxTotal><cbc:TaxAmount currencyID="${e(cur)}">${amt(invoice.vatCents)}</cbc:TaxAmount>`,
    `<cac:TaxSubtotal><cbc:TaxableAmount currencyID="${e(cur)}">${amt(invoice.netCents)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="${e(cur)}">${amt(invoice.vatCents)}</cbc:TaxAmount>${taxCategory('TaxCategory', true)}</cac:TaxSubtotal>`,
    '</cac:TaxTotal>',
    '<cac:LegalMonetaryTotal>',
    `<cbc:LineExtensionAmount currencyID="${e(cur)}">${amt(invoice.netCents)}</cbc:LineExtensionAmount>`,
    `<cbc:TaxExclusiveAmount currencyID="${e(cur)}">${amt(invoice.netCents)}</cbc:TaxExclusiveAmount>`,
    `<cbc:TaxInclusiveAmount currencyID="${e(cur)}">${amt(invoice.grossCents)}</cbc:TaxInclusiveAmount>`,
    `<cbc:PayableAmount currencyID="${e(cur)}">${amt(invoice.grossCents)}</cbc:PayableAmount>`,
    '</cac:LegalMonetaryTotal>',
    ...lines,
    '</ubl:Invoice>',
  ]
    .filter(Boolean)
    .join('\n');
  return { xml, missing };
};

export const xrechnungFileName = (number: string) => `XRechnung-${number.replace(/[^A-Za-z0-9_-]/g, '_')}.xml`;
