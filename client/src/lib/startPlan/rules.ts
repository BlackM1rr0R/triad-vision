/**
 * "Start here" wizard (/start → /start/plan?w=…&p=…&l=…): the deterministic rules that turn three answers (who are
 * you · profession · German level) into a personal plan — 3–5 ordered steps with links, five tools, guide
 * candidates, the profession hub whose vacancies to show and the call to action. Pure data, no React; tested in
 * rules.test.ts. Step / tool texts: i18n/pagesStartHere.ts (startHere.steps.<id>), toolsPage.items.<key>.
 *
 * Language targets are ORIENTATION, not legal rules (shown as such, with sources, on the plan page):
 * - Ausbildung: as a rule B1; the training company may confirm lower skills in writing (§ 16a AufenthG,
 *   make-it-in-germany.com "Visum zur Berufsausbildung").
 * - Nursing: recognition as Pflegefachkraft usually asks for B2 (varies by federal state).
 * - Spouses: often simple German (A1) — with exceptions, e.g. spouses of skilled workers (§ 30 AufenthG).
 * - Other workers / students: B1 recommended (most employers / many programmes ask for it).
 */
import { PROFESSION_HUB_SLUGS, hubBySlug, type ProfessionHubSlug } from '../professionHubs';

export const WHO = ['worker', 'ausbildung', 'student', 'family', 'employer'] as const;
export type Who = (typeof WHO)[number];
export const PROFESSIONS = [...PROFESSION_HUB_SLUGS, 'other'] as const;
export type Profession = (typeof PROFESSIONS)[number];
export const LEVELS = ['none', 'a1', 'a2', 'b1', 'b2'] as const;
export type Level = (typeof LEVELS)[number];

export interface PlanInput {
  who: Who;
  /** Only for worker / ausbildung / family (null otherwise). */
  profession: Profession | null;
  /** Everyone but employers (null for employers). */
  level: Level | null;
}

export type StepId =
  | 'eligibility'
  | 'germanLearn'
  | 'germanProve'
  | 'documents'
  | 'money'
  | 'apply'
  | 'familyCheck'
  | 'studyFind'
  | 'ausbildungFind'
  | 'empGuide'
  | 'empCandidates'
  | 'empCosts'
  | 'empEzb'
  | 'empContact';

export interface PlanStep {
  id: StepId;
  /** Internal links (site paths, optionally with a query or hash), most important first. */
  links: string[];
  /** Target language level of the German steps ("B1"). */
  target?: string;
}

export type CtaKind = 'register' | 'employer';

export interface Plan {
  input: PlanInput;
  steps: PlanStep[];
  /** Five tool paths (all in components/audience/tools.ts TOOLS). */
  tools: string[];
  /** Guide keys in order of preference (the page shows the first one published in the reader's language). */
  guides: string[];
  /** Profession hub whose vacancies the plan lists (GET /api/profession-hubs/:slug/vacancies), else null. */
  hub: ProfessionHubSlug | null;
  cta: CtaKind;
}

export const needsProfession = (who: Who) => who === 'worker' || who === 'ausbildung' || who === 'family';
export const needsLevel = (who: Who) => who !== 'employer';

const isOf = <T extends string>(list: readonly T[], v: string | null | undefined): v is T => !!v && (list as readonly string[]).includes(v);

/** Reads ?w=&p=&l= (the shareable plan URL). Null when an answer is missing or unknown. */
export const parsePlanParams = (params: URLSearchParams): PlanInput | null => {
  const w = params.get('w');
  if (!isOf(WHO, w)) return null;
  const p = params.get('p');
  const l = params.get('l');
  const profession = needsProfession(w) ? (isOf(PROFESSIONS, p) ? p : null) : null;
  const level = needsLevel(w) ? (isOf(LEVELS, l) ? l : null) : null;
  if (needsProfession(w) && !profession) return null;
  if (needsLevel(w) && !level) return null;
  return { who: w, profession, level };
};

/** "?w=worker&p=cook&l=a2" (only the answers that apply). */
export const planSearch = (input: PlanInput): string => {
  const q = new URLSearchParams({ w: input.who });
  if (needsProfession(input.who) && input.profession) q.set('p', input.profession);
  if (needsLevel(input.who) && input.level) q.set('l', input.level);
  return `?${q.toString()}`;
};

export const levelRank = (l: Level) => LEVELS.indexOf(l);

/** Recommended German level (orientation, see the header). */
export const targetLevel = (input: PlanInput): Level => {
  if (input.who === 'family') return 'a1';
  if (input.profession === 'nurse') return 'b2';
  return 'b1';
};

const LABEL: Record<Level, string> = { none: '–', a1: 'A1', a2: 'A2', b1: 'B1', b2: 'B2' };

/** Visa document checklist type (/visa-document-checklist?type=…). */
export const checklistType = (input: PlanInput): string => {
  if (input.who === 'ausbildung') return 'ausbildung';
  if (input.who === 'student') return 'study';
  if (input.who === 'family') return 'family';
  if (input.profession === 'nurse') return 'recognition';
  return 'skilled';
};

/** Professions whose qualification usually needs formal recognition (Anerkennung) first. */
const RECOGNITION: ReadonlySet<Profession> = new Set<Profession>(['nurse', 'electrician', 'cook']);

