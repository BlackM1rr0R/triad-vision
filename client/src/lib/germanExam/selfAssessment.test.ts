import { describe, expect, it } from 'vitest';
import {
  CEFR_LEVELS,
  LEVEL_HOURS,
  LEVEL_UE,
  MAX_PLAN_WEEKS,
  SKILLS,
  STATEMENTS,
  activityLink,
  buildPlan,
  estimateAll,
  estimateSkill,
  hoursBetween,
  mockExamFor,
  nextLevel,
  overallLevel,
  targetsAbove,
  typicalWeeks,
  ueBetween,
  weakestFirst,
  weeksFor,
  type Answer,
  type EstLevel,
  type Skill,
} from './selfAssessment';
import { pagesLevelSelf } from '@/i18n/pagesLevelSelf';
import { LEVEL_SELF_FAQ, MOCK_EXAM_FAQ } from './faq';

const LANGS = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;

/** Answers: every statement of `skill` up to `level` answered with `a`, the rest "not yet". */
const upTo = (skill: Skill, level: EstLevel, a: Answer = 2) => {
  const idx = level === 'preA1' ? -1 : CEFR_LEVELS.indexOf(level);
  return Object.fromEntries(STATEMENTS.filter((s) => s.skill === skill).map((s) => [s.id, CEFR_LEVELS.indexOf(s.level) <= idx ? a : 0])) as Record<string, Answer>;
};

describe('statements', () => {
  it('has two statements per skill and level with texts in all six languages', () => {
    expect(STATEMENTS).toHaveLength(SKILLS.length * CEFR_LEVELS.length * 2);
    expect(new Set(STATEMENTS.map((s) => s.id)).size).toBe(STATEMENTS.length);
    for (const l of LANGS) {
      const texts = pagesLevelSelf[l].levelSelf.statements as Record<string, string>;
      for (const s of STATEMENTS) expect(texts[s.id], `${l} ${s.id}`).toBeTruthy();
      expect(Object.keys(texts).sort(), l).toEqual(STATEMENTS.map((s) => s.id).sort());
    }
  });

  it('has the same i18n keys in all languages', () => {
    const keys = (o: unknown, prefix = ''): string[] =>
      o && typeof o === 'object' ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, `${prefix}${k}.`)) : [prefix.slice(0, -1)];
    const en = keys(pagesLevelSelf.en).sort();
    for (const l of LANGS) expect(keys(pagesLevelSelf[l]).sort(), l).toEqual(en);
  });

  it('has three FAQ entries per page in all languages', () => {
    for (const l of LANGS) {
      expect(MOCK_EXAM_FAQ[l]).toHaveLength(3);
      expect(LEVEL_SELF_FAQ[l]).toHaveLength(3);
      for (const f of [...MOCK_EXAM_FAQ[l], ...LEVEL_SELF_FAQ[l]]) expect(f.q && f.a, l).toBeTruthy();
    }
  });
});

describe('level estimate', () => {
  it('reaches a level with ≥ 70 % of its points, consecutively from A1', () => {
    expect(estimateSkill('listening', {})).toBe('preA1');
    expect(estimateSkill('listening', upTo('listening', 'A1'))).toBe('A1');
    expect(estimateSkill('listening', upTo('listening', 'B2'))).toBe('B2');
    // "With difficulty" everywhere = 50 % → not reached.
    expect(estimateSkill('reading', upTo('reading', 'B2', 1))).toBe('preA1');
    // One "easily" + one "with difficulty" = 75 % → reached.
    expect(estimateSkill('reading', { 'reading-a1-1': 2, 'reading-a1-2': 1 })).toBe('A1');
    // A gap at A2 stops the climb even if B1 is answered "easily".
    expect(estimateSkill('writing', { ...upTo('writing', 'A1'), 'writing-b1-1': 2, 'writing-b1-2': 2 })).toBe('A1');
  });

  it('takes the rounded-down mean of the skills as overall level and finds the weakest skill', () => {
    const answers = { ...upTo('listening', 'B1'), ...upTo('reading', 'B2'), ...upTo('speaking', 'A2'), ...upTo('writing', 'A2') };
    const by = estimateAll(answers);
    expect(by).toEqual({ listening: 'B1', reading: 'B2', speaking: 'A2', writing: 'A2' });
    expect(overallLevel(by)).toBe('A2'); // indices preA1 = 0 … B2 = 4: (3 + 4 + 2 + 2) / 4 = 2.75 → 2
  });

  it('orders skills from weakest to strongest', () => {
    expect(weakestFirst({ listening: 'B1', reading: 'B2', speaking: 'A1', writing: 'A2' })).toEqual(['speaking', 'writing', 'listening', 'reading']);
  });
});

