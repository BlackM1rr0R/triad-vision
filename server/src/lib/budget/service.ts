import { z } from 'zod';
import { prisma } from '../../db.js';
import { cached } from '../cache.js';
import { notFound } from '../http.js';
import { feesFor, getCostSettings } from '../marketing/costCalculator.js';
import { computeBudget, HOUSEHOLDS, HOUSING, isValidDay, type BudgetInput } from './budget.js';
import { activeCityCosts, matchCity, publicCity, type PublicCity } from './cities.js';
import { CURRENT_PARAMS, FEDERAL_STATES, type FederalState } from './params.js';

/**
 * Glue between HTTP and the pure budget maths: query parsing with defaults, city / visa resolution
 * (blocked account from the cost calculator settings) and the client-portal prefill.
 */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidDay, 'INVALID_DATE');
const flag = z.enum(['1', '0']);

export const budgetQuerySchema = z.object({
  city: z.string().trim().toLowerCase().max(60).optional(),
  /** Free-text place (vacancy / arrival city) matched to a row when `city` is missing. */
  place: z.string().trim().max(120).optional(),
  /** GENERIC rows (and overrides): the Bundesland for church tax / Saxony care rate. */
  state: z.enum(FEDERAL_STATES).optional(),
  gross: z.coerce.number().min(0).max(30_000).default(2_800),
  household: z.enum(HOUSEHOLDS).default('single'),
  children: z.coerce.number().int().min(0).max(6).default(0),
  taxClass: z.enum(['1', '3', '4']).optional(),
  church: flag.default('0'),
  age: z.coerce.number().int().min(16).max(70).default(30),
  /** Zusatzbeitrag in percent (2.9 = 2.9 %). */
  zusatz: z.coerce.number().min(0).max(6).optional(),
  housing: z.enum(HOUSING).optional(),
  companyRent: z.coerce.number().int().min(0).max(5_000).optional(),
  start: day.optional(),
  arrival: day.optional(),
  /** Visa category slug (blocked account). */
  visa: z.string().trim().max(120).optional(),
  /** Override: 1 = blocked account needed (default amount), 0 = not needed. */
  blocked: flag.optional(),
});
export type BudgetQuery = z.infer<typeof budgetQuerySchema>;

/** First day of the month after next (a realistic earliest start for someone still applying). */
export const defaultStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1)).toISOString().slice(0, 10);

const visaOptions = () =>
  cached('budget:visas', async () => {
    const [cats, settings] = await Promise.all([
      prisma.visaCategory.findMany({
        where: { published: true },
        orderBy: { sortOrder: 'asc' },
        select: { slug: true, title: true, visaLabel: true, salaryMin: true, salaryMax: true },
      }),
      getCostSettings(),
    ]);
    return cats.map((c) => ({ ...c, blockedAccount: feesFor(c, settings).blockedAccount }));
  });

/** Public configuration of the page: cities, visas, defaults and the main yearly parameters. */
export const budgetConfig = async () => {
  const [rows, visas, settings] = await Promise.all([activeCityCosts(), visaOptions(), getCostSettings()]);
  const P = CURRENT_PARAMS;
  return {
    year: P.year,
    checkedAt: P.checkedAt,
    cities: rows.map(publicCity),
    visas,
    defaults: { start: defaultStart(), gross: 2_800, city: rows.find((r) => r.kind === 'CITY')?.slug ?? rows[0]?.slug ?? null },
    params: {
      averageZusatzbeitrag: P.payroll.social.averageZusatzbeitrag,
      deutschlandticket: P.costs.deutschlandticket,
      rundfunk: P.costs.rundfunkMonthly,
      kindergeld: P.costs.kindergeld,
      blockedAccountYear: settings.blockedAccountAmount || P.costs.blockedAccountYear,
      arrivalDaysBeforeStart: P.costs.arrivalDaysBeforeStart,
      firstPayMonthsAfterStart: P.costs.firstPayMonthsAfterStart,
    },
  };
};

/** Parses a query, resolves city + visa and computes the budget. */
export const budgetFor = async (q: BudgetQuery) => {
  const rows = await activeCityCosts();
  if (!rows.length) throw notFound('NO_CITY_DATA');
  const warnings: string[] = [];
  let row = q.city ? rows.find((r) => r.slug === q.city) : undefined;
  if (q.city && !row) throw notFound('CITY_NOT_FOUND');
  if (!row && q.place) {
    row = matchCity(rows, q.place) ?? undefined;
    if (!row) {
      warnings.push('PLACE_NOT_FOUND');
      row = rows.find((r) => r.slug === 'other-medium') ?? rows.find((r) => r.kind === 'GENERIC');
    }
  }
  row ??= rows.find((r) => r.kind === 'CITY') ?? rows[0];
  const city: PublicCity = publicCity(row);

  let state = (q.state ?? (row.state as FederalState | null)) || null;
  if (!state) {
    state = 'NW';
    warnings.push('STATE_ASSUMED');
  }

  const visas = await visaOptions();
  const visa = q.visa ? visas.find((v) => v.slug === q.visa) ?? null : null;
  const settings = await getCostSettings();
  const blockedDefault = settings.blockedAccountAmount || CURRENT_PARAMS.costs.blockedAccountYear;
  const blockedAccountYear = q.blocked === '0' ? 0 : q.blocked === '1' ? visa?.blockedAccount || blockedDefault : (visa?.blockedAccount ?? 0);

  const household = q.household;
  const taxClass = q.taxClass ? (Number(q.taxClass) as 1 | 3 | 4) : household === 'single' ? 1 : 3;
  const input: BudgetInput = {
    gross: q.gross,
    taxClass,
    church: q.church === '1',
    age: q.age,
    zusatzbeitrag: q.zusatz != null ? q.zusatz / 100 : undefined,
    state,
    household,
    children: household === 'family' ? Math.max(1, q.children) : 0,
    housing: q.housing ?? (household === 'single' ? 'wg' : 'flat'),
    companyRent: q.companyRent ?? null,
    start: q.start ?? defaultStart(),
    arrival: q.arrival ?? null,
    blockedAccountYear,
  };
  const result = computeBudget(input, city);
  return {
    ...result,
    warnings: [...warnings, ...result.warnings],
    city,
    visa: visa ? { slug: visa.slug, title: visa.title, visaLabel: visa.visaLabel, blockedAccount: visa.blockedAccount } : null,
  };
};
export type BudgetResponse = Awaited<ReturnType<typeof budgetFor>>;

