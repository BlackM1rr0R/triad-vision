import type { CaseStatus } from '@prisma/client';
import { prisma } from '../db.js';

/**
 * Conversion funnel computed from existing tables (no event tracking): only visits come from the
 * cookie-less AnalyticsDaily counter. Every number is an aggregate — no personal data leaves here.
 */

const DAY = 24 * 60 * 60 * 1000;

export type GroupBy = 'day' | 'week' | 'month';

/** utm_source / referrer host → lower-case, [a-z0-9.-_] only, max 60 chars ("" = direct). */
export const normaliseSource = (s: string | null | undefined) =>
  (s ?? '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 60);

export const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/** Start of the bucket (YYYY-MM-DD, UTC) a moment falls into. Weeks start on Monday. */
export const bucketKey = (d: Date, groupBy: GroupBy) => {
  if (groupBy === 'month') return `${d.toISOString().slice(0, 7)}-01`;
  if (groupBy === 'week') {
    const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dow = (day.getUTCDay() + 6) % 7; // Monday = 0
    return utcDay(new Date(day.getTime() - dow * DAY));
  }
  return utcDay(d);
};

/** Every bucket between two days (inclusive), in order. */
export const bucketRange = (from: Date, to: Date, groupBy: GroupBy) => {
  const keys: string[] = [];
  let cur = new Date(`${bucketKey(from, groupBy)}T00:00:00Z`);
  const end = to.getTime();
  while (cur.getTime() <= end && keys.length < 1000) {
    keys.push(utcDay(cur));
    if (groupBy === 'month') cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    else cur = new Date(cur.getTime() + (groupBy === 'week' ? 7 : 1) * DAY);
  }
  return keys;
};

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  const v = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  return Math.round(v * 10) / 10;
};

export const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

