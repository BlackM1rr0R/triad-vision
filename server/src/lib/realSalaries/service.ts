import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { outsideImpersonation } from '../privacy/impersonationContext.js';
import { bakuParts } from '../reports/dates.js';
import { canonicalProfession } from '../matching.js';
import { activeCityCosts, matchCity } from '../budget/cities.js';
import { buildSalaryTable, monthlyOf, staffGroups, type SalaryRecord, type SalaryTable } from './aggregate.js';

/**
 * Real salary database — data loading, the monthly snapshot and its cache. The public endpoint only ever reads
 * the snapshot (ranges of groups with ≥ 3 workers, lib/realSalaries/aggregate.ts); the snapshot is recomputed
 * once per Baku month by the job (src/jobs/realSalaries.ts), on demand by staff, and on the first request when
 * none exists yet.
 *
 * Source: EmploymentContract (gross monthly / yearly, weekly hours, contract type) of cases of placed workers —
 * a signed contract or an approved visa; rejected and cancelled cases are left out. Profession: the case's
 * profession (else the contract's job title) mapped to the canonical keys of lib/matching.ts. City: the
 * vacancy's city, else the employer's city, merged into the city-cost rows (suburbs → the big city, with the
 * federal state) where they match.
 */

export const monthKey = (d = new Date()) => {
  const p = bakuParts(d);
  return `${p.y}-${String(p.m + 1).padStart(2, '0')}`;
};

const titleCase = (s: string) =>
  s
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
    .slice(0, 80);

const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));

/** Contract rows (with the case's data) the database is computed from, newest first. */
const loadRows = () =>
  prisma.employmentContract.findMany({
    where: { OR: [{ grossMonthly: { not: null } }, { grossYearly: { not: null } }] },
    orderBy: { updatedAt: 'desc' },
    take: 20000,
    select: {
      caseId: true,
      jobTitle: true,
      contractType: true,
      grossMonthly: true,
      grossYearly: true,
      weeklyHours: true,
      signedAt: true,
      startDate: true,
      createdAt: true,
      companyId: true,
    },
  });

export interface LoadedRecord extends SalaryRecord {
  caseNumber: string;
  rawProfession: string;
  rawCity: string | null;
  employerName: string | null;
  exclusionReason: string | null;
}

export const loadRecords = async (): Promise<LoadedRecord[]> => {
  const rows = await loadRows();
  if (!rows.length) return [];
  const cases = await prisma.case.findMany({
    where: { id: { in: rows.map((r) => r.caseId) }, status: { notIn: ['REJECTED', 'CANCELLED'] } },
    select: {
      id: true,
      number: true,
      status: true,
      clientId: true,
      profession: true,
      vacancy: { select: { city: true } },
      company: { select: { city: true, name: true } },
    },
  });
  const caseOf = new Map(cases.map((c) => [c.id, c]));
  const [exclusions, cities] = await Promise.all([
    prisma.realSalaryExclusion.findMany({ where: { caseId: { in: cases.map((c) => c.id) } }, select: { caseId: true, reason: true } }),
    activeCityCosts(),
  ]);
  const excluded = new Map(exclusions.map((e) => [e.caseId, e.reason ?? '']));
  const out: LoadedRecord[] = [];
  for (const r of rows) {
    const c = caseOf.get(r.caseId);
    if (!c) continue;
    // Placed: the contract is signed or the visa approved.
    if (!r.signedAt && c.status !== 'APPROVED') continue;
    const rawCity = c.vacancy?.city?.trim() || c.company?.city?.trim() || null;
    const row = rawCity ? matchCity(cities, rawCity) : null;
    out.push({
      caseId: c.id,
      caseNumber: c.number,
      workerId: c.clientId,
      profession: canonicalProfession(c.profession) ?? canonicalProfession(r.jobTitle),
      rawProfession: c.profession,
      city: row ? row.name : rawCity ? titleCase(rawCity) : null,
      rawCity,
      state: row?.state ?? null,
      employerName: c.company?.name ?? null,
      grossMonthly: num(r.grossMonthly),
      grossYearly: num(r.grossYearly),
      weeklyHours: num(r.weeklyHours),
      contractType: r.contractType,
      at: r.signedAt ?? r.startDate ?? r.createdAt,
      excluded: excluded.has(c.id),
      exclusionReason: excluded.get(c.id) ?? null,
    });
  }
  return out;
};

export interface PublicSalaryData extends SalaryTable {
  month: string;
  computedAt: string;
}

let cache: PublicSalaryData | null = null;
let inflight: Promise<PublicSalaryData> | null = null;

export const clearRealSalaryCache = () => {
  cache = null;
};

/** Computes the table now and stores it as this month's snapshot. */
export const recomputeRealSalaries = async (): Promise<PublicSalaryData> => {
  const table = buildSalaryTable(await loadRecords());
  const month = monthKey();
  const row = await prisma.realSalarySnapshot.create({ data: { month, data: table as unknown as Prisma.InputJsonValue } });
  // Older snapshots of the same month are superseded (the history keeps one per month).
  await prisma.realSalarySnapshot.deleteMany({ where: { month, id: { not: row.id } } });
  cache = { ...table, month, computedAt: row.computedAt.toISOString() };
  return cache;
};

const latestSnapshot = async (): Promise<PublicSalaryData | null> => {
  const row = await prisma.realSalarySnapshot.findFirst({ orderBy: { computedAt: 'desc' } });
  return row ? { ...(row.data as unknown as SalaryTable), month: row.month, computedAt: row.computedAt.toISOString() } : null;
};

/** The published table: the cached snapshot (computed when none exists yet). */
export const publicRealSalaries = async (): Promise<PublicSalaryData> => {
  if (cache) return cache;
  if (!inflight) {
    // Shared by every visitor (public data): never built inside a "view as client" request's read-only context.
    inflight = outsideImpersonation(async () => (await latestSnapshot()) ?? (await recomputeRealSalaries()))
      .then((v) => {
        cache = v;
        return v;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
};

/** Monthly job: a new snapshot when the latest one is from an earlier Baku month. */
export const runMonthlyRealSalaries = async () => {
  const latest = await prisma.realSalarySnapshot.findFirst({ orderBy: { computedAt: 'desc' }, select: { month: true } });
  if (latest?.month === monthKey()) return false;
  await recomputeRealSalaries();
  return true;
};

/** Staff view: every record with its amount and why it is (not) used, plus the group preview. */
export const staffOverview = async () => {
  const records = await loadRecords();
  const preview = staffGroups(records);
  const snapshot = await latestSnapshot();
  return {
    records: records.map((r) => {
      const m = monthlyOf(r);
      return {
        caseId: r.caseId,
        caseNumber: r.caseNumber,
        profession: r.profession,
        rawProfession: r.rawProfession,
        city: r.city,
        rawCity: r.rawCity,
        employerName: r.employerName,
        grossMonthly: 'gross' in m ? Math.round(m.gross) : (r.grossMonthly ?? (r.grossYearly ? Math.round(r.grossYearly / 12) : null)),
        skip: 'skip' in m ? m.skip : null,
        excluded: r.excluded,
        exclusionReason: r.exclusionReason,
        at: r.at,
      };
    }),
    groups: preview.groups,
    skipped: preview.skipped,
    workers: preview.workers,
    snapshot: snapshot ? { month: snapshot.month, computedAt: snapshot.computedAt, groups: snapshot.groups.length } : null,
  };
};
