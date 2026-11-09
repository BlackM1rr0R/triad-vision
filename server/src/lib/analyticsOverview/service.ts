import type { CaseStatus, Prisma, VisaType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { trackedDocuments, daysLeft } from '../expiry/index.js';
import { EXPIRY_WINDOW_DAYS, STUCK_DAYS, WAIT_SLA_HOURS, WAITING_STATUSES } from '../myWork.js';
import { loadInvoices } from '../finance/load.js';
import { outstandingAt } from '../finance/aggregate.js';
import { csvSafe } from '../csvSafe.js';
import { bakuMidnight, bakuParts } from '../reports/dates.js';
import { STATUS_RANK } from '../funnel.js';
import {
  FUNNEL_STEPS,
  GOAL_METRICS,
  cohortFunnel,
  bakuDayKey,
  bakuYear,
  caseSource,
  channelRows,
  goalPace,
  healthScore,
  inWin,
  inquiryChannel,
  inquirySource,
  lastDayOf,
  lastMonths,
  median,
  pctChange,
  periodWindows,
  ratio,
  weeklyCounts,
  type AttentionReason,
  type OverviewPeriod,
  type SourceKey,
  type Window,
} from './compute.js';

/**
 * Analytics overview (GET /api/admin/analytics/overview): one aggregated read for the "İcmal" landing page —
 * the 12-month trend, KPI cards, the case funnel by source, visa-type segments, cases that need a look, lead
 * channels and the annual goal. Built on the definitions already used elsewhere: revenue = paid company
 * invoices (lib/finance) + client payments in EUR, receivables = lib/finance outstandingAt + open client
 * invoices, "needs a look" = the my-work rules (waiting past the SLA, stuck, expiring documents).
 * Money is only computed for ADMIN+ (`finance: false` leaves every amount out of the response).
 */

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
export const VISA_TYPES: VisaType[] = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'];
export { FUNNEL_STEPS } from './compute.js';
const SOURCES: (SourceKey | 'all')[] = ['all', 'partner', 'site', 'agent'];
const ATTENTION_ROWS = 8;
const TREND_WEEKS = 8;

export const GOAL_KEY = 'analyticsOverviewGoal';
export const goalSchema = z.object({
  metric: z.enum(GOAL_METRICS),
  /** Visas: count; revenue: euro cents. */
  target: z.number().int().min(1).max(1_000_000_000_00),
  year: z.number().int().min(2020).max(2100),
});
export type OverviewGoal = z.infer<typeof goalSchema>;

export const readGoal = async (): Promise<OverviewGoal | null> => {
  const row = await prisma.setting.findUnique({ where: { key: GOAL_KEY } });
  const parsed = goalSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : null;
};

export const writeGoal = async (goal: OverviewGoal) => {
  await prisma.setting.upsert({ where: { key: GOAL_KEY }, create: { key: GOAL_KEY, value: goal }, update: { value: goal } });
  invalidateOverview();
};

const sourceSelect = { partnerId: true, client: { select: { ownerPartnerId: true, referredByAgentId: true } } } satisfies Prisma.CaseSelect;

const initials = (first: string, last: string) => `${first.trim().charAt(0)}${last.trim().charAt(0)}`.toUpperCase() || '?';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Revenue rows (cents) of [start, end): paid company invoices (gross) and client payments in EUR. */
const loadRevenue = async (start: Date, end: Date) => {
  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({ where: { status: 'PAID', paidAt: { gte: start, lt: end } }, select: { paidAt: true, grossCents: true } }),
    prisma.clientPayment.findMany({ where: { paidAt: { gte: start, lt: end }, currency: 'EUR' }, select: { paidAt: true, amountCents: true, caseId: true } }),
  ]);
  return { invoices: invoices.map((i) => ({ at: i.paidAt!, cents: i.grossCents })), payments: payments.map((p) => ({ at: p.paidAt, cents: p.amountCents, caseId: p.caseId })) };
};

