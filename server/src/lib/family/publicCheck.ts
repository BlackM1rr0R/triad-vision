import { z } from 'zod';
import { assessReunion, FAMILY_LAW, SPONSOR_TITLES, type CheckStatus, type ReadinessCheck, type ReadinessMember, type SponsorTitle } from './legal.js';

/**
 * Public family-reunification self-check (/family-reunification-check, GET /api/family-check) for visitors
 * WITHOUT a case: the same rules as the staff / portal readiness check (lib/family/legal.ts assessReunion),
 * fed with the visitor's answers instead of case data. Pure: no database, nothing stored, nothing logged.
 *
 * Answer per person: "now" (every rule met), "likely" (met, but something the authority weighs — estimated
 * income, discretion), "after" (a fixable gap: A1, income, flat, age 18, a work title first), "check"
 * (an answer is missing) or "no" (the rules do not allow it: adult child, parents of an older title).
 * Codes only; the client words them in the visitor's language.
 */

const blank = (v: unknown) => (v === '' || v === null ? undefined : v);
const int = (min: number, max: number) => z.preprocess(blank, z.coerce.number().int().min(min).max(max).optional());
const day = z.preprocess(blank, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional());

export const FAMILY_CHECK_GERMAN = ['none', 'a1'] as const;

export const familyCheckSchema = z.object({
  title: z.preprocess(blank, z.enum(SPONSOR_TITLES).default('SKILLED')),
  /** Date the main applicant's title was FIRST issued (parents' rule § 36 (3)). */
  issued: day,
  net: int(0, 100_000),
  gross: int(0, 100_000),
  /** Warm rent per month (EUR). */
  rent: int(0, 20_000),
  /** Flat size in m². */
  space: int(0, 2_000),
  spouse: z.preprocess(blank, z.enum(['0', '1']).default('1')),
  spouseAge: int(14, 99),
  spouseGerman: z.preprocess(blank, z.enum(FAMILY_CHECK_GERMAN).default('none')),
  /** Children's ages, comma separated ("3,7,16"), at most 8. */
  children: z.preprocess(
    blank,
    z
      .string()
      .max(40)
      .regex(/^\d{1,2}(,\d{1,2}){0,7}$/)
      .optional(),
  ),
  parents: int(0, 4),
});
export type FamilyCheckInput = z.infer<typeof familyCheckSchema>;

export type Verdict = 'now' | 'likely' | 'after' | 'check' | 'no';
export type Who = 'spouse' | 'child' | 'parent';

export interface Blocker {
  code: string;
  status: CheckStatus;
  params: Record<string, number | string | boolean | null>;
}

export type DocKey =
  | 'sponsorPassport'
  | 'sponsorTitle'
  | 'sponsorContract'
  | 'sponsorPayslips'
  | 'sponsorRent'
  | 'sponsorRegistration'
  | 'memberPassport'
  | 'photos'
  | 'applicationForm'
  | 'healthInsurance'
  | 'marriageCert'
  | 'germanA1'
  | 'birthCert'
  | 'custodyConsent'
  | 'childGerman'
  | 'parentRelation'
  | 'parentLivelihood';

/** Rules that cannot be fixed by waiting / preparing: the person cannot come under this rule. */
const FINAL_FAILS = new Set(['CHILD_AGE', 'PARENT_ALLOWED']);
/** Rules about the whole family (the main applicant): they hold back every member. */
const FAMILY_CODES = new Set(['SPONSOR_TITLE', 'LIVING_SPACE', 'INCOME']);

/** A birth date that gives `age` full years at `now` (half a year after the birthday). */
const birthFor = (age: number, now: Date) => new Date(Date.UTC(now.getUTCFullYear() - age, now.getUTCMonth(), now.getUTCDate()) - 182 * 86_400_000);

const verdictOf = (checks: ReadinessCheck[]): Verdict => {
  if (checks.some((c) => c.status === 'fail' && FINAL_FAILS.has(c.code))) return 'no';
  if (checks.some((c) => c.status === 'fail' || (c.code === 'SPOUSE_LANGUAGE' && c.status === 'missing'))) return 'after';
  if (checks.some((c) => c.status === 'missing')) return 'check';
  if (checks.some((c) => c.status === 'warn')) return 'likely';
  return 'now';
};

const blockersOf = (checks: ReadinessCheck[]): Blocker[] => checks.filter((c) => c.status !== 'ok').map((c) => ({ code: c.code, status: c.status, params: c.params }));

