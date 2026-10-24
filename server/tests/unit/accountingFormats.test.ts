import { describe, expect, it } from 'vitest';
import { convertToEur, formatMoney, groupByCurrency } from '../../src/lib/billing/currency.js';
import { ENTITY_DEFAULTS, billingEntitiesSchema, entityForCurrency, entityOfInvoice } from '../../src/lib/billing/entities.js';
import { priceFor, pricesOf, visitorCurrency } from '../../src/lib/billing/packagePrices.js';
import { nextNumberFrom } from '../../src/lib/billing/math.js';
import { decodeCp1252, encodeCp1252, toCp1252Text } from '../../src/lib/accounting/cp1252.js';
import {
  COLUMNS,
  DATEV_DEFAULTS,
  HEADER_FIELDS,
  belegDatum,
  buildBuchungsstapel,
  datevAmount,
  datevSettingsSchema,
  fiscalYearStart,
  revenueAccount,
  rowLine,
  splitByAccount,
} from '../../src/lib/accounting/datevFormat.js';
import { buildXRechnung, parseBuyerAddress, splitZipCity } from '../../src/lib/accounting/xrechnung.js';
import { awaitingCountersign } from '../../src/lib/esign/countersign.js';

describe('currencies', () => {
  it('formats minor units in German format with symbol, code or the PDF font rule', () => {
    expect(formatMoney(123456, 'EUR')).toBe('1.234,56 €');
    expect(formatMoney(123456, 'AZN')).toBe('1.234,56 ₼');
    expect(formatMoney(-500, 'TRY')).toBe('-5,00 ₺');
    expect(formatMoney(123456, 'AZN', { display: 'code' })).toBe('1.234,56 AZN');
    // DejaVu Sans has € and ₺ but no ₼; Helvetica (WinAnsi) only €.
    expect(formatMoney(100, 'AZN', { pdf: 'dejavu' })).toBe('1,00 AZN');
    expect(formatMoney(100, 'TRY', { pdf: 'dejavu' })).toBe('1,00 ₺');
    expect(formatMoney(100, 'TRY', { pdf: 'winansi' })).toBe('1,00 TRY');
    expect(formatMoney(100, 'EUR', { pdf: 'winansi' })).toBe('1,00 €');
  });

  it('never adds currencies together and converts to EUR only with a rate', () => {
    const groups = groupByCurrency(
      [
        { c: 'TRY', v: 5 },
        { c: 'EUR', v: 10 },
        { c: 'EUR', v: 15 },
        { c: 'AZN', v: 7 },
      ],
      (r) => r.c,
      (r) => ({ total: r.v }),
    );
    expect(groups).toEqual([
      { currency: 'EUR', total: 25, count: 2 },
      { currency: 'AZN', total: 7, count: 1 },
      { currency: 'TRY', total: 5, count: 1 },
    ]);
    const rates = { rates: { AZN: 2, TRY: null } };
    expect(convertToEur(1000, 'EUR', rates)).toBe(1000);
    expect(convertToEur(1000, 'AZN', rates)).toBe(500);
    expect(convertToEur(1000, 'TRY', rates)).toBeNull();
  });

  it('picks the issuing entity by currency (AZ only when enabled) and keeps it for issued invoices', () => {
    const s = billingEntitiesSchema.parse({ az: { enabled: true, name: 'Triad Vision MMC' }, byCurrency: { AZN: 'AZ' } });
    expect(entityForCurrency('AZN', s)).toBe('AZ');
    expect(entityForCurrency('EUR', s)).toBe('DE');
    expect(entityForCurrency('AZN', ENTITY_DEFAULTS)).toBe('DE');
    expect(entityForCurrency('AZN', { ...s, az: { ...s.az, enabled: false } })).toBe('DE');
    expect(entityOfInvoice({ number: 'TV-AZ-2026-0001', status: 'SENT', currency: 'AZN' }, ENTITY_DEFAULTS)).toBe('AZ');
    expect(entityOfInvoice({ number: 'TV-KR-2026-0001', status: 'SENT', currency: 'AZN' }, s)).toBe('DE');
    expect(entityOfInvoice({ number: 'DRAFT-x', status: 'DRAFT', currency: 'AZN' }, s)).toBe('AZ');
    expect(nextNumberFrom(['TV-AZ-2026-0004', 'TV-KR-2026-0010'], 2026, 'TV-AZ')).toBe('TV-AZ-2026-0005');
    expect(nextNumberFrom(['TV-AZ-2026-0004', 'TV-KR-2026-0010'], 2026)).toBe('TV-KR-2026-0011');
  });

  it('shows a package in the visitor currency where a price exists, else the base price', () => {
    const pkg = { id: 'p1', priceCents: 250000, currency: 'EUR' };
    const store = { p1: { AZN: 480000 } };
    expect(pricesOf(pkg, store)).toEqual({ EUR: 250000, AZN: 480000 });
    expect(visitorCurrency('az')).toBe('AZN');
    expect(visitorCurrency('tr')).toBe('TRY');
    expect(visitorCurrency('de')).toBe('EUR');
    expect(priceFor(pkg, store, 'AZN')).toEqual({ priceCents: 480000, currency: 'AZN' });
    expect(priceFor(pkg, store, 'TRY')).toEqual({ priceCents: 250000, currency: 'EUR' });
    expect(priceFor(pkg, {}, null)).toEqual({ priceCents: 250000, currency: 'EUR' });
  });
});

