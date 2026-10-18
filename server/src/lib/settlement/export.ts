import ExcelJS from 'exceljs';
import { prisma } from '../../db.js';
import { STAGE_FILL, formatStatus } from './parse.js';
import { CURRENCIES, type BeneficiaryLike, type Currency } from './split.js';
import { loadRows, totalsOf, type RowDto } from './service.js';

/**
 * The ledger as a workbook like the team's: one sheet per project and one per partner (same column order),
 * rows filled by stage (green / yellow / red / blue), "manat" / "euro" number formats, a totals row, frozen
 * header and autofilter, plus a summary sheet (per-beneficiary pending / paid, per-partner commissions).
 */

const FMT: Record<Currency, string> = { AZN: '#,##0 "manat"', EUR: '#,##0 "euro"' };
const HEADER_FILL = 'FF00B0F0';
const THIN = { style: 'thin' as const, color: { argb: 'FF7F7F7F' } };

type Col = { header: string; width: number; value: (r: RowDto) => ExcelJS.CellValue; currency?: (r: RowDto) => Currency | null; total?: (rows: RowDto[]) => ExcelJS.CellValue };

const money = (cents: number | null | undefined) => (cents == null ? null : cents / 100);

const bagText = (bag: Partial<Record<Currency, number>>) =>
  CURRENCIES.filter((c) => bag[c])
    .map((c) => `${Math.round(bag[c]! / 100).toLocaleString('en-US')} ${c === 'AZN' ? 'manat' : 'euro'}`)
    .join(' + ');

/** A totals cell: a number with its format when one currency, text "x manat + y euro" when mixed. */
const totalCell = (bag: Partial<Record<Currency, number>>): { value: ExcelJS.CellValue; fmt?: string } => {
  const curs = CURRENCIES.filter((c) => bag[c]);
  if (!curs.length) return { value: null };
  if (curs.length === 1) return { value: bag[curs[0]!]! / 100, fmt: FMT[curs[0]!] };
  return { value: bagText(bag) };
};

