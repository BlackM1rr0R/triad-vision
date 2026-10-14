/**
 * Pure scoring rules for the "Which visa suits me?" eligibility quiz.
 * No React, no i18n — the UI translates the returned keys via `quiz.reasons.*` / `quiz.checklist.*`.
 */

export const FIELD_SLUGS = [
  'lkw-fahrer',
  'kurierfahrer',
  'gastronomie-hotel',
  'bau-handwerk',
  'pflege-gesundheit',
  'landwirtschaft',
  'industrie-technik',
  'ausbildung',
  'it-buero',
] as const;

export type Education = 'school' | 'vocational' | 'university';
export type Experience = 'exp0' | 'exp1' | 'exp3' | 'exp5';
export type German = 'none' | 'a1a2' | 'b1' | 'b2';
export type AgeRange = 'a18' | 'a26' | 'a36' | 'a46';
export type Licence = 'B' | 'C' | 'CE' | 'none';
export type Goal = 'work' | 'study' | 'seasonal';

export interface QuizAnswers {
  field?: string;
  education?: Education;
  experience?: Experience;
  german?: German;
  age?: AgeRange;
  licence?: Licence;
  goal?: Goal;
}

export type QuestionId = keyof QuizAnswers;

export const OPTIONS = {
  education: ['school', 'vocational', 'university'],
  experience: ['exp0', 'exp1', 'exp3', 'exp5'],
  german: ['none', 'a1a2', 'b1', 'b2'],
  age: ['a18', 'a26', 'a36', 'a46'],
  licence: ['B', 'C', 'CE', 'none'],
  goal: ['work', 'study', 'seasonal'],
} as const;

export const DRIVER_SLUGS = ['lkw-fahrer', 'kurierfahrer'];
export const isDriverField = (field?: string) => !!field && DRIVER_SLUGS.includes(field);

/** The ordered list of steps for the current answers (the licence step only appears for drivers). */
export const stepsFor = (a: QuizAnswers): QuestionId[] => {
  const steps: QuestionId[] = ['field', 'education', 'experience', 'german', 'age'];
  if (isDriverField(a.field)) steps.push('licence');
  steps.push('goal');
  return steps;
};

export const isComplete = (a: QuizAnswers) => stepsFor(a).every((s) => a[s] !== undefined);

// ─── Category profiles ────────────────────────────────────────────────────

const GERMAN_RANK: Record<German, number> = { none: 0, a1a2: 1, b1: 2, b2: 3 };
const EXP_YEARS: Record<Experience, number> = { exp0: 0, exp1: 1.5, exp3: 4, exp5: 6 };
const EDU_RANK: Record<Education, number> = { school: 0, vocational: 1, university: 2 };

interface Profile {
  /** Minimum German level that makes an application realistic (rank of GERMAN_RANK). */
  german: number;
  /** Years of experience that make a strong case. */
  years: number;
  /** Minimum education rank. */
  education: number;
  kind: 'work' | 'study' | 'seasonal';
  driver?: 'truck' | 'van';
  /** Fields considered closely related (partial credit). */
  related?: string[];
}

const DEFAULT_PROFILE: Profile = { german: 1, years: 2, education: 1, kind: 'work' };

const PROFILES: Record<string, Profile> = {
  'lkw-fahrer': { german: 1, years: 2, education: 0, kind: 'work', driver: 'truck', related: ['kurierfahrer'] },
  kurierfahrer: { german: 1, years: 1, education: 0, kind: 'work', driver: 'van', related: ['lkw-fahrer'] },
  'gastronomie-hotel': { german: 1, years: 2, education: 1, kind: 'work', related: ['landwirtschaft'] },
  'bau-handwerk': { german: 1, years: 2, education: 1, kind: 'work', related: ['industrie-technik'] },
  'pflege-gesundheit': { german: 2, years: 1, education: 1, kind: 'work', related: ['ausbildung'] },
  landwirtschaft: { german: 0, years: 0, education: 0, kind: 'seasonal', related: ['gastronomie-hotel'] },
  'industrie-technik': { german: 1, years: 2, education: 1, kind: 'work', related: ['bau-handwerk'] },
  ausbildung: { german: 2, years: 0, education: 0, kind: 'study' },
  'it-buero': { german: 0, years: 2, education: 2, kind: 'work', related: ['industrie-technik'] },
};

export const profileFor = (slug: string): Profile => PROFILES[slug] ?? DEFAULT_PROFILE;

export const GERMAN_LEVEL_LABEL = ['A1', 'A2', 'B1', 'B2'] as const;
const requiredGermanLabel = (p: Profile) => (p.german <= 0 ? 'A1' : p.german === 1 ? 'A2' : p.german === 2 ? 'B1' : 'B2');

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

