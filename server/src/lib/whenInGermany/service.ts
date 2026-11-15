import type { CaseStatus } from '@prisma/client';
import { prisma } from '../../db.js';
import { bakuParts } from '../reports/dates.js';
import { PATH_LABEL_RE } from '../publicAi/eligibility.js';
import { buildStatsTable, MIN_GROUP_SAMPLE, type CaseRow, type ExtraRow, type StatsTable } from './stats.js';
import { estimateWhen, type WhenEstimate, type WhenInput } from './estimate.js';

/**
 * Data of the "When could I be in Germany?" estimator: the duration statistics of our case history, computed
 * server-side once per Baku day (in-process cache, concurrent misses collapsed) — only percentiles and sample
 * sizes of groups with ≥ MIN_GROUP_SAMPLE cases leave this module, never a case.
 */

/** The most recent cases feed the statistics (older practice is less representative). */
const HISTORY_CASES = 3000;
const DAY = 24 * 60 * 60 * 1000;

interface Cached {
  day: string;
  table: StatsTable;
  computedAt: string;
}
let cache: Cached | null = null;
let inflight: Promise<Cached> | null = null;

export const clearWhenCache = () => {
  cache = null;
};

const bakuDayKey = (d = new Date()) => {
  const p = bakuParts(d);
  return `${p.y}-${p.m + 1}-${p.d}`;
};

const loadTable = async (): Promise<StatsTable> => {
  const cases = await prisma.case.findMany({
    where: { status: { not: 'CANCELLED' }, parentCaseId: null, visaType: { not: 'TOURIST' } },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_CASES,
    select: {
      id: true,
      createdAt: true,
      status: true,
      visaType: true,
      profession: true,
      decisionAt: true,
      arrivalFollowUp: { select: { arrivedAt: true } },
    },
  });
  const byId = new Map(cases.map((c) => [c.id, c]));
  const events = cases.length
    ? await prisma.caseEvent.findMany({
        where: { caseId: { in: cases.map((c) => c.id) }, toStatus: { not: null } },
        select: { caseId: true, fromStatus: true, toStatus: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      })
    : [];
  const eventsOf = new Map<string, CaseRow['events']>();
  for (const e of events) {
    const list = eventsOf.get(e.caseId) ?? [];
    list.push({ createdAt: e.createdAt, fromStatus: e.fromStatus as CaseStatus | null, toStatus: e.toStatus as CaseStatus | null });
    eventsOf.set(e.caseId, list);
  }
  const rows: CaseRow[] = cases.map((c) => ({ createdAt: c.createdAt, status: c.status, visaType: c.visaType, profession: c.profession, events: eventsOf.get(c.id) ?? [] }));

  const travel: ExtraRow[] = cases
    .filter((c) => c.status === 'APPROVED' && c.decisionAt && c.arrivalFollowUp)
    .map((c) => ({ visaType: c.visaType, profession: c.profession, days: (c.arrivalFollowUp!.arrivedAt.getTime() - c.decisionAt!.getTime()) / DAY }));

  const processes = await prisma.recognitionProcess.findMany({
    where: { status: { in: ['RECOGNISED', 'PARTIALLY_RECOGNISED', 'REJECTED'] }, decisionAt: { not: null } },
    orderBy: { decisionAt: 'desc' },
    take: HISTORY_CASES,
    select: { caseId: true, createdAt: true, decisionAt: true },
  });
  const missing = [...new Set(processes.map((p) => p.caseId).filter((id) => !byId.has(id)))];
  const others = missing.length ? await prisma.case.findMany({ where: { id: { in: missing } }, select: { id: true, visaType: true, profession: true } }) : [];
  const caseOf = new Map<string, { visaType: CaseRow['visaType']; profession: string }>([...cases, ...others].map((c) => [c.id, c]));
  const recognition: ExtraRow[] = processes.flatMap((p) => {
    const c = caseOf.get(p.caseId);
    return c ? [{ visaType: c.visaType, profession: c.profession, days: (p.decisionAt!.getTime() - p.createdAt.getTime()) / DAY }] : [];
  });

  return buildStatsTable({ cases: rows, recognition, travel });
};

/** Today's statistics table (computed at most once per Baku day). */
export const whenStats = async (): Promise<Cached> => {
  const day = bakuDayKey();
  if (cache?.day === day) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const fresh: Cached = { day, table: await loadTable(), computedAt: new Date().toISOString() };
    cache = fresh;
    return fresh;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
};

export interface WhenResponse extends WhenEstimate {
  /** Published visa category of the route (register / visa page links). */
  visa: { slug: string; label: string } | null;
  minSample: number;
  computedAt: string;
}

export const whenEstimate = async (input: WhenInput): Promise<WhenResponse> => {
  const [{ table, computedAt }, cats] = await Promise.all([
    whenStats(),
    prisma.visaCategory.findMany({ where: { published: true }, orderBy: { sortOrder: 'asc' }, select: { slug: true, visaLabel: true } }),
  ]);
  const r = estimateWhen(input, table);
  const cat = cats.find((c) => PATH_LABEL_RE[r.route].test(c.visaLabel)) ?? null;
  return { ...r, visa: cat ? { slug: cat.slug, label: cat.visaLabel } : null, minSample: MIN_GROUP_SAMPLE, computedAt };
};