const sheetName = (name: string, used: Set<string>) => {
  const base = (name.replace(/[\\/*?:[\]]/g, ' ').trim() || 'Sheet').slice(0, 31);
  let n = base;
  let i = 2;
  while (used.has(n.toLowerCase())) n = `${base.slice(0, 28)} ${i++}`;
  used.add(n.toLowerCase());
  return n;
};

const columns = (bens: BeneficiaryLike[], partnerName: Map<string, string>, partnerSheet: boolean): Col[] => {
  const cols: Col[] = [];
  if (!partnerSheet) cols.push({ header: 'Zwischen Person', width: 18, value: (r) => (r.partnerId ? (partnerName.get(r.partnerId) ?? '') : '') });
  cols.push(
    { header: partnerSheet ? 'Musteri adi' : 'Name', width: 28, value: (r) => (r.licence ? `${r.clientName} (${r.licence})` : r.clientName) },
    { header: partnerSheet ? 'Transport' : 'Transporte', width: 22, value: (r) => r.employer ?? '' },
    { header: 'Status', width: 32, value: (r) => formatStatus(r.tlsDate ? new Date(r.tlsDate) : null, r.visaDate ? new Date(r.visaDate) : null, r.stage) },
    {
      header: partnerSheet ? 'Odeniw' : 'Bezahlung',
      width: 18,
      value: (r) => money(r.amountCents),
      currency: (r) => r.currency,
    },
    { header: 'Sanani', width: 14, value: (r) => money(r.partnerShareCents), currency: (r) => r.partnerShareCurrency },
  );
  for (const b of bens) {
    cols.push({
      header: b.name,
      width: 14,
      value: (r) => {
        const s = r.shares[b.id];
        if (!s) return null;
        return s.text ? s.text : s.cents / 100;
      },
      currency: (r) => r.shares[b.id]?.currency ?? null,
    });
  }
  if (!partnerSheet) cols.push({ header: 'Rasxod', width: 14, value: (r) => money(r.expensesCents), currency: (r) => r.currency });
  cols.push({ header: 'Viza sonrası', width: 12, value: (r) => (r.payAfterVisa ? 'bəli' : '') });
  cols.push({ header: 'Ödənilib', width: 14, value: (r) => (r.paidCents ? r.paidCents / 100 : null), currency: (r) => r.currency });
  cols.push({ header: 'Qeyd', width: 40, value: (r) => r.note ?? '' });
  return cols;
};

const writeSheet = (wb: ExcelJS.Workbook, name: string, rows: RowDto[], cols: Col[], bens: BeneficiaryLike[]) => {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.header, width: c.width }));
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.alignment = { horizontal: 'center', vertical: 'middle' };
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.border = { top: THIN, bottom: THIN, left: THIN, right: THIN };
  });
  for (const r of rows) {
    const row = ws.addRow(cols.map((c) => c.value(r)));
    row.eachCell({ includeEmpty: true }, (cell, i) => {
      const col = cols[i - 1];
      if (!col) return;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STAGE_FILL[r.stage] } };
      cell.border = { top: THIN, bottom: THIN, left: THIN, right: THIN };
      cell.alignment = { horizontal: col.header === 'Qeyd' ? 'left' : 'center', vertical: 'middle', wrapText: col.header === 'Qeyd' };
      const cur = col.currency?.(r);
      if (cur && typeof cell.value === 'number') cell.numFmt = FMT[cur];
      if (r.stage === 'REFUSED' || r.stage === 'VISA') cell.font = { color: { argb: 'FF000000' } };
    });
  }
  // Totals row
  const totals = totalsOf(rows, bens);
  const values: { value: ExcelJS.CellValue; fmt?: string }[] = cols.map((c) => {
    switch (c.header) {
      case 'Name':
      case 'Musteri adi':
        return { value: `Cəmi: ${rows.length}` };
      case 'Bezahlung':
      case 'Odeniw':
        return totalCell(totals.amount);
      case 'Sanani':
        return totalCell(totals.partnerShare);
      case 'Rasxod':
        return totalCell(totals.expenses);
      case 'Ödənilib':
        return totalCell(totals.paid);
      default: {
        const b = bens.find((x) => x.name === c.header);
        return b ? totalCell(totals.shares[b.id]?.total ?? {}) : { value: null };
      }
    }
  });
  const tr = ws.addRow(values.map((v) => v.value));
  tr.font = { bold: true };
  tr.eachCell({ includeEmpty: true }, (cell, i) => {
    const v = values[i - 1];
    if (v?.fmt) cell.numFmt = v.fmt;
    cell.border = { top: { style: 'double', color: { argb: 'FF000000' } } };
    cell.alignment = { horizontal: 'center' };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: cols.length } };
  return ws;
};

export const buildSettlementXlsx = async (opts: { project?: string } = {}) => {
  const [{ rows, beneficiaries }, partners] = await Promise.all([loadRows({ project: opts.project }), prisma.referralPartner.findMany({ select: { id: true, name: true } })]);
  const bens = beneficiaries.filter((b) => b.active);
  const partnerName = new Map(partners.map((p) => [p.id, p.name]));
  const partnerNames = new Set(partners.map((p) => p.name.toLowerCase()));
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const used = new Set<string>();

  // Project sheets (a project named like a partner is that partner's sheet below).
  const projects = [...new Set(rows.map((r) => r.project))];
  for (const p of projects) {
    if (partnerNames.has(p.toLowerCase())) continue;
    writeSheet(wb, sheetName(p, used), rows.filter((r) => r.project === p), columns(bens, partnerName, false), bens);
  }
  // Partner sheets: every client of that partner.
  const byPartner = new Map<string, RowDto[]>();
  for (const r of rows) if (r.partnerId) byPartner.set(r.partnerId, [...(byPartner.get(r.partnerId) ?? []), r]);
  const partnerOrder = [...byPartner.keys()].sort((a, b) => (partnerName.get(a) ?? '').localeCompare(partnerName.get(b) ?? ''));
  for (const pid of partnerOrder) {
    writeSheet(wb, sheetName(partnerName.get(pid) ?? 'Partner', used), byPartner.get(pid)!, columns(bens, partnerName, true), bens);
  }
  // Rows of a partner-named project without a partner set would be lost otherwise.
  for (const p of projects) {
    if (!partnerNames.has(p.toLowerCase())) continue;
    const orphans = rows.filter((r) => r.project === p && !r.partnerId);
    if (orphans.length) writeSheet(wb, sheetName(`${p} (partnyorsuz)`, used), orphans, columns(bens, partnerName, false), bens);
  }

  // Summary
  const totals = totalsOf(rows, bens);
  const ws = wb.addWorksheet(sheetName('Xülasə', used));
  ws.columns = [
    { header: 'Kim', width: 24 },
    { header: 'Cəmi', width: 26 },
    { header: 'Ödənilməyib', width: 26 },
    { header: 'Ödənilib', width: 26 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  });
  for (const b of bens) {
    const s = totals.shares[b.id]!;
    ws.addRow([b.name, bagText(s.total), bagText(s.pending), bagText(s.paid)]);
  }
  ws.addRow([]);
  ws.addRow(['Partnyor komissiyaları', 'Cəmi', 'Ödənilməyib', 'Ödənilib']).font = { bold: true };
  for (const pid of partnerOrder) {
    const t = totalsOf(byPartner.get(pid)!, bens).partner;
    ws.addRow([partnerName.get(pid) ?? '', bagText(t.total), bagText(t.pending), bagText(t.paid)]);
  }
  ws.addRow([]);
  ws.addRow(['Gəlir', bagText(totals.amount), '', bagText(totals.paid)]).font = { bold: true };
  ws.addRow(['Xərclər (Rasxod)', bagText(totals.expenses)]);
  ws.addRow(['Sətir sayı', rows.length]);

  return Buffer.from(await wb.xlsx.writeBuffer());
};