// ─── Match score (how well a category fits the person) ────────────────────

export interface CategoryMatch {
  slug: string;
  score: number;
  reasons: string[];
}

export const matchCategory = (slug: string, a: QuizAnswers): CategoryMatch => {
  const p = profileFor(slug);
  const reasons: string[] = [];
  let s = 10;

  // Field preference is the strongest signal.
  if (a.field === slug) {
    s += 35;
    reasons.push('fieldMatch');
  } else if (a.field && p.related?.includes(a.field)) {
    s += 15;
    reasons.push('relatedField');
  }

  // Goal.
  if (a.goal) {
    if (a.goal === p.kind) {
      s += a.goal === 'work' ? 10 : 30;
      if (a.goal !== 'work') reasons.push(a.goal === 'study' ? 'goalStudy' : 'goalSeasonal');
    } else if (a.goal === 'seasonal' && slug === 'gastronomie-hotel') {
      s += 10; // hotels hire seasonal staff too
    } else if (a.goal === 'study' && slug === 'pflege-gesundheit') {
      s += 8; // nursing Ausbildung is a common path
    } else {
      s -= 12;
    }
  }

  // German.
  if (a.german) {
    const gap = GERMAN_RANK[a.german] - p.german;
    if (gap >= 1 && p.german >= 1) reasons.push('germanStrong');
    s += gap >= 0 ? 8 + Math.min(gap, 2) * 3 : gap * (p.german >= 2 ? 10 : 5);
  }

  // Experience (irrelevant for Ausbildung / seasonal work).
  if (a.experience && p.years > 0) {
    const y = EXP_YEARS[a.experience];
    if (y >= p.years) {
      s += 10 + (y >= 4 ? 4 : 0);
      if (a.field === slug || p.related?.includes(a.field ?? '')) reasons.push('experienceStrong');
    } else s -= y === 0 ? 12 : 4;
  }

  // Education.
  if (a.education) {
    const gap = EDU_RANK[a.education] - p.education;
    if (gap >= 0) {
      s += 6;
      if (slug === 'it-buero' && a.education === 'university') {
        s += 8;
        reasons.push('degreeStrong');
      }
      if (a.education === 'vocational' && p.education === 1 && a.field === slug) reasons.push('vocationalStrong');
    } else s += gap * (slug === 'it-buero' ? 14 : 6);
  }

  // Age.
  if (a.age) {
    if (p.kind === 'study') {
      s += { a18: 12, a26: 4, a36: -14, a46: -30 }[a.age];
      if (a.age === 'a18') reasons.push('ageFit');
    } else if (a.age === 'a46' && p.kind === 'work') s -= 4;
  }

  // Driving licence.
  if (p.driver && a.licence) {
    if (p.driver === 'truck') {
      s += { CE: 18, C: 10, B: -8, none: -20 }[a.licence];
      if (a.licence === 'CE') reasons.push('licenceStrong');
    } else {
      s += a.licence === 'none' ? -20 : 8;
      if (a.licence !== 'none') reasons.push('licenceOk');
    }
  } else if (p.driver && !isDriverField(a.field)) {
    s -= 10; // never asked about a licence → assume none
  }

  return { slug, score: clamp(s), reasons };
};

// ─── Readiness (how prepared the person is for the recommended visa) ─────

export const readinessFor = (slug: string, a: QuizAnswers): number => {
  const p = profileFor(slug);
  let r = 0;
  // German — 30 pts.
  const g = a.german ? GERMAN_RANK[a.german] - p.german : -3;
  r += g >= 0 ? 30 : g === -1 ? 18 : g === -2 ? 8 : 0;
  // Experience — 25 pts.
  if (p.years === 0) r += 25;
  else if (a.experience) r += Math.min(1, EXP_YEARS[a.experience] / p.years) * 25;
  // Education — 20 pts.
  if (a.education) r += EDU_RANK[a.education] >= p.education ? 20 : EDU_RANK[a.education] === p.education - 1 ? 9 : 0;
  // Licence — 15 pts (non-driving categories get it for free).
  if (!p.driver) r += 15;
  else if (p.driver === 'truck') r += a.licence === 'CE' ? 15 : a.licence === 'C' ? 9 : a.licence === 'B' ? 3 : 0;
  else r += a.licence && a.licence !== 'none' ? 15 : 0;
  // Age — 10 pts.
  if (a.age) r += p.kind === 'study' ? { a18: 10, a26: 7, a36: 3, a46: 0 }[a.age] : a.age === 'a46' ? 6 : 10;
  return clamp(r);
};

