import { z } from 'zod';
import { toCp1252Text } from './cp1252.js';

/**
 * DATEV "Buchungsstapel" (EXTF, format version 700, category 21, format version 13) — the pure part: settings
 * schema with SKR03 / SKR04 defaults, account choice per line category, number / date formats, header line,
 * the 125 column headers and the rows. Unit tested (tests/unit/datevExport.test.ts); the database part (which
 * invoices / payments of a period) lives in datev.ts.
 *
 * Bookings (Soll = debit):
 *  - invoice:  Konto = Debitor, Gegenkonto = Erlöskonto, Umsatz = gross of the account group, "S"
 *              (DATEV derives the VAT from the automatic revenue account; optional BU keys for manual accounts);
 *              embassy fees go to the "durchlaufende Posten" account without VAT;
 *  - payment:  Konto = Bank (or Kasse for cash), Gegenkonto = Debitor, "S", Belegfeld 1 = invoice number (OPOS);
 *  - storno:   the invoice rows again with "H" (cancelled invoices, dated on the cancellation day).
 * Amounts in a foreign currency (TRY / AZN invoices of the German entity) carry WKZ, Kurs (units per 1 EUR, the
 * admin-set exchange rate) and the EUR Basis-Umsatz; without a rate the document is left out with a warning.
 */

export const CHARTS = ['SKR03', 'SKR04'] as const;
export type Chart = (typeof CHARTS)[number];
export const DATEV_KEY = 'datev';

const acct = z.string().trim().regex(/^\d{1,9}$/, 'INVALID_ACCOUNT');
const optAcct = z.union([acct, z.literal('')]).default('');

export interface ChartDefaults {
  revenue19: string;
  revenue7: string;
  revenueTaxFree: string;
  revenueSmallBusiness: string;
  passThrough: string;
  bank: string;
  cash: string;
}

/** Standard accounts (automatic VAT accounts where DATEV has them). */
export const CHART_DEFAULTS: Record<Chart, ChartDefaults> = {
  SKR03: { revenue19: '8400', revenue7: '8300', revenueTaxFree: '8338', revenueSmallBusiness: '8195', passThrough: '1590', bank: '1200', cash: '1000' },
  SKR04: { revenue19: '4400', revenue7: '4300', revenueTaxFree: '4338', revenueSmallBusiness: '4185', passThrough: '1370', bank: '1800', cash: '1600' },
};

export const datevSettingsSchema = z.object({
  /** Beraternummer (1001–9999999) and Mandantennummer (1–99999) — both required for an export. */
  consultantNumber: z.coerce.number().int().min(0).max(9_999_999).default(0),
  clientNumber: z.coerce.number().int().min(0).max(99_999).default(0),
  chart: z.enum(CHARTS).default('SKR03'),
  /** First month of the fiscal year (1 = January). */
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12).default(1),
  accountLength: z.coerce.number().int().min(4).max(8).default(4),
  /** Empty = the chart's default. */
  accounts: z
    .object({ revenue19: optAcct, revenue7: optAcct, revenueTaxFree: optAcct, revenueSmallBusiness: optAcct, passThrough: optAcct, bank: optAcct, cash: optAcct, companyInvoices: optAcct })
    .default({}),
  /** Optional Erlöskonto per client invoice line category (overrides the VAT-based account; not for EMBASSY_FEE). */
  categoryAccounts: z
    .object({ SERVICE_FEE: optAcct, TRANSLATION: optAcct, APOSTILLE: optAcct, COURIER: optAcct, OTHER: optAcct })
    .default({}),
  /** BU-Schlüssel only for revenue accounts WITHOUT automatic VAT (off: automatic accounts, no key). */
  useBuKeys: z.boolean().default(false),
  buKeys: z.object({ vat19: z.string().trim().max(4).default('3'), vat7: z.string().trim().max(4).default('2') }).default({}),
  /** PER_PARTY: a Debitor number per client / company from debtorStart (stable, remembered); COLLECTIVE: one account each. */
  debtorMode: z.enum(['PER_PARTY', 'COLLECTIVE']).default('PER_PARTY'),
  debtorStart: z.coerce.number().int().min(10_000).max(69_999).default(10_000),
  collectiveClientDebtor: z.coerce.number().int().min(10_000).max(69_999).default(10_000),
  collectiveCompanyDebtor: z.coerce.number().int().min(10_000).max(69_999).default(10_001),
  includePayments: z.boolean().default(true),
  dictationCode: z.string().trim().max(2).default(''),
});
export type DatevSettings = z.infer<typeof datevSettingsSchema>;
export const DATEV_DEFAULTS: DatevSettings = datevSettingsSchema.parse({});

