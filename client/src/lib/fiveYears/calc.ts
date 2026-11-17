import { CITIES, cityBySlug } from '../cities/data';
import { LIFESTYLES, livingCosts, type Lifestyle } from '../moneyHome/calc';
import { AZ_SECTOR_WAGES, AZ_SECTOR_WAGE_YEAR, type AzSector } from '../moneyHome/data';
import { addMonths, computePr, DEFAULT_PR, isYm } from '../permanentResidence/calc';

/**
 * 5-year "time machine" (/five-years-in-germany), pure and deterministic (months as "YYYY-MM", no clock, no Intl):
 * year-by-year gross and net salary (configurable raise per year), living costs in the city (lib/cities, growing
 * with the assumed inflation), savings and their running total, the residence milestones of the permanent-residence
 * calculator (lib/permanentResidence/calc.ts) combined with the German-learning path, and the same profession's
 * sector average in Azerbaijan (stat.gov.az, growing with an assumed rate). Every number is an ESTIMATE built on the
 * assumptions the visitor can change.
 */

export const FY_PROFESSIONS = ['driver', 'care', 'construction', 'technical', 'hospitality', 'it', 'logistics'] as const;
export type FyProfession = (typeof FY_PROFESSIONS)[number];

/**
 * Indicative entry-level gross per month in Germany (€, 2026, full time) — the same orientation values as the path
 * finder (server/src/lib/publicAi/pathFinder.ts REFERENCE_GROSS, Entgeltatlas of the Federal Employment Agency);
 * server/tests/unit/fiveYears.test.ts checks that both agree.
 */
export const FY_REFERENCE_GROSS: Record<FyProfession, readonly [number, number]> = {
  driver: [2800, 3600],
  care: [2900, 3900],
  construction: [2700, 3500],
  technical: [3000, 3900],
  hospitality: [2450, 3000],
  it: [3800, 5500],
  logistics: [2450, 3100],
};

/** Profession → economic activity of the Azerbaijani wage statistics (sector average, not the profession). */
export const FY_AZ_SECTOR: Record<FyProfession, AzSector> = {
  driver: 'transport',
  care: 'health',
  construction: 'construction',
  technical: 'manufacturing',
  hospitality: 'accommodation',
  it: 'ict',
  logistics: 'transport',
};

export const FY_GERMAN = ['none', 'a1', 'a2', 'b1', 'b2'] as const;
export type FyGerman = (typeof FY_GERMAN)[number];
export const FY_PERMITS = ['skilled', 'blueCard'] as const;
export type FyPermit = (typeof FY_PERMITS)[number];

export interface FyInput {
  profession: FyProfession;
  city: string;
  /** German level on arrival. */
  german: FyGerman;
  /** Months of evening classes per CEFR level after arrival (next level each `pace` months). */
  pace: number;
  permit: FyPermit;
  /** Arrival / job start, YYYY-MM. */
  start: string;
  style: Lifestyle;
  /** Assumptions, % per year. */
  raise: number;
  inflation: number;
  azGrowth: number;
}

export const FY_DEFAULTS: Omit<FyInput, 'start'> = {
  profession: 'driver',
  city: 'berlin',
  german: 'a1',
  pace: 6,
  permit: 'skilled',
  style: 'normal',
  raise: 3,
  inflation: 2,
  azGrowth: 7,
};

export const defaultPermit = (p: FyProfession): FyPermit => (p === 'it' ? 'blueCard' : 'skilled');

export interface FyYear {
  year: number;
  /** First month of this year of the stay. */
  from: string;
  gross: number;
  net: number;
  costs: number;
  /** Savings per month (net − costs), may be negative. */
  saveMonth: number;
  saveYear: number;
  /** Running total of savings at the end of this year (EUR, nominal). */
  total: number;
  /** The same in today's money (deflated with the assumed inflation). */
  totalReal: number;
  /** Sector average gross in Azerbaijan in that calendar year, AZN per month. */
  azGross: number;
}

