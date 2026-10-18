import { DAY_MS, inRange, monthsOf, type Period } from './period.js';

/**
 * Pure aggregation for the financial reports (no database access, unit-tested).
 *
 * Definitions (amounts in euro cents):
 * - Revenue: invoices with status PAID whose `paidAt` lies in the period (gross and net).
 * - Invoiced: invoices with status SENT / OVERDUE / PAID whose `issueDate` lies in the period (gross).
 * - Outstanding at an instant T: invoices issued before T that are SENT / OVERDUE, or PAID only at / after T.
 *   DRAFT and CANCELLED invoices are never receivables. The overdue part is the outstanding amount at least
 *   one whole day past its due date at T. Receivables of a period are taken at min(period end, now).
 * - Translation revenue: DELIVERED translation orders with a price, dated by `completedAt` (fallback `updatedAt`).
 * - Commissions: PENDING / APPROVED / CANCELLED by `createdAt` in the period; PAID by `paidAt` in the period.
 * - Partner commissions (referral partners / middlemen): the same rules as agent commissions, reported separately.
 * - Net result estimate: net invoice revenue + translation revenue − commissions paid (agents and partners).
 * - Cases: new = `createdAt` in the period; decided = APPROVED / REJECTED with decision date
 *   (`decisionAt`, fallback `closedAt`) in the period; conversion = approved / decided.
 */

export type InvoiceStatusT = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface InvoiceRow {
  id: string;
  number: string;
  companyId: string;
  companyName: string;
  issueDate: Date;
  dueDate: Date;
  netCents: number;
  grossCents: number;
  status: InvoiceStatusT;
  paidAt: Date | null;
}

export interface CommissionRow {
  agentId: string;
  caseId: string | null;
  amountCents: number;
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED';
  createdAt: Date;
  paidAt: Date | null;
}

/** Commission of a referral partner (middleman); `partnerCommissions` is optional in FinanceData. */
export interface PartnerCommissionRow {
  partnerId: string;
  caseId: string | null;
  amountCents: number;
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED';
  createdAt: Date;
  paidAt: Date | null;
}

export interface TranslationRow {
  caseId: string | null;
  priceCents: number | null;
  status: string;
  completedAt: Date | null;
  updatedAt: Date;
}

export interface CaseRow {
  id: string;
  status: string;
  createdAt: Date;
  decisionAt: Date | null;
  closedAt: Date | null;
  assignedStaffId: string | null;
  visaType: string;
  visaCategoryId: string | null;
  companyId: string | null;
}

export interface FinanceData {
  invoices: InvoiceRow[];
  commissions: CommissionRow[];
  translations: TranslationRow[];
  cases: CaseRow[];
  /** Referral-partner commissions (separate from the agent programme). */
  partnerCommissions?: PartnerCommissionRow[];
}

const FINAL = new Set(['APPROVED', 'REJECTED', 'CANCELLED']);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? round1(sum(xs) / xs.length) : null);
const pct = (num: number, den: number) => (den > 0 ? round1((num / den) * 100) : null);

export const decisionDate = (c: Pick<CaseRow, 'decisionAt' | 'closedAt'>) => c.decisionAt ?? c.closedAt;
export const isDecided = (c: CaseRow) => c.status === 'APPROVED' || c.status === 'REJECTED';
export const translationDate = (t: TranslationRow) => t.completedAt ?? t.updatedAt;
export const isTranslationRevenue = (t: TranslationRow) => t.status === 'DELIVERED' && (t.priceCents ?? 0) > 0;
export const daysBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / DAY_MS;

// ─── Receivables ────────────────────────────────────────────────────────

export const isOutstandingAt = (inv: InvoiceRow, at: Date) => {
  if (inv.issueDate >= at) return false;
  if (inv.status === 'SENT' || inv.status === 'OVERDUE') return true;
  return inv.status === 'PAID' && !!inv.paidAt && inv.paidAt >= at;
};

/** Whole days past the due date at `at` (0 when not yet due or due less than a day ago; such invoices are not overdue). */
export const daysOverdue = (dueDate: Date, at: Date) => Math.max(0, Math.floor((at.getTime() - dueDate.getTime()) / DAY_MS));

