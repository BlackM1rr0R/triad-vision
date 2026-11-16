import { Prisma, type CaseStatus, type QuarterlyReport } from '@prisma/client';
import { prisma } from '../../db.js';
import { activeCityCosts, matchCity } from '../budget/cities.js';
import { canonicalProfession, GERMAN_LEVELS } from '../matching.js';
import { caseSamples, type CaseRow } from '../whenInGermany/stats.js';
import { buildQuarterStats, quarterRange, previousQuarter, satisfiesK, type QuarterStats, type ReportCase } from './aggregate.js';
import { REPORT_LANGS, type ReportLang } from './texts.js';

/**
 * Data of the quarterly report: loads the approved main cases of a quarter (and of the previous one), turns them
 * into ReportCase rows (canonical profession, federal state of the employer's city, German level, stage
 * durations) and aggregates them with the k-anonymity rules of ./aggregate.ts. Nothing per case leaves here.
 */

const DAY = 24 * 60 * 60 * 1000;

export type Intro = Partial<Record<ReportLang, string>>;

const loadCases = async (year: number, quarter: number): Promise<ReportCase[]> => {
  const { from, to } = quarterRange(year, quarter);
  const cases = await prisma.case.findMany({
    where: { status: 'APPROVED', parentCaseId: null, decisionAt: { gte: from, lt: to } },
    take: 20000,
    select: {
      id: true,
      createdAt: true,
      decisionAt: true,
      status: true,
      visaType: true,
      profession: true,
      client: { select: { germanLevel: true } },
      company: { select: { city: true } },
      vacancy: { select: { city: true } },
    },
  });
  if (!cases.length) return [];
  const events = await prisma.caseEvent.findMany({
    where: { caseId: { in: cases.map((c) => c.id) }, toStatus: { not: null } },
    select: { caseId: true, fromStatus: true, toStatus: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const eventsOf = new Map<string, CaseRow['events']>();
  for (const e of events) {
    const list = eventsOf.get(e.caseId) ?? [];
    list.push({ createdAt: e.createdAt, fromStatus: e.fromStatus as CaseStatus | null, toStatus: e.toStatus as CaseStatus | null });
    eventsOf.set(e.caseId, list);
  }
  const cities = await activeCityCosts();
  return cases.map((c) => {
    const s = caseSamples({ createdAt: c.createdAt, status: c.status, visaType: c.visaType, profession: c.profession, events: eventsOf.get(c.id) ?? [] });
    const total = c.decisionAt ? (c.decisionAt.getTime() - c.createdAt.getTime()) / DAY : undefined;
    const city = matchCity(cities, c.company?.city ?? c.vacancy?.city ?? null);
    const level = c.client.germanLevel && (GERMAN_LEVELS as readonly string[]).includes(c.client.germanLevel) ? c.client.germanLevel : null;
    return {
      id: c.id,
      visaType: c.visaType,
      profession: canonicalProfession(c.profession),
      state: city?.state ?? null,
      germanLevel: level,
      samples: {
        ...(s.documents_none !== undefined ? { documents: s.documents_none } : {}),
        ...(s.contract !== undefined ? { contract: s.contract } : {}),
        ...(s.embassy !== undefined ? { embassy: s.embassy } : {}),
        ...(s.decision !== undefined ? { decision: s.decision } : {}),
        ...(total !== undefined && total >= 0 ? { total } : {}),
      },
    };
  });
};

/** Live aggregates of a quarter (k-anonymous). */
export const computeQuarterStats = async (year: number, quarter: number, now = new Date()): Promise<QuarterStats> => {
  const pq = previousQuarter(year, quarter);
  const [current, previous] = await Promise.all([loadCases(year, quarter), loadCases(pq.year, pq.quarter)]);
  const stats = buildQuarterStats({ year, quarter, current, previous, now });
  if (!satisfiesK(stats)) throw new Error('quarterly report: k-anonymity check failed');
  return stats;
};

export const introOf = (r: Pick<QuarterlyReport, 'intro'> | null | undefined): Intro => {
  const v = r?.intro;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Intro = {};
  for (const l of REPORT_LANGS) {
    const t = (v as Record<string, unknown>)[l];
    if (typeof t === 'string' && t.trim()) out[l] = t;
  }
  return out;
};

export const snapshotOf = (r: Pick<QuarterlyReport, 'snapshot'> | null | undefined): QuarterStats | null => {
  const v = r?.snapshot as unknown as QuarterStats | null | undefined;
  return v && typeof v === 'object' && v.version === 1 ? v : null;
};

/** Stats for a report: the frozen snapshot when published, else live. */
export const statsFor = async (year: number, quarter: number, report: QuarterlyReport | null) => {
  const snap = report?.published ? snapshotOf(report) : null;
  return snap ?? computeQuarterStats(year, quarter);
};

export const getReport = (year: number, quarter: number) => prisma.quarterlyReport.findUnique({ where: { year_quarter: { year, quarter } } });

export const saveIntro = async (year: number, quarter: number, intro: Intro, userId: string) =>
  prisma.quarterlyReport.upsert({
    where: { year_quarter: { year, quarter } },
    create: { year, quarter, intro: intro as Prisma.InputJsonValue, createdById: userId, updatedById: userId },
    update: { intro: intro as Prisma.InputJsonValue, updatedById: userId },
  });

/** Publishes with freshly computed aggregates (frozen), or unpublishes (the snapshot is dropped). */
export const setPublished = async (year: number, quarter: number, published: boolean, userId: string) => {
  if (!published) {
    return prisma.quarterlyReport.upsert({
      where: { year_quarter: { year, quarter } },
      create: { year, quarter, createdById: userId, updatedById: userId },
      update: { published: false, publishedAt: null, snapshot: Prisma.DbNull, updatedById: userId },
    });
  }
  const stats = await computeQuarterStats(year, quarter);
  const data = { published: true, publishedAt: new Date(), snapshot: stats as unknown as Prisma.InputJsonValue, generatedAt: new Date(stats.generatedAt), updatedById: userId };
  return prisma.quarterlyReport.upsert({
    where: { year_quarter: { year, quarter } },
    create: { year, quarter, createdById: userId, ...data },
    update: data,
  });
};

export const listPublished = () =>
  prisma.quarterlyReport.findMany({ where: { published: true }, orderBy: [{ year: 'desc' }, { quarter: 'desc' }], take: 200, select: { year: true, quarter: true, publishedAt: true, snapshot: true } });
