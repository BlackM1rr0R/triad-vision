/**
 * Permanent residence (Niederlassungserlaubnis) and citizenship (Einbürgerung) timeline (/permanent-residence).
 * Pure and deterministic: months as "YYYY-MM", no Intl, no clock (the caller passes `today`).
 *
 * Law as of November 2026 (sources in the page copy, LAW below):
 *  - § 18c (2) AufenthG — EU Blue Card: 27 months of Blue Card employment with pension contributions and
 *    simple German (A1); 21 months with sufficient German (B1).
 *  - § 18c (1) AufenthG — skilled workers (§ 18a / § 18b / § 18g…): 3 years with the title and 36 months of
 *    pension contributions, sufficient German (B1); 2 years / 24 months after a German vocational training or
 *    degree. Time on an Ausbildung visa or Chancenkarte does not count toward these years (only the title).
 *  - § 28 (2) AufenthG — spouse of a German: 3 years with the residence permit, family living together, B1.
 *  - § 9 AufenthG — general rule (family members of foreigners and everyone else): 5 years with a residence
 *    permit, 60 months of pension contributions (spouses: one partner's contributions count), B1, basic knowledge
 *    of the legal and social order ("Leben in Deutschland" test).
 *  - § 10 StAG — citizenship: 5 years of lawful habitual residence (since the reform of 27.06.2024), B1, own
 *    livelihood, naturalisation test, no conviction. The 3-year "special integration" route (§ 10 (3)) was
 *    repealed in October 2025.
 *  - § 9 StAG — spouse of a German: 3 years of residence and the marriage has lasted 2 years.
 *  - Dual citizenship: Germany allows it since 27.06.2024 — Azerbaijan does not (voluntary acquisition of another
 *    citizenship is a ground for losing Azerbaijani citizenship, Law on Citizenship Art. 18).
 */

export const PR_PERMITS = ['blueCard', 'skilled', 'ausbildung', 'chancenkarte', 'family'] as const;
export type PrPermit = (typeof PR_PERMITS)[number];
export const PR_GERMAN = ['none', 'a1', 'b1', 'b2'] as const;
export type PrGerman = (typeof PR_GERMAN)[number];

export const PR_AS_OF = '2026-11';

export interface PrInput {
  permit: PrPermit;
  german: PrGerman;
  /** Start of lawful residence in Germany (arrival), YYYY-MM. */
  start: string;
  /** Ausbildung / Chancenkarte: months before the work title (skilled worker permit) started. */
  before: number;
  /** German pension contributions so far, in months; null = continuously since the work title started. */
  pension: number | null;
  /** Completed a German vocational training or degree (skilled workers; automatic after Ausbildung). */
  germanDegree: boolean;
  marriedGerman: boolean;
  /** Marriage date (YYYY-MM) when married to a German. */
  marriedSince: string | null;
}

export type PrRoute = 'blueCard' | 'skilled' | 'skilledDegree' | 'spouseGerman' | 'general';
export type PrRequirement =
  | 'germanA1'
  | 'germanB1'
  | 'pension'
  | 'job'
  | 'livelihood'
  | 'space'
  | 'lid'
  | 'noCrime'
  | 'familyUnit'
  | 'einbTest'
  | 'commitment'
  | 'marriage';

export interface PrResult {
  route: PrRoute;
  paragraph: string;
  /** When the qualifying title starts (YYYY-MM). */
  titleStart: string;
  /** Months with the title the route requires. */
  titleMonths: number;
  /** Pension months the route requires (0: none). */
  pensionMonths: number;
  /** Earliest Niederlassungserlaubnis (YYYY-MM): later of title time and pension months. */
  settlement: string;
  /** Limited by: the title time or the pension contributions. */
  settlementBy: 'title' | 'pension';
  /** German level the route needs and whether the visitor has it. */
  germanNeeded: 'a1' | 'b1';
  germanOk: boolean;
  /** Blue Card below B1: the 21-month date with B1. */
  fasterWithB1: string | null;
  citizenship: string;
  citizenshipRoute: 'standard' | 'spouseGerman';
  citizenshipGermanOk: boolean;
  requirements: PrRequirement[];
  citizenshipRequirements: PrRequirement[];
  /** settlement / citizenship already reached at `today`. */
  settlementReached: boolean;
  citizenshipReached: boolean;
}

const LEVEL: Record<PrGerman, number> = { none: 0, a1: 1, b1: 2, b2: 3 };

/** "2026-11" + n months. */
export const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + Math.round(n);
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
export const monthsBetween = (a: string, b: string) => {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return yb * 12 + mb - (ya * 12 + ma);
};
const later = (a: string, b: string) => (a >= b ? a : b);
export const isYm = (s: string | null | undefined): s is string => !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

export const DEFAULT_PR: Omit<PrInput, 'start'> = { permit: 'blueCard', german: 'a1', before: 0, pension: null, germanDegree: false, marriedGerman: false, marriedSince: null };
export const DEFAULT_BEFORE: Record<PrPermit, number> = { blueCard: 0, skilled: 0, ausbildung: 36, chancenkarte: 12, family: 0 };

