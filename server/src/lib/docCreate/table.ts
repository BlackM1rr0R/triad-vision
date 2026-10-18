import ExcelJS from 'exceljs';
import { badRequest } from '../http.js';

/**
 * Tables from pasted text and spreadsheet files: delimiter detection (tab, semicolon, comma, pipe tables,
 * columns aligned with spaces), CSV parsing with quotes, .xlsx writing (bold header, autofilter, widths)
 * and reading the first worksheet of an .xlsx.
 */

export type Delimiter = 'tab' | 'semicolon' | 'comma' | 'pipe' | 'spaces' | 'none';
export const DELIMITERS: Delimiter[] = ['tab', 'semicolon', 'comma', 'pipe', 'spaces', 'none'];

export const TABLE_LIMITS = { rows: 20_000, cols: 60, pdfRows: 5000, pdfCols: 30 } as const;

const SEP: Record<'tab' | 'semicolon' | 'comma', string> = { tab: '\t', semicolon: ';', comma: ',' };

/** CSV-style parsing: quoted fields may contain the separator, quotes ("") and line breaks. */
export const parseDelimited = (text: string, sep: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let atStart = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && atStart) {
      quoted = true;
      atStart = false;
      continue;
    }
    if (ch === sep) {
      row.push(field);
      field = '';
      atStart = true;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      atStart = true;
      if (rows.length > TABLE_LIMITS.rows) break;
      continue;
    }
    field += ch;
    if (ch !== ' ') atStart = false;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
};

const pipeRows = (lines: string[]) =>
  lines
    .filter((l) => l.includes('|'))
    .map((l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()))
    // Markdown separator rows ("---|:---:") go.
    .filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c) || c === ''));

const spaceRows = (lines: string[]) => lines.map((l) => l.trim().split(/\s{2,}|\t/));

/** Rows of `text` split with one delimiter. */
export const splitWith = (text: string, d: Delimiter): string[][] => {
  const norm = text.replace(/\r\n?/g, '\n');
  const lines = norm.split('\n').filter((l) => l.trim() !== '');
  if (d === 'none') return lines.map((l) => [l.trim()]);
  if (d === 'pipe') return pipeRows(lines);
  if (d === 'spaces') return spaceRows(lines);
  return parseDelimited(norm, SEP[d]);
};

/** How well rows form a table: share of rows with the most common column count (≥ 2). */
const consistency = (rows: string[][]) => {
  if (rows.length < 2) return { score: 0, cols: 0 };
  const counts = new Map<number, number>();
  for (const r of rows) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
  let cols = 0;
  let best = 0;
  for (const [c, n] of counts) if (c >= 2 && n > best) [cols, best] = [c, n];
  return { score: best / rows.length, cols };
};

/** Picks the delimiter that splits the text into the most regular table (or "none" for running text). */
export const detectDelimiter = (text: string): Delimiter => {
  const sample = text.slice(0, 200_000);
  const lines = sample.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) return lines[0]?.includes('\t') ? 'tab' : 'none';
  const need: Record<Exclude<Delimiter, 'none'>, number> = { tab: 0.7, semicolon: 0.8, pipe: 0.8, comma: 0.9, spaces: 0.85 };
  for (const d of ['tab', 'semicolon', 'pipe', 'comma', 'spaces'] as const) {
    if (d === 'tab' && !sample.includes('\t')) continue;
    if (d === 'semicolon' && !sample.includes(';')) continue;
    if (d === 'pipe' && lines.filter((l) => l.includes('|')).length < lines.length * 0.8) continue;
    if (d === 'comma' && !sample.includes(',')) continue;
    const c = consistency(splitWith(sample, d));
    if (c.cols >= 2 && c.score >= need[d]) return d;
  }
  return 'none';
};

export interface ParsedText {
  delimiter: Delimiter;
  rows: string[][];
  columns: number;
}

