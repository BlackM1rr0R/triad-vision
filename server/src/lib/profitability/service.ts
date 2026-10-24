import type { CaseStatus, Prisma, VisaType } from '@prisma/client';
import { dateKey, dayRange } from '../reports/dates.js';
import { COST_KEYS, computeProfitability, type CaseProfit, type CostKey } from './compute.js';
import { getProfitSettings } from './settings.js';

/** Profitability overview (Admin → Gəlirlilik): filters, totals, breakdowns, top / bottom cases. */

export interface ProfitFilters {
  /** Cases opened from / to (YYYY-MM-DD, Baku days): a cohort view — each case with its lifetime figures. */
  from?: string;
  to?: string;
  status?: CaseStatus[];
  visaType?: VisaType[];
  staffId?: string;
  partnerId?: string;
  companyId?: string;
}

export const profitWhere = (f: ProfitFilters): Prisma.CaseWhereInput => {
  const and: Prisma.CaseWhereInput[] = [];
  if (f.from || f.to) {
    const r = dayRange(f.from ?? '1970-01-01', f.to ?? '2999-12-31');
    and.push({ createdAt: { ...(f.from ? { gte: r.start } : {}), ...(f.to ? { lt: r.end } : {}) } });
  }
  if (f.status?.length) and.push({ status: { in: f.status } });
  if (f.visaType?.length) and.push({ visaType: { in: f.visaType } });
  if (f.staffId) and.push({ assignedStaffId: f.staffId });
  if (f.partnerId) and.push({ partnerId: f.partnerId });
  if (f.companyId) and.push({ companyId: f.companyId });
  return { AND: and };
};

const pct = (margin: number, revenue: number) => (revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : null);

export interface Bucket {
  key: string | null;
  label: string | null;
  cases: number;
  revenueCents: number;
  costCents: number;
  marginCents: number;
  marginPct: number | null;
}

const bucketBy = (rows: CaseProfit[], keyOf: (r: CaseProfit) => string | null, labelOf: (r: CaseProfit) => string | null, sort: 'margin' | 'key' = 'margin'): Bucket[] => {
  const m = new Map<string | null, Bucket>();
  for (const r of rows) {
    const k = keyOf(r);
    let b = m.get(k);
    if (!b) m.set(k, (b = { key: k, label: labelOf(r), cases: 0, revenueCents: 0, costCents: 0, marginCents: 0, marginPct: null }));
    b.cases++;
    b.revenueCents += r.revenue.total;
    b.costCents += r.costs.total;
    b.marginCents += r.marginCents;
  }
  const out = [...m.values()].map((b) => ({ ...b, marginPct: pct(b.marginCents, b.revenueCents) }));
  return sort === 'key' ? out.sort((a, b) => String(a.key ?? '').localeCompare(String(b.key ?? ''))) : out.sort((a, b) => b.marginCents - a.marginCents);
};

/** A case row without its lines (tables, top / bottom lists). */
export const caseRow = (r: CaseProfit) => {
  const { lines: _lines, ...rest } = r;
  return rest;
};

export const profitOverview = async (f: ProfitFilters) => {
  const s = await getProfitSettings();
  const rows = await computeProfitability(profitWhere(f), s);
  const revenue = rows.reduce((a, r) => a + r.revenue.total, 0);
  const costs = rows.reduce((a, r) => a + r.costs.total, 0);
  const margin = revenue - costs;
  const withRevenue = rows.filter((r) => r.marginPct !== null);
  const costsByCategory = Object.fromEntries(COST_KEYS.map((k) => [k, rows.reduce((a, r) => a + r.costs[k], 0)])) as Record<CostKey, number>;
  const revenueBySource = {
    INVOICE: rows.reduce((a, r) => a + r.revenue.INVOICE, 0),
    SETTLEMENT: rows.reduce((a, r) => a + r.revenue.SETTLEMENT, 0),
    TRANSLATION: rows.reduce((a, r) => a + r.revenue.TRANSLATION, 0),
    CLIENT_INVOICE: rows.reduce((a, r) => a + r.revenue.CLIENT_INVOICE, 0),
  };
  const byMargin = [...rows].sort((a, b) => b.marginCents - a.marginCents || a.number.localeCompare(b.number));
  return {
    settings: s,
    totals: {
      cases: rows.length,
      revenueCents: revenue,
      costCents: costs,
      marginCents: margin,
      marginPct: pct(margin, revenue),
      avgMarginCents: rows.length ? Math.round(margin / rows.length) : null,
      avgMarginPct: withRevenue.length ? Math.round((withRevenue.reduce((a, r) => a + r.marginPct!, 0) / withRevenue.length) * 10) / 10 : null,
      unprofitable: rows.filter((r) => r.marginCents < 0).length,
    },
    costsByCategory,
    revenueBySource,
    byVisaType: bucketBy(rows, (r) => r.visaType, (r) => r.visaType),
    byCategory: bucketBy(rows, (r) => r.visaCategoryId, (r) => r.categoryLabel),
    byPartner: bucketBy(rows, (r) => r.partnerId, (r) => r.partnerName),
    byAgent: bucketBy(rows, (r) => r.agentId, (r) => r.agentName),
    byStaff: bucketBy(rows, (r) => r.staffId, (r) => r.staffName),
    byEmployer: bucketBy(rows, (r) => r.companyId, (r) => r.companyName),
    byMonth: bucketBy(rows, (r) => dateKey(r.createdAt, 'month'), (r) => dateKey(r.createdAt, 'month'), 'key'),
    top: byMargin.slice(0, 10).map(caseRow),
    bottom: [...byMargin].reverse().slice(0, 10).map(caseRow),
    rows: byMargin.slice(0, 2000).map(caseRow),
    rowsTruncated: byMargin.length > 2000,
  };
};

export const caseProfit = async (caseId: string) => {
  const s = await getProfitSettings();
  const [row] = await computeProfitability({ id: caseId }, s);
  return { settings: s, profit: row ?? null };
};
