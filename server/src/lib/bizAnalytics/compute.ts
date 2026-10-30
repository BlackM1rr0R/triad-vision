import type { CaseStatus } from '@prisma/client';
import { STAGE_STATUSES, monthOf, round1, mean, type StageStatus, type StatusEvent } from '../kpi/compute.js';
import { median, rate } from '../funnel.js';
import { isRefused } from '../caseProcessing/index.js';

/**
 * Pure maths of the management analytics "Biznes analitikası" (no database access, unit tested): time per visa
 * stage with its monthly / per-category trend and today's bottleneck, partner / agent / staff performance and the
 * client funnel by registration month. Months are Baku calendar months ("2026-10"), like the KPI card.
 */

const DAY = 24 * 60 * 60 * 1000;
const FINAL: CaseStatus[] = ['APPROVED', 'REJECTED', 'CANCELLED'];

export { STAGE_STATUSES, type StageStatus };

// ─── Months ─────────────────────────────────────────────────────────────

/** Every Baku month touched by [start, end) (oldest first). */
export const monthsIn = (start: Date, end: Date) => {
  const first = monthOf(start);
  const last = monthOf(new Date(Math.max(start.getTime(), end.getTime() - 1)));
  const out: string[] = [];
  let [y, m] = first.split('-').map(Number);
  while (out.length < 400) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(key);
    if (key === last) break;
    m++;
    if (m > 12) (m = 1), y++;
  }
  return out;
};

const p75 = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return round1(s[Math.min(s.length - 1, Math.ceil(s.length * 0.75) - 1)]);
};

// ─── Time per stage ─────────────────────────────────────────────────────

export interface StageTime {
  /** Days spent in the stage (several visits add up; an open stage counts until `now`). */
  days: number;
  /** When the case last left the stage; null while the case is still in it. */
  exitedAt: Date | null;
}

/**
 * Days per status of one case from its status changes (same rules as the KPI's stageDurations: the case starts in
 * DOCUMENTS_PENDING at `createdAt` unless the first change says otherwise; final statuses are not measured), plus
 * when the stage was left — trends put a stage into the month it ended in.
 */
export const caseStageTimes = (createdAt: Date, events: StatusEvent[], now: Date): Partial<Record<StageStatus, StageTime>> => {
  const changes = events.filter((e) => e.toStatus && e.fromStatus !== e.toStatus).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const out: Partial<Record<StageStatus, StageTime>> = {};
  let status: CaseStatus = changes[0]?.fromStatus ?? 'DOCUMENTS_PENDING';
  let since = createdAt.getTime();
  const add = (s: CaseStatus, until: number, open: boolean) => {
    if (!(STAGE_STATUSES as readonly string[]).includes(s) || until < since) return;
    const cur = out[s as StageStatus] ?? { days: 0, exitedAt: null };
    out[s as StageStatus] = { days: cur.days + (until - since) / DAY, exitedAt: open ? null : new Date(until) };
  };
  for (const e of changes) {
    const prev = status;
    status = e.toStatus!;
    // No "from" = the initial status written with the case (CASE_CREATED, a few ms after createdAt): nothing ends.
    if (e.fromStatus === null) continue;
    add(prev, e.createdAt.getTime(), false);
    since = Math.max(since, e.createdAt.getTime());
  }
  if (!FINAL.includes(status)) add(status, Math.max(since, now.getTime()), true);
  return out;
};

export interface StageCase {
  createdAt: Date;
  categoryId: string | null;
  events: StatusEvent[];
}

export interface StageStat {
  stage: StageStatus;
  /** Cases that finished the stage in the period. */
  cases: number;
  avgDays: number | null;
  medianDays: number | null;
  p75Days: number | null;
}

/**
 * Average / median days per stage over the stages that ended in [start, end), by month (median of the stages that
 * ended in that month) and by visa category. Open stages are left out here (see bottleneck).
 */
