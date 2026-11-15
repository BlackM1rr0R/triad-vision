import { CITIES, type City, type Industry } from '@/lib/cities/data';

/**
 * "Which German city suits you?" (/which-city): eight questions, a deterministic score over the 14 city
 * profiles of the city guide (lib/cities/data.ts: size, cost, climate, industries, community) plus four traits
 * kept here (nature, nightlife, public transport, how international). Same answers → same city, everywhere
 * (server render, browser, shared link). No randomness, no network.
 *
 * Answers travel in the URL as one digit per question (?a=01201120, option index), the result as ?r=<slug>.
 */

export const QUESTIONS = {
  climate: ['mild', 'sunny', 'any'],
  size: ['metropolis', 'mid', 'any'],
  budget: ['tight', 'medium', 'comfortable'],
  field: ['logistics', 'care', 'construction', 'it', 'hospitality', 'industry'],
  lifestyle: ['nature', 'nightlife', 'balance'],
  transport: ['noCar', 'mixed', 'car'],
  community: ['important', 'nice', 'no'],
  language: ['englishFirst', 'someGerman', 'germanOk'],
} as const;

export type QuestionKey = keyof typeof QUESTIONS;
export const QUESTION_KEYS = Object.keys(QUESTIONS) as QuestionKey[];
export type Answers = { [K in QuestionKey]: (typeof QUESTIONS)[K][number] };

/** Points 0–3 per question are multiplied by this weight (the job field matters most, then money). */
const WEIGHT: Record<QuestionKey, number> = { climate: 1, size: 1, budget: 1.5, field: 2, lifestyle: 1, transport: 1, community: 1, language: 1 };

/** Traits not in the city guide data (0–3, our editorial judgement). */
const TRAITS: Record<string, { nature: number; nightlife: number; transit: number; intl: number }> = {
  berlin: { nature: 2, nightlife: 3, transit: 3, intl: 3 },
  hamburg: { nature: 2, nightlife: 3, transit: 3, intl: 2 },
  muenchen: { nature: 3, nightlife: 2, transit: 3, intl: 3 },
  koeln: { nature: 1, nightlife: 3, transit: 2, intl: 2 },
  frankfurt: { nature: 2, nightlife: 2, transit: 3, intl: 3 },
  stuttgart: { nature: 3, nightlife: 1, transit: 2, intl: 2 },
  duesseldorf: { nature: 1, nightlife: 2, transit: 2, intl: 2 },
  leipzig: { nature: 2, nightlife: 2, transit: 2, intl: 1 },
  dresden: { nature: 3, nightlife: 1, transit: 2, intl: 1 },
  hannover: { nature: 2, nightlife: 1, transit: 2, intl: 1 },
  nuernberg: { nature: 2, nightlife: 1, transit: 2, intl: 1 },
  dortmund: { nature: 2, nightlife: 1, transit: 2, intl: 1 },
  bremen: { nature: 1, nightlife: 1, transit: 2, intl: 1 },
  essen: { nature: 2, nightlife: 1, transit: 2, intl: 1 },
};

export const QUIZ_CITIES: City[] = CITIES.filter((c) => TRAITS[c.slug]);

const FIELD_INDUSTRIES: Record<Answers['field'], Industry[]> = {
  logistics: ['logistics', 'port', 'trade'],
  care: ['care', 'health'],
  construction: ['construction', 'energy'],
  it: ['it', 'finance', 'media', 'research'],
  hospitality: ['hospitality', 'food', 'aviation'],
  industry: ['automotive', 'manufacturing', 'electrical', 'chemicals'],
};

/** 0 cheap · 1 middle · 2 expensive, from the all-in price of a shared-flat room. */
export const costTier = (c: City) => {
  const mid = (c.wgRoom[0] + c.wgRoom[1]) / 2;
  return mid >= 620 ? 2 : mid >= 480 ? 1 : 0;
};