export const buildOverview = async (opts: { period: OverviewPeriod; finance: boolean; now?: Date }) => {
  const now = opts.now ?? new Date();
  const { cur, prev } = periodWindows(opts.period, now);
  const months = lastMonths(12, now);
  const seriesStart = months[0].start;
  const scanStart = new Date(Math.min(prev.start.getTime(), seriesStart.getTime()));
  const both: Prisma.DateTimeFilter = { gte: prev.start, lt: cur.end };
  const year = bakuYear(now);
  const yearStart = bakuMidnight(year, 0, 1);

  const [inquiries, createdCases, decided, cancelled, openTrendCases, openNow, goal] = await Promise.all([
    prisma.inquiry.findMany({ where: { createdAt: both }, select: { createdAt: true, partnerId: true, agentId: true, source: true, landingPageId: true, utm: true, convertedUserId: true } }),
    prisma.case.findMany({ where: { createdAt: { gte: scanStart, lt: cur.end } }, select: { id: true, createdAt: true, visaType: true, status: true, clientId: true, ...sourceSelect } }),
    prisma.case.findMany({
      where: { status: { in: ['APPROVED', 'REJECTED'] }, decisionAt: { gte: new Date(Math.min(scanStart.getTime(), yearStart.getTime())), lt: cur.end } },
      select: { createdAt: true, decisionAt: true, status: true, visaType: true, ...sourceSelect },
    }),
    prisma.case.count({ where: { status: 'CANCELLED', closedAt: { gte: cur.start, lt: cur.end } } }),
    // Open at some point of the last 12 months: still open, or closed after the series start.
    prisma.case.findMany({
      where: { createdAt: { lt: cur.end }, OR: [{ status: { notIn: FINAL_STATUSES } }, { closedAt: { gte: seriesStart } }, { closedAt: null, decisionAt: { gte: seriesStart } }] },
      select: { createdAt: true, closedAt: true, decisionAt: true, status: true },
    }),
    prisma.case.count({ where: { status: { notIn: FINAL_STATUSES } } }),
    readGoal(),
  ]);

  // ── 12-month series ──
  const monthIdx = (d: Date) => months.findIndex((m) => d >= m.start && d < m.end);
  const casesByType: Record<string, number[]> = Object.fromEntries(VISA_TYPES.map((v) => [v, months.map(() => 0)]));
  for (const c of createdCases) {
    const i = monthIdx(c.createdAt);
    if (i >= 0) casesByType[c.visaType][i]++;
  }
  const approvedM = months.map(() => 0);
  const rejectedM = months.map(() => 0);
  const daysM: number[][] = months.map(() => []);
  for (const c of decided) {
    const i = monthIdx(c.decisionAt!);
    if (i < 0) continue;
    if (c.status === 'APPROVED') {
      approvedM[i]++;
      daysM[i].push((c.decisionAt!.getTime() - c.createdAt.getTime()) / DAY);
    } else rejectedM[i]++;
  }
  const closedOf = (c: (typeof openTrendCases)[number]) => c.closedAt ?? (FINAL_STATUSES.includes(c.status) ? (c.decisionAt ?? c.createdAt) : null);
  const openAt = (at: Date) =>
    openTrendCases.filter((c) => {
      const closed = closedOf(c);
      return c.createdAt < at && (!closed || closed >= at);
    }).length;
  const activeTrend = months.map((m) => openAt(m.end));

  // ── Period figures ──
  const decidedIn = (w: Window) => decided.filter((c) => inWin(c.decisionAt, w));
  const approvalOf = (w: Window) => {
    const d = decidedIn(w);
    return ratio(d.filter((c) => c.status === 'APPROVED').length, d.length);
  };
  const processingOf = (w: Window) => median(decidedIn(w).filter((c) => c.status === 'APPROVED').map((c) => (c.decisionAt!.getTime() - c.createdAt.getTime()) / DAY));
  const approvedIn = (w: Window) => decidedIn(w).filter((c) => c.status === 'APPROVED').length;
  const createdIn = (w: Window) => createdCases.filter((c) => inWin(c.createdAt, w));
  const inquiriesIn = (w: Window) => inquiries.filter((i) => inWin(i.createdAt, w));

  // ── Cohort funnel per source: the leads / cases that entered in each window, followed up to now ──
  const cohortIds = [...createdIn(cur), ...createdIn(prev)].map((c) => c.id);
  const [cohortEvents, cohortArrivals] = cohortIds.length
    ? await Promise.all([
        prisma.caseEvent.findMany({ where: { caseId: { in: cohortIds }, toStatus: { not: null } }, select: { caseId: true, toStatus: true } }),
        prisma.arrivalPlan.findMany({ where: { caseId: { in: cohortIds }, status: 'COMPLETED' }, select: { caseId: true } }),
      ])
    : [[], []];
  const maxRank = new Map<string, number>();
  for (const e of cohortEvents) maxRank.set(e.caseId, Math.max(maxRank.get(e.caseId) ?? 0, STATUS_RANK[e.toStatus as CaseStatus]));
  const arrivedIds = new Set(cohortArrivals.map((a) => a.caseId));
  const cohortOf = (w: Window) => ({
    inquiries: inquiriesIn(w).map((i) => ({ source: inquirySource(i), convertedUserId: i.convertedUserId })),
    cases: createdIn(w).map((c) => ({
      clientId: c.clientId,
      source: caseSource(c),
      maxRank: Math.max(STATUS_RANK[c.status], maxRank.get(c.id) ?? 0),
      approved: c.status === 'APPROVED',
      arrived: arrivedIds.has(c.id),
    })),
  });
  const curCohort = cohortOf(cur);
  const prevCohort = cohortOf(prev);
  const funnel = Object.fromEntries(
    SOURCES.map((s) => {
      const now = cohortFunnel(curCohort.inquiries, curCohort.cases, s);
      const before = cohortFunnel(prevCohort.inquiries, prevCohort.cases, s);
      return [s, now.map((step, i) => ({ key: step.key, count: step.count, prev: before[i].count }))];
    }),
  ) as Record<SourceKey | 'all', { key: (typeof FUNNEL_STEPS)[number]; count: number; prev: number }[]>;

  // ── Money (ADMIN+) ──
  let revenue: { months: { invoices: number[]; payments: number[] }; cur: number; prev: number; year: number; bySegment: Record<string, { cur: number; prev: number }> } | null = null;
  let receivables: { grossCents: number; overdueCents: number; count: number; overdueCount: number } | null = null;
  if (opts.finance) {
    const rev = await loadRevenue(new Date(Math.min(scanStart.getTime(), yearStart.getTime())), cur.end);
    const inv = months.map(() => 0);
    const pay = months.map(() => 0);
    for (const r of rev.invoices) {
      const i = monthIdx(r.at);
      if (i >= 0) inv[i] += r.cents;
    }
    for (const r of rev.payments) {
      const i = monthIdx(r.at);
      if (i >= 0) pay[i] += r.cents;
    }
    const total = (w: Window) => sum(rev.invoices.filter((r) => inWin(r.at, w)).map((r) => r.cents)) + sum(rev.payments.filter((r) => inWin(r.at, w)).map((r) => r.cents));
    // Segment revenue: client payments linked to a case of that visa type.
    const payCaseIds = [...new Set(rev.payments.filter((p) => p.caseId && (inWin(p.at, cur) || inWin(p.at, prev))).map((p) => p.caseId!))];
    const typeOf = new Map(
      payCaseIds.length ? (await prisma.case.findMany({ where: { id: { in: payCaseIds } }, select: { id: true, visaType: true } })).map((c) => [c.id, c.visaType] as const) : [],
    );
    const bySegment: Record<string, { cur: number; prev: number }> = Object.fromEntries(VISA_TYPES.map((v) => [v, { cur: 0, prev: 0 }]));
    for (const p of rev.payments) {
      const t = p.caseId ? typeOf.get(p.caseId) : undefined;
      if (!t) continue;
      if (inWin(p.at, cur)) bySegment[t].cur += p.cents;
      else if (inWin(p.at, prev)) bySegment[t].prev += p.cents;
    }
    revenue = { months: { invoices: inv, payments: pay }, cur: total(cur), prev: total(prev), year: total({ start: yearStart, end: cur.end }), bySegment };

    const [companyInvoices, clientOpen] = await Promise.all([
      loadInvoices({ from: '', to: '', start: now, end: now }),
      prisma.clientInvoice.findMany({ where: { status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] }, issueDate: { lt: now } }, select: { grossCents: true, paidCents: true, dueDate: true } }),
    ]);
    const company = outstandingAt(companyInvoices, now);
    const clientRows = clientOpen.map((c) => ({ cents: Math.max(0, c.grossCents - c.paidCents), overdue: now.getTime() - c.dueDate.getTime() >= DAY })).filter((c) => c.cents > 0);
    receivables = {
      grossCents: company.grossCents + sum(clientRows.map((c) => c.cents)),
      overdueCents: company.overdueGrossCents + sum(clientRows.filter((c) => c.overdue).map((c) => c.cents)),
      count: company.count + clientRows.length,
      overdueCount: company.overdueCount + clientRows.filter((c) => c.overdue).length,
    };
  }

  // ── Segments by visa type ──
  const curCreated = createdIn(cur);
  const prevCreated = createdIn(prev);
  const segments = VISA_TYPES.map((v) => ({
    key: v,
    count: curCreated.filter((c) => c.visaType === v).length,
    prev: prevCreated.filter((c) => c.visaType === v).length,
    revenueCents: revenue ? revenue.bySegment[v].cur : null,
    revenuePrevCents: revenue ? revenue.bySegment[v].prev : null,
  }))
    .filter((s) => s.count > 0 || s.prev > 0 || (s.revenueCents ?? 0) > 0)
    .map((s) => ({ ...s, share: ratio(s.count, curCreated.length), delta: pctChange(s.count, s.prev) }));

  // ── Needs a look ──
  const attention = await attentionCases(now);

  // ── Channels ──
  const channels = channelRows(inquiriesIn(cur).map(inquiryChannel), inquiriesIn(prev).map(inquiryChannel));

  // ── Goal ──
  const goalMetric = goal?.metric ?? 'visas';
  const goalHidden = goalMetric === 'revenue' && !opts.finance;
  const goalValue = goalMetric === 'visas' ? decided.filter((c) => c.status === 'APPROVED' && c.decisionAt! >= yearStart).length : (revenue?.year ?? 0);
  const goalOut = goalHidden
    ? { metric: goalMetric, hidden: true as const }
    : { metric: goalMetric, hidden: false as const, ...goalPace(goal && goal.year === year ? goal.target : null, goalValue, year, now) };

  const newCases = curCreated.length;
  const newCasesPrev = prevCreated.length;
  return {
    generatedAt: now.toISOString(),
    period: { key: opts.period, from: bakuDayKey(cur.start), to: lastDayOf(cur), prevFrom: bakuDayKey(prev.start), prevTo: lastDayOf(prev) },
    finance: opts.finance,
    summary: {
      newCases,
      newCasesPrev,
      newCasesDelta: pctChange(newCases, newCasesPrev),
      newInquiries: inquiriesIn(cur).length,
      newInquiriesPrev: inquiriesIn(prev).length,
      approvals: approvedIn(cur),
      approvalsPrev: approvedIn(prev),
      attention: attention.total,
      revenueCents: revenue?.cur ?? null,
      revenuePrevCents: revenue?.prev ?? null,
    },
    monthly: {
      months: months.map((m) => m.key),
      casesByType,
      visas: { approved: approvedM, rejected: rejectedM },
      revenue: revenue ? revenue.months : null,
    },
    kpis: {
      activeCases: { value: openNow, prev: openAt(cur.start), trend: activeTrend },
      approvalRate: { value: approvalOf(cur), prev: approvalOf(prev), trend: months.map((_, i) => ratio(approvedM[i], approvedM[i] + rejectedM[i])) },
      processingDays: { value: processingOf(cur), prev: processingOf(prev), trend: daysM.map((d) => median(d)) },
      receivables,
    },
    funnel,
    segments,
    movement: { created: newCases, approved: approvedIn(cur), rejected: decidedIn(cur).length - approvedIn(cur), cancelled },
    attention,
    channels,
    goal: goalOut,
  };
};