export const computePr = (input: PrInput, today: string): PrResult => {
  const lvl = LEVEL[input.german];
  const switches = input.permit === 'ausbildung' || input.permit === 'chancenkarte';
  const titleStart = addMonths(input.start, switches ? Math.max(0, input.before) : 0);
  const degree = input.permit === 'ausbildung' || (input.germanDegree && input.permit !== 'blueCard' && input.permit !== 'family');

  let route: PrRoute;
  let paragraph: string;
  let titleMonths: number;
  let pensionMonths: number;
  let germanNeeded: 'a1' | 'b1' = 'b1';
  let fasterWithB1: string | null = null;
  let requirements: PrRequirement[];

  if (input.permit === 'blueCard') {
    route = 'blueCard';
    paragraph = '§ 18c Abs. 2 AufenthG';
    titleMonths = lvl >= LEVEL.b1 ? 21 : 27;
    pensionMonths = titleMonths;
    germanNeeded = lvl >= LEVEL.b1 ? 'b1' : 'a1';
    requirements = [germanNeeded === 'b1' ? 'germanB1' : 'germanA1', 'job', 'pension', 'livelihood', 'space', 'lid', 'noCrime'];
  } else if (input.permit === 'family') {
    if (input.marriedGerman) {
      route = 'spouseGerman';
      paragraph = '§ 28 Abs. 2 AufenthG';
      titleMonths = 36;
      pensionMonths = 0;
      requirements = ['germanB1', 'familyUnit', 'lid', 'noCrime'];
    } else {
      route = 'general';
      paragraph = '§ 9 AufenthG';
      titleMonths = 60;
      pensionMonths = 60;
      requirements = ['germanB1', 'pension', 'livelihood', 'space', 'lid', 'noCrime'];
    }
  } else {
    route = degree ? 'skilledDegree' : 'skilled';
    paragraph = '§ 18c Abs. 1 AufenthG';
    titleMonths = degree ? 24 : 36;
    pensionMonths = titleMonths;
    requirements = ['germanB1', 'job', 'pension', 'livelihood', 'space', 'lid', 'noCrime'];
  }

  const byTitle = addMonths(titleStart, titleMonths);
  // Pension: given months so far (as of today) → the rest from today on; unknown → continuously since the title.
  const pensionFrom = input.pension == null ? titleStart : later(titleStart, today);
  const pensionLeft = input.pension == null ? pensionMonths : Math.max(0, pensionMonths - input.pension);
  const byPension = pensionMonths ? addMonths(pensionFrom, pensionLeft) : byTitle;
  const settlement = later(byTitle, byPension);
  if (route === 'blueCard' && lvl < LEVEL.b1) {
    const t21 = addMonths(titleStart, 21);
    const p21 = input.pension == null ? addMonths(titleStart, 21) : addMonths(pensionFrom, Math.max(0, 21 - input.pension));
    fasterWithB1 = later(t21, p21);
  }

  // Citizenship: 5 years of lawful residence from arrival (Ausbildung and Chancenkarte years count), or as the
  // spouse of a German 3 years of residence once the marriage has lasted 2 years.
  let citizenship = addMonths(input.start, 60);
  let citizenshipRoute: PrResult['citizenshipRoute'] = 'standard';
  if (input.marriedGerman) {
    const spouseDate = later(addMonths(input.start, 36), addMonths(isYm(input.marriedSince) ? input.marriedSince : input.start, 24));
    if (spouseDate < citizenship) {
      citizenship = spouseDate;
      citizenshipRoute = 'spouseGerman';
    }
  }
  const citizenshipRequirements: PrRequirement[] = ['germanB1', 'livelihood', 'einbTest', 'commitment', 'noCrime', ...(citizenshipRoute === 'spouseGerman' ? (['marriage'] as PrRequirement[]) : [])];

  return {
    route,
    paragraph,
    titleStart,
    titleMonths,
    pensionMonths,
    settlement,
    settlementBy: byPension > byTitle ? 'pension' : 'title',
    germanNeeded,
    germanOk: lvl >= LEVEL[germanNeeded],
    fasterWithB1,
    citizenship,
    citizenshipRoute,
    citizenshipGermanOk: lvl >= LEVEL.b1,
    requirements,
    citizenshipRequirements,
    settlementReached: settlement <= today,
    citizenshipReached: citizenship <= today,
  };
};

/** URL ⇄ input (?permit&german&start&before&pension&degree&married&since). */
export const prFromParams = (p: URLSearchParams, today: string): PrInput => {
  const permit = (PR_PERMITS as readonly string[]).includes(p.get('permit') ?? '') ? (p.get('permit') as PrPermit) : DEFAULT_PR.permit;
  const german = (PR_GERMAN as readonly string[]).includes(p.get('german') ?? '') ? (p.get('german') as PrGerman) : DEFAULT_PR.german;
  const start = isYm(p.get('start')) ? p.get('start')! : today;
  const before = p.has('before') ? Math.min(72, Math.max(0, Math.round(Number(p.get('before')) || 0))) : DEFAULT_BEFORE[permit];
  const pRaw = p.get('pension');
  const pension = pRaw !== null && pRaw !== '' && Number.isFinite(Number(pRaw)) ? Math.min(600, Math.max(0, Math.round(Number(pRaw)))) : null;
  const since = p.get('since');
  return { permit, german, start, before, pension, germanDegree: p.get('degree') === '1', marriedGerman: p.get('married') === '1', marriedSince: isYm(since) ? since : null };
};

export const prToQuery = (i: PrInput) => {
  const q = new URLSearchParams();
  q.set('permit', i.permit);
  q.set('german', i.german);
  q.set('start', i.start);
  if (i.before !== DEFAULT_BEFORE[i.permit]) q.set('before', String(i.before));
  if (i.pension != null) q.set('pension', String(i.pension));
  if (i.germanDegree) q.set('degree', '1');
  if (i.marriedGerman) q.set('married', '1');
  if (i.marriedGerman && i.marriedSince) q.set('since', i.marriedSince);
  return q.toString();
};