/** Splits pasted text into rows (auto-detected unless a delimiter is given); rows are padded to equal length. */
export const parseText = (text: string, delimiter?: Delimiter | 'auto'): ParsedText => {
  const d = !delimiter || delimiter === 'auto' ? detectDelimiter(text) : delimiter;
  let rows = splitWith(text, d).slice(0, TABLE_LIMITS.rows);
  const columns = Math.min(TABLE_LIMITS.cols, Math.max(0, ...rows.map((r) => r.length)));
  rows = rows.map((r) => Array.from({ length: columns }, (_, i) => r[i] ?? ''));
  return { delimiter: d, rows, columns };
};

/** "1 234,50", "12.5", "-7" → number; values with a leading zero (phone, passport) stay text. */
const asNumber = (s: string): number | null => {
  const t = s.replace(/[\s ]/g, '');
  if (!t || t.length > 15) return null;
  if (/^[-+]?0\d/.test(t)) return null;
  if (/^[-+]?\d+$/.test(t)) return Number(t);
  if (/^[-+]?\d+[.,]\d+$/.test(t)) return Number(t.replace(',', '.'));
  // 1.234,56 (German) and 1,234.56 (English) thousands separators.
  if (/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'));
  if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ''));
  return null;
};

/** An .xlsx with one sheet: first row bold header with autofilter and frozen, column widths from the content. */
export const rowsToXlsx = async (rows: string[][], sheetName = 'Tabelle1'): Promise<Buffer> => {
  if (!rows.length) throw badRequest('NO_TABLE_DATA');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Triad Vision';
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName.replace(/[*?:\\/[\]]/g, ' ').slice(0, 31) || 'Tabelle1', { views: [{ state: 'frozen', ySplit: rows.length > 1 ? 1 : 0 }] });
  const cols = Math.max(...rows.map((r) => r.length));
  rows.forEach((r, i) => {
    const values = Array.from({ length: cols }, (_, c) => {
      const v = r[c] ?? '';
      if (i === 0) return v;
      const n = asNumber(v);
      return n === null ? v : n;
    });
    ws.addRow(values);
  });
  if (rows.length > 1) {
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FB' } };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols } };
  }
  for (let c = 1; c <= cols; c++) {
    let max = 6;
    for (const r of rows.slice(0, 2000)) max = Math.max(max, Math.min(60, (r[c - 1] ?? '').length + 2));
    ws.getColumn(c).width = max;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
};

/** Text of the first worksheet of an .xlsx (formatted values, at most `limits`). */
export const xlsxToRows = async (buf: Buffer, limits: { rows: number; cols: number } = { rows: TABLE_LIMITS.pdfRows, cols: TABLE_LIMITS.pdfCols }) => {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  } catch {
    throw badRequest('INVALID_SPREADSHEET');
  }
  const ws = wb.worksheets.find((s) => s.state !== 'hidden' && s.actualRowCount > 0) ?? wb.worksheets[0];
  if (!ws) return { name: 'Tabelle1', rows: [] as string[][] };
  const cols = Math.min(limits.cols, ws.actualColumnCount || ws.columnCount);
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    if (rows.length >= limits.rows) return;
    const cells: string[] = [];
    for (let c = 1; c <= cols; c++) {
      let text = '';
      try {
        text = row.getCell(c).text ?? '';
      } catch {
        text = '';
      }
      cells.push(String(text));
    }
    if (cells.some((x) => x.trim())) rows.push(cells);
  });
  // Drop columns that are empty everywhere at the right end.
  let width = cols;
  while (width > 1 && rows.every((r) => !r[width - 1]?.trim())) width--;
  return { name: ws.name, rows: rows.map((r) => r.slice(0, width)) };
};

/** CSV file bytes → rows (UTF-8, BOM stripped; separator detected among ; , tab). */
export const csvToRows = (buf: Buffer) => {
  const text = buf.toString('utf8').replace(/^﻿/, '');
  const d = detectDelimiter(text);
  const use: Delimiter = d === 'tab' || d === 'semicolon' || d === 'comma' ? d : text.includes(';') ? 'semicolon' : 'comma';
  return parseText(text, use).rows;
};
