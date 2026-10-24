import ExcelJS from 'exceljs';
import { renderDocPdf } from '../docCreate/pdf.js';
import { bakuDay } from './dates.js';
import { NO, NONE_LABEL, YES } from './labels.js';
import type { OutColumn, ReportResult } from './engine.js';
import { L, type Lang } from './types.js';
import { csvSafe } from '../csvSafe.js';

/**
 * Report exports: Excel (exceljs: styled frozen header, autofilter, auto-fit widths, number / money / date
 * formats, totals row), CSV (UTF-8 with BOM, semicolon-separated so Excel in de/az locales opens it) and a
 * simple PDF table (the drive's document renderer, DejaVu Sans for az / de / ru, landscape).
 */

export const EXPORT_FORMATS = ['xlsx', 'csv', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const MIME: Record<ExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf',
};

const TOTAL = L('Cəmi', 'Summe', 'Total', 'Итого');
const ROWS = L('sətir', 'Zeilen', 'rows', 'строк');
const TRUNCATED = L('Yalnız ilk {n} sətir daxil edilib.', 'Nur die ersten {n} Zeilen sind enthalten.', 'Only the first {n} rows are included.', 'Включены только первые {n} строк.');
const PDF_LIMIT = 2000;

/** A cell value as text in the language (enums, booleans, dates; money in units with 2 decimals). */
export const cellText = (c: OutColumn, v: unknown, lang: Lang): string => {
  if (v === null || v === undefined || v === '') return c.column && !c.fn ? NONE_LABEL[lang] : '';
  if (c.type === 'money') return (Number(v) / 100).toFixed(2);
  if (c.type === 'boolean') return (v ? YES : NO)[lang];
  if (v instanceof Date) return bakuDay(v);
  if (c.type === 'enum' && c.enumLabels?.[String(v)]) return c.enumLabels[String(v)][lang];
  return String(v);
};

/** Typed value for an Excel cell. */
const xlsxValue = (c: OutColumn, v: unknown, lang: Lang): ExcelJS.CellValue => {
  if (v === null || v === undefined || v === '') return c.column && (c.type === 'enum' || c.type === 'string' || c.type === 'user') && !c.fn ? NONE_LABEL[lang] : null;
  if (c.type === 'money') return Math.round(Number(v)) / 100;
  if (c.type === 'number') return Number(v);
  if (v instanceof Date) {
    // Excel has no time zones: write the Baku calendar day as a UTC date.
    const [y, m, d] = bakuDay(v).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  return cellText(c, v, lang);
};

const label = (c: OutColumn, lang: Lang) => c.label[lang];

export const reportFilename = (name: string, format: ExportFormat, now = new Date()) => {
  const base = name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'report';
  return `${base}-${bakuDay(now)}.${format}`;
};

export const buildXlsx = async (r: ReportResult, title: string, lang: Lang): Promise<Buffer> => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Triad Vision';
  wb.created = new Date();
  const ws = wb.addWorksheet(title.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Report', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = r.columns.map((c) => ({ header: label(c, lang), key: c.key }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565E8' } };
  head.alignment = { vertical: 'middle', wrapText: true };
  head.height = 22;
  for (const row of r.rows) ws.addRow(r.columns.map((c) => xlsxValue(c, row[c.key], lang)));
  if (r.totals) {
    const t = ws.addRow(r.columns.map((c, i) => (i === 0 && r.totals![c.key] === undefined ? `${TOTAL[lang]} (${r.records} ${ROWS[lang]})` : r.totals![c.key] === undefined ? null : xlsxValue({ ...c, column: undefined }, r.totals![c.key], lang))));
    t.font = { bold: true };
    t.border = { top: { style: 'thin', color: { argb: 'FF7F7F7F' } } };
  }
  r.columns.forEach((c, i) => {
    const column = ws.getColumn(i + 1);
    if (c.type === 'money') column.numFmt = '#,##0.00';
    else if (c.type === 'number') column.numFmt = c.fn === 'avg' ? '#,##0.00' : '#,##0.##';
    else if (c.type === 'date') column.numFmt = 'dd.mm.yyyy';
    // Auto-fit: the longest text of the first 2 000 rows, between 8 and 60 characters.
    let w = label(c, lang).length;
    r.rows.slice(0, 2000).forEach((row) => {
      w = Math.max(w, cellText(c, row[c.key], lang).length);
    });
    column.width = Math.min(60, Math.max(8, w + 2));
  });
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565E8' } };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + r.rows.length, column: Math.max(1, r.columns.length) } };
  if (r.truncated) ws.addRow([TRUNCATED[lang].replace('{n}', String(r.records))]).font = { italic: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
};

const csvCell = (raw: string) => {
  const s = csvSafe(raw); // report cells carry client / company input: no spreadsheet formulas
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const buildCsv = (r: ReportResult, lang: Lang): Buffer => {
  const lines = [r.columns.map((c) => csvCell(label(c, lang))).join(';')];
  for (const row of r.rows) lines.push(r.columns.map((c) => csvCell(cellText(c, row[c.key], lang))).join(';'));
  if (r.totals) lines.push(r.columns.map((c, i) => csvCell(r.totals![c.key] !== undefined ? cellText(c, r.totals![c.key], lang) : i === 0 ? TOTAL[lang] : '')).join(';'));
  return Buffer.concat([Buffer.from('﻿', 'utf8'), Buffer.from(lines.join('\r\n'), 'utf8')]);
};

export const buildPdf = async (r: ReportResult, title: string, lang: Lang, meta: string): Promise<Buffer> => {
  const cols = r.columns.slice(0, 20);
  const rows = r.rows.slice(0, PDF_LIMIT - 2);
  const table: string[][] = [cols.map((c) => label(c, lang))];
  for (const row of rows) table.push(cols.map((c) => cellText(c, row[c.key], lang).slice(0, 300)));
  if (r.totals) table.push(cols.map((c, i) => (r.totals![c.key] !== undefined ? cellText(c, r.totals![c.key], lang) : i === 0 ? TOTAL[lang] : '')));
  const notes = [meta, rows.length < r.rows.length || r.truncated ? TRUNCATED[lang].replace('{n}', String(rows.length)) : ''].filter(Boolean);
  return renderDocPdf(
    {
      title,
      letterhead: false,
      date: bakuDay(new Date()).split('-').reverse().join('.'),
      blocks: [...notes.map((n) => ({ type: 'p' as const, runs: [{ t: n }] })), { type: 'table', header: true, rows: table }],
    },
    { embedSource: false, landscape: cols.length > 5 },
  );
};

export const buildExport = async (r: ReportResult, format: ExportFormat, title: string, lang: Lang, meta = '') =>
  format === 'xlsx' ? buildXlsx(r, title, lang) : format === 'csv' ? buildCsv(r, lang) : buildPdf(r, title, lang, meta);

/** Short plain-text summary of a result (e-mail body): row count and the totals row. */
export const summaryLines = (r: ReportResult, lang: Lang): string[] => {
  const out = [`${r.grouped ? r.total : r.records} ${ROWS[lang]}`];
  if (r.totals) {
    for (const c of r.columns) {
      const v = r.totals[c.key];
      if (v === undefined || v === null) continue;
      out.push(`${label(c, lang)}: ${cellText(c, v, lang)}`);
    }
  }
  return out.slice(0, 12);
};