export const AGING_BUCKETS = ['0-30', '31-60', '61-90', '90+'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

/** Aging bucket by days overdue; invoices not yet due fall into 0–30. */
export const agingBucket = (days: number): AgingBucket => (days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+');

export const outstandingAt = (invoices: InvoiceRow[], at: Date) => {
  const open = invoices.filter((i) => isOutstandingAt(i, at));
  const overdue = open.filter((i) => daysOverdue(i.dueDate, at) > 0);
  return {
    grossCents: sum(open.map((i) => i.grossCents)),
    count: open.length,
    overdueGrossCents: sum(overdue.map((i) => i.grossCents)),
    overdueCount: overdue.length,
  };
};

export const receivables = (invoices: InvoiceRow[], at: Date) => {
  const rows = invoices
    .filter((i) => isOutstandingAt(i, at))
    .map((i) => {
      const days = daysOverdue(i.dueDate, at);
      return {
        id: i.id,
        number: i.number,
        companyId: i.companyId,
        companyName: i.companyName,
        issueDate: i.issueDate,
        dueDate: i.dueDate,
        status: i.status,
        grossCents: i.grossCents,
        daysOverdue: days,
        bucket: agingBucket(days),
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue || a.dueDate.getTime() - b.dueDate.getTime());
  const aging = AGING_BUCKETS.map((bucket) => {
    const inBucket = rows.filter((r) => r.bucket === bucket);
    return { bucket, count: inBucket.length, grossCents: sum(inBucket.map((r) => r.grossCents)) };
  });
  return { asOf: at, rows, aging, totalGrossCents: sum(rows.map((r) => r.grossCents)), count: rows.length };
};

// ─── Summary ────────────────────────────────────────────────────────────

/** The instant receivables are measured at: the end of the period, or now for a period that is still running. */
export const asOfFor = (p: Period, now: Date) => (p.end < now ? p.end : now);

/** PENDING / APPROVED by `createdAt` in [start, end), PAID by `paidAt`. */
const commissionSums = (rows: { amountCents: number; status: CommissionRow['status']; createdAt: Date; paidAt: Date | null }[], start: Date, end: Date) => {
  const created = (status: CommissionRow['status']) => rows.filter((c) => c.status === status && inRange(c.createdAt, start, end));
  const paid = rows.filter((c) => c.status === 'PAID' && inRange(c.paidAt, start, end));
  return {
    pendingCents: sum(created('PENDING').map((c) => c.amountCents)),
    pendingCount: created('PENDING').length,
    approvedCents: sum(created('APPROVED').map((c) => c.amountCents)),
    approvedCount: created('APPROVED').length,
    paidCents: sum(paid.map((c) => c.amountCents)),
    paidCount: paid.length,
  };
};

export const summarize = (d: FinanceData, p: Period, now: Date) => {
  const { start, end } = p;
  const paid = d.invoices.filter((i) => i.status === 'PAID' && inRange(i.paidAt, start, end));
  const revenue = { grossCents: sum(paid.map((i) => i.grossCents)), netCents: sum(paid.map((i) => i.netCents)), count: paid.length };
  const translations = d.translations.filter((t) => isTranslationRevenue(t) && inRange(translationDate(t), start, end));
  const translation = { cents: sum(translations.map((t) => t.priceCents ?? 0)), count: translations.length };
  const commissions = commissionSums(d.commissions, start, end);
  const partnerCommissions = commissionSums(d.partnerCommissions ?? [], start, end);
  const newCases = d.cases.filter((c) => inRange(c.createdAt, start, end)).length;
  const decided = d.cases.filter((c) => isDecided(c) && inRange(decisionDate(c), start, end));
  const approved = decided.filter((c) => c.status === 'APPROVED').length;
  return {
    revenue,
    receivables: outstandingAt(d.invoices, asOfFor(p, now)),
    translation,
    commissions,
    partnerCommissions,
    netResultCents: revenue.netCents + translation.cents - commissions.paidCents - partnerCommissions.paidCents,
    cases: {
      new: newCases,
      approved,
      rejected: decided.length - approved,
      decided: decided.length,
      conversionPct: pct(approved, decided.length),
      avgDaysToDecision: avg(decided.map((c) => daysBetween(c.createdAt, decisionDate(c)!))),
    },
  };
};

// ─── Monthly ────────────────────────────────────────────────────────────

export const monthly = (d: FinanceData, p: Period, now: Date) =>
  monthsOf(p).map(({ key, start, end }) => {
    const billed = d.invoices.filter((i) => i.status !== 'DRAFT' && i.status !== 'CANCELLED' && inRange(i.issueDate, start, end));
    const paid = d.invoices.filter((i) => i.status === 'PAID' && inRange(i.paidAt, start, end));
    return {
      month: key,
      invoicedCents: sum(billed.map((i) => i.grossCents)),
      paidCents: sum(paid.map((i) => i.grossCents)),
      // Months that have not ended yet are measured now; months entirely in the future have no value.
      outstandingCents: start > now ? null : outstandingAt(d.invoices, end < now ? end : now).grossCents,
      translationCents: sum(d.translations.filter((t) => isTranslationRevenue(t) && inRange(translationDate(t), start, end)).map((t) => t.priceCents ?? 0)),
      commissionsPaidCents: sum(d.commissions.filter((c) => c.status === 'PAID' && inRange(c.paidAt, start, end)).map((c) => c.amountCents)),
      partnerCommissionsPaidCents: sum((d.partnerCommissions ?? []).filter((c) => c.status === 'PAID' && inRange(c.paidAt, start, end)).map((c) => c.amountCents)),
      newCases: d.cases.filter((c) => inRange(c.createdAt, start, end)).length,
      approved: d.cases.filter((c) => c.status === 'APPROVED' && inRange(decisionDate(c), start, end)).length,
    };
  });

// ─── Commissions per agent ──────────────────────────────────────────────

export interface AgentInfo {
  id: string;
  code: string;
  name: string;
  region: string | null;
  status: string;
  referralsTotal: number;
  referralsInRange: number;
}

export const commissionsByAgent = (agents: AgentInfo[], commissions: CommissionRow[], p: Period) => {
  const rows = agents.map((a) => {
    const mine = commissions.filter((c) => c.agentId === a.id);
    const created = (s: CommissionRow['status']) => sum(mine.filter((c) => c.status === s && inRange(c.createdAt, p.start, p.end)).map((c) => c.amountCents));
    const paidCents = sum(mine.filter((c) => c.status === 'PAID' && inRange(c.paidAt, p.start, p.end)).map((c) => c.amountCents));
    const pendingCents = created('PENDING');
    const approvedCents = created('APPROVED');
    return {
      ...a,
      pendingCents,
      approvedCents,
      paidCents,
      cancelledCents: created('CANCELLED'),
      totalCents: pendingCents + approvedCents + paidCents,
    };
  });
  const visible = rows.filter((r) => r.totalCents > 0 || r.cancelledCents > 0 || r.referralsInRange > 0 || r.status === 'ACTIVE');
  visible.sort((a, b) => b.totalCents - a.totalCents || b.referralsInRange - a.referralsInRange || a.name.localeCompare(b.name));
  const totals = {
    referralsInRange: sum(visible.map((r) => r.referralsInRange)),
    pendingCents: sum(visible.map((r) => r.pendingCents)),
    approvedCents: sum(visible.map((r) => r.approvedCents)),
    paidCents: sum(visible.map((r) => r.paidCents)),
    cancelledCents: sum(visible.map((r) => r.cancelledCents)),
    totalCents: sum(visible.map((r) => r.totalCents)),
  };
  return { rows: visible, totals };
};

// ─── Commissions per referral partner ───────────────────────────────────

export interface PartnerInfo {
  id: string;
  name: string;
  active: boolean;
}

export const commissionsByPartner = (partners: PartnerInfo[], rows: PartnerCommissionRow[], p: Period) => {
  const list = partners.map((pt) => {
    const mine = rows.filter((c) => c.partnerId === pt.id);
    const created = (s: PartnerCommissionRow['status']) => sum(mine.filter((c) => c.status === s && inRange(c.createdAt, p.start, p.end)).map((c) => c.amountCents));
    const paidCents = sum(mine.filter((c) => c.status === 'PAID' && inRange(c.paidAt, p.start, p.end)).map((c) => c.amountCents));
    const pendingCents = created('PENDING');
    const approvedCents = created('APPROVED');
    return { ...pt, pendingCents, approvedCents, paidCents, cancelledCents: created('CANCELLED'), totalCents: pendingCents + approvedCents + paidCents };
  });
  const visible = list.filter((r) => r.totalCents > 0 || r.cancelledCents > 0);
  visible.sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name));
  const totals = {
    pendingCents: sum(visible.map((r) => r.pendingCents)),
    approvedCents: sum(visible.map((r) => r.approvedCents)),
    paidCents: sum(visible.map((r) => r.paidCents)),
    cancelledCents: sum(visible.map((r) => r.cancelledCents)),
    totalCents: sum(visible.map((r) => r.totalCents)),
  };
  return { rows: visible, totals };
};

// ─── Staff league ───────────────────────────────────────────────────────

export interface StaffInfo {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
}

export const staffStats = (
  staff: StaffInfo[],
  cases: CaseRow[],
  docsReviewed: Map<string, number>,
  satisfaction: Map<string, { avg: number; count: number }>,
  p: Period,
) => {
  const rows = staff.map((s) => {
    const mine = cases.filter((c) => c.assignedStaffId === s.id);
    const decided = mine.filter((c) => isDecided(c) && inRange(decisionDate(c), p.start, p.end));
    const approved = decided.filter((c) => c.status === 'APPROVED').length;
    const sat = satisfaction.get(s.id);
    return {
      id: s.id,
      name: s.name,
      role: s.role,
      isActive: s.isActive,
      activeCases: mine.filter((c) => !FINAL.has(c.status)).length,
      newCases: mine.filter((c) => inRange(c.createdAt, p.start, p.end)).length,
      approved,
      rejected: decided.length - approved,
      approvalPct: pct(approved, decided.length),
      avgDaysToDecision: avg(decided.map((c) => daysBetween(c.createdAt, decisionDate(c)!))),
      documentsReviewed: docsReviewed.get(s.id) ?? 0,
      satisfactionAvg: sat ? round1(sat.avg) : null,
      satisfactionCount: sat?.count ?? 0,
    };
  });
  return rows
    .filter((r) => r.isActive || r.activeCases + r.newCases + r.approved + r.rejected + r.documentsReviewed + r.satisfactionCount > 0)
    .sort((a, b) => b.approved - a.approved || b.activeCases - a.activeCases || a.name.localeCompare(b.name));
};

// ─── By visa type / category ────────────────────────────────────────────

/**
 * Invoices are addressed to companies, not cases, so invoice revenue is attributed to the company's
 * cases: each paid invoice is split evenly over the company's cases (their visa type / category).
 * Revenue of a company without cases is reported under the key `null`. Translation revenue and
 * commissions are linked to a case directly.
 */
export const byType = (d: FinanceData, p: Period) => {
  type Acc = { newCases: number; approved: number; rejected: number; active: number; invoiceRevenueCents: number; translationCents: number; commissionsPaidCents: number };
  const empty = (): Acc => ({ newCases: 0, approved: 0, rejected: 0, active: 0, invoiceRevenueCents: 0, translationCents: 0, commissionsPaidCents: 0 });
  const types = new Map<string | null, Acc>();
  const cats = new Map<string | null, Acc>();
  const get = (m: Map<string | null, Acc>, k: string | null) => {
    let v = m.get(k);
    if (!v) m.set(k, (v = empty()));
    return v;
  };
  const caseById = new Map(d.cases.map((c) => [c.id, c]));
  const both = (c: CaseRow | undefined, fn: (a: Acc) => void) => {
    fn(get(types, c ? c.visaType : null));
    fn(get(cats, c ? c.visaCategoryId : null));
  };

  for (const c of d.cases) {
    const created = inRange(c.createdAt, p.start, p.end);
    const decided = isDecided(c) && inRange(decisionDate(c), p.start, p.end);
    const active = !FINAL.has(c.status);
    if (!created && !decided && !active) continue;
    both(c, (a) => {
      if (created) a.newCases++;
      if (decided && c.status === 'APPROVED') a.approved++;
      if (decided && c.status === 'REJECTED') a.rejected++;
      if (active) a.active++;
    });
  }

  const casesByCompany = new Map<string, CaseRow[]>();
  for (const c of d.cases) if (c.companyId) casesByCompany.set(c.companyId, [...(casesByCompany.get(c.companyId) ?? []), c]);
  for (const inv of d.invoices) {
    if (inv.status !== 'PAID' || !inRange(inv.paidAt, p.start, p.end)) continue;
    const linked = casesByCompany.get(inv.companyId) ?? [];
    if (linked.length === 0) {
      both(undefined, (a) => (a.invoiceRevenueCents += inv.grossCents));
      continue;
    }
    // Split in whole cents; the remainder goes to the first cases so the parts add up exactly.
    const share = Math.floor(inv.grossCents / linked.length);
    let rest = inv.grossCents - share * linked.length;
    for (const c of linked) {
      const part = share + (rest > 0 ? 1 : 0);
      if (rest > 0) rest--;
      both(c, (a) => (a.invoiceRevenueCents += part));
    }
  }
  for (const t of d.translations) {
    if (!isTranslationRevenue(t) || !inRange(translationDate(t), p.start, p.end)) continue;
    both(t.caseId ? caseById.get(t.caseId) : undefined, (a) => (a.translationCents += t.priceCents ?? 0));
  }
  for (const c of d.commissions) {
    if (c.status !== 'PAID' || !inRange(c.paidAt, p.start, p.end)) continue;
    both(c.caseId ? caseById.get(c.caseId) : undefined, (a) => (a.commissionsPaidCents += c.amountCents));
  }

  const finish = (m: Map<string | null, Acc>) =>
    [...m.entries()]
      .map(([key, a]) => ({
        key,
        ...a,
        approvalPct: pct(a.approved, a.approved + a.rejected),
        revenueCents: a.invoiceRevenueCents + a.translationCents,
      }))
      .sort((x, y) => y.revenueCents - x.revenueCents || y.newCases - x.newCases || String(x.key).localeCompare(String(y.key)));
  return { byVisaType: finish(types), byCategory: finish(cats) };
};