/** The effective account (setting or chart default). */
export const accountOf = (s: DatevSettings, key: keyof ChartDefaults) => s.accounts[key] || CHART_DEFAULTS[s.chart][key];

// ─── Formats ─────────────────────────────────────────────────────────

/** Minor units → "1234,56" (DATEV: no thousands separator, decimal comma, always positive). */
export const datevAmount = (cents: number) => (Math.abs(cents) / 100).toFixed(2).replace('.', ',');
/** Exchange rate → "36,5" with up to 6 decimals. */
export const datevRate = (r: number) => String(Number(r.toFixed(6))).replace('.', ',');

const berlinParts = (d: Date) => {
  const p = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { y: get('year'), m: get('month'), d: get('day') };
};
/**
 * Belegdatum "DDMM" (the year comes from the header period). UTC like the period filter, so a row never falls
 * outside the header's Datum vom / bis (calendar days are stored at 12:00 UTC anyway).
 */
export const belegDatum = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
export const yyyymmdd = (d: Date) => {
  const p = berlinParts(d);
  return `${p.y}${p.m}${p.d}`;
};
/** Calendar day of a period boundary (stored as UTC day start / end). */
const utcDay = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

/** Text field: CP1252-safe, quotes doubled, cut to `max` characters, wrapped in quotes. */
export const quote = (s: string | null | undefined, max = 60) => {
  const t = toCp1252Text(String(s ?? '').replace(/[\r\n\t]+/g, ' ').trim()).slice(0, max);
  return `"${t.replace(/"/g, '""')}"`;
};

/** Belegfeld 1: DATEV allows a-z A-Z 0-9 $ & % * + - / (max. 36). */
export const belegfeld = (s: string) => s.replace(/[^A-Za-z0-9$&%*+\-/]/g, '').slice(0, 36);

/** First day of the fiscal year containing `d` (UTC midnight). */
export const fiscalYearStart = (d: Date, startMonth: number) => {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return new Date(Date.UTC(m >= startMonth ? y : y - 1, startMonth - 1, 1));
};

// ─── Header + columns ────────────────────────────────────────────────