const pointsFor = (c: City, q: QuestionKey, a: Answers): number => {
  const t = TRAITS[c.slug];
  switch (q) {
    case 'climate':
      if (a.climate === 'any') return 0;
      if (a.climate === 'mild') return { north: 3, west: 3, central: 2, south: 1, east: 1 }[c.climate];
      return { south: 3, east: 2, central: 2, west: 1, north: 0 }[c.climate];
    case 'size':
      if (a.size === 'any') return 0;
      if (a.size === 'metropolis') return c.population >= 1_000_000 ? 3 : c.population >= 700_000 ? 1.5 : 0;
      return c.population < 1_000_000 ? 3 : 1;
    case 'budget': {
      const tier = costTier(c);
      if (a.budget === 'tight') return [3, 1.5, 0][tier];
      if (a.budget === 'medium') return [2, 3, 1][tier];
      return [1, 2, 3][tier];
    }
    case 'field': {
      const wanted = FIELD_INDUSTRIES[a.field];
      const idx = c.industries.findIndex((i) => wanted.includes(i));
      return idx < 0 ? 0 : idx < 3 ? 3 : 2;
    }
    case 'lifestyle':
      if (a.lifestyle === 'nature') return t.nature;
      if (a.lifestyle === 'nightlife') return t.nightlife;
      return Math.min(t.nature, t.nightlife) + 1;
    case 'transport':
      if (a.transport === 'noCar') return t.transit;
      if (a.transport === 'mixed') return 2;
      return Math.min(3, 4 - t.transit);
    case 'community':
      if (a.community === 'no') return 0;
      if (a.community === 'important') return { large: 3, notable: 2, smaller: 0 }[c.community];
      return { large: 2, notable: 2, smaller: 1 }[c.community];
    case 'language':
      if (a.language === 'germanOk') return 0;
      if (a.language === 'englishFirst') return t.intl;
      return Math.min(3, t.intl + 1);
  }
};

export interface CityScore {
  city: City;
  score: number;
  /** 0–100: share of the points this city could get for these answers. */
  match: number;
  /** Questions where this city scored well (≥ 2.5 of 3), strongest first. */
  reasons: QuestionKey[];
}

/** Every quiz city, best first (ties: the order of the city guide). */
export const rankCities = (a: Answers): CityScore[] => {
  const max = QUESTION_KEYS.reduce((s, q) => s + WEIGHT[q] * Math.max(...QUIZ_CITIES.map((c) => pointsFor(c, q, a))), 0) || 1;
  return QUIZ_CITIES.map((city, order) => {
    const per = QUESTION_KEYS.map((q) => ({ q, p: pointsFor(city, q, a), w: WEIGHT[q] }));
    const score = per.reduce((s, x) => s + x.p * x.w, 0);
    const reasons = per
      .filter((x) => x.p >= 2.5)
      .sort((x, y) => y.p * y.w - x.p * x.w)
      .map((x) => x.q);
    return { city, score, match: Math.round((score / max) * 100), reasons, order };
  })
    .sort((x, y) => y.score - x.score || x.order - y.order)
    .map(({ order: _o, ...r }) => r);
};

export const DEFAULT_ANSWERS: Answers = { climate: 'any', size: 'any', budget: 'medium', field: 'logistics', lifestyle: 'balance', transport: 'mixed', community: 'nice', language: 'someGerman' };

/** "01201120" → answers; null when the string is not a complete, valid answer set. */
export const decodeAnswers = (s: string | null | undefined): Answers | null => {
  if (!s || !/^\d{8}$/.test(s)) return null;
  const out: Partial<Record<QuestionKey, string>> = {};
  for (let i = 0; i < QUESTION_KEYS.length; i++) {
    const q = QUESTION_KEYS[i];
    const opt = (QUESTIONS[q] as readonly string[])[Number(s[i])];
    if (!opt) return null;
    out[q] = opt;
  }
  return out as Answers;
};

export const encodeAnswers = (a: Answers) => QUESTION_KEYS.map((q) => (QUESTIONS[q] as readonly string[]).indexOf(a[q])).join('');

export const quizCity = (slug: string | null | undefined) => QUIZ_CITIES.find((c) => c.slug === slug) ?? null;
