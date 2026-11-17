import { READY_ACTIVITIES, type ReadyActivity } from './activities.js';

/**
 * "Germany Ready" — pure rules (unit-tested): validation + clamping of synced practice results, the points model,
 * certificate levels, the weekly challenge (deterministic per ISO week) and the anonymous bands for the pool.
 *
 * Results are SELF-REPORTED by the browser (the games run client-side). They are labelled "practice achievements"
 * everywhere; nothing here is an exam result.
 */

export const ITEM_RE = /^[A-Za-z0-9-]{1,40}$/;
/** Results older than this are refused (a stale device queue). */
export const MAX_AGE_DAYS = 365;
/** Words learned in the vocabulary trainer for full points (lib/german/vocab isLearned). */
export const VOCAB_GOAL = 50;

export const activityById = (id: string): ReadyActivity | undefined => (READY_ACTIVITIES as readonly ReadyActivity[]).find((a) => a.id === id);

export interface ResultInput {
  activityId: string;
  item?: string | null;
  score: number;
  max: number;
  completedAt?: string | Date | null;
}

export interface CleanResult {
  activityId: string;
  item: string;
  score: number;
  max: number;
  percent: number;
  completedAt: Date;
}

export type ResultError = 'UNKNOWN_ACTIVITY' | 'SERVER_ACTIVITY' | 'BAD_ITEM' | 'BAD_SCORE' | 'BAD_COMPLETED_AT';

/**
 * Validates one result against the registry and clamps it: max to 1…maxScore, score to 0…max, completedAt to
 * whole seconds (so a resend of the same completion is the same row), never in the future, at most a year old.
 */
export const cleanResult = (r: ResultInput, now = new Date()): CleanResult | ResultError => {
  const a = activityById(r.activityId);
  if (!a) return 'UNKNOWN_ACTIVITY';
  if (a.source !== 'client') return 'SERVER_ACTIVITY';
  const item = (r.item ?? '').trim();
  if (!a.items) {
    if (item) return 'BAD_ITEM';
  } else {
    if (!item || !ITEM_RE.test(item)) return 'BAD_ITEM';
    if (a.items !== 'any' && !a.items.includes(item)) return 'BAD_ITEM';
  }
  if (!Number.isFinite(r.score) || !Number.isFinite(r.max) || r.max <= 0) return 'BAD_SCORE';
  const max = Math.min(a.maxScore, Math.max(1, Math.round(r.max)));
  const score = Math.min(max, Math.max(0, Math.round(r.score)));
  let at = r.completedAt ? new Date(r.completedAt) : now;
  if (Number.isNaN(at.getTime())) return 'BAD_COMPLETED_AT';
  if (at.getTime() > now.getTime()) at = now;
  if (now.getTime() - at.getTime() > MAX_AGE_DAYS * 86_400_000) return 'BAD_COMPLETED_AT';
  at = new Date(Math.floor(at.getTime() / 1000) * 1000);
  return { activityId: a.id, item, score, max, percent: Math.round((score / max) * 100), completedAt: at };
};

// ─── Points ─────────────────────────────────────────────────────────────

export interface StoredResult {
  activityId: string;
  item: string;
  score: number;
  max: number;
  percent: number;
  completedAt: Date;
}

export interface ServerFacts {
  /** Vocabulary trainer: words with an interval of ≥ 21 days. */
  wordsLearned: number;
  /** Germany readiness score 0–100 (lib/readiness). */
  readinessScore: number;
}

export interface ActivityProgress {
  id: string;
  group: ReadyActivity['group'];
  path: string;
  source: ReadyActivity['source'];
  points: number;
  earned: number;
  /** 0–1 */
  progress: number;
  done: boolean;
  /** Best percentage of a single result (null: nothing yet). */
  best: number | null;
  /** Item-based activities: distinct items at or above the pass mark / needed. */
  itemsPassed: number | null;
  itemsRequired: number | null;
  attempts: number;
  lastAt: string | null;
}

const bestByItem = (rows: StoredResult[]) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.item, Math.max(m.get(r.item) ?? 0, r.percent));
  return m;
};