export const stageStats = (cases: StageCase[], start: Date, end: Date, now: Date) => {
  const months = monthsIn(start, end);
  const monthIdx = new Map(months.map((m, i) => [m, i]));
  const all = new Map<StageStatus, number[]>(STAGE_STATUSES.map((s) => [s, []]));
  const perMonth = new Map<StageStatus, number[][]>(STAGE_STATUSES.map((s) => [s, months.map(() => [])]));
  const perCat = new Map<string, { cases: number; stages: Map<StageStatus, number[]> }>();
  for (const c of cases) {
    const times = caseStageTimes(c.createdAt, c.events, now);
    let counted = false;
    for (const s of STAGE_STATUSES) {
      const tm = times[s];
      if (!tm?.exitedAt || tm.exitedAt < start || tm.exitedAt >= end) continue;
      counted = true;
      all.get(s)!.push(tm.days);
      const i = monthIdx.get(monthOf(tm.exitedAt));
      if (i !== undefined) perMonth.get(s)![i].push(tm.days);
      const key = c.categoryId ?? '';
      let cat = perCat.get(key);
      if (!cat) perCat.set(key, (cat = { cases: 0, stages: new Map() }));
      cat.stages.set(s, [...(cat.stages.get(s) ?? []), tm.days]);
    }
    if (counted) perCat.get(c.categoryId ?? '')!.cases++;
  }
  const stat = (stage: StageStatus, xs: number[]): StageStat => {
    const m = mean(xs);
    return { stage, cases: xs.length, avgDays: m === null ? null : round1(m), medianDays: median(xs), p75Days: p75(xs) };
  };
  const stages = STAGE_STATUSES.map((s) => stat(s, all.get(s)!));
  // The slowest stage of the period: highest median (ties: more cases).
  const slowest = stages.filter((s) => s.medianDays !== null).sort((a, b) => b.medianDays! - a.medianDays! || b.cases - a.cases)[0]?.stage ?? null;
  return {
    stages,
    slowest,
    trend: { months, rows: STAGE_STATUSES.map((s) => ({ stage: s, medianDays: perMonth.get(s)!.map((xs) => median(xs)), cases: perMonth.get(s)!.map((xs) => xs.length) })) },
    byCategory: [...perCat.entries()]
      .map(([id, v]) => ({
        categoryId: id || null,
        cases: v.cases,
        medianDays: Object.fromEntries(STAGE_STATUSES.filter((s) => v.stages.has(s)).map((s) => [s, median(v.stages.get(s)!)])) as Partial<Record<StageStatus, number | null>>,
        // Typical end-to-end time: the sum of the stage medians.
        totalMedianDays: round1(STAGE_STATUSES.reduce((a, s) => a + (v.stages.has(s) ? (median(v.stages.get(s)!) ?? 0) : 0), 0)),
      }))
      .sort((a, b) => b.cases - a.cases),
  };
};

export interface OpenCase {
  status: CaseStatus;
  /** When the case entered its current status. */
  since: Date;
}

/**
 * Where open cases sit right now: per stage the cases, the median days they have been waiting, the case-days
 * waiting in total and how many wait longer than the typical (p75) time of the stage. The bottleneck is the stage
 * holding the most case-days.
 */
export const bottleneck = (open: OpenCase[], typical: Partial<Record<StageStatus, number | null>>, now: Date) => {
  const rows = STAGE_STATUSES.map((stage) => {
    const waits = open.filter((c) => c.status === stage).map((c) => Math.max(0, (now.getTime() - c.since.getTime()) / DAY));
    const limit = typical[stage];
    return {
      stage,
      open: waits.length,
      medianWaitingDays: median(waits),
      waitingDays: round1(waits.reduce((a, b) => a + b, 0)),
      overTypical: typeof limit === 'number' ? waits.filter((w) => w > limit).length : 0,
    };
  });
  const top = [...rows].sort((a, b) => b.waitingDays - a.waitingDays || b.open - a.open)[0];
  return { rows, stage: top && top.open > 0 ? top.stage : null };
};

// ─── Partner / agent / staff performance ────────────────────────────────

export interface PerfCase {
  clientId: string;
  createdAt: Date;
  status: CaseStatus;
  processingStage: string | null;
  /** decisionAt, else closedAt / the "Ablehnung" mark — the end of processing. */
  decidedAt: Date | null;
  revenueCents: number;
  commissionCents: number;
}

export interface PerfRow {
  id: string | null;
  name: string | null;
  /** Clients brought in the period (agents: referred clients who registered then); null where not tracked. */
  clients: number | null;
  clientsWithCase: number | null;
  /** % of those clients who opened a case. */
  caseRate: number | null;
  cases: number;
  active: number;
  approved: number;
  refused: number;
  cancelled: number;
  /** approved / decided, refused / decided (%). */
  approvalRate: number | null;
  refusalRate: number | null;
  avgDays: number | null;
  medianDays: number | null;
  revenueCents: number;
  commissionCents: number;
  /** Commission as % of revenue. */
  commissionShare: number | null;
}