export const COLUMNS = [
  'Umsatz (ohne Soll/Haben-Kz)', 'Soll/Haben-Kennzeichen', 'WKZ Umsatz', 'Kurs', 'Basis-Umsatz', 'WKZ Basis-Umsatz', 'Konto', 'Gegenkonto (ohne BU-Schlüssel)', 'BU-Schlüssel', 'Belegdatum',
  'Belegfeld 1', 'Belegfeld 2', 'Skonto', 'Buchungstext', 'Postensperre', 'Diverse Adressnummer', 'Geschäftspartnerbank', 'Sachverhalt', 'Zinssperre', 'Beleglink',
  ...Array.from({ length: 8 }, (_, i) => [`Beleginfo - Art ${i + 1}`, `Beleginfo - Inhalt ${i + 1}`]).flat(),
  'KOST1 - Kostenstelle', 'KOST2 - Kostenstelle', 'Kost-Menge', 'EU-Land u. UStID (Bestimmung)', 'EU-Steuersatz (Bestimmung)', 'Abw. Versteuerungsart', 'Sachverhalt L+L', 'Funktionsergänzung L+L',
  'BU 49 Hauptfunktionstyp', 'BU 49 Hauptfunktionsnummer', 'BU 49 Funktionsergänzung',
  ...Array.from({ length: 20 }, (_, i) => [`Zusatzinformation - Art ${i + 1}`, `Zusatzinformation- Inhalt ${i + 1}`]).flat(),
  'Stück', 'Gewicht', 'Zahlweise', 'Forderungsart', 'Veranlagungsjahr', 'Zugeordnete Fälligkeit', 'Skontotyp', 'Auftragsnummer', 'Buchungstyp', 'USt-Schlüssel (Anzahlungen)',
  'EU-Land (Anzahlungen)', 'Sachverhalt L+L (Anzahlungen)', 'EU-Steuersatz (Anzahlungen)', 'Erlöskonto (Anzahlungen)', 'Herkunft-Kz', 'Buchungs GUID', 'KOST-Datum', 'SEPA-Mandatsreferenz', 'Skontosperre', 'Gesellschaftername',
  'Beteiligtennummer', 'Identifikationsnummer', 'Zeichnernummer', 'Postensperre bis', 'Bezeichnung SoBil-Sachverhalt', 'Kennzeichen SoBil-Buchung', 'Festschreibung', 'Leistungsdatum', 'Datum Zuord. Steuerperiode', 'Fälligkeit',
  'Generalumkehr (GU)', 'Steuersatz', 'Land', 'Abrechnungsreferenz', 'BVV-Position', 'EU-Mitgliedstaat u. UStID (Ursprung)', 'EU-Steuersatz (Ursprung)', 'Abw. Skontokonto',
] as const;

export const HEADER_FIELDS = 31;

export const headerLine = (s: DatevSettings, opts: { from: Date; to: Date; createdAt: Date; label: string }) => {
  const created = opts.createdAt;
  const ts = `${created.getUTCFullYear()}${String(created.getUTCMonth() + 1).padStart(2, '0')}${String(created.getUTCDate()).padStart(2, '0')}${String(created.getUTCHours()).padStart(2, '0')}${String(created.getUTCMinutes()).padStart(2, '0')}${String(created.getUTCSeconds()).padStart(2, '0')}${String(created.getUTCMilliseconds()).padStart(3, '0')}`;
  const fields: (string | number)[] = [
    '"EXTF"', 700, 21, '"Buchungsstapel"', 13, ts, '', '"RE"', '""', '""',
    s.consultantNumber, s.clientNumber, utcDay(fiscalYearStart(opts.from, s.fiscalYearStartMonth)), s.accountLength, utcDay(opts.from), utcDay(opts.to), quote(opts.label, 30), quote(s.dictationCode, 2), 1, 0,
    0, '"EUR"', '', '""', '', '', `"${s.chart === 'SKR03' ? '03' : '04'}"`, '', '', '""', '""',
  ];
  return fields.join(';');
};

export interface DatevRow {
  amountCents: number;
  side: 'S' | 'H';
  account: string;
  contraAccount: string;
  buKey?: string;
  date: Date;
  beleg1: string;
  beleg2?: string;
  text: string;
  /** Foreign currency: amount in that currency + rate (units per EUR) + EUR base amount. */
  currency?: string;
  rate?: number;
  baseCents?: number;
  partnerName?: string;
  serviceDate?: Date | null;
}