export const activityProgress = (a: ReadyActivity, rows: StoredResult[], facts: ServerFacts): ActivityProgress => {
  let progress = 0;
  let best: number | null = rows.length ? Math.max(...rows.map((r) => r.percent)) : null;
  let itemsPassed: number | null = null;
  let itemsRequired: number | null = null;
  if (a.id === 'vocabulary') {
    progress = Math.min(1, Math.max(0, facts.wordsLearned) / VOCAB_GOAL);
    best = Math.min(100, Math.round(progress * 100));
  } else if (a.id === 'readiness') {
    best = Math.max(0, Math.min(100, facts.readinessScore));
    progress = a.passPercent ? Math.min(1, best / a.passPercent) : 1;
  } else if (a.items) {
    itemsRequired = a.requiredItems ?? 1;
    itemsPassed = [...bestByItem(rows).values()].filter((p) => p >= a.passPercent).length;
    progress = Math.min(1, itemsPassed / itemsRequired);
  } else if (rows.length) {
    progress = a.passPercent ? Math.min(1, (best ?? 0) / a.passPercent) : 1;
  }
  const done = progress >= 1;
  const lastAt = rows.length ? new Date(Math.max(...rows.map((r) => r.completedAt.getTime()))).toISOString() : null;
  return {
    id: a.id,
    group: a.group,
    path: a.path,
    source: a.source,
    points: a.points,
    earned: done ? a.points : Math.floor(a.points * progress),
    progress: Math.round(progress * 100) / 100,
    done,
    best,
    itemsPassed,
    itemsRequired,
    attempts: rows.length,
    lastAt,
  };
};

export const MAX_POINTS = (READY_ACTIVITIES as readonly ReadyActivity[]).reduce((s, a) => s + a.points, 0);

export const LEVELS = [
  { level: 'BRONZE', points: 60, done: 5 },
  { level: 'SILVER', points: 85, done: 8 },
  { level: 'GOLD', points: 110, done: 11 },
] as const;
export type ReadyLevel = (typeof LEVELS)[number]['level'];
export const levelRank = (l: string | null | undefined) => LEVELS.findIndex((x) => x.level === l);

/** Highest level whose points AND completed-activity thresholds are met (null: none yet). */
export const certificateLevel = (points: number, done: number): ReadyLevel | null => {
  let out: ReadyLevel | null = null;
  for (const l of LEVELS) if (points >= l.points && done >= l.done) out = l.level;
  return out;
};

export const summarize = (results: StoredResult[], facts: ServerFacts) => {
  const by = new Map<string, StoredResult[]>();
  for (const r of results) by.set(r.activityId, [...(by.get(r.activityId) ?? []), r]);
  const activities = (READY_ACTIVITIES as readonly ReadyActivity[]).map((a) => activityProgress(a, by.get(a.id) ?? [], facts));
  const points = activities.reduce((s, a) => s + a.earned, 0);
  const done = activities.filter((a) => a.done).length;
  const level = certificateLevel(points, done);
  const next = LEVELS.find((l) => levelRank(l.level) > levelRank(level)) ?? null;
  // Suggestions: unfinished activities with the most points still open (client games first: one click away).
  const suggestions = activities
    .filter((a) => !a.done)
    .sort((x, y) => y.points - y.earned - (x.points - x.earned) || (x.source === y.source ? 0 : x.source === 'client' ? -1 : 1))
    .slice(0, 3)
    .map((a) => a.id);
  return { activities, points, maxPoints: MAX_POINTS, done, level, next: next ? { level: next.level, points: next.points, done: next.done } : null, suggestions };
};

// ─── Weekly challenge ───────────────────────────────────────────────────

/** ISO 8601 week of a date (UTC): key "2026-W47", Monday 00:00 UTC start, next Monday end. */
export const isoWeek = (d: Date) => {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = day.getUTCDay() || 7;
  const start = new Date(day.getTime() - (dow - 1) * 86_400_000);
  const thursday = new Date(start.getTime() + 3 * 86_400_000);
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / 86_400_000 / 7) + 1;
  return { key: `${year}-W${String(week).padStart(2, '0')}`, year, week, start, end: new Date(start.getTime() + 7 * 86_400_000) };
};

export type ChallengeKind = 'sumScore' | 'bestPercent' | 'bestScore' | 'itemsPassed' | 'vocabNew';

export interface Challenge {
  key: string;
  activityIds: string[];
  kind: ChallengeKind;
  goal: number;
  item?: string;
  /** itemsPassed: pass mark per item */
  pass?: number;
}

