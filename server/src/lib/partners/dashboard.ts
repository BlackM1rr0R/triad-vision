import type { CaseStatus } from '@prisma/client';
import { prisma } from '../../db.js';
import { isRefused } from '../caseProcessing/index.js';
import { quotaOf, type PartnerQuota } from './quota.js';

/**
 * Dashboard of one referral partner (GET /api/admin/partners/:id/dashboard, the "Panel" tab of the profile):
 * cases by status, new clients / commissions / client payments per month (last 12 Baku months), refusal
 * rate, the client quota and a merged feed of the latest activity. Read-only; every number comes from the
 * existing models (Case, User.ownerPartnerId, PartnerCommission, ClientPayment, CaseEvent, PartnerActivity).
 * Client payments ("revenue") are ADMIN+ only, as the client billing lists are.
 */

export const DASHBOARD_MONTHS = 12;
const BAKU_OFFSET_MS = 4 * 60 * 60 * 1000;
const ACTIVITY_LIMIT = 12;

/** 'YYYY-MM' of an instant in Baku (UTC+4, no DST). */
export const bakuMonth = (d: Date) => new Date(d.getTime() + BAKU_OFFSET_MS).toISOString().slice(0, 7);

/** The last `n` month keys ending with the current Baku month (oldest first). */
export const lastMonths = (now = new Date(), n = DASHBOARD_MONTHS) => {
  const [y, m] = bakuMonth(now).split('-').map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
};

/** Start of the first month of `months` as an instant (Baku midnight). */
export const monthsStart = (months: string[]) => new Date(Date.parse(`${months[0]}-01T00:00:00Z`) - BAKU_OFFSET_MS);

/** Sums `value` per month key (rows outside the window are ignored). */
export const bucketByMonth = <T>(rows: T[], months: string[], at: (r: T) => Date, value: (r: T) => number = () => 1) => {
  const idx = new Map(months.map((k, i) => [k, i]));
  const out = months.map(() => 0);
  for (const r of rows) {
    const i = idx.get(bakuMonth(at(r)));
    if (i !== undefined) out[i]! += value(r);
  }
  return out;
};

/** Money rows in several currencies: the series uses `preferred` (else the most frequent one); others are counted. */
export const moneySeries = <T extends { currency: string; amountCents: number }>(rows: T[], months: string[], at: (r: T) => Date, preferred?: string | null) => {
  const freq = new Map<string, number>();
  for (const r of rows) freq.set(r.currency, (freq.get(r.currency) ?? 0) + 1);
  const top = [...freq].sort((a, b) => b[1] - a[1])[0]?.[0];
  const currency = (preferred && freq.has(preferred) ? preferred : top) ?? preferred ?? 'EUR';
  const mine = rows.filter((r) => r.currency === currency);
  const cents = bucketByMonth(mine, months, at, (r) => r.amountCents);
  return { currency, cents, totalCents: cents.reduce((a, b) => a + b, 0), otherCurrencyRows: rows.length - mine.length };
};

/**
 * Refusal rate over decided cases: refused (REJECTED, or the team stage "Ablehnung" on a not approved case)
 * ÷ (refused + approved). Cancelled and running cases are not decided. null without a decided case.
 */
export const refusalRate = (cases: { status: CaseStatus; processingStage: string | null }[]) => {
  let refused = 0;
  let approved = 0;
  for (const c of cases) {
    if (isRefused(c)) refused++;
    else if (c.status === 'APPROVED') approved++;
  }
  const decided = refused + approved;
  return { refused, approved, decided, rate: decided ? Math.round((refused / decided) * 1000) / 10 : null };
};

/** The date a client joined the partner: their first case with the partner, or the ownership date if earlier. */
export const joinDates = (cases: { clientId: string; createdAt: Date }[], owned: { id: string; ownerPartnerAt: Date | null; createdAt: Date }[]) => {
  const first = new Map<string, Date>();
  const take = (id: string, d: Date) => {
    const cur = first.get(id);
    if (!cur || d < cur) first.set(id, d);
  };
  for (const c of cases) take(c.clientId, c.createdAt);
  for (const u of owned) take(u.id, u.ownerPartnerAt ?? u.createdAt);
  return first;
};

export type DashboardActivity =
  | { id: string; kind: 'case'; at: Date; caseId: string; caseNumber: string; clientName: string }
  | { id: string; kind: 'status'; at: Date; caseId: string; caseNumber: string; clientName: string; toStatus: CaseStatus }
  | { id: string; kind: 'note'; at: Date; noteKind: string; text: string }
  | { id: string; kind: 'commission'; at: Date; caseId: string | null; caseNumber: string | null; amountCents: number; currency: string; status: string };