describe('study hours and weeks (Goethe-Institut ranges)', () => {
  it('uses the cumulative Goethe ranges (UE × 0.75 = hours, as rounded by the source)', () => {
    for (const l of Object.keys(LEVEL_HOURS) as (keyof typeof LEVEL_HOURS)[]) {
      expect(Math.abs(LEVEL_HOURS[l][0] - LEVEL_UE[l][0] * 0.75), l).toBeLessThanOrEqual(5);
      expect(Math.abs(LEVEL_HOURS[l][1] - LEVEL_UE[l][1] * 0.75), l).toBeLessThanOrEqual(5);
    }
  });

  it('computes hours between levels as a sorted range', () => {
    expect(hoursBetween('preA1', 'A1')).toEqual([60, 150]);
    expect(hoursBetween('preA1', 'B1')).toEqual([260, 490]);
    expect(hoursBetween('A1', 'B1')).toEqual([200, 340]);
    expect(hoursBetween('B1', 'B2')).toEqual([110, 190]);
    expect(hoursBetween('B2', 'B1')).toEqual([0, 0]);
    expect(ueBetween('preA1', 'B1')).toEqual([350, 650]);
    expect(ueBetween('A1', 'A2')).toEqual([120, 150]);
  });

  it('turns hours into weeks', () => {
    expect(weeksFor([60, 150], 1, 5)).toEqual([12, 30]);
    expect(weeksFor([200, 340], 2, 7)).toEqual([15, 25]);
    expect(weeksFor([60, 150], 0, 5)).toBeNull();
    expect(typicalWeeks([12, 30])).toBe(21);
  });

  it('offers targets above the current level', () => {
    expect(nextLevel('preA1')).toBe('A1');
    expect(nextLevel('B2')).toBe('C1');
    expect(targetsAbove('A2')).toEqual(['B1', 'B2', 'C1']);
  });
});

describe('plan', () => {
  const by = { listening: 'A2', reading: 'B1', speaking: 'A1', writing: 'A2' } as const;

  it('rotates the focus with the weakest skill every other week', () => {
    const plan = buildPlan(by, 6);
    expect(plan.map((w) => w.focus)).toEqual(['speaking', 'listening', 'speaking', 'writing', 'speaking', 'reading']);
    expect(plan.every((w) => w.activities[0] === 'vocab')).toBe(true);
  });

  it('adds a mock exam every 4th week and a final check in the last week', () => {
    const plan = buildPlan(by, 9);
    expect(plan.filter((w) => w.milestone === 'check').map((w) => w.week)).toEqual([4, 8]);
    expect(plan[8]).toMatchObject({ milestone: 'final' });
    expect(plan[8].activities).toEqual(expect.arrayContaining(['mockExam', 'selfCheck']));
    expect(plan.every((w) => new Set(w.activities).size === w.activities.length)).toBe(true);
  });

  it('caps the plan length', () => {
    expect(buildPlan(by, 500)).toHaveLength(MAX_PLAN_WEEKS);
    expect(buildPlan(by, 0)).toHaveLength(1);
  });

  it('links every activity to an existing page and the right mock exam', () => {
    expect(mockExamFor('A2')).toBe('a1');
    expect(mockExamFor('B2')).toBe('b1');
    expect(activityLink('mockWriting', 'B1')).toBe('/german-mock-exam/b1');
    expect(activityLink('vocab', 'A1')).toBe('/account/german');
    expect(activityLink('phrase', 'A1')).toBe('/phrase-of-the-day');
    for (const l of LANGS) {
      const labels = pagesLevelSelf[l].levelSelf.activities as Record<string, string>;
      for (const w of buildPlan(by, 12)) for (const a of w.activities) expect(labels[a], `${l} ${a}`).toBeTruthy();
    }
  });
});