export const CHALLENGES: readonly Challenge[] = [
  { key: 'TRAFFIC_30', activityIds: ['traffic-signs'], kind: 'sumScore', goal: 30 },
  { key: 'SIM_ANMELDUNG_80', activityIds: ['german-simulator'], kind: 'bestPercent', item: 'anmeldung', goal: 80 },
  { key: 'VOCAB_20', activityIds: ['vocabulary'], kind: 'vocabNew', goal: 20 },
  { key: 'MOCK_LESEN_60', activityIds: ['mock-a1', 'mock-b1'], kind: 'bestPercent', item: 'lesen', goal: 60 },
  { key: 'PRON_10', activityIds: ['pronunciation'], kind: 'itemsPassed', pass: 70, goal: 10 },
  { key: 'WORK_SCENE_80', activityIds: ['work-scenes'], kind: 'bestPercent', goal: 80 },
  { key: 'WASTE_15', activityIds: ['waste-sorting'], kind: 'bestScore', goal: 15 },
  { key: 'SIM_DOCTOR_80', activityIds: ['german-simulator'], kind: 'bestPercent', item: 'doctor', goal: 80 },
  { key: 'PRICE_600', activityIds: ['price-game'], kind: 'bestScore', goal: 600 },
  { key: 'INTERVIEW_10', activityIds: ['interview-prep'], kind: 'bestScore', goal: 10 },
];
export const CHALLENGE_KEYS = CHALLENGES.map((c) => c.key);

/** Admin order (Setting) cleaned: known keys once each, every missing key appended in the default order. */
export const challengeOrder = (override: unknown): string[] => {
  const list = Array.isArray(override) ? override.filter((k): k is string => typeof k === 'string' && CHALLENGE_KEYS.includes(k)) : [];
  const uniq = [...new Set(list)];
  return [...uniq, ...CHALLENGE_KEYS.filter((k) => !uniq.includes(k))];
};

/** Weeks since Monday 1970-01-05 (the first ISO Monday) — the same challenge for everyone in a week. */
const weekIndex = (start: Date) => Math.floor((start.getTime() - Date.UTC(1970, 0, 5)) / (7 * 86_400_000));

export const challengeForWeek = (d: Date, override?: unknown): Challenge => {
  const order = challengeOrder(override);
  const w = isoWeek(d);
  const key = order[((weekIndex(w.start) % order.length) + order.length) % order.length];
  return CHALLENGES.find((c) => c.key === key)!;
};

/** Progress of a challenge from the week's results (and new vocabulary words this week). */
export const evaluateChallenge = (c: Challenge, weekResults: StoredResult[], vocabNewThisWeek = 0) => {
  const rows = weekResults.filter((r) => c.activityIds.includes(r.activityId) && (!c.item || r.item === c.item));
  let value = 0;
  if (c.kind === 'sumScore') value = rows.reduce((s, r) => s + r.score, 0);
  else if (c.kind === 'bestPercent') value = rows.reduce((m, r) => Math.max(m, r.percent), 0);
  else if (c.kind === 'bestScore') value = rows.reduce((m, r) => Math.max(m, r.score), 0);
  else if (c.kind === 'itemsPassed') value = new Set(rows.filter((r) => r.percent >= (c.pass ?? 0)).map((r) => r.item)).size;
  else value = vocabNewThisWeek;
  return { value: Math.min(value, c.goal), goal: c.goal, done: value >= c.goal };
};

// ─── Anonymous bands (candidate pool) ───────────────────────────────────

export const readinessBand = (score: number) => (score >= 80 ? '80-100' : score >= 60 ? '60-79' : score >= 40 ? '40-59' : '0-39');
export const practiceBand = (doneActivities: number) => (doneActivities >= 10 ? '10+' : doneActivities >= 5 ? '5-9' : doneActivities >= 1 ? '1-4' : '0');

/** Work scene of a free-text profession (az / de / en / ru keywords), for the employer readiness card. */
const SCENE_WORDS: [string, RegExp][] = [
  ['restaurant-kitchen', /koch|köch|cook|chef|aşpaz|aspaz|повар|kitchen|küche|bäcker|baker|kellner|waiter|ofisiant/i],
  ['truck-cab', /fahrer|driver|sürücü|surucu|водител|lkw|bus|kurier|courier/i],
  ['hospital-ward', /pflege|nurse|tibb|медсестр|кранкен|kranken|altenpfleg|care/i],
  ['construction-site', /bau|construct|inşaat|insaat|строит|maurer|schweiß|welder|qaynaq|zimmer|carpenter|maler|painter|klempner|plumber|santexnik/i],
  ['electrical-panel', /elektr|electric|электрик/i],
];
export const sceneForProfession = (profession: string | null | undefined) => {
  if (!profession) return null;
  return SCENE_WORDS.find(([, re]) => re.test(profession))?.[0] ?? null;
};
