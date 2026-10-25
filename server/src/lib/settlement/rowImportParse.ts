import { RAWOT, asCurrency, computeSplit, convert, fixedShares, type BeneficiaryLike, type Currency, type StoredShare } from './split.js';
import { headerKey, looksLikeCredential, parseAmount, parseStatus, splitName, type Stage } from './parse.js';

/**
 * Row import of the settlement ledger (CSV / XLSX in the documented template format) — the pure part:
 * table reading (CSV with , ; or tab, BOM, quotes), header mapping, cell normalising (amount + currency,
 * "viza sonrası", instalments, "rawot", refusals, dates, names with licence class / flags) and the shares a row
 * gets once its columns are mapped to beneficiaries. No database here; matching and writing live in rowImport.ts.
 *
 * Owner rules (confirmed):
 *  - "rawot" in a share column, the amount or the status = cancelled: that share is not owed (shown as "rawot"),
 *    and the line is CANCELLED;
 *  - a visa refusal ("atkaz", "saxta atkaz", …) = REFUSED: every share of the line is cancelled, including the
 *    middleman's (Sanani) share;
 *  - "viza sonrası" = payable after the visa: kept as a condition (payAfterVisa) on the fee;
 *  - each amount keeps its own currency (manat / azn / ₼ = AZN, euro / eur / € = EUR).
 */

export type Cell = string | number | Date | null;

// ─── Template ─────────────────────────────────────────────────────────

/** Fixed columns of the template, in order. Beneficiary columns (one per beneficiary + "<name> currency") follow Sanani. */
export const TEMPLATE_FIXED = [
  'Project',
  'Intermediary',
  'Client',
  'Licence',
  'Employer',
  'TLS date',
  'Visa date',
  'Status',
  'Amount',
  'Currency',
  'Pay after visa',
  'Sanani',
  'Sanani currency',
] as const;
export const TEMPLATE_TAIL = ['Expenses', 'Expenses currency', 'Note'] as const;

export const templateHeaders = (beneficiaryNames: string[]) => [
  ...TEMPLATE_FIXED,
  ...beneficiaryNames.flatMap((n) => [n, `${n} currency`]),
  ...TEMPLATE_TAIL,
];

/** Column documentation (shown in the template's "Format" sheet and in the dialog). */
export const TEMPLATE_DOC: [string, string][] = [
  ['Project', 'Sheet / project of the ledger ("XTA", "Proyekt 2", a middleman\'s name …). Empty = "Ümumi".'],
  ['Intermediary', 'Zwischen Person: who brought the client (matched to the partners; a new name can be created).'],
  ['Client', 'Client name, "Last First" or "First Last". "(CE)", "(BC)" … = licence class; other brackets, e.g. "(islemeyecek)", become notes.'],
  ['Licence', 'Optional licence class (CE, BC …) when it is not in the name.'],
  ['Employer', 'Transport company / employer (matched to the companies by name).'],
  ['TLS date', 'TLS appointment: DD.MM.YYYY or YYYY-MM-DD.'],
  ['Visa date', 'Visa issued: DD.MM.YYYY or YYYY-MM-DD.'],
  ['Status', 'Free text: "atkaz" / "saxta atkaz" = refusal (all shares cancelled), "rawot" = cancelled. "TLS/01.06.2026-viza/09.07.2026" also fills the dates.'],
  ['Amount', 'Total fee: 3000, "3000 manat", "1500 euro", "4000 azn (viza sonrasi)", "2000azn/2000azn viza sonrasi" (instalments are added up), or "rawot".'],
  ['Currency', 'AZN or EUR (manat / euro accepted). Empty = the currency written in Amount, else AZN.'],
  ['Pay after visa', 'yes / no ("viza sonrasi" in Amount also sets it).'],
  ['Sanani', "The intermediary's share (commission). Number, \"500 euro\", 0 or \"rawot\"."],
  ['Sanani currency', 'AZN or EUR; empty = written in Sanani, else EUR.'],
  ['<Beneficiary>', 'One column per beneficiary (Xalid, Tofig, Abdulla, Team …): the share as written, or "rawot" = not owed. Empty everywhere = computed by the split rule.'],
  ['<Beneficiary> currency', 'AZN or EUR; empty = written in the cell, else the payment currency (Team: its own currency).'],
  ['Expenses', 'Rasxod (expenses), in the payment currency.'],
  ['Expenses currency', 'Optional; a different currency is converted with the ledger rate.'],
  ['Note', 'Free note.'],
];