const germanStep = (input: PlanInput): PlanStep | null => {
  if (!input.level) return null;
  const target = targetLevel(input);
  if (levelRank(input.level) >= levelRank(target)) {
    return { id: 'germanProve', links: [levelRank(input.level) >= levelRank('b1') ? '/german-mock-exam/b1' : '/german-mock-exam/a1', '/german-level-test-self'], target: LABEL[target] };
  }
  return { id: 'germanLearn', links: ['/german-level-test-self', levelRank(input.level) < levelRank('a2') ? '/german-mock-exam/a1' : '/german-mock-exam/b1'], target: LABEL[target] };
};

const hubOf = (input: PlanInput): ProfessionHubSlug | null => (input.profession && input.profession !== 'other' ? input.profession : null);

const BASE_TOOLS: Record<Who, string[]> = {
  worker: ['/salary-calculator', '/anerkennung', '/blue-card-check', '/which-city', '/workplace-etiquette', '/budget'],
  ausbildung: ['/salary-calculator', '/german-mock-exam', '/which-city', '/budget', '/workplace-etiquette', '/rent-check'],
  student: ['/grade-converter', '/cost-calculator', '/budget', '/which-city', '/german-mock-exam', '/rent-check'],
  family: ['/family-reunification-check', '/cost-calculator', '/german-mock-exam', '/which-city', '/life-in-germany', '/budget'],
  employer: ['/employer-cost-calculator', '/kandidaten', '/employer-guide-azerbaijan', '/shortage-barometer', '/novruz-card'],
};

/** Five tools: the profession hub's (workers) first, then the defaults of the group; only paths in `known`. */
export const planTools = (input: PlanInput, known: readonly string[]): string[] => {
  const hub = input.who === 'worker' ? hubBySlug(hubOf(input) ?? undefined) : null;
  const out: string[] = [];
  for (const p of [...(hub?.tools ?? []), ...BASE_TOOLS[input.who]]) {
    if (known.includes(p) && !out.includes(p)) out.push(p);
    if (out.length === 5) break;
  }
  return out;
};

const GUIDES: Record<Who, string[]> = {
  worker: ['work-visa', 'salary-net', 'first-month'],
  ausbildung: ['ausbildung', 'work-visa', 'first-month'],
  student: ['first-month', 'salary-net'],
  family: ['familiennachzug', 'first-month'],
  employer: ['employer-azerbaijan', 'fast-track-81a', 'employer-apprentices'],
};

/** Builds the plan. `knownTools` = the paths of the public tools registry (components/audience/tools.ts). */
export const buildPlan = (input: PlanInput, knownTools: readonly string[]): Plan => {
  const hub = hubOf(input);
  const hubData = hubBySlug(hub ?? undefined);
  const docs = { id: 'documents' as const, links: [`/visa-document-checklist?type=${checklistType(input)}`] };
  const german = germanStep(input);
  let steps: (PlanStep | null)[];

  switch (input.who) {
    case 'employer':
      steps = [
        { id: 'empGuide', links: ['/employer-guide-azerbaijan'] },
        { id: 'empCandidates', links: ['/kandidaten'] },
        { id: 'empCosts', links: ['/employer-cost-calculator'] },
        { id: 'empEzb', links: ['/employer-guide-azerbaijan#ega-visa', '/glossary/zustimmung-der-bundesagentur', '/glossary/beschleunigtes-fachkraefteverfahren'] },
        { id: 'empContact', links: ['/for-employers', '/contact'] },
      ];
      break;
    case 'ausbildung':
      steps = [
        { id: 'ausbildungFind', links: ['/ausbildung', '/path-finder'] },
        german,
        docs,
        { id: 'money', links: ['/salary-calculator', '/budget'] },
        { id: 'apply', links: ['/register', '/booking'] },
      ];
      break;
    case 'student':
      steps = [
        { id: 'studyFind', links: ['/study', '/grade-converter'] },
        german,
        docs,
        { id: 'money', links: ['/cost-calculator', '/budget'] },
        { id: 'apply', links: ['/register', '/booking'] },
      ];
      break;
    case 'family':
      steps = [
        { id: 'familyCheck', links: ['/family-reunification-check', '/path-finder'] },
        german,
        docs,
        { id: 'money', links: ['/cost-calculator', '/budget'] },
        { id: 'apply', links: ['/register', '/booking'] },
      ];
      break;
    default: {
      // Professions that usually need recognition first: the recognition check joins the eligibility step.
      const recognition = !!input.profession && RECOGNITION.has(input.profession);
      steps = [
        { id: 'eligibility', links: recognition ? ['/path-finder', '/anerkennung'] : ['/path-finder', '/blue-card-check'] },
        german,
        docs,
        { id: 'money', links: ['/salary-calculator', '/budget'] },
        { id: 'apply', links: [hubData ? `/for/${hubData.slug}` : '/jobs', '/register', '/booking'] },
      ];
    }
  }

  const guides = input.who === 'worker' && hubData ? [...hubData.guides, ...GUIDES.worker] : GUIDES[input.who];
  return {
    input,
    steps: steps.filter((s): s is PlanStep => !!s),
    tools: planTools(input, knownTools),
    guides: [...new Set(guides)],
    hub: input.who === 'employer' || input.who === 'student' ? null : hub,
    cta: input.who === 'employer' ? 'employer' : 'register',
  };
};
