import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { conflict, notFound } from '../http.js';
import { isOpen } from '../vacancies.js';
import { OCCUPYING_APPLICATION_STATUSES, OCCUPYING_CASE_STATUSES, computePlaces, countOccupying, type Places } from './places.js';

/**
 * Free places of vacancies (rules in places.ts) and the race-safe checks behind "apply" / "start a case for this
 * vacancy" / "employer accepts a candidate":
 *   - every check that can take or rely on the last place runs in a READ COMMITTED transaction whose FIRST statement
 *     is `SELECT … FROM Vacancy … FOR UPDATE`, so two requests for the same vacancy run one after the other and the
 *     second one counts what the first one committed;
 *   - errors: 404 VACANCY_NOT_FOUND (no such vacancy), 409 VACANCY_CLOSED (not OPEN, unpublished or past closesAt),
 *     409 VACANCY_FULL (no free place).
 */

type Db = Prisma.TransactionClient | typeof prisma;
type Countable = { id: string; positions: number; filledAdjustment: number };

export const TX_OPTIONS = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 } as const;

/** People occupying a place, per vacancy id (each person once). */
export const occupyingCounts = async (ids: string[], db: Db = prisma): Promise<Map<string, number>> => {
  if (!ids.length) return new Map();
  const apps = await db.vacancyApplication.findMany({
    where: { vacancyId: { in: ids }, status: { in: OCCUPYING_APPLICATION_STATUSES } },
    select: { vacancyId: true, userId: true },
  });
  const cases = await db.case.findMany({
    where: { vacancyId: { in: ids }, status: { in: OCCUPYING_CASE_STATUSES } },
    select: { vacancyId: true, clientId: true },
  });
  return countOccupying(apps, cases);
};

/** positions / filled / free for each vacancy (by id). */
export const placesFor = async (vacancies: Countable[], db: Db = prisma): Promise<Map<string, Places>> => {
  const counts = await occupyingCounts(vacancies.map((v) => v.id), db);
  return new Map(vacancies.map((v) => [v.id, computePlaces(v, counts.get(v.id) ?? 0)]));
};

/** Locks the vacancy row (first statement of the transaction); 404 when there is none. */
const lockVacancy = async (tx: Prisma.TransactionClient, by: { id: string } | { slug: string }): Promise<string> => {
  const rows =
    'id' in by
      ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM \`Vacancy\` WHERE id = ${by.id} FOR UPDATE`
      : await tx.$queryRaw<{ id: string }[]>`SELECT id FROM \`Vacancy\` WHERE slug = ${by.slug} FOR UPDATE`;
  if (!rows.length) throw notFound('VACANCY_NOT_FOUND');
  return rows[0].id;
};

const loadChecked = async (tx: Prisma.TransactionClient, id: string) => {
  const v = await tx.vacancy.findUniqueOrThrow({
    where: { id },
    include: { visaCategory: { select: { slug: true, visaLabel: true, germanLevel: true } } },
  });
  if (!isOpen(v)) throw conflict('VACANCY_CLOSED');
  const places = computePlaces(v, (await occupyingCounts([v.id], tx)).get(v.id) ?? 0);
  if (places.free <= 0) throw conflict('VACANCY_FULL');
  return { vacancy: v, places };
};

/**
 * Runs `work` while holding the vacancy's row lock, after checking that the vacancy exists, is open and has a free
 * place. Used by the candidate's apply and the client's "start an application for this vacancy".
 */
export const withApplicableVacancy = <R>(
  by: { id: string } | { slug: string },
  work: (tx: Prisma.TransactionClient, checked: Awaited<ReturnType<typeof loadChecked>>) => Promise<R>,
): Promise<R> =>
  prisma.$transaction(async (tx) => {
    const id = await lockVacancy(tx, by);
    return work(tx, await loadChecked(tx, id));
  }, TX_OPTIONS);

/** Same checks without doing anything (quick refusal before files are processed). */
export const assertApplicable = (by: { id: string } | { slug: string }) => withApplicableVacancy(by, async (_tx, checked) => checked);

/**
 * Takes a place: runs `change` (e.g. the conditional "→ ACCEPTED" update) under the vacancy's row lock and rolls it
 * back with 409 VACANCY_FULL when the vacancy would then have more people than places. A person who already
 * occupies a place (e.g. through their case) does not take a second one.
 */
export const takePlace = <R>(vacancyId: string, change: (tx: Prisma.TransactionClient) => Promise<R>): Promise<R> =>
  prisma.$transaction(async (tx) => {
    const id = await lockVacancy(tx, { id: vacancyId });
    const before = (await occupyingCounts([id], tx)).get(id) ?? 0;
    const result = await change(tx);
    const v = await tx.vacancy.findUniqueOrThrow({ where: { id }, select: { id: true, positions: true, filledAdjustment: true } });
    const after = (await occupyingCounts([id], tx)).get(id) ?? 0;
    // Only a NEW person is refused when the places are taken (an over-full vacancy set by staff stays as it is).
    if (after > before && computePlaces(v, after).filled > v.positions) throw conflict('VACANCY_FULL');
    return result;
  }, TX_OPTIONS);