export type FyMilestoneKey = 'arrival' | 'probation' | 'family' | 'a2' | 'b1' | 'b2' | 'settlement' | 'citizenship';
export interface FyMilestone {
  key: FyMilestoneKey;
  ym: string;
  /** Month of the stay (0 = arrival). */
  month: number;
  /** Within the 5 years shown. */
  inside: boolean;
}

export interface FyResult {
  years: FyYear[];
  milestones: FyMilestone[];
  /** Earliest settlement permit and citizenship (YYYY-MM) and what limits them. */
  settlement: string;
  settlementBy: 'law' | 'german';
  citizenship: string;
  citizenshipBy: 'law' | 'german';
  /** Level reached at the end of the 5 years. */
  germanAtEnd: FyGerman;
  azSector: AzSector;
}

const FY_ORDER: FyMilestoneKey[] = ['arrival', 'family', 'probation', 'a2', 'b1', 'b2', 'settlement', 'citizenship'];
const r0 = Math.round;
const later = (a: string, b: string) => (a >= b ? a : b);
const monthsBetween = (a: string, b: string) => {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return yb * 12 + mb - (ya * 12 + ma);
};

/** Month a level is reached when learning one level per `pace` months from arrival (the start month if already reached). */
export const levelDate = (start: string, from: FyGerman, to: FyGerman, pace: number) => {
  const steps = FY_GERMAN.indexOf(to) - FY_GERMAN.indexOf(from);
  return addMonths(start, Math.max(0, steps) * Math.max(1, pace));
};

export const levelAt = (months: number, from: FyGerman, pace: number): FyGerman => {
  const idx = Math.min(FY_GERMAN.length - 1, FY_GERMAN.indexOf(from) + Math.floor(months / Math.max(1, pace)));
  return FY_GERMAN[idx];
};

/**
 * Earliest settlement permit with the learning path: the law's time (computePr) and the German level it needs.
 * Blue Card: 21 months with B1 or 27 months with A1, whichever comes first; skilled worker: 36 months and B1.
 */
export const settlementWithPath = (i: Pick<FyInput, 'start' | 'german' | 'pace' | 'permit'>) => {
  const base = { ...DEFAULT_PR, start: i.start, permit: i.permit };
  const b1 = levelDate(i.start, i.german, 'b1', i.pace);
  if (i.permit === 'blueCard') {
    const a1 = levelDate(i.start, i.german, 'a1', i.pace);
    const law21 = computePr({ ...base, german: 'b1' }, i.start).settlement;
    const law27 = computePr({ ...base, german: 'a1' }, i.start).settlement;
    const withB1 = later(law21, b1);
    const withA1 = later(law27, a1);
    const best = withB1 <= withA1 ? withB1 : withA1;
    return { ym: best, by: (best === withB1 ? b1 > law21 : a1 > law27) ? ('german' as const) : ('law' as const) };
  }
  const law = computePr({ ...base, german: 'b1' }, i.start).settlement;
  return { ym: later(law, b1), by: b1 > law ? ('german' as const) : ('law' as const) };
};