/** Runs the reunion rules on the visitor's answers. */
export const familySelfCheck = (input: FamilyCheckInput, now = new Date()) => {
  const L = FAMILY_LAW;
  const title = input.title as SponsorTitle;
  const spouse = input.spouse === '1';
  const childAges = input.children ? input.children.split(',').map(Number) : [];
  const parents = input.parents ?? 0;
  const spouseExemptByTitle = L.spouse.languageExemptTitles.includes(title);

  const core: ReadinessMember[] = [];
  if (spouse)
    core.push({
      caseId: 'spouse',
      relation: 'spouse',
      birthDate: input.spouseAge != null ? birthFor(input.spouseAge, now) : null,
      germanExempt: spouseExemptByTitle,
      germanCertAccepted: input.spouseGerman === 'a1',
    });
  childAges.forEach((age, i) => core.push({ caseId: `child-${i}`, relation: 'child', birthDate: birthFor(age, now), germanExempt: false, germanCertAccepted: false }));

  const sponsor = {
    title,
    titleIssuedAt: input.issued ? new Date(`${input.issued}T00:00:00.000Z`) : null,
    livingSpaceM2: input.space ?? null,
    warmRent: input.rent ?? null,
    netMonthly: input.net ?? null,
    grossMonthly: input.net == null ? (input.gross ?? null) : null,
  };
  // Spouse and children: the core family (flat and income are counted for them). Parents (§ 36 (3)) are
  // checked on their own: they need their own livelihood and health insurance, not the core family's flat.
  const r = assessReunion(sponsor, core, now);
  const parentCheck = parents ? assessReunion(sponsor, [{ caseId: 'parent-0', relation: 'parent', birthDate: null, germanExempt: false, germanCertAccepted: false }], now) : null;
  const family = r.checks.filter((c) => FAMILY_CODES.has(c.code));
  // SPOUSE_AGE: add the years until 18 (the earliest moment the rule is met).
  const withYears = (c: ReadinessCheck): ReadinessCheck =>
    c.code === 'SPOUSE_AGE' && c.status === 'fail' && typeof c.params.age === 'number' ? { ...c, params: { ...c.params, yearsTo18: L.spouse.minAge - c.params.age } } : c;
  const person = (id: string) => {
    const own = r.checks.filter((c) => c.memberCaseId === id).map(withYears);
    const all = [...own, ...family];
    return { verdict: verdictOf(all), blockers: blockersOf(all) };
  };
  const parentResult = () => {
    const all = (parentCheck?.checks ?? []).filter((c) => c.memberCaseId === 'parent-0' || c.code === 'SPONSOR_TITLE');
    return { verdict: verdictOf(all), blockers: blockersOf(all) };
  };

  const docs = new Set<DocKey>(['sponsorPassport', 'sponsorTitle', 'sponsorContract', 'sponsorPayslips', 'sponsorRegistration']);
  if (!L.livingSpace.exemptTitles.includes(title)) docs.add('sponsorRent');
  if (core.length || parents) ['memberPassport', 'photos', 'applicationForm', 'healthInsurance'].forEach((d) => docs.add(d as DocKey));
  if (spouse) {
    docs.add('marriageCert');
    if (!spouseExemptByTitle) docs.add('germanA1');
  }
  if (childAges.length) {
    docs.add('birthCert');
    docs.add('custodyConsent');
    if (childAges.some((a) => a >= L.child.languageFromAge && a < L.child.maxAgeExclusive) && !L.child.languageExemptTitles.includes(title)) docs.add('childGerman');
  }
  if (parents) {
    docs.add('parentRelation');
    docs.add('parentLivelihood');
  }

  return {
    asOf: L.asOf,
    status: r.status,
    title: { code: title, paragraph: L.titles[title].paragraph, reunion: L.titles[title].reunion },
    spouseLanguageExempt: spouseExemptByTitle,
    livingSpaceExempt: L.livingSpace.exemptTitles.includes(title),
    livingSpace: r.livingSpace,
    income: r.income,
    family: blockersOf(family),
    spouse: spouse ? person('spouse') : null,
    children: childAges.map((age, i) => ({ age, ...person(`child-${i}`) })),
    parents: parents ? { count: parents, ...parentResult() } : null,
    documents: [...docs],
  };
};
export type FamilySelfCheck = ReturnType<typeof familySelfCheck>;