// ─── Table reading ────────────────────────────────────────────────────

/** RFC 4180-ish CSV: delimiter sniffed from the header line (, ; or tab), quotes, "" escapes, newlines in quotes, BOM. */
export const parseCsv = (input: string): string[][] => {
  const text = input.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => {
    let n = 0;
    let q = false;
    for (const c of firstLine) {
      if (c === '"') q = !q;
      else if (!q && c === ch) n++;
    }
    return n;
  };
  const delim = [',', ';', '\t'].map((d) => [d, count(d)] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"' && cell === '') quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
};

/** CSV text of a table (comma, quotes where needed). */
export const toCsv = (rows: (string | number | null | undefined)[][]) =>
  rows
    .map((r) =>
      r
        .map((v) => {
          const s = v == null ? '' : String(v);
          return /[",;\n\r\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\r\n');

// ─── Header mapping ───────────────────────────────────────────────────

export type FieldKey =
  | 'project'
  | 'intermediary'
  | 'client'
  | 'licence'
  | 'employer'
  | 'tlsDate'
  | 'visaDate'
  | 'status'
  | 'amount'
  | 'currency'
  | 'payAfterVisa'
  | 'sanani'
  | 'expenses'
  | 'note';

const ALIASES: Record<FieldKey, string[]> = {
  project: ['project', 'proyekt', 'projekt', 'layihe', 'sheet', 'vereq'],
  intermediary: ['intermediary', 'zwischenperson', 'zwischen', 'vasiteci', 'vasitechi', 'partner', 'partnyor', 'middleman'],
  client: ['client', 'name', 'musteriadi', 'musteri', 'kunde', 'klient', 'adsoyad', 'ad', 'clientname'],
  licence: ['licence', 'license', 'kateqoriya', 'fuhrerschein', 'sinif', 'class'],
  employer: ['employer', 'transporte', 'transport', 'isegoturen', 'arbeitgeber', 'firma', 'company', 'sirket'],
  tlsDate: ['tlsdate', 'tls', 'tlstarixi', 'termin'],
  visaDate: ['visadate', 'viza', 'visa', 'vizatarixi', 'visum', 'vizadate'],
  status: ['status', 'veziyyet'],
  amount: ['amount', 'bezahlung', 'odeniw', 'odenis', 'odenish', 'payment', 'mebleg', 'fee', 'zahlung', 'total'],
  currency: ['currency', 'valyuta', 'wahrung', 'amountcurrency'],
  payAfterVisa: ['payaftervisa', 'vizasonrasi', 'aftervisa', 'nachvisum', 'nachdemvisum'],
  sanani: ['sanani', 'senani', 'partnershare', 'intermediaryshare', 'provision', 'commission', 'partnyorpayi'],
  expenses: ['expenses', 'rasxod', 'rashod', 'xerc', 'xercler', 'ausgaben'],
  note: ['note', 'notes', 'qeyd', 'bemerkung', 'comment'],
};
const IGNORED = ['no', 'nr', 'n', 'id', 'sira', '#', 'num'];
const CURRENCY_SUFFIX = /(currency|valyuta|wahrung|waehrung|cur)$/;

export interface ColumnMap {
  fields: Partial<Record<FieldKey, number>>;
  /** Currency columns per field / beneficiary column name: "Sanani currency" → sanani. */
  currencyOf: Record<string, number>;
  /** Beneficiary share columns: header text → column index. */
  beneficiaries: { name: string; index: number }[];
}

export const mapHeaders = (header: string[]): ColumnMap => {
  const out: ColumnMap = { fields: {}, currencyOf: {}, beneficiaries: [] };
  const pendingCur: { base: string; index: number }[] = [];
  header.forEach((raw, index) => {
    const text = String(raw ?? '').trim();
    const k = headerKey(text);
    if (!k || IGNORED.includes(k)) return;
    for (const [field, words] of Object.entries(ALIASES) as [FieldKey, string[]][]) {
      if (words.includes(k) && out.fields[field] == null) {
        out.fields[field] = index;
        return;
      }
    }
    const m = k.match(CURRENCY_SUFFIX);
    if (m && k.length > m[0].length) {
      pendingCur.push({ base: k.slice(0, -m[0].length), index });
      return;
    }
    out.beneficiaries.push({ name: text.slice(0, 80), index });
  });
  for (const { base, index } of pendingCur) {
    const field = (Object.entries(ALIASES) as [FieldKey, string[]][]).find(([, words]) => words.includes(base))?.[0];
    if (field === 'amount') out.fields.currency ??= index;
    else if (field) out.currencyOf[field] = index;
    else {
      const ben = out.beneficiaries.find((b) => headerKey(b.name) === base);
      if (ben) out.currencyOf[`ben:${ben.name}`] = index;
    }
  }
  return out;
};

// ─── Cells ────────────────────────────────────────────────────────────

const lower = (s: string) => s.normalize('NFC').toLowerCase().replace(/i̇/g, 'i');
export const cellText = (v: Cell | undefined): string => {
  if (v == null) return '';
  if (v instanceof Date) return `${String(v.getUTCDate()).padStart(2, '0')}.${String(v.getUTCMonth() + 1).padStart(2, '0')}.${v.getUTCFullYear()}`;
  return String(v).trim();
};

const UNSUPPORTED_CUR = /(\btry\b|\blira\b|\btl\b|₺|\busd\b|\$|dollar|dolar|\brub\b|₽|rubl)/i;

/** "AZN", "manat", "₼" → AZN; "EUR", "euro", "€" → EUR; empty → null; anything else → 'UNSUPPORTED'. */
export const currencyCell = (v: string): Currency | null | 'UNSUPPORTED' => {
  const t = lower(v.trim());
  if (!t) return null;
  if (/^(azn|manat|₼)$/.test(t)) return 'AZN';
  if (/^(eur|euro|avro|€|evro)$/.test(t)) return 'EUR';
  return 'UNSUPPORTED';
};

const textCurrency = (s: string): Currency | null | 'UNSUPPORTED' => {
  const t = lower(s);
  if (/(manat|azn|₼)/.test(t)) return 'AZN';
  if (/(euro|eur\b|€|avro)/.test(t)) return 'EUR';
  if (UNSUPPORTED_CUR.test(t)) return 'UNSUPPORTED';
  return null;
};

export interface Money {
  cents: number | null;
  /** Currency written in the cell or its currency column (null = not given). */
  currency: Currency | null;
  /** "rawot" or another non-numeric text ("XALID"). */
  text: string | null;
  payAfterVisa: boolean;
  instalments: number[];
  warnings: string[];
}

/**
 * One money cell (+ its optional currency column): "3000 manat", "1500 euro", "4000 azn (viza sonrasi)",
 * "viza sonrasi 2000 euro", "2000azn/2000azn viza sonrasi", 3000, "0", "rawot", "RAWOT".
 */
export const parseMoney = (value: Cell | undefined, currencyColumn?: Cell): Money => {
  const out: Money = { cents: null, currency: null, text: null, payAfterVisa: false, instalments: [], warnings: [] };
  const raw = typeof value === 'number' ? String(value) : cellText(value);
  const curCol = currencyCell(cellText(currencyColumn ?? null));
  if (curCol === 'UNSUPPORTED') out.warnings.push('UNSUPPORTED_CURRENCY');
  if (!raw) {
    out.currency = curCol === 'UNSUPPORTED' ? null : curCol;
    return out;
  }
  const inText = textCurrency(raw);
  if (inText === 'UNSUPPORTED') out.warnings.push('UNSUPPORTED_CURRENCY');
  const a = parseAmount(typeof value === 'number' ? value : raw, null);
  out.payAfterVisa = a.payAfterVisa;
  if (a.amountCents == null) {
    out.text = /^\W*rawot\W*$/i.test(raw) ? RAWOT : raw.slice(0, 200);
  } else {
    out.cents = a.amountCents;
    out.instalments = a.instalments;
    if (/[+/]\s*$/.test(raw)) out.warnings.push('AMOUNT_INCOMPLETE');
  }
  const t = inText === 'UNSUPPORTED' ? null : inText;
  const c = curCol === 'UNSUPPORTED' ? null : curCol;
  if (t && c && t !== c) out.warnings.push('CURRENCY_MISMATCH');
  out.currency = t ?? c;
  return out;
};

const DATE_DMY = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/;
const DATE_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})/;

/** DD.MM.YYYY, D/M/YY, YYYY-MM-DD or an Excel date → "YYYY-MM-DD"; '' → null; unreadable → 'INVALID'. */
export const parseDate = (v: Cell | undefined): string | null | 'INVALID' => {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? 'INVALID' : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  const iso = s.match(DATE_ISO);
  const dmy = s.match(DATE_DMY);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) {
    [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
    if (y < 100) y += 2000;
  } else return 'INVALID';
  const date = new Date(Date.UTC(y, m - 1, d));
  if (m < 1 || m > 12 || date.getUTCDate() !== d) return 'INVALID';
  return date.toISOString().slice(0, 10);
};

const YES = /^(1|true|yes|y|b[əe]li|ha|h|ja|j|да|x|✓|viza sonras[ıi])$/i;
const REFUSAL = /(atkaz|otkaz|imtina|imtına|r[əe]dd|отказ|ablehn|refus|reject)/i;
const FAKE = /(saxta|fake|фальш|липов)/i;
/** "(islemeyecek)" / "(işləməyəcək)" = the client will not work (the job fell through). */
const WILL_NOT_WORK = /(i[sş]l[əe]m[əe]y[əe]c[əe]k|islemeyecek|will not work|arbeitet nicht)/i;

// ─── Rows ─────────────────────────────────────────────────────────────

export interface ShareCell {
  cents: number | null;
  currency: Currency | null;
  text: string | null;
}

/** One normalised row (also the shape the client sends back on confirm). */
export interface NormalisedRow {
  line: number;
  project: string;
  intermediary: string | null;
  clientName: string;
  licence: string | null;
  willNotWork: boolean;
  employer: string | null;
  tlsDate: string | null;
  visaDate: string | null;
  /** Status text left after the dates ("saxta atkaz", "rawot" …). */
  statusText: string | null;
  refused: boolean;
  cancelled: boolean;
  stage: Stage;
  amountCents: number | null;
  currency: Currency;
  payAfterVisa: boolean;
  instalments: number[];
  partnerShare: ShareCell | null;
  expenses: ShareCell | null;
  /** Beneficiary column name (as in the file) → cell. */
  shares: Record<string, ShareCell>;
  note: string | null;
  /** Parse-level warning codes. */
  warnings: string[];
}

export interface ParsedTable {
  rows: NormalisedRow[];
  beneficiaryColumns: string[];
  /** Cells that looked like login data (e-mail / password): never read or returned. */
  skippedCredentials: number;
  errors: string[];
}

const fmtUnits = (cents: number) => String(cents / 100);

/** Normalises the table (first row with a Client column within the first 10 rows is the header). */
export const normaliseTable = (table: Cell[][]): ParsedTable => {
  const result: ParsedTable = { rows: [], beneficiaryColumns: [], skippedCredentials: 0, errors: [] };
  let headerAt = -1;
  let map: ColumnMap | null = null;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const m = mapHeaders((table[i] ?? []).map((c) => cellText(c)));
    if (m.fields.client != null) {
      headerAt = i;
      map = m;
      break;
    }
  }
  if (!map) {
    result.errors.push('NO_HEADER');
    return result;
  }
  result.beneficiaryColumns = map.beneficiaries.map((b) => b.name);
  const usedBenColumns = new Set<string>();

  for (let r = headerAt + 1; r < table.length; r++) {
    const src = table[r] ?? [];
    // Login data anywhere in the row is blanked out and only counted.
    const cells = src.map((c) => {
      if (looksLikeCredential(c)) {
        result.skippedCredentials++;
        return null;
      }
      return c;
    });
    const get = (f: FieldKey) => (map!.fields[f] == null ? null : (cells[map!.fields[f]!] ?? null));
    const curOf = (k: string) => (map!.currencyOf[k] == null ? null : (cells[map!.currencyOf[k]!] ?? null));
    const nameRaw = cellText(get('client'));
    if (!nameRaw) continue;
    if (/^(c[əe]mi|total|summe|gesamt|итого|всего)\b/i.test(nameRaw)) continue;
    const warnings: string[] = [];
    const notes: string[] = [];
    const sn = splitName(nameRaw);
    if (!sn.name) continue;
    const willNotWork = WILL_NOT_WORK.test(nameRaw);
    if (sn.note) notes.push(willNotWork ? sn.note.replace(WILL_NOT_WORK, 'işləməyəcək') : sn.note);
    if (willNotWork) warnings.push('WILL_NOT_WORK');
    const licenceCol = cellText(get('licence')).toUpperCase().replace(/[\s/+-]/g, '');

    // Dates: own columns, else from the status text ("TLS/01.06.2026-viza/09.07.2026").
    const statusRaw = cellText(get('status'));
    const st = parseStatus(statusRaw);
    const tlsCol = parseDate(get('tlsDate'));
    const visaCol = parseDate(get('visaDate'));
    if (tlsCol === 'INVALID' || visaCol === 'INVALID') warnings.push('BAD_DATE');
    const tlsDate = (tlsCol !== 'INVALID' ? tlsCol : null) ?? st.tlsDate?.toISOString().slice(0, 10) ?? null;
    const visaDate = (visaCol !== 'INVALID' ? visaCol : null) ?? st.visaDate?.toISOString().slice(0, 10) ?? null;
    const statusText =
      statusRaw
        .replace(/tls\s*\/?\s*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/gi, '')
        .replace(/(viza|visa|виза)\s*\/?\s*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/gi, '')
        .replace(/^[\s\-/,;]+|[\s\-/,;]+$/g, '')
        .replace(/^tls$/i, '')
        .trim() || null;

    // Amount.
    const pay = parseMoney(get('amount'), get('currency'));
    warnings.push(...pay.warnings);
    const payAfterVisa = pay.payAfterVisa || YES.test(cellText(get('payAfterVisa')));
    if (pay.cents != null && !pay.currency) warnings.push('CURRENCY_ASSUMED');
    const currency: Currency = pay.currency ?? 'AZN';
    if (pay.text && pay.text !== RAWOT) notes.push(`Ödəniş: ${pay.text}`);
    if (pay.instalments.length > 1) notes.push(`Hissələr: ${pay.instalments.map(fmtUnits).join(' / ')} ${currency}`);
    if (payAfterVisa) notes.push('Viza sonrası ödənilir');

    // Middleman share, expenses, beneficiary shares.
    const sanRaw = parseMoney(get('sanani'), curOf('sanani'));
    warnings.push(...sanRaw.warnings.filter((w) => w !== 'AMOUNT_INCOMPLETE'));
    const partnerShare: ShareCell | null =
      sanRaw.cents == null && !sanRaw.text ? null : { cents: sanRaw.cents, currency: sanRaw.currency, text: sanRaw.text };
    const expRaw = parseMoney(get('expenses'), curOf('expenses'));
    warnings.push(...expRaw.warnings.filter((w) => w !== 'AMOUNT_INCOMPLETE'));
    const expenses: ShareCell | null = expRaw.cents == null && !expRaw.text ? null : { cents: expRaw.cents, currency: expRaw.currency, text: expRaw.text };
    if (expenses?.currency && expenses.currency !== currency) warnings.push('CURRENCY_MISMATCH');
    const shares: Record<string, ShareCell> = {};
    for (const b of map.beneficiaries) {
      const m = parseMoney(cells[b.index] ?? null, curOf(`ben:${b.name}`));
      warnings.push(...m.warnings.filter((w) => w !== 'AMOUNT_INCOMPLETE'));
      if (m.cents == null && !m.text) continue;
      shares[b.name] = { cents: m.cents, currency: m.currency, text: m.text };
      usedBenColumns.add(b.name);
    }

    // Stage by the owner rules.
    const markerTexts = [statusRaw, pay.text ?? '', sanRaw.text ?? '', ...Object.values(shares).map((s) => s.text ?? '')];
    const refused = REFUSAL.test(statusRaw) || REFUSAL.test(pay.text ?? '');
    const cancelled = markerTexts.some((x) => lower(x).includes(RAWOT));
    if (refused && FAKE.test(statusRaw + (pay.text ?? ''))) warnings.push('FAKE_REFUSAL');
    const stage: Stage = refused ? 'REFUSED' : cancelled ? 'CANCELLED' : visaDate ? 'VISA' : tlsDate ? 'IN_PROGRESS' : 'NEW';
    if (statusText) notes.push(`Status: ${statusText}`);
    if (pay.cents == null && !pay.text) warnings.push('NO_AMOUNT');
    const noteCol = cellText(get('note'));
    if (noteCol) notes.push(noteCol);

    result.rows.push({
      line: r + 1,
      project: cellText(get('project')).slice(0, 80) || 'Ümumi',
      intermediary: cellText(get('intermediary')).slice(0, 120) || null,
      clientName: sn.name.slice(0, 160),
      licence: (licenceCol || sn.licence || '').slice(0, 20) || null,
      willNotWork,
      employer: cellText(get('employer')).slice(0, 160) || null,
      tlsDate,
      visaDate,
      statusText: statusText?.slice(0, 200) ?? null,
      refused,
      cancelled,
      stage,
      amountCents: pay.cents,
      currency,
      payAfterVisa,
      instalments: pay.instalments,
      partnerShare,
      expenses,
      shares,
      note: notes.join('\n').slice(0, 5000) || null,
      warnings: [...new Set(warnings)],
    });
  }
  // Beneficiary columns that are empty in every row are left out.
  result.beneficiaryColumns = result.beneficiaryColumns.filter((c) => usedBenColumns.has(c));
  return result;
};

// ─── Shares of one row (after the columns are mapped to beneficiaries) ─

export interface BuiltRow {
  shares: Record<string, StoredShare>;
  partnerShareCents: number | null;
  partnerShareCurrency: Currency;
  expensesCents: number | null;
  /** Extra note lines (cancelled middleman share, converted expenses). */
  notes: string[];
  warnings: string[];
}

/**
 * Stored shares for a row: values typed in the file that differ from the split rule become manual values
 * (the REMAINDER shares are compared after the others, like the workbook import); "rawot" → not owed;
 * when some share columns are filled, the empty ones of that row are not owed either (nothing written = nothing
 * paid out). REFUSED: every share and the middleman's share are cancelled.
 * `columnToBen`: file column name → beneficiary id (unmapped / ignored columns are absent).
 */
export const buildShares = (
  row: Pick<NormalisedRow, 'amountCents' | 'currency' | 'partnerShare' | 'expenses' | 'shares'>,
  stage: Stage,
  columnToBen: Record<string, string>,
  bens: BeneficiaryLike[],
  rate: number,
): BuiltRow => {
  const out: BuiltRow = { shares: {}, partnerShareCents: null, partnerShareCurrency: 'EUR', expensesCents: null, notes: [], warnings: [] };
  const cur = row.currency;
  const active = bens.filter((b) => b.active);
  const ownCur = (b: BeneficiaryLike): Currency => (b.rule === 'FIXED' && (b.currency === 'AZN' || b.currency === 'EUR') ? b.currency : cur);

  // Middleman share.
  const ps = row.partnerShare;
  out.partnerShareCurrency = ps?.currency ?? 'EUR';
  if (stage === 'REFUSED') {
    if (ps?.cents) out.notes.push(`Sanani ləğv edildi (atkaz): ${fmtUnits(ps.cents)} ${out.partnerShareCurrency}`);
  } else if (ps?.text === RAWOT) {
    out.notes.push('Sanani: rawot');
  } else if (ps?.text) {
    out.notes.push(`Sanani: ${ps.text}`);
  } else if (ps) out.partnerShareCents = ps.cents;

  // Expenses (converted into the payment currency when written in the other one).
  const ex = row.expenses;
  if (ex?.cents != null) {
    const exCur = ex.currency ?? cur;
    out.expensesCents = exCur === cur ? ex.cents : Math.round(convert(ex.cents, exCur, cur, rate));
    if (exCur !== cur) out.notes.push(`Rasxod: ${fmtUnits(ex.cents)} ${exCur} (${fmtUnits(out.expensesCents)} ${cur})`);
  } else if (ex?.text) out.notes.push(`Rasxod: ${ex.text}`);

  const byBen = new Map<string, ShareCell>();
  for (const [col, cell] of Object.entries(row.shares)) {
    const id = columnToBen[col];
    if (id) byBen.set(id, cell);
  }
  const none = (b: BeneficiaryLike, text?: string): StoredShare =>
    text ? { cents: 0, currency: ownCur(b), text, status: 'NONE', manual: true } : { cents: 0, currency: ownCur(b), status: 'NONE', manual: true };

  if (stage === 'REFUSED') {
    for (const b of active) out.shares[b.id] = none(b, RAWOT);
    return out;
  }
  if (!byBen.size) return out; // nothing written: the split rule computes every share
  const overrides: Record<string, StoredShare> = {};
  for (const b of active) {
    const cell = byBen.get(b.id);
    if (!cell) overrides[b.id] = none(b);
    else if (cell.text) overrides[b.id] = none(b, cell.text === RAWOT ? RAWOT : cell.text.slice(0, 40));
    else if (!cell.cents) overrides[b.id] = { ...none(b), currency: cell.currency ?? ownCur(b) };
  }
  const amounts = {
    amountCents: row.amountCents,
    currency: cur,
    partnerShareCents: out.partnerShareCents,
    partnerShareCurrency: out.partnerShareCurrency,
    expensesCents: out.expensesCents,
  };
  const pass = (remainder: boolean) => {
    const split = computeSplit(amounts, active, rate, fixedShares(overrides, cur));
    for (const b of active) {
      if ((b.rule === 'REMAINDER') !== remainder || overrides[b.id]) continue;
      const cell = byBen.get(b.id)!;
      const c = { cents: cell.cents!, currency: cell.currency ?? ownCur(b) };
      const comp = split?.shares[b.id];
      if (!comp || comp.cents !== c.cents || comp.currency !== c.currency) overrides[b.id] = { cents: c.cents, currency: c.currency, status: 'PENDING', manual: true };
    }
  };
  pass(false);
  pass(true);
  out.shares = overrides;

  // Shares + middleman + expenses above the fee (in the payment currency) is worth a look.
  if (row.amountCents != null) {
    let total = (out.expensesCents ?? 0) + (out.partnerShareCents ? convert(out.partnerShareCents, out.partnerShareCurrency, cur, rate) : 0);
    const split = computeSplit(amounts, active, rate, fixedShares(overrides, cur));
    for (const b of active) {
      const s = overrides[b.id] ?? split?.shares[b.id];
      if (s?.cents) total += convert(s.cents, asCurrency(s.currency, cur), cur, rate);
    }
    if (Math.round(total) > row.amountCents + 100) out.warnings.push('SHARES_EXCEED_AMOUNT');
  }
  return out;
};

// ─── Matching keys ────────────────────────────────────────────────────

const LEGAL = /\b(gmbh|mbh|e\s?k|ek|e\s?kfm|ug|kg|ag|ohg|gbr|co|haftungsbeschrankt|inh|ltd|llc|mmc|sp)\b/g;

/** Company name key: lower ASCII, legal forms dropped, Logistics = Logistik, Transporte = Transport. */
export const companyKey = (name: string) =>
  lower(name)
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(LEGAL, ' ')
    .replace(/\blogistics\b/g, 'logistik')
    .replace(/\btransporte\b/g, 'transport')
    .replace(/\s+/g, ' ')
    .trim();

/** 0..1 company name similarity: 1 same key, 0.8 one contains the other, 0.5 a shared distinctive word. */
export const companyScore = (a: string, b: string) => {
  const ka = companyKey(a);
  const kb = companyKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  if (ka.length >= 3 && kb.length >= 3 && (` ${kb} `.includes(` ${ka} `) || ` ${ka} `.includes(` ${kb} `))) return 0.8;
  const generic = new Set(['transport', 'logistik', 'spedition', 'service', 'group', 'trans']);
  const ta = ka.split(' ').filter((t) => t.length >= 3 && !generic.has(t));
  const tb = new Set(kb.split(' '));
  return ta.some((t) => tb.has(t)) ? 0.5 : 0;
};

/** Lower-case key for partner / beneficiary names (case, accents and AZ transliteration insensitive). */
export const personKey = (name: string) => headerKey(name).replace(/q/g, 'g').replace(/x/g, 'kh');
