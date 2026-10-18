import ExcelJS from 'exceljs';
import type { CommissionStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { caseLabels, commissionTotals, monthRange, periodWhere, settlementClientNames } from './commissions.js';

/**
 * Commission reports of referral partners as Excel (exceljs): a summary sheet (one row per partner)
 * and a detail sheet (one row per commission). Azerbaijani headers, money as numbers (EUR, 2 decimals).
 */

export const COMMISSION_STATUS_AZ: Record<CommissionStatus, string> = {
  PENDING: 'Gözləyir',
  APPROVED: 'Təsdiqlənib',
  PAID: 'Ödənilib',
  CANCELLED: 'Ləğv edilib',
};

const money = (cents: number) => Math.round(cents) / 100;
const MONEY_FMT = '#,##0.00';

const headerStyle = (ws: ExcelJS.Worksheet) => {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565E8' } };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
};

export interface CommissionReportOpts {
  /** `YYYY-MM`; without it the whole history is reported. */
  month?: string;
  partnerId?: string;
  /** Detail sheet without the partner column (the partner's own download). */
  forPartner?: boolean;
}

export const buildCommissionWorkbook = async (opts: CommissionReportOpts) => {
  const range = opts.month ? monthRange(opts.month) : null;
  const where: Prisma.PartnerCommissionWhereInput = {
    ...(opts.partnerId ? { partnerId: opts.partnerId } : {}),
    ...(range ? periodWhere(range.start, range.end) : {}),
  };
  const rows = await prisma.partnerCommission.findMany({
    where,
    orderBy: [{ createdAt: 'asc' }],
    include: { partner: { select: { id: true, name: true } } },
  });
  const [labels, names] = await Promise.all([caseLabels(rows.map((r) => r.caseId)), settlementClientNames(rows)]);
  const partners = opts.partnerId
    ? await prisma.referralPartner.findMany({ where: { id: opts.partnerId }, select: { id: true, name: true } })
    : await prisma.referralPartner.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.partnerId))] } }, select: { id: true, name: true }, orderBy: { name: 'asc' } });

  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  // ── Summary per partner ──
  const sum = wb.addWorksheet('Xülasə', { views: [{ state: 'frozen', ySplit: 1 }] });
  sum.columns = [
    { header: 'Partnyor', key: 'name', width: 28 },
    { header: 'Dövr', key: 'period', width: 12 },
    { header: 'Say', key: 'count', width: 8 },
    { header: 'Gözləyən, EUR', key: 'pending', width: 16, style: { numFmt: MONEY_FMT } },
    { header: 'Təsdiqlənmiş, EUR', key: 'approved', width: 18, style: { numFmt: MONEY_FMT } },
    { header: 'Ödənilmiş, EUR', key: 'paid', width: 16, style: { numFmt: MONEY_FMT } },
    { header: 'Ləğv edilmiş, EUR', key: 'cancelled', width: 18, style: { numFmt: MONEY_FMT } },
    { header: 'Cəmi (ləğvsiz), EUR', key: 'total', width: 20, style: { numFmt: MONEY_FMT } },
  ];
  const all = commissionTotals(rows, range?.start, range?.end);
  const totals = partners.map((p) => {
    const t = commissionTotals(rows.filter((r) => r.partnerId === p.id), range?.start, range?.end);
    return { partner: p, t };
  });
  for (const { partner, t } of totals) {
    sum.addRow({
      name: partner.name,
      period: range?.key ?? 'Hamısı',
      count: t.pendingCount + t.approvedCount + t.paidCount,
      pending: money(t.pendingCents),
      approved: money(t.approvedCents),
      paid: money(t.paidCents),
      cancelled: money(t.cancelledCents),
      total: money(t.totalCents),
    });
  }
  const totalRow = sum.addRow({
    name: 'Cəmi',
    period: range?.key ?? 'Hamısı',
    count: all.pendingCount + all.approvedCount + all.paidCount,
    pending: money(all.pendingCents),
    approved: money(all.approvedCents),
    paid: money(all.paidCents),
    cancelled: money(all.cancelledCents),
    total: money(all.totalCents),
  });
  totalRow.font = { bold: true };
  headerStyle(sum);

  // ── Detail rows ──
  const det = wb.addWorksheet('Ətraflı', { views: [{ state: 'frozen', ySplit: 1 }] });
  det.columns = [
    { header: '№', key: 'i', width: 6 },
    ...(opts.forPartner ? [] : [{ header: 'Partnyor', key: 'partner', width: 24 }]),
    { header: 'Müraciət №', key: 'number', width: 16 },
    { header: 'Müştəri', key: 'client', width: 26 },
    { header: 'Məbləğ', key: 'amount', width: 12, style: { numFmt: MONEY_FMT } },
    { header: 'Valyuta', key: 'currency', width: 9 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Yaradılma tarixi', key: 'createdAt', width: 15, style: { numFmt: 'dd.mm.yyyy' } },
    { header: 'Ödəniş müddəti', key: 'dueAt', width: 15, style: { numFmt: 'dd.mm.yyyy' } },
    { header: 'Ödəniş tarixi', key: 'paidAt', width: 15, style: { numFmt: 'dd.mm.yyyy' } },
    { header: 'Qeyd', key: 'note', width: 36 },
  ];
  rows.forEach((r, i) => {
    const c = r.caseId ? labels.get(r.caseId) : undefined;
    det.addRow({
      i: i + 1,
      partner: r.partner.name,
      number: c?.number ?? '',
      client: c ? `${c.client.firstName} ${c.client.lastName}`.trim() : r.settlementEntryId ? (names.get(r.settlementEntryId) ?? '') : '',
      amount: money(r.amountCents),
      currency: r.currency,
      status: COMMISSION_STATUS_AZ[r.status],
      createdAt: r.createdAt,
      dueAt: r.dueAt ?? null,
      paidAt: r.paidAt ?? null,
      // The partner's own download shows only the payout note of paid rows, never internal notes.
      note: opts.forPartner ? (r.status === 'PAID' ? (r.note ?? '') : '') : (r.note ?? ''),
    });
  });
  headerStyle(det);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, rows: rows.length, partners: partners.length, period: range?.key ?? null };
};
