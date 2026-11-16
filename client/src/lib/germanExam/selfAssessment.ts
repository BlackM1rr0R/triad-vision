/**
 * German level self-assessment (/german-level-test-self): "can do" statements per skill and level, paraphrased
 * from the Council of Europe CEFR self-assessment grid (Table 2, CEFR 3.3; © Council of Europe,
 * https://www.coe.int/en/web/common-european-framework-reference-languages/table-2-cefr-3.3-common-reference-levels-self-assessment-grid),
 * an estimated level per skill and overall, and a study plan from the Goethe-Institut's guided-learning ranges
 * ("How long does it take to reach a level?", https://www.goethe.de/ins/gb/en/sta/lon/kur/faq.html; 1 UE = 45 min):
 * A1 80–200 UE (60–150 h), A2 200–350 UE (150–260 h), B1 350–650 UE (260–490 h), B2 600–800 UE (450–600 h),
 * C1 800–1,000 UE (600–750 h), cumulative from zero. Same table as server/src/lib/whenInGermany/estimate.ts.
 * Statement texts: i18n levelSelf.statements.<id>. No React here (unit-testable).
 */

export const SKILLS = ['listening', 'reading', 'speaking', 'writing'] as const;
export type Skill = (typeof SKILLS)[number];
export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];
/** Estimated level: below A1, or one of the assessed levels. */
export type EstLevel = 'preA1' | CefrLevel;
/** Plan target (C1 allowed as the next step after B2). */
export const TARGET_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
export type TargetLevel = (typeof TARGET_LEVELS)[number];

/** Answer per statement: 0 not yet, 1 with difficulty, 2 yes, easily. */
export type Answer = 0 | 1 | 2;

export interface Statement {
  id: string;
  skill: Skill;
  level: CefrLevel;
}

/** Two statements per skill and level (ids "<skill>-<level>-<n>"). */
export const STATEMENTS: Statement[] = SKILLS.flatMap((skill) => CEFR_LEVELS.flatMap((level) => [1, 2].map((n) => ({ id: `${skill}-${level.toLowerCase()}-${n}`, skill, level }))));

/** Share of the maximum points a level needs to count as reached (consecutively from A1). */
export const REACH_THRESHOLD = 0.7;

/** Cumulative guided-learning hours from zero (Goethe-Institut; UE × 0.75). */
export const LEVEL_HOURS: Record<TargetLevel, readonly [number, number]> = { A1: [60, 150], A2: [150, 260], B1: [260, 490], B2: [450, 600], C1: [600, 750] };
export const LEVEL_UE: Record<TargetLevel, readonly [number, number]> = { A1: [80, 200], A2: [200, 350], B1: [350, 650], B2: [600, 800], C1: [800, 1000] };

const ORDER: EstLevel[] = ['preA1', 'A1', 'A2', 'B1', 'B2'];
export const levelIndex = (l: EstLevel) => ORDER.indexOf(l);

/** Highest level reached in a skill: each level from A1 up needs ≥ 70 % of its points; unanswered counts as 0. */
export const estimateSkill = (skill: Skill, answers: Record<string, Answer | undefined>): EstLevel => {
  let reached: EstLevel = 'preA1';
  for (const level of CEFR_LEVELS) {
    const list = STATEMENTS.filter((s) => s.skill === skill && s.level === level);
    const score = list.reduce((sum, s) => sum + (answers[s.id] ?? 0), 0);
    if (score / (list.length * 2) >= REACH_THRESHOLD) reached = level;
    else break;
  }
  return reached;
};

export const estimateAll = (answers: Record<string, Answer | undefined>) => Object.fromEntries(SKILLS.map((s) => [s, estimateSkill(s, answers)])) as Record<Skill, EstLevel>;

/** Overall level: the average of the four skills, rounded down (a conservative estimate). */
export const overallLevel = (bySkill: Record<Skill, EstLevel>): EstLevel => {
  const mean = SKILLS.reduce((s, k) => s + levelIndex(bySkill[k]), 0) / SKILLS.length;
  return ORDER[Math.floor(mean + 1e-9)];
};

/** Skills from weakest to strongest (ties keep the SKILLS order). */
export const weakestFirst = (bySkill: Record<Skill, EstLevel>): Skill[] => [...SKILLS].sort((a, b) => levelIndex(bySkill[a]) - levelIndex(bySkill[b]));

/** The level after `l` (B2 → C1). */
export const nextLevel = (l: EstLevel): TargetLevel => (l === 'preA1' ? 'A1' : l === 'A1' ? 'A2' : l === 'A2' ? 'B1' : l === 'B1' ? 'B2' : 'C1');