/** One row per group: the cases opened in the period plus (agents) the clients brought. */
export const perfRow = (id: string | null, name: string | null, cases: PerfCase[], clients?: { total: number; withCase: number }): PerfRow => {
  let approved = 0;
  let refused = 0;
  let cancelled = 0;
  let active = 0;
  const days: number[] = [];
  for (const c of cases) {
    const ref = isRefused(c);
    if (ref) refused++;
    else if (c.status === 'APPROVED') approved++;
    else if (c.status === 'CANCELLED') cancelled++;
    else active++;
    if ((ref || c.status === 'APPROVED') && c.decidedAt) days.push(Math.max(0, (c.decidedAt.getTime() - c.createdAt.getTime()) / DAY));
  }
  const avg = mean(days);
  const revenue = cases.reduce((a, c) => a + c.revenueCents, 0);
  const commission = cases.reduce((a, c) => a + c.commissionCents, 0);
  return {
    id,
    name,
    clients: clients ? clients.total : null,
    clientsWithCase: clients ? clients.withCase : null,
    caseRate: clients ? rate(clients.withCase, clients.total) : null,
    cases: cases.length,
    active,
    approved,
    refused,
    cancelled,
    approvalRate: rate(approved, approved + refused),
    refusalRate: rate(refused, approved + refused),
    avgDays: avg === null ? null : round1(avg),
    medianDays: median(days),
    revenueCents: revenue,
    commissionCents: commission,
    commissionShare: rate(commission, revenue),
  };
};

/** Rows grouped by key (null key = "without"), most cases first, the "without" row last. */
export const perfRows = (
  cases: (PerfCase & { key: string | null })[],
  nameOf: (key: string) => string | null,
  clientsOf?: Map<string, { total: number; withCase: number }>,
) => {
  const groups = new Map<string, PerfCase[]>();
  for (const c of cases) groups.set(c.key ?? '', [...(groups.get(c.key ?? '') ?? []), c]);
  for (const k of clientsOf?.keys() ?? []) if (!groups.has(k)) groups.set(k, []);
  const rows = [...groups.entries()].map(([k, list]) => perfRow(k || null, k ? nameOf(k) : null, list, clientsOf ? (clientsOf.get(k) ?? { total: 0, withCase: 0 }) : undefined));
  return rows.sort((a, b) => Number(!a.id) - Number(!b.id) || b.cases - a.cases || (b.clients ?? 0) - (a.clients ?? 0) || (a.name ?? '').localeCompare(b.name ?? ''));
};

// ─── Funnel by registration month ───────────────────────────────────────

export const FUNNEL_STEPS = ['registered', 'consultation', 'caseOpened', 'documentsComplete', 'approved', 'departed'] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export interface FunnelClient {
  registeredAt: Date;
  consultation: boolean;
  /** Furthest visa step of the client's cases (lib/funnel STATUS_RANK: 2 = documents accepted, 7 = approved); null without a case. */
  caseRank: number | null;
  departed: boolean;
}

/**
 * Furthest funnel step (index into FUNNEL_STEPS). A later step implies the earlier ones, so a client who opened a
 * case without booking a consultation still counts as past "consultation" — every step is "reached or beyond".
 */
export const funnelStepOf = (c: FunnelClient) => {
  if (c.departed) return 5;
  if (c.caseRank !== null && c.caseRank >= 7) return 4;
  if (c.caseRank !== null && c.caseRank >= 2) return 3;
  if (c.caseRank !== null) return 2;
  return c.consultation ? 1 : 0;
};

const steps = (counts: number[]) =>
  FUNNEL_STEPS.map((key, i) => ({ key, count: counts[i], rate: i === 0 ? null : rate(counts[i], counts[i - 1]), ofFirst: i === 0 ? (counts[0] ? 100 : null) : rate(counts[i], counts[0]) }));

/** Funnel totals and one cohort row per registration month. */
export const funnelCohorts = (clients: FunnelClient[], months: string[]) => {
  const total = FUNNEL_STEPS.map(() => 0);
  const perMonth = new Map(months.map((m) => [m, FUNNEL_STEPS.map(() => 0)]));
  for (const c of clients) {
    const furthest = funnelStepOf(c);
    const row = perMonth.get(monthOf(c.registeredAt));
    for (let i = 0; i <= furthest; i++) {
      total[i]++;
      if (row) row[i]++;
    }
  }
  return { steps: steps(total), cohorts: months.map((month) => ({ month, steps: steps(perMonth.get(month)!) })) };
};