export type Overview = Awaited<ReturnType<typeof buildOverview>>;

/** Cases that need a look (team-wide my-work rules), the least healthy first. */
const attentionCases = async (now: Date) => {
  const stuckCutoff = new Date(now.getTime() - STUCK_DAYS * DAY);
  const waitCutoff = new Date(now.getTime() - WAIT_SLA_HOURS * HOUR);
  const [stuck, waiting, docs] = await Promise.all([
    prisma.case.findMany({
      where: {
        status: { notIn: [...FINAL_STATUSES, ...WAITING_STATUSES] },
        updatedAt: { lt: stuckCutoff },
        events: { none: { createdAt: { gte: stuckCutoff } } },
        messages: { none: { createdAt: { gte: stuckCutoff } } },
      },
      select: { id: true },
    }),
    prisma.case.findMany({ where: { status: { in: WAITING_STATUSES }, updatedAt: { lt: waitCutoff } }, select: { id: true } }),
    trackedDocuments({ until: new Date(now.getTime() + EXPIRY_WINDOW_DAYS * DAY), caseWhere: {} }),
  ]);
  const reasons = new Map<string, { reasons: Set<AttentionReason>; expiryDays: number | null }>();
  const add = (id: string, r: AttentionReason, expiryDays: number | null = null) => {
    const row = reasons.get(id) ?? { reasons: new Set<AttentionReason>(), expiryDays: null };
    row.reasons.add(r);
    if (expiryDays !== null) row.expiryDays = row.expiryDays === null ? expiryDays : Math.min(row.expiryDays, expiryDays);
    reasons.set(id, row);
  };
  stuck.forEach((c) => add(c.id, 'stuck'));
  waiting.forEach((c) => add(c.id, 'waiting'));
  for (const d of docs) {
    const left = daysLeft(d.expiresAt!, now);
    add(d.case.id, left <= 0 ? 'expired' : 'expiring', left);
  }
  const ids = [...reasons.keys()];
  if (!ids.length) return { total: 0, rows: [] };
  const trendStart = new Date(now.getTime() - TREND_WEEKS * 7 * DAY);
  const [cases, events] = await Promise.all([
    prisma.case.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        number: true,
        status: true,
        visaType: true,
        updatedAt: true,
        client: { select: { firstName: true, lastName: true } },
        assignedStaff: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.caseEvent.findMany({ where: { caseId: { in: ids }, createdAt: { gte: trendStart } }, select: { caseId: true, createdAt: true } }),
  ]);
  const eventsOf = new Map<string, Date[]>();
  for (const e of events) eventsOf.set(e.caseId, [...(eventsOf.get(e.caseId) ?? []), e.createdAt]);
  const rows = cases
    .map((c) => {
      const r = reasons.get(c.id)!;
      const evs = eventsOf.get(c.id) ?? [];
      const last = new Date(Math.max(c.updatedAt.getTime(), ...evs.map((d) => d.getTime())));
      const idleDays = Math.floor((now.getTime() - last.getTime()) / DAY);
      const list = [...r.reasons];
      return {
        caseId: c.id,
        number: c.number,
        client: `${c.client.firstName} ${c.client.lastName}`.trim(),
        initials: initials(c.client.firstName, c.client.lastName),
        visaType: c.visaType,
        status: c.status,
        reasons: list,
        expiryDays: r.expiryDays,
        idleDays,
        lastActivityAt: last.toISOString(),
        health: healthScore({ idleDays, reasons: list, expiryDays: r.expiryDays }),
        trend: weeklyCounts(evs, now, TREND_WEEKS),
        assignee: c.assignedStaff ? `${c.assignedStaff.firstName} ${c.assignedStaff.lastName}`.trim() : null,
      };
    })
    .sort((a, b) => a.health - b.health || b.idleDays - a.idleDays || a.number.localeCompare(b.number));
  return { total: rows.length, rows: rows.slice(0, ATTENTION_ROWS) };
};

