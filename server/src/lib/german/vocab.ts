/**
 * Vocabulary trainer — pure rules (no database): SM-2 scheduling, streaks by Baku calendar day,
 * the daily session queue and which level new words come from.
 *
 * Grades follow SM-2 (0–5); the apps send 1 "again", 3 "hard", 4 "good", 5 "easy".
 * Below 3 the word is relearned: repetitions reset and it comes back in 10 minutes.
 */

export const VOCAB_LEVELS = ['A1', 'A2', 'B1', 'B2'] as const;
export type VocabLevel = (typeof VOCAB_LEVELS)[number];
export const VOCAB_FIELDS = ['GENERAL', 'WORK', 'CARE', 'CONSTRUCTION', 'HOSPITALITY', 'DRIVING'] as const;
export type VocabField = (typeof VOCAB_FIELDS)[number];

/** New words introduced per day; reviews are not capped (they are what keeps words). */
export const DAILY_NEW_WORDS = 10;
/** Reviews a day that count as "goal reached" in the apps. */
export const DAILY_GOAL = 20;
/** A word counts as learned once its interval reached three weeks. */
export const LEARNED_DAYS = 21;
export const MIN_EASINESS = 1.3;
export const RELEARN_MINUTES = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SrsState {
  repetitions: number;
  easiness: number;
  intervalDays: number;
}

export const NEW_STATE: SrsState = { repetitions: 0, easiness: 2.5, intervalDays: 0 };

export interface SrsResult extends SrsState {
  dueAt: Date;
  correct: boolean;
}

/** SM-2: the next state after a review with `grade` (0–5) at `now`. */
export const review = (state: SrsState, grade: number, now: Date): SrsResult => {
  const q = Math.max(0, Math.min(5, Math.round(grade)));
  const easiness = Math.max(MIN_EASINESS, Math.round((state.easiness + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))) * 100) / 100);
  if (q < 3) return { repetitions: 0, easiness, intervalDays: 0, dueAt: new Date(now.getTime() + RELEARN_MINUTES * 60 * 1000), correct: false };
  const repetitions = state.repetitions + 1;
  const intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.max(1, Math.round(state.intervalDays * easiness));
  return { repetitions, easiness, intervalDays, dueAt: new Date(now.getTime() + intervalDays * DAY_MS), correct: true };
};

export const isLearned = (s: { intervalDays: number }) => s.intervalDays >= LEARNED_DAYS;

// ─── Days and streaks (Asia/Baku, UTC+4 all year) ────────────────────

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baku', year: 'numeric', month: '2-digit', day: '2-digit' });

/** "YYYY-MM-DD" of `d` on the Baku calendar. */
export const dayKey = (d: Date) => dayFmt.format(d);

/** `day` shifted by `n` calendar days ("2026-03-01", -1 → "2026-02-28"). */
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10);

/**
 * Current streak: consecutive practice days ending today — or yesterday, so the streak is not shown
 * as lost before the candidate had a chance to practise today. `best` is the longest run ever.
 */
export const streakOf = (days: Iterable<string>, today: string) => {
  const set = new Set(days);
  let current = 0;
  let cursor = set.has(today) ? today : addDays(today, -1);
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  let best = 0;
  for (const d of set) {
    if (set.has(addDays(d, -1))) continue; // not the start of a run
    let len = 0;
    let c = d;
    while (set.has(c)) {
      len++;
      c = addDays(c, 1);
    }
    best = Math.max(best, len);
  }
  return { current, best, practisedToday: set.has(today) };
};

// ─── Session ──────────────────────────────────────────────────────────

/**
 * Level new words come from: the profile level's own words first, then the next one
 * ('none' → A1, A1 → A2 …, B2 and above stay at B2). Returns the levels in order.
 */
export const newWordLevels = (profileLevel: string | null | undefined): VocabLevel[] => {
  const idx = (VOCAB_LEVELS as readonly string[]).indexOf(profileLevel ?? '');
  if (profileLevel === 'C1' || profileLevel === 'C2') return [...VOCAB_LEVELS];
  if (idx < 0) return ['A1'];
  return VOCAB_LEVELS.slice(0, Math.min(idx + 2, VOCAB_LEVELS.length));
};

/** The level the apps suggest practising (the one after the profile level, B2 at most). */
export const recommendedLevel = (profileLevel: string | null | undefined): VocabLevel => {
  const levels = newWordLevels(profileLevel);
  return levels[levels.length - 1];
};

/**
 * Today's queue: due reviews first (most overdue first), then new words up to what is left of the
 * daily allowance, `limit` cards at most.
 */
export const buildSession = <D extends { dueAt: Date }, N>(due: D[], fresh: N[], opts: { limit: number; newToday: number; dailyNew?: number }) => {
  const reviews = [...due].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime()).slice(0, opts.limit);
  const allowance = Math.max(0, (opts.dailyNew ?? DAILY_NEW_WORDS) - opts.newToday);
  const news = fresh.slice(0, Math.max(0, Math.min(allowance, opts.limit - reviews.length)));
  return { reviews, news };
};