export const fiveYears = (input: FyInput, netOf: (gross: number) => number): FyResult => {
  const city = cityBySlug(input.city) ?? CITIES[0];
  const [lo, hi] = FY_REFERENCE_GROSS[input.profession];
  const gross0 = (lo + hi) / 2;
  const costs0 = livingCosts(city, input.style).total;
  const raise = input.raise / 100;
  const infl = input.inflation / 100;
  const azg = input.azGrowth / 100;
  const sector = FY_AZ_SECTOR[input.profession];
  const startYear = Number(input.start.slice(0, 4));

  const years: FyYear[] = [];
  let total = 0;
  let totalReal = 0;
  for (let y = 1; y <= 5; y++) {
    const gross = r0(gross0 * (1 + raise) ** (y - 1));
    const net = r0(netOf(gross));
    const costs = r0(costs0 * (1 + infl) ** (y - 1));
    const saveMonth = net - costs;
    const saveYear = saveMonth * 12;
    total += saveYear;
    totalReal += saveYear / (1 + infl) ** (y - 1);
    const calYear = startYear + y - 1;
    years.push({
      year: y,
      from: addMonths(input.start, 12 * (y - 1)),
      gross,
      net,
      costs,
      saveMonth,
      saveYear,
      total: r0(total),
      totalReal: r0(totalReal),
      azGross: r0(AZ_SECTOR_WAGES[sector] * (1 + azg) ** Math.max(0, calYear - AZ_SECTOR_WAGE_YEAR)),
    });
  }

  const settlement = settlementWithPath(input);
  const b1 = levelDate(input.start, input.german, 'b1', input.pace);
  const lawCitizenship = addMonths(input.start, 60); // § 10 StAG: 5 years of lawful residence, B1
  const citizenship = later(lawCitizenship, b1);
  const end = addMonths(input.start, 60);

  const ms: { key: FyMilestoneKey; ym: string }[] = [
    { key: 'arrival', ym: input.start },
    { key: 'family', ym: input.start },
    { key: 'probation', ym: addMonths(input.start, 6) },
  ];
  for (const l of ['a2', 'b1', 'b2'] as const) if (FY_GERMAN.indexOf(l) > FY_GERMAN.indexOf(input.german)) ms.push({ key: l, ym: levelDate(input.start, input.german, l, input.pace) });
  ms.push({ key: 'settlement', ym: settlement.ym }, { key: 'citizenship', ym: citizenship });
  const milestones = ms
    .map((m) => ({ ...m, month: monthsBetween(input.start, m.ym), inside: m.ym <= end }))
    .sort((a, b) => a.month - b.month || FY_ORDER.indexOf(a.key) - FY_ORDER.indexOf(b.key));

  return {
    years,
    milestones,
    settlement: settlement.ym,
    settlementBy: settlement.by,
    citizenship,
    citizenshipBy: b1 > lawCitizenship ? 'german' : 'law',
    germanAtEnd: levelAt(60, input.german, input.pace),
    azSector: sector,
  };
};


// ─── URL ⇄ input ─────────────────────────────────────────────────────────────

const pick = <T extends string>(list: readonly T[], v: string | null, d: T): T => ((list as readonly string[]).includes(v ?? '') ? (v as T) : d);
const num = (v: string | null, min: number, max: number, d: number) => {
  if (v == null || v.trim() === '') return d;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 10) / 10)) : d;
};

export const fyFromParams = (p: URLSearchParams, today: string): FyInput => {
  const d = FY_DEFAULTS;
  const profession = pick(FY_PROFESSIONS, p.get('profession'), d.profession);
  return {
    profession,
    city: cityBySlug(p.get('city'))?.slug ?? d.city,
    german: pick(FY_GERMAN, p.get('german'), d.german),
    pace: Math.round(num(p.get('pace'), 3, 18, d.pace)),
    permit: pick(FY_PERMITS, p.get('permit'), defaultPermit(profession)),
    start: isYm(p.get('start')) ? p.get('start')! : today,
    style: pick(LIFESTYLES, p.get('style'), d.style),
    raise: num(p.get('raise'), 0, 15, d.raise),
    inflation: num(p.get('inflation'), 0, 15, d.inflation),
    azGrowth: num(p.get('az'), 0, 30, d.azGrowth),
  };
};

export const fyToQuery = (i: FyInput) =>
  new URLSearchParams({
    profession: i.profession,
    city: i.city,
    german: i.german,
    pace: String(i.pace),
    permit: i.permit,
    start: i.start,
    style: i.style,
    raise: String(i.raise),
    inflation: String(i.inflation),
    az: String(i.azGrowth),
  }).toString();