// ─── Live activity (privacy-safe: event types, case numbers, channels; no names, notes or texts) ──────

export const overviewActivity = async (opts: { finance: boolean; limit?: number; now?: Date }) => {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 12;
  const p = bakuParts(now);
  const todayStart = bakuMidnight(p.y, p.m, p.d);
  const [events, inquiries, payments, eventsToday, inquiriesToday] = await Promise.all([
    prisma.caseEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, type: true, toStatus: true, createdAt: true, case: { select: { id: true, number: true, visaType: true } } },
    }),
    prisma.inquiry.findMany({ orderBy: { createdAt: 'desc' }, take: limit, select: { id: true, kind: true, createdAt: true, partnerId: true, agentId: true, source: true, landingPageId: true, utm: true } }),
    opts.finance
      ? prisma.clientPayment.findMany({ orderBy: { paidAt: 'desc' }, take: limit, where: { paidAt: { lte: now } }, select: { id: true, paidAt: true, amountCents: true, currency: true, caseId: true } })
      : Promise.resolve([]),
    prisma.caseEvent.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.inquiry.count({ where: { createdAt: { gte: todayStart } } }),
  ]);
  const payCases = new Map(
    payments.length
      ? (await prisma.case.findMany({ where: { id: { in: payments.map((p) => p.caseId).filter((x): x is string => !!x) } }, select: { id: true, number: true, visaType: true } })).map((c) => [c.id, c] as const)
      : [],
  );
  const items = [
    ...events.map((e) => ({ id: `e:${e.id}`, kind: 'case' as const, type: e.type, toStatus: e.toStatus, at: e.createdAt, caseId: e.case.id, caseNumber: e.case.number, visaType: e.case.visaType, channel: null, amountCents: null, currency: null })),
    ...inquiries.map((i) => ({ id: `i:${i.id}`, kind: 'inquiry' as const, type: i.kind, toStatus: null, at: i.createdAt, caseId: null, caseNumber: null, visaType: null, channel: inquiryChannel(i), amountCents: null, currency: null })),
    ...payments.map((p) => {
      const c = p.caseId ? payCases.get(p.caseId) : undefined;
      return { id: `p:${p.id}`, kind: 'payment' as const, type: 'PAYMENT', toStatus: null, at: p.paidAt, caseId: c?.id ?? null, caseNumber: c?.number ?? null, visaType: c?.visaType ?? null, channel: null, amountCents: p.amountCents, currency: p.currency };
    }),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit)
    .map((x) => ({ ...x, at: x.at.toISOString() }));
  return { generatedAt: now.toISOString(), today: eventsToday + inquiriesToday, items };
};