describe('countersignature state', () => {
  it('waits for the countersignature once every other party signed and a STAFF signer is open', () => {
    expect(awaitingCountersign([{ role: 'CANDIDATE', status: 'SIGNED' }, { role: 'STAFF', status: 'PENDING' }])).toBe(true);
    expect(awaitingCountersign([{ role: 'CANDIDATE', status: 'VIEWED' }, { role: 'STAFF', status: 'PENDING' }])).toBe(false);
    expect(awaitingCountersign([{ role: 'CANDIDATE', status: 'SIGNED' }, { role: 'STAFF', status: 'SIGNED' }])).toBe(false);
    expect(awaitingCountersign([{ role: 'CANDIDATE', status: 'SIGNED' }])).toBe(false);
    expect(awaitingCountersign([{ role: 'STAFF', status: 'PENDING' }])).toBe(false);
  });
});

describe('CP1252', () => {
  it('encodes Latin-1 and the CP1252 extras, transliterates the rest', () => {
    const b = encodeCp1252('Größe € „x“ – Əliyeva Şəki Москва ₼');
    expect(b.includes(0x80)).toBe(true); // €
    expect(b.includes(0x84)).toBe(true); // „
    expect(b.includes(0xf6)).toBe(true); // ö
    expect(decodeCp1252(b)).toBe('Größe € „x“ – Eliyeva Seki Moskva AZN');
    expect(toCp1252Text('日本')).toBe('??');
    expect(b.length).toBe(decodeCp1252(b).length);
  });
});

