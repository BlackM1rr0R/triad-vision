import { z } from 'zod';
import { prisma } from '../../db.js';
import { budgetFor, budgetQuerySchema } from '../budget/service.js';
import { activeCityCosts, publicCity } from '../budget/cities.js';
import { CURRENT_PARAMS } from '../budget/params.js';
import { HOUSEHOLDS } from '../budget/budget.js';
import { professionSalary } from '../publicAi/pathFinder.js';
import { openVacancyWhere } from '../vacancies.js';
import { getEurAzn } from './cbar.js';
import { LIFE_PROFESSIONS, getLifeSettings, type LifeProfession } from './settings.js';
import { bakuComparison, simulateLife } from './simulate.js';

/**
 * "Life in Germany" simulator (/life-in-germany): glue between HTTP, the budget engine, the profession salary
 * references (open vacancies: 25th–75th percentile, else the path finder's reference table) and the CBAR rate.
 */

const SALARY_TTL_MS = 30 * 60 * 1000;
let salaryCache: { at: number; value: Record<LifeProfession, ReturnType<typeof professionSalary>> } | null = null;

/** Salary range per simulator profession (cached 30 min; vacancies change slowly). */
export const professionSalaries = async () => {
  if (salaryCache && Date.now() - salaryCache.at < SALARY_TTL_MS) return salaryCache.value;
  const vacancies = await prisma.vacancy.findMany({ where: openVacancyWhere(), select: { profession: true, title: true, salaryMin: true, salaryMax: true }, take: 2000 });
  const value = Object.fromEntries(LIFE_PROFESSIONS.map((p) => [p, professionSalary(vacancies, p)])) as Record<LifeProfession, ReturnType<typeof professionSalary>>;
  salaryCache = { at: Date.now(), value };
  return value;
};
export const clearLifeSalaryCache = () => {
  salaryCache = null;
};

const midOf = (lo: number, hi: number) => Math.round((lo + hi) / 2 / 50) * 50;

export const lifeConfig = async () => {
  const [salaries, rows, rate, settings] = await Promise.all([professionSalaries(), activeCityCosts(), getEurAzn({ waitMs: 800 }), getLifeSettings()]);
  return {
    year: CURRENT_PARAMS.year,
    checkedAt: CURRENT_PARAMS.checkedAt,
    professions: LIFE_PROFESSIONS.map((key) => {
      const s = salaries[key];
      return { key, grossMin: s.grossMin, grossMax: s.grossMax, gross: midOf(s.grossMin, s.grossMax), source: s.source, vacancies: s.vacancies };
    }),
    cities: rows.filter((r) => r.kind === 'CITY').map((r) => ({ slug: r.slug, name: publicCity(r).name, state: r.state })),
    defaults: { profession: 'driver' as LifeProfession, city: rows.find((r) => r.kind === 'CITY')?.slug ?? null, household: 'single' as const, taxClass: 1 as const },
    params: { deutschlandticket: CURRENT_PARAMS.costs.deutschlandticket, rundfunk: CURRENT_PARAMS.costs.rundfunkMonthly, kindergeld: CURRENT_PARAMS.costs.kindergeld },
    /** Baku comparison: on/off and the national average (article text); per-profession figures come with /estimate. */
    baku: { enabled: settings.baku.enabled, nationalAverage: settings.baku.nationalAverage },
    rate,
  };
};

export const lifeQuerySchema = z.object({
  profession: z.enum(LIFE_PROFESSIONS).default('driver'),
  city: z.string().trim().toLowerCase().max(60).optional(),
  household: z.enum(HOUSEHOLDS).default('single'),
  children: z.coerce.number().int().min(1).max(6).optional(),
  taxClass: z.enum(['1', '3', '4']).optional(),
  housing: z.enum(['wg', 'flat']).optional(),
  /** Own gross (EUR / month); default: the middle of the profession's range. */
  gross: z.coerce.number().int().min(500).max(30_000).optional(),
});
export type LifeQuery = z.infer<typeof lifeQuerySchema>;

export const lifeEstimate = async (q: LifeQuery) => {
  const [salaries, rate, settings] = await Promise.all([professionSalaries(), getEurAzn({ waitMs: 1500 }), getLifeSettings()]);
  const salary = salaries[q.profession];
  const gross = q.gross ?? midOf(salary.grossMin, salary.grossMax);
  const household = q.household;
  const taxClass = q.taxClass ?? (household === 'single' ? '1' : '3');
  // Long-term life: a single person in a flat by default (the first-month budget assumes a WG room).
  const housing = household === 'single' ? (q.housing ?? 'flat') : 'flat';
  const budget = await budgetFor(
    budgetQuerySchema.parse({
      city: q.city,
      gross,
      household,
      children: household === 'family' ? (q.children ?? 1) : 0,
      taxClass,
      housing,
    }),
  );
  const sim = simulateLife(budget, rate?.rate ?? null);
  const baku = bakuComparison(sim, {
    enabled: settings.baku.enabled,
    profession: settings.baku.professions[q.profession] ?? null,
    national: settings.baku.nationalAverage,
  });
  const share = new URLSearchParams({ profession: q.profession, city: budget.city.slug, household, taxClass });
  if (household === 'family') share.set('children', String(budget.children));
  if (household === 'single' && housing !== 'flat') share.set('housing', housing);
  if (q.gross != null) share.set('gross', String(gross));
  return {
    input: { profession: q.profession, city: budget.city.slug, household, children: budget.children, taxClass: Number(taxClass) as 1 | 3 | 4, housing, gross, grossIsDefault: q.gross == null },
    salary: { grossMin: salary.grossMin, grossMax: salary.grossMax, source: salary.source, vacancies: salary.vacancies },
    city: { slug: budget.city.slug, name: budget.city.name, state: budget.input.state, checkedAt: budget.city.checkedAt },
    payroll: budget.net,
    sim,
    baku,
    rate,
    warnings: budget.warnings,
    year: budget.year,
    share: share.toString(),
  };
};
export type LifeEstimate = Awaited<ReturnType<typeof lifeEstimate>>;
