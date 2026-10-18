import FormulaParser from 'fast-formula-parser';
import { isDateFormat, type CellValue } from './model';

/** Display text of a value with an Excel number format (SSF, the formatter Excel-compatible tools use). */
const SSF = FormulaParser.SSF;

const general = (n: number) => {
  if (Number.isInteger(n)) return String(n);
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-9 || abs >= 1e15)) return n.toExponential(5).replace(/\.?0+e/, 'e');
  return String(Number.parseFloat(n.toPrecision(11)));
};

/** SSF chokes on "." between date parts ("dd.mm.yyyy"): quote the dots of date formats. */
const fmtCache = new Map<string, string>();
const ssfFormat = (fmt: string) => {
  let f = fmtCache.get(fmt);
  if (f === undefined) {
    f = isDateFormat(fmt) ? fmt.split(/("[^"]*")/).map((part) => (part.startsWith('"') ? part : part.replace(/\\?\./g, '"."'))).join('') : fmt;
    fmtCache.set(fmt, f);
  }
  return f;
};

export const formatValue = (v: CellValue | undefined, fmt?: string): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'string') return v;
  if (!Number.isFinite(v)) return '#NUM!';
  if (fmt && fmt !== 'General' && fmt !== '@') {
    try {
      return SSF.format(ssfFormat(fmt), v);
    } catch {
      /* unknown format: fall back to General */
    }
  }
  return general(v);
};

/** Number formats offered in the toolbar. */
export const NUMBER_FORMATS = [
  { key: 'general', fmt: undefined },
  { key: 'number', fmt: '#,##0.00' },
  { key: 'integer', fmt: '#,##0' },
  { key: 'percent', fmt: '0.00%' },
  { key: 'eur', fmt: '#,##0.00 "€"' },
  { key: 'azn', fmt: '#,##0.00 "₼"' },
  { key: 'usd', fmt: '"$"#,##0.00' },
  { key: 'date', fmt: 'dd.mm.yyyy' },
  { key: 'datetime', fmt: 'dd.mm.yyyy hh:mm' },
  { key: 'text', fmt: '@' },
] as const;

export type NumberFormatKey = (typeof NUMBER_FORMATS)[number]['key'];