/** Canonical share query of a result (only the inputs, so links stay short and stable). */
export const shareQuery = (r: BudgetResponse) => {
  const i = r.input;
  const p = new URLSearchParams({ city: r.city.slug, gross: String(i.gross), household: i.household, housing: i.housingUsed, start: i.start, taxClass: String(i.taxClass) });
  if (i.household === 'family') p.set('children', String(i.children));
  if (r.city.kind === 'GENERIC') p.set('state', i.state);
  if (i.church) p.set('church', '1');
  if (i.age !== 30) p.set('age', String(i.age));
  if (i.zusatzbeitrag != null) p.set('zusatz', String(Math.round(i.zusatzbeitrag * 1000) / 10));
  if (i.companyRent != null && i.housingUsed === 'company') p.set('companyRent', String(i.companyRent));
  if (i.arrival) p.set('arrival', i.arrival);
  if (r.visa) p.set('visa', r.visa.slug);
  else if (i.blockedAccountYear > 0) p.set('blocked', '1');
  return p.toString();
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : undefined);
const num = (v: unknown) => (v == null ? null : Number(v));

/**
 * Prefill of the personalised budget in the client portal: the latest main application's employment
 * contract (gross, start), vacancy (salary, city), visa category, arrival plan (flight date, housing city)
 * and family members. Only the client's own records.
 */
export const portalPrefill = async (clientId: string) => {
  const kase = await prisma.case.findFirst({
    where: { clientId, parentCaseId: null, status: { not: 'CANCELLED' } },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      vacancy: { select: { slug: true, city: true, salaryMin: true, salaryMax: true } },
      visaCategory: { select: { slug: true, salaryMin: true, salaryMax: true } },
      arrivalPlan: { select: { flightDate: true, housingCity: true } },
      familyMembers: { where: { status: { not: 'CANCELLED' } }, select: { relation: true } },
    },
  });
  if (!kase) return { hasCase: false as const, prefill: {}, sources: {} };
  const contract = await prisma.employmentContract.findUnique({ where: { caseId: kase.id }, select: { grossMonthly: true, grossYearly: true, startDate: true } });
  const sources: Record<string, string> = {};
  const prefill: Partial<Record<keyof BudgetQuery, string | number>> = {};

  const mid = (a: number | null | undefined, b: number | null | undefined) => (a && b ? Math.round((a + b) / 2) : a || b || null);
  const contractGross = num(contract?.grossMonthly) || (num(contract?.grossYearly) ? Math.round(num(contract!.grossYearly)! / 12) : null);
  const vacancyGross = mid(kase.vacancy?.salaryMin, kase.vacancy?.salaryMax);
  const visaGross = mid(kase.visaCategory?.salaryMin, kase.visaCategory?.salaryMax);
  const gross = contractGross || vacancyGross || visaGross;
  if (gross) {
    prefill.gross = Math.round(gross);
    sources.gross = contractGross ? 'contract' : vacancyGross ? 'vacancy' : 'visa';
  }

  const rows = await activeCityCosts();
  const place = kase.arrivalPlan?.housingCity || kase.vacancy?.city || null;
  if (place) {
    const row = matchCity(rows, place);
    if (row) prefill.city = row.slug;
    else prefill.place = place;
    sources.city = kase.arrivalPlan?.housingCity ? 'arrival' : 'vacancy';
  }
  const start = iso(contract?.startDate);
  if (start && start >= new Date().toISOString().slice(0, 10)) {
    prefill.start = start;
    sources.start = 'contract';
  }
  const flight = iso(kase.arrivalPlan?.flightDate);
  if (flight && (!prefill.start || flight <= String(prefill.start))) {
    prefill.arrival = flight;
    sources.arrival = 'arrival';
  }
  if (kase.visaCategory?.slug) prefill.visa = kase.visaCategory.slug;
  const spouse = kase.familyMembers.some((m) => m.relation === 'spouse');
  const kids = kase.familyMembers.filter((m) => m.relation === 'child').length;
  if (kids > 0) {
    prefill.household = 'family';
    prefill.children = Math.min(6, kids);
    sources.household = 'family';
  } else if (spouse) {
    prefill.household = 'couple';
    sources.household = 'family';
  }
  return { hasCase: true as const, prefill, sources };
};