export const rowLine = (r: DatevRow) => {
  const cols: string[] = new Array(COLUMNS.length).fill('');
  const foreign = r.currency && r.currency !== 'EUR' && r.rate && r.baseCents !== undefined;
  cols[0] = datevAmount(r.amountCents);
  cols[1] = `"${r.side}"`;
  cols[2] = foreign ? `"${r.currency}"` : '"EUR"';
  if (foreign) {
    cols[3] = datevRate(r.rate!);
    cols[4] = datevAmount(r.baseCents!);
    cols[5] = '"EUR"';
  }
  cols[6] = r.account;
  cols[7] = r.contraAccount;
  cols[8] = r.buKey ? `"${r.buKey}"` : '""';
  cols[9] = belegDatum(r.date);
  cols[10] = `"${belegfeld(r.beleg1)}"`;
  cols[11] = r.beleg2 ? `"${belegfeld(r.beleg2).slice(0, 12)}"` : '""';
  cols[13] = quote(r.text, 60);
  if (r.partnerName) {
    cols[20] = '"Geschäftspartner"';
    cols[21] = quote(r.partnerName, 210);
  }
  if (r.serviceDate) {
    const p = yyyymmdd(r.serviceDate);
    cols[114] = `${p.slice(6, 8)}${p.slice(4, 6)}${p.slice(0, 4)}`;
  }
  return cols.join(';');
};

/** The whole file as text (CRLF lines; encode with encodeCp1252 before download). */
export const buildBuchungsstapel = (s: DatevSettings, rows: DatevRow[], opts: { from: Date; to: Date; createdAt?: Date; label?: string }) => {
  const header = headerLine(s, { from: opts.from, to: opts.to, createdAt: opts.createdAt ?? new Date(), label: opts.label ?? 'Triad Vision' });
  const head = COLUMNS.map((c) => c).join(';');
  return [header, head, ...rows.map(rowLine)].join('\r\n') + '\r\n';
};

// ─── Account choice / splitting ──────────────────────────────────────

export type LineCat = 'SERVICE_FEE' | 'TRANSLATION' | 'APOSTILLE' | 'EMBASSY_FEE' | 'COURIER' | 'OTHER';

/** Revenue account of one client invoice line. */
export const revenueAccount = (s: DatevSettings, line: { category: LineCat }, vat: { rate: number; smallBusiness: boolean }) => {
  if (line.category === 'EMBASSY_FEE') return accountOf(s, 'passThrough');
  const override = s.categoryAccounts[line.category as Exclude<LineCat, 'EMBASSY_FEE'>];
  if (override) return override;
  if (vat.rate >= 19) return accountOf(s, 'revenue19');
  if (vat.rate > 0) return accountOf(s, 'revenue7');
  return vat.smallBusiness ? accountOf(s, 'revenueSmallBusiness') : accountOf(s, 'revenueTaxFree');
};

export const buKeyFor = (s: DatevSettings, rate: number, account: string) => {
  if (!s.useBuKeys || rate <= 0 || account === accountOf(s, 'passThrough')) return '';
  return rate >= 19 ? s.buKeys.vat19 : rate === 7 ? s.buKeys.vat7 : '';
};

/**
 * Groups an invoice's lines by revenue account: net per account + its share of the VAT (taxable lines only,
 * proportional, the rounding rest on the last taxable group) → gross per account. The groups add up to gross.
 */
export const splitByAccount = (
  lines: { category: LineCat; netCents: number }[],
  vatCents: number,
  accountFor: (l: { category: LineCat }) => string,
  isTaxable: (l: { category: LineCat }) => boolean,
) => {
  const groups = new Map<string, { net: number; taxable: number }>();
  for (const l of lines) {
    const a = accountFor(l);
    const g = groups.get(a) ?? { net: 0, taxable: 0 };
    g.net += l.netCents;
    if (isTaxable(l)) g.taxable += l.netCents;
    groups.set(a, g);
  }
  const taxableTotal = [...groups.values()].reduce((a, g) => a + g.taxable, 0);
  const entries = [...groups.entries()];
  const lastTaxable = entries.map(([, g]) => g.taxable !== 0).lastIndexOf(true);
  let vatLeft = vatCents;
  return entries.map(([account, g], i) => {
    let vat = 0;
    if (g.taxable !== 0 && taxableTotal !== 0) {
      vat = i === lastTaxable ? vatLeft : Math.round((vatCents * g.taxable) / taxableTotal);
      vatLeft -= vat;
    }
    return { account, netCents: g.net, vatCents: vat, grossCents: g.net + vat };
  });
};