export interface PartnerDashboard {
  months: string[];
  cases: { total: number; byStatus: Partial<Record<CaseStatus, number>> };
  refusal: ReturnType<typeof refusalRate>;
  clients: { total: number; newPerMonth: number[]; newInWindow: number };
  commissions: ReturnType<typeof moneySeries>;
  /** Client payments of the partner's clients (ADMIN+); null for STAFF. */
  revenue: ReturnType<typeof moneySeries> | null;
  quota: PartnerQuota;
  activity: DashboardActivity[];
}

const clip = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export const partnerDashboard = async (
  partner: { id: string; clientQuota: number | null; currency: string | null },
  opts: { withRevenue: boolean; now?: Date },
): Promise<PartnerDashboard> => {
  const months = lastMonths(opts.now);
  const since = monthsStart(months);
  const [cases, owned, commissions, events, notes] = await Promise.all([
    prisma.case.findMany({
      where: { partnerId: partner.id },
      select: { id: true, number: true, clientId: true, status: true, processingStage: true, createdAt: true, client: { select: { firstName: true, lastName: true } } },
    }),
    prisma.user.findMany({ where: { ownerPartnerId: partner.id }, select: { id: true, ownerPartnerAt: true, createdAt: true } }),
    prisma.partnerCommission.findMany({
      where: { partnerId: partner.id },
      select: { id: true, caseId: true, amountCents: true, currency: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.caseEvent.findMany({
      where: { case: { partnerId: partner.id }, toStatus: { not: null } },
      select: { id: true, caseId: true, toStatus: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: ACTIVITY_LIMIT,
    }),
    prisma.partnerActivity.findMany({
      where: { referralPartnerId: partner.id },
      select: { id: true, kind: true, body: true, at: true },
      orderBy: { at: 'desc' },
      take: ACTIVITY_LIMIT,
    }),
  ]);

  const byStatus: Partial<Record<CaseStatus, number>> = {};
  for (const c of cases) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;

  const joined = joinDates(cases, owned);
  const newPerMonth = bucketByMonth([...joined.values()], months, (d) => d);

  // Earned month = when the commission was booked; cancelled ones are not earned.
  const earned = commissions.filter((c) => c.status !== 'CANCELLED');
  const commissionSeries = moneySeries(earned, months, (c) => c.createdAt, partner.currency);

  let revenue: PartnerDashboard['revenue'] = null;
  if (opts.withRevenue) {
    const caseIds = cases.map((c) => c.id);
    const clientIds = [...joined.keys()];
    const payments =
      caseIds.length || clientIds.length
        ? await prisma.clientPayment.findMany({
            where: {
              paidAt: { gte: since },
              OR: [...(caseIds.length ? [{ caseId: { in: caseIds } }] : []), ...(clientIds.length ? [{ caseId: null, clientId: { in: clientIds } }] : [])],
            },
            select: { amountCents: true, currency: true, paidAt: true },
          })
        : [];
    revenue = moneySeries(payments, months, (p) => p.paidAt, 'EUR');
  }

  const caseById = new Map(cases.map((c) => [c.id, c]));
  const nameOf = (c: (typeof cases)[number]) => `${c.client.firstName} ${c.client.lastName}`.trim();
  const activity: DashboardActivity[] = [];
  for (const c of [...cases].sort((a, b) => +b.createdAt - +a.createdAt).slice(0, ACTIVITY_LIMIT))
    activity.push({ id: `case:${c.id}`, kind: 'case', at: c.createdAt, caseId: c.id, caseNumber: c.number, clientName: nameOf(c) });
  for (const e of events) {
    const c = caseById.get(e.caseId);
    if (c && e.toStatus) activity.push({ id: `event:${e.id}`, kind: 'status', at: e.createdAt, caseId: c.id, caseNumber: c.number, clientName: nameOf(c), toStatus: e.toStatus });
  }
  for (const n of notes) activity.push({ id: `note:${n.id}`, kind: 'note', at: n.at, noteKind: n.kind, text: clip(n.body) });
  for (const c of commissions.slice(0, ACTIVITY_LIMIT))
    activity.push({
      id: `commission:${c.id}`,
      kind: 'commission',
      at: c.createdAt,
      caseId: c.caseId,
      caseNumber: c.caseId ? (caseById.get(c.caseId)?.number ?? null) : null,
      amountCents: c.amountCents,
      currency: c.currency,
      status: c.status,
    });
  activity.sort((a, b) => +b.at - +a.at);

  return {
    months,
    cases: { total: cases.length, byStatus },
    refusal: refusalRate(cases),
    clients: { total: joined.size, newPerMonth, newInWindow: newPerMonth.reduce((a, b) => a + b, 0) },
    commissions: commissionSeries,
    revenue,
    quota: quotaOf(partner.clientQuota, joined.size),
    activity: activity.slice(0, ACTIVITY_LIMIT),
  };
};