// ─── Personalised checklist ───────────────────────────────────────────────

export interface ChecklistItem {
  key: string;
  /** 'todo' = something to improve, 'ok' = already fine, 'info' = paperwork to prepare. */
  tone: 'todo' | 'ok' | 'info';
  params?: Record<string, string>;
}

export const checklistFor = (slug: string, a: QuizAnswers): ChecklistItem[] => {
  const p = profileFor(slug);
  const list: ChecklistItem[] = [];
  const level = requiredGermanLabel(p);
  const gRank = a.german ? GERMAN_RANK[a.german] : 0;

  // Language.
  if (slug === 'pflege-gesundheit') {
    list.push(gRank >= 3 ? { key: 'germanOk', tone: 'ok' } : { key: 'germanNursing', tone: 'todo' });
  } else if (gRank < p.german) {
    list.push({ key: 'germanNeeded', tone: 'todo', params: { level } });
  } else if (p.german > 0 || gRank > 0) {
    list.push({ key: 'germanOk', tone: 'ok' });
  }

  // Category specific.
  switch (slug) {
    case 'lkw-fahrer':
      if (a.licence === 'CE') list.push({ key: 'truckCode95', tone: 'info' });
      else list.push({ key: 'truckLicence', tone: 'todo' });
      list.push({ key: 'driverCard', tone: 'info' });
      break;
    case 'kurierfahrer':
      list.push(a.licence && a.licence !== 'none' ? { key: 'licenceConvert', tone: 'info' } : { key: 'courierLicence', tone: 'todo' });
      break;
    case 'pflege-gesundheit':
      list.push({ key: 'nursingRecognition', tone: a.education === 'school' ? 'todo' : 'info' });
      break;
    case 'ausbildung':
      list.push({ key: 'schoolCertificate', tone: 'info' });
      if (a.age === 'a36' || a.age === 'a46') list.push({ key: 'ausbildungAge', tone: 'todo' });
      list.push({ key: 'ausbildungFunds', tone: 'info' });
      break;
    case 'landwirtschaft':
      list.push({ key: 'seasonal', tone: 'info' });
      break;
    case 'it-buero':
      list.push(a.education === 'university' ? { key: 'degreeAnabin', tone: 'info' } : { key: 'itDegree', tone: 'todo' });
      break;
    default:
      break;
  }

  // Recognition of qualifications for skilled-worker categories.
  if (p.kind === 'work' && !p.driver && slug !== 'it-buero' && slug !== 'pflege-gesundheit') {
    list.push(a.education === 'school' ? { key: 'qualificationNeeded', tone: 'todo' } : { key: 'recognition', tone: 'info' });
  }

  // Experience.
  if (p.years > 0 && a.experience) {
    if (EXP_YEARS[a.experience] < p.years) list.push({ key: 'experienceBuild', tone: 'todo', params: { years: String(p.years) } });
    else list.push({ key: 'experienceProof', tone: 'info' });
  }

  // Age 45+ rule for first-time work visas (§18 (2) Nr. 5 AufenthG).
  if (a.age === 'a46' && p.kind === 'work') list.push({ key: 'age45', tone: 'todo' });

  // Always.
  list.push({ key: 'passport', tone: 'info' });
  list.push({ key: 'cv', tone: 'info' });

  // Show what to improve first.
  const order = { todo: 0, info: 1, ok: 2 } as const;
  return list.sort((x, y) => order[x.tone] - order[y.tone]);
};

// ─── Full result ──────────────────────────────────────────────────────────

export interface QuizResult {
  top: CategoryMatch;
  alternatives: CategoryMatch[];
  readiness: number;
  checklist: ChecklistItem[];
}

/** Scores every available category and returns the best match, up to two alternatives, readiness and checklist. */
export const scoreQuiz = (a: QuizAnswers, availableSlugs: readonly string[] = FIELD_SLUGS): QuizResult | null => {
  if (!availableSlugs.length) return null;
  const ranked = availableSlugs.map((slug) => matchCategory(slug, a)).sort((x, y) => y.score - x.score);
  const top = ranked[0];
  const alternatives = ranked.slice(1, 3).filter((m) => m.score >= 35 && m.score >= top.score - 35);
  const checklist = checklistFor(top.slug, a);
  // Open to-dos mean the person is not fully ready yet, whatever the raw score says.
  const todos = checklist.filter((c) => c.tone === 'todo').length;
  const readiness = todos ? Math.min(readinessFor(top.slug, a), 92 - (todos - 1) * 6) : readinessFor(top.slug, a);
  return { top, alternatives, readiness: clamp(readiness), checklist };
};