/** Targets above the current level. */
export const targetsAbove = (l: EstLevel): TargetLevel[] => TARGET_LEVELS.slice(TARGET_LEVELS.indexOf(nextLevel(l)));

/**
 * Guided-learning hours from `from` to `to` as [min, max]: the difference of the cumulative ranges' lower and
 * upper ends (sorted; the source ranges overlap, e.g. B1 → B2 gives 110–190 h). Zero when `to` is not above.
 */
const rangeBetween = (table: Record<TargetLevel, readonly [number, number]>, from: EstLevel, to: TargetLevel): [number, number] => {
  const a = from === 'preA1' ? [0, 0] : table[from];
  const b = table[to];
  const lo = b[0] - a[0];
  const hi = b[1] - a[1];
  if (lo <= 0 && hi <= 0) return [0, 0];
  return [Math.max(0, Math.min(lo, hi)), Math.max(lo, hi)];
};
export const hoursBetween = (from: EstLevel, to: TargetLevel) => rangeBetween(LEVEL_HOURS, from, to);
/** The same in teaching units (UE, 45 minutes) as the source states them. */
export const ueBetween = (from: EstLevel, to: TargetLevel) => rangeBetween(LEVEL_UE, from, to);

/** Weeks for [min, max] hours at `hoursPerDay` × `daysPerWeek` (rounded up; null with no study time). */
export const weeksFor = (hours: [number, number], hoursPerDay: number, daysPerWeek: number): [number, number] | null => {
  const perWeek = hoursPerDay * daysPerWeek;
  if (!(perWeek > 0)) return null;
  return [Math.ceil(hours[0] / perWeek), Math.ceil(hours[1] / perWeek)];
};

/** Activities of the plan (labels levelSelf.activities.<key>; links in ACTIVITY_LINKS). */
export type Activity = 'vocab' | 'phrase' | 'pronunciation' | 'simulator' | 'glossary' | 'mockListening' | 'mockReading' | 'mockWriting' | 'mockSpeaking' | 'mockExam' | 'selfCheck';

/** Mock exam level for a target: A1 / A2 → the A1 test, B1 and above → the B1 test. */
export const mockExamFor = (target: TargetLevel) => (target === 'A1' || target === 'A2' ? 'a1' : 'b1');

export const activityLink = (a: Activity, target: TargetLevel): string => {
  const mock = `/german-mock-exam/${mockExamFor(target)}`;
  switch (a) {
    case 'vocab':
      return '/account/german';
    case 'phrase':
      return '/phrase-of-the-day';
    case 'pronunciation':
      return '/pronunciation';
    case 'simulator':
      return '/german-simulator';
    case 'glossary':
      return '/glossary';
    case 'selfCheck':
      return '/german-level-test-self';
    default:
      return mock;
  }
};

const FOCUS_ACTIVITIES: Record<Skill, Activity[]> = {
  listening: ['phrase', 'mockListening'],
  reading: ['glossary', 'mockReading'],
  speaking: ['simulator', 'pronunciation', 'mockSpeaking'],
  writing: ['mockWriting'],
};

export interface PlanWeek {
  week: number;
  focus: Skill;
  activities: Activity[];
  /** 'check' every 4th week (mock exam), 'final' in the last week (mock exam + new self-assessment). */
  milestone: 'check' | 'final' | null;
}

/** Weeks of the plan are capped (a 2-hour-a-week plan to C1 would run for years). */
export const MAX_PLAN_WEEKS = 104;

/**
 * Week-by-week plan for `weeks` weeks: the focus rotates over the skills with the weakest one every other week
 * (weakest, 2nd, weakest, 3rd, weakest, 4th …); vocabulary every week; a mock exam every 4th week and in the
 * last week, which also repeats the self-assessment.
 */
export const buildPlan = (bySkill: Record<Skill, EstLevel>, weeks: number): PlanWeek[] => {
  const n = Math.max(1, Math.min(MAX_PLAN_WEEKS, Math.round(weeks)));
  const order = weakestFirst(bySkill);
  const rotation: Skill[] = order.slice(1).flatMap((s) => [order[0], s]);
  return Array.from({ length: n }, (_, i) => {
    const week = i + 1;
    const focus = rotation[i % rotation.length];
    const final = week === n;
    const check = !final && week % 4 === 0;
    const activities: Activity[] = ['vocab', ...FOCUS_ACTIVITIES[focus]];
    if (check || final) activities.push('mockExam');
    if (final) activities.push('selfCheck');
    return { week, focus, activities: [...new Set(activities)], milestone: final ? 'final' : check ? 'check' : null };
  });
};

/** Typical number of plan weeks: the middle of the [min, max] range, rounded up. */
export const typicalWeeks = (w: [number, number]) => Math.ceil((w[0] + w[1]) / 2);