describe('DATEV Buchungsstapel (EXTF 700)', () => {
  const s = datevSettingsSchema.parse({ consultantNumber: 1234567, clientNumber: 10001, chart: 'SKR03' });
  const from = new Date('2026-10-01T00:00:00Z');
  const to = new Date('2026-10-31T23:59:59Z');

  it('formats amounts, dates and the fiscal year', () => {
    expect(datevAmount(123456)).toBe('1234,56');
    expect(datevAmount(-5)).toBe('0,05');
    expect(belegDatum(new Date('2026-03-07T12:00:00Z'))).toBe('0703');
    expect(fiscalYearStart(new Date('2026-03-07T12:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(fiscalYearStart(new Date('2026-03-07T12:00:00Z'), 7).toISOString().slice(0, 10)).toBe('2025-07-01');
    expect(DATEV_DEFAULTS.chart).toBe('SKR03');
  });

  it('writes the header line (31 fields), the 125 column headers and rows with semicolons and CRLF', () => {
    const text = buildBuchungsstapel(
      s,
      [
        { amountCents: 119000, side: 'S', account: '10000', contraAccount: '8400', date: new Date('2026-10-05T12:00:00Z'), beleg1: 'TV-KR-2026-0001', text: 'Rechnung TV-KR-2026-0001 Leyla Əliyeva; "VIP"', partnerName: 'Leyla Əliyeva' },
        { amountCents: 50000, side: 'S', account: '1200', contraAccount: '10000', date: new Date('2026-10-20T12:00:00Z'), beleg1: 'TV-KR-2026-0001', text: 'Zahlung', currency: 'TRY', rate: 36.5, baseCents: 1370 },
      ],
      { from, to, createdAt: new Date('2026-11-02T08:09:10.123Z'), label: 'Triad Vision 2026-10' },
    );
    expect(text.endsWith('\r\n')).toBe(true);
    const lines = text.split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(4);
    const header = lines[0].split(';');
    expect(header).toHaveLength(HEADER_FIELDS);
    expect(header.slice(0, 6)).toEqual(['"EXTF"', '700', '21', '"Buchungsstapel"', '13', '20261102080910123']);
    expect(header[10]).toBe('1234567');
    expect(header[11]).toBe('10001');
    expect(header[12]).toBe('20260101'); // WJ-Beginn
    expect(header[13]).toBe('4');
    expect(header[14]).toBe('20261001');
    expect(header[15]).toBe('20261031');
    expect(header[21]).toBe('"EUR"');
    expect(header[26]).toBe('"03"');
    expect(COLUMNS).toHaveLength(125);
    expect(lines[1].split(';')).toHaveLength(125);
    expect(lines[1].startsWith('Umsatz (ohne Soll/Haben-Kz);Soll/Haben-Kennzeichen;WKZ Umsatz;Kurs;Basis-Umsatz;WKZ Basis-Umsatz;Konto;Gegenkonto (ohne BU-Schlüssel);BU-Schlüssel;Belegdatum;Belegfeld 1')).toBe(true);
    const row = lines[2].split(';');
    // the text contains a semicolon inside quotes: split naively there is one extra field
    expect(row.length).toBe(126);
    expect(row.slice(0, 11)).toEqual(['1190,00', '"S"', '"EUR"', '', '', '', '10000', '8400', '""', '0510', '"TV-KR-2026-0001"']);
    expect(lines[2]).toContain('"Rechnung TV-KR-2026-0001 Leyla Eliyeva; ""VIP"""');
    const fx = lines[3].split(';');
    expect(fx.slice(0, 7)).toEqual(['500,00', '"S"', '"TRY"', '36,5', '13,70', '"EUR"', '1200']);
    const bytes = encodeCp1252(text);
    expect(bytes.includes(0xfc)).toBe(true); // ü of "Schlüssel" in CP1252, not UTF-8
    expect(bytes.toString('latin1')).not.toContain('Ã');
  });

  it('chooses revenue accounts by VAT / category and splits an invoice so the rows add up to the gross', () => {
    const vat = { rate: 19, smallBusiness: false };
    expect(revenueAccount(s, { category: 'SERVICE_FEE' }, vat)).toBe('8400');
    expect(revenueAccount(s, { category: 'EMBASSY_FEE' }, vat)).toBe('1590');
    expect(revenueAccount(s, { category: 'SERVICE_FEE' }, { rate: 0, smallBusiness: true })).toBe('8195');
    expect(revenueAccount({ ...s, chart: 'SKR04' }, { category: 'SERVICE_FEE' }, vat)).toBe('4400');
    expect(revenueAccount({ ...s, categoryAccounts: { ...s.categoryAccounts, TRANSLATION: '8401' } }, { category: 'TRANSLATION' }, vat)).toBe('8401');
    const sx = { ...s, categoryAccounts: { ...s.categoryAccounts, TRANSLATION: '8401' } };
    const groups = splitByAccount(
      [
        { category: 'SERVICE_FEE', netCents: 100000 },
        { category: 'TRANSLATION', netCents: 9000 },
        { category: 'EMBASSY_FEE', netCents: 7500 },
      ],
      20710,
      (l) => revenueAccount(sx, l, vat),
      (l) => l.category !== 'EMBASSY_FEE',
    );
    expect(groups.map((g) => [g.account, g.grossCents])).toEqual([
      ['8400', 119000],
      ['8401', 10710],
      ['1590', 7500],
    ]);
    expect(groups.reduce((a, g) => a + g.grossCents, 0)).toBe(100000 + 9000 + 7500 + 20710);
    const line = rowLine({ amountCents: 1, side: 'H', account: '1', contraAccount: '2', date: new Date('2026-01-31T12:00:00Z'), beleg1: 'TV KR#1', text: 'x', serviceDate: new Date('2026-01-15T12:00:00Z') }).split(';');
    expect(line[10]).toBe('"TVKR1"'); // only DATEV-allowed Belegfeld characters
    expect(line[114]).toBe('15012026'); // Leistungsdatum DDMMYYYY
  });
});

/** Minimal XML well-formedness check: balanced tags, one root, no stray '&'. */
const wellFormed = (xml: string) => {
  const body = xml.replace(/^<\?xml[^>]*\?>\s*/, '');
  if (/&(?!(amp|lt|gt|quot|apos);)/.test(body)) return false;
  const stack: string[] = [];
  let roots = 0;
  for (const m of body.matchAll(/<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>/g)) {
    const [, close, name, , self] = m;
    if (self) {
      if (!stack.length) roots++;
      continue;
    }
    if (close) {
      if (stack.pop() !== name) return false;
    } else {
      if (!stack.length) roots++;
      stack.push(name);
    }
  }
  return stack.length === 0 && roots === 1;
};

describe('XRechnung (UBL 2.1, CIUS XRechnung 3.0)', () => {
  const seller = { name: 'Triad Vision GmbH', street: 'Musterstraße 1', zipCity: '10115 Berlin', country: 'Deutschland', vatId: 'DE123456789', taxNumber: '', register: 'HRB 1 B', managingDirector: 'Max Muster', email: 'rechnung@triad-vision.de', phone: '+49 30 1', website: '' };
  const input = {
    invoice: {
      number: 'TV-RE-2026-0007',
      issueDate: new Date('2026-10-05T12:00:00Z'),
      dueDate: new Date('2026-10-19T12:00:00Z'),
      currency: 'EUR',
      items: [
        { description: 'Vermittlung Fachkraft <Lager> & Logistik', quantity: 2, unitPriceCents: 150000, servicePeriod: { from: '2026-09-01', to: '2026-09-30' } },
        { description: 'Rabatt', quantity: 1, unitPriceCents: -10000 },
      ],
      vatRate: 19,
      netCents: 290000,
      vatCents: 55100,
      grossCents: 345100,
      note: null,
    },
    seller,
    bank: { iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX', accountHolder: 'Triad Vision GmbH', bank: 'Commerzbank' },
    smallBusiness: false,
    paymentTermsText: 'Zahlbar bis 19.10.2026',
    buyer: { name: 'Logistik AG', address: 'Hafenweg 5\n20457 Hamburg', city: 'Hamburg', vatId: 'DE987654321', email: 'ap@logistik.de' },
    buyerReference: '991-12345-67',
  };

  it('is well-formed and carries every mandatory business term', () => {
    const { xml, missing } = buildXRechnung(input);
    expect(missing).toEqual([]);
    expect(wellFormed(xml)).toBe(true);
    for (const tag of [
      '<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>',
      '<cbc:ID>TV-RE-2026-0007</cbc:ID>',
      '<cbc:IssueDate>2026-10-05</cbc:IssueDate>',
      '<cbc:DueDate>2026-10-19</cbc:DueDate>',
      '<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>',
      '<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>',
      '<cbc:BuyerReference>991-12345-67</cbc:BuyerReference>',
      '<cbc:StartDate>2026-09-01</cbc:StartDate>',
      '<cbc:EndpointID schemeID="EM">rechnung@triad-vision.de</cbc:EndpointID>',
      '<cbc:EndpointID schemeID="EM">ap@logistik.de</cbc:EndpointID>',
      '<cbc:CompanyID>DE123456789</cbc:CompanyID>',
      '<cbc:PostalZone>20457</cbc:PostalZone>',
      '<cbc:CityName>Hamburg</cbc:CityName>',
      '<cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>',
      '<cbc:ID>DE89370400440532013000</cbc:ID>',
      '<cbc:TaxAmount currencyID="EUR">551.00</cbc:TaxAmount>',
      '<cbc:Percent>19</cbc:Percent>',
      '<cbc:LineExtensionAmount currencyID="EUR">2900.00</cbc:LineExtensionAmount>',
      '<cbc:PayableAmount currencyID="EUR">3451.00</cbc:PayableAmount>',
      '<cbc:Telephone>+49 30 1</cbc:Telephone>',
    ])
      expect(xml, tag).toContain(tag);
    expect(xml).toContain('Vermittlung Fachkraft &lt;Lager&gt; &amp; Logistik');
    // Credit line: negative quantity, positive price (BR-27).
    expect(xml).toContain('<cbc:InvoicedQuantity unitCode="C62">-1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="EUR">-100.00</cbc:LineExtensionAmount>');
    expect(xml).toContain('<cbc:PriceAmount currencyID="EUR">100.00</cbc:PriceAmount>');
    // UBL element order: supplier before customer before payment before totals before lines.
    const order = ['<cac:AccountingSupplierParty>', '<cac:AccountingCustomerParty>', '<cac:PaymentMeans>', '<cac:TaxTotal>', '<cac:LegalMonetaryTotal>', '<cac:InvoiceLine>'].map((t) => xml.indexOf(t));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('uses category E with the § 19 reason for small businesses and reports missing data', () => {
    const { xml, missing } = buildXRechnung({ ...input, smallBusiness: true, invoice: { ...input.invoice, vatRate: 0, vatCents: 0, grossCents: 290000 }, buyer: { name: 'X GmbH' }, buyerReference: null, seller: { ...seller, phone: '' } });
    expect(wellFormed(xml)).toBe(true);
    expect(xml).toContain('<cbc:ID>E</cbc:ID><cbc:Percent>0</cbc:Percent><cbc:TaxExemptionReason>');
    expect(xml).toContain('§ 19 UStG');
    expect(xml).toContain('<cbc:BuyerReference>TV-RE-2026-0007</cbc:BuyerReference>');
    expect(missing).toEqual(expect.arrayContaining(['BT-42 seller telephone', 'BT-52 buyer city', 'BT-53 buyer post code', 'BT-49 buyer electronic address']));
  });

  it('splits addresses', () => {
    expect(splitZipCity('10115 Berlin')).toEqual({ zip: '10115', city: 'Berlin' });
    expect(splitZipCity('D-80331 München')).toEqual({ zip: '80331', city: 'München' });
    expect(parseBuyerAddress('Hafenweg 5, 20457 Hamburg', null)).toEqual({ street: 'Hafenweg 5', zip: '20457', city: 'Hamburg' });
    expect(parseBuyerAddress('Hafenweg 5', '20457 Hamburg')).toEqual({ street: 'Hafenweg 5', zip: '20457', city: 'Hamburg' });
  });
});