// ─── Cache (60 s; `fresh` bypasses it, writing the goal clears it) ──────

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<string, { at: number; value: Overview }>();
const inflight = new Map<string, Promise<Overview>>();

export const cachedOverview = async (opts: { period: OverviewPeriod; finance: boolean; fresh?: boolean }) => {
  const key = `${opts.period}|${opts.finance ? 'f' : '-'}`;
  const hit = cache.get(key);
  if (!opts.fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const pending = !opts.fresh && inflight.get(key);
  if (pending) return pending;
  const p = buildOverview(opts)
    .then((value) => {
      cache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
};

export const invalidateOverview = () => cache.clear();

// ─── CSV export of the aggregates ───────────────────────────────────────

const cell = (v: string | number | null | undefined) => {
  const s = csvSafe(v === null || v === undefined ? '' : String(v));
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One long table: section, key, current, previous (amounts in euro, two decimals). */
export const overviewCsv = (o: Overview) => {
  const eur = (c: number | null | undefined) => (c === null || c === undefined ? '' : (c / 100).toFixed(2));
  const rows: (string | number | null)[][] = [['section', 'key', 'current', 'previous']];
  rows.push(['period', 'range', `${o.period.from}..${o.period.to}`, `${o.period.prevFrom}..${o.period.prevTo}`]);
  rows.push(['summary', 'newCases', o.summary.newCases, o.summary.newCasesPrev]);
  rows.push(['summary', 'newInquiries', o.summary.newInquiries, o.summary.newInquiriesPrev]);
  rows.push(['summary', 'approvals', o.summary.approvals, o.summary.approvalsPrev]);
  rows.push(['summary', 'needsAttention', o.summary.attention, null]);
  if (o.finance) rows.push(['summary', 'revenueEur', eur(o.summary.revenueCents), eur(o.summary.revenuePrevCents)]);
  rows.push(['kpi', 'activeCases', o.kpis.activeCases.value, o.kpis.activeCases.prev]);
  rows.push(['kpi', 'approvalRatePct', o.kpis.approvalRate.value, o.kpis.approvalRate.prev]);
  rows.push(['kpi', 'processingDaysMedian', o.kpis.processingDays.value, o.kpis.processingDays.prev]);
  if (o.kpis.receivables) {
    rows.push(['kpi', 'receivablesEur', eur(o.kpis.receivables.grossCents), null]);
    rows.push(['kpi', 'receivablesOverdueEur', eur(o.kpis.receivables.overdueCents), null]);
  }
  for (const [source, steps] of Object.entries(o.funnel)) for (const s of steps) rows.push([`funnel:${source}`, s.key, s.count, s.prev]);
  for (const s of o.segments) {
    rows.push(['segment', s.key, s.count, s.prev]);
    if (o.finance) rows.push(['segmentRevenueEur', s.key, eur(s.revenueCents), eur(s.revenuePrevCents)]);
  }
  for (const c of o.channels) rows.push(['channel', c.key, c.count, c.prev]);
  o.monthly.months.forEach((m, i) => {
    for (const v of VISA_TYPES) rows.push([`month:${m}`, `cases:${v}`, o.monthly.casesByType[v][i], null]);
    rows.push([`month:${m}`, 'visasApproved', o.monthly.visas.approved[i], null]);
    rows.push([`month:${m}`, 'visasRejected', o.monthly.visas.rejected[i], null]);
    if (o.monthly.revenue) {
      rows.push([`month:${m}`, 'revenueInvoicesEur', eur(o.monthly.revenue.invoices[i]), null]);
      rows.push([`month:${m}`, 'revenuePaymentsEur', eur(o.monthly.revenue.payments[i]), null]);
    }
  });
  return `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
};