/** Funnel stages in order. Case steps count distinct cases that reached the status in the period. */
export const FUNNEL_STAGES = [
  'visits',
  'registrations',
  'emailVerified',
  'casesCreated',
  'documentsSubmitted',
  'contractSigned',
  'embassySubmitted',
  'lodged',
  'approved',
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

const STAGE_STATUS: Partial<Record<FunnelStage, CaseStatus>> = {
  documentsSubmitted: 'DOCUMENTS_REVIEW',
  contractSigned: 'CONTRACT_SIGNED',
  embassySubmitted: 'EMBASSY_REVIEW',
  lodged: 'DECISION_PENDING',
};

/** Visa steps for the drop-off view (cohort of cases created in the period). */
export const VISA_STEPS = ['created', 'documentsSubmitted', 'contractSent', 'contractSigned', 'embassySubmitted', 'appointment', 'lodged', 'approved'] as const;

/** Furthest step index a status implies. */
const STATUS_RANK: Record<CaseStatus, number> = {
  DOCUMENTS_PENDING: 0,
  DOCUMENTS_REVIEW: 1,
  CONTRACT_SENT: 2,
  CONTRACT_SIGNED: 3,
  EMBASSY_DOCUMENTS: 3,
  EMBASSY_REVIEW: 4,
  APPOINTMENT_SCHEDULED: 5,
  DECISION_PENDING: 6,
  APPROVED: 7,
  REJECTED: 6,
  CANCELLED: 0,
};

export const EXTRA_METRICS = ['inquiries', 'bookings', 'applications'] as const;

export interface AnalyticsQuery {
  from: Date; // inclusive, 00:00 UTC
  to: Date; // inclusive day; the range ends at the end of this UTC day
  groupBy: GroupBy;
}

export const computeAnalytics = async ({ from, to, groupBy }: AnalyticsQuery) => {
  const end = new Date(to.getTime() + DAY); // exclusive
  const range = { gte: from, lt: end };
  const buckets = bucketRange(from, to, groupBy);
  const bucketIndex = new Map(buckets.map((b, i) => [b, i]));

  const [visitRows, regs, verified, casesCreated, stepEvents, approved, inquiries, bookings, applications, categories] = await Promise.all([
    prisma.analyticsDaily.findMany({ where: { metric: 'visit', day: range }, select: { day: true, source: true, count: true } }),
    prisma.user.findMany({ where: { role: 'CLIENT', createdAt: range }, select: { createdAt: true } }),
    prisma.user.findMany({ where: { role: 'CLIENT', emailVerifiedAt: range }, select: { emailVerifiedAt: true } }),
    prisma.case.findMany({
      where: { createdAt: range },
      select: { id: true, createdAt: true, status: true, visaCategoryId: true, client: { select: { createdAt: true } } },
    }),
    prisma.caseEvent.findMany({
      where: { createdAt: range, toStatus: { in: Object.values(STAGE_STATUS) as CaseStatus[] } },
      select: { caseId: true, toStatus: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.case.findMany({ where: { status: 'APPROVED', decisionAt: range }, select: { createdAt: true, decisionAt: true } }),
    prisma.inquiry.findMany({ where: { createdAt: range }, select: { createdAt: true } }),
    prisma.booking.findMany({ where: { createdAt: range }, select: { createdAt: true } }),
    prisma.vacancyApplication.findMany({ where: { createdAt: range }, select: { createdAt: true } }),
    prisma.visaCategory.findMany({ select: { id: true, slug: true, title: true, visaLabel: true } }),
  ]);

  const emptySeries = () => buckets.map(() => 0);
  const series: Record<string, number[]> = {};
  const add = (key: string, at: Date, n = 1) => {
    const s = (series[key] ??= emptySeries());
    const i = bucketIndex.get(bucketKey(at, groupBy));
    if (i !== undefined) s[i] += n;
  };
  for (const k of [...FUNNEL_STAGES, ...EXTRA_METRICS]) series[k] = emptySeries();

  // Visits and sources
  const sourceTotals = new Map<string, number>();
  for (const r of visitRows) {
    add('visits', r.day, r.count);
    sourceTotals.set(r.source, (sourceTotals.get(r.source) ?? 0) + r.count);
  }
  regs.forEach((u) => add('registrations', u.createdAt));
  verified.forEach((u) => add('emailVerified', u.emailVerifiedAt!));
  casesCreated.forEach((c) => add('casesCreated', c.createdAt));
  approved.forEach((c) => add('approved', c.decisionAt!));
  inquiries.forEach((x) => add('inquiries', x.createdAt));
  bookings.forEach((x) => add('bookings', x.createdAt));
  applications.forEach((x) => add('applications', x.createdAt));

  // Case steps: first time each case reached the step within the period.
  const seen = new Set<string>();
  for (const e of stepEvents) {
    const stage = (Object.entries(STAGE_STATUS) as [FunnelStage, CaseStatus][]).find(([, s]) => s === e.toStatus)?.[0];
    if (!stage) continue;
    const k = `${stage}:${e.caseId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    add(stage, e.createdAt);
  }

  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const totals = Object.fromEntries(Object.entries(series).map(([k, v]) => [k, sum(v)])) as Record<string, number>;
  const funnel = FUNNEL_STAGES.map((key, i) => ({
    key,
    count: totals[key],
    rate: i === 0 ? null : rate(totals[key], totals[FUNNEL_STAGES[i - 1]]),
    ofFirst: i === 0 ? 100 : rate(totals[key], totals[FUNNEL_STAGES[0]]),
  }));

  // Sources
  const visitsTotal = totals.visits;
  const sources = [...sourceTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([source, count]) => ({ source, count, share: rate(count, visitsTotal) }));

  // Medians
  const regToCase = casesCreated.map((c) => (c.createdAt.getTime() - c.client.createdAt.getTime()) / DAY).filter((d) => d >= 0);
  const caseToApproval = approved.map((c) => (c.decisionAt!.getTime() - c.createdAt.getTime()) / DAY);

  // Drop-off per visa step for the cohort of cases created in the period.
  const cohortIds = casesCreated.map((c) => c.id);
  const cohortEvents = cohortIds.length
    ? await prisma.caseEvent.findMany({ where: { caseId: { in: cohortIds }, toStatus: { not: null } }, select: { caseId: true, toStatus: true } })
    : [];
  const maxRank = new Map<string, number>();
  for (const c of casesCreated) maxRank.set(c.id, STATUS_RANK[c.status]);
  for (const e of cohortEvents) maxRank.set(e.caseId, Math.max(maxRank.get(e.caseId) ?? 0, STATUS_RANK[e.toStatus!]));
  const statusOf = new Map(casesCreated.map((c) => [c.id, c.status]));
  const dropoff = VISA_STEPS.map((step, i) => {
    const atOrBeyond = casesCreated.filter((c) => (maxRank.get(c.id) ?? 0) >= i);
    const stoppedHere = atOrBeyond.filter((c) => (maxRank.get(c.id) ?? 0) === i);
    const lost = stoppedHere.filter((c) => ['CANCELLED', 'REJECTED'].includes(statusOf.get(c.id)!)).length;
    const isLast = i === VISA_STEPS.length - 1;
    return {
      step,
      reached: atOrBeyond.length,
      rate: i === 0 ? null : rate(atOrBeyond.length, casesCreated.length),
      stepRate: i === 0 ? null : rate(atOrBeyond.length, casesCreated.filter((c) => (maxRank.get(c.id) ?? 0) >= i - 1).length),
      // cases whose furthest step is this one: still open vs. ended (cancelled / refused)
      active: isLast ? 0 : stoppedHere.length - lost,
      lost: isLast ? 0 : lost,
    };
  });

  // By visa category (same cohort)
  const catById = new Map(categories.map((c) => [c.id, c]));
  const byCat = new Map<string, { created: number; approved: number; rejected: number; cancelled: number; active: number }>();
  for (const c of casesCreated) {
    const key = c.visaCategoryId && catById.has(c.visaCategoryId) ? c.visaCategoryId : '';
    const row = byCat.get(key) ?? { created: 0, approved: 0, rejected: 0, cancelled: 0, active: 0 };
    row.created++;
    if (c.status === 'APPROVED') row.approved++;
    else if (c.status === 'REJECTED') row.rejected++;
    else if (c.status === 'CANCELLED') row.cancelled++;
    else row.active++;
    byCat.set(key, row);
  }
  const byCategory = [...byCat.entries()]
    .map(([id, r]) => {
      const cat = catById.get(id);
      return {
        id: id || null,
        slug: cat?.slug ?? null,
        visaLabel: cat?.visaLabel ?? null,
        title: (cat?.title as Record<string, string> | undefined) ?? null,
        ...r,
        approvalRate: rate(r.approved, r.approved + r.rejected),
      };
    })
    .sort((a, b) => b.created - a.created);

  return {
    range: { from: utcDay(from), to: utcDay(to), groupBy },
    funnel,
    totals: { ...totals, visitToApproved: rate(totals.approved, totals.visits), registrationToCase: rate(totals.casesCreated, totals.registrations) },
    series: { buckets, values: series },
    sources,
    medians: {
      registrationToCaseDays: median(regToCase),
      registrationToCaseSamples: regToCase.length,
      caseToApprovalDays: median(caseToApproval),
      caseToApprovalSamples: caseToApproval.length,
    },
    dropoff,
    byCategory,
  };
};
