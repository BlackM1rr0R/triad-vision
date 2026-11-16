import { describe, expect, it } from 'vitest';
import {
  MONEY_QUESTIONS,
  PARTS,
  WEIGHTS,
  bestLevel,
  computeReadiness,
  documentsPart,
  housingPart,
  languagePart,
  moneyPart,
  moneyPoints,
  readMoney,
  skillsPart,
  type ReadinessFacts,
} from '../../src/lib/readiness/score';

const empty: ReadinessFacts = {
  german: { profile: null, exam: null, test: null, activeCourse: false, examBooked: false },
  documents: { hasCase: false, approved: false, required: [] },
  skills: { cvPercent: 0, hasCv: false, recognition: null },
  housing: { signals: [], stepsDone: 0, stepsTotal: 8, approved: false },
  money: {},
};

describe('readiness score', () => {
  it('has weights that add up to 100 and money options that add up to 100', () => {
    expect(PARTS.reduce((s, p) => s + WEIGHTS[p], 0)).toBe(100);
    const max = Object.values(MONEY_QUESTIONS).reduce((s, q) => s + Math.max(...Object.values(q as Record<string, number>)), 0);
    expect(max).toBe(100);
  });

  it('is 0 for a new client and 100 when everything is done', () => {
    const zero = computeReadiness(empty);
    expect(zero.score).toBe(0);
    expect(zero.parts.every((p) => p.next !== null)).toBe(true);
    const full = computeReadiness({
      german: { profile: 'C1', exam: null, test: null, activeCourse: false, examBooked: false },
      documents: { hasCase: true, approved: true, required: ['accepted'] },
      skills: { cvPercent: 100, hasCv: true, recognition: 'RECOGNISED' },
      housing: { signals: ['ANMELDUNG_DONE'], stepsDone: 8, stepsTotal: 8, approved: true },
      money: { savings: 'gt2', firstMonth: 'yes', travelCosts: 'yes', bankCard: 'yes' },
    });
    expect(full.score).toBe(100);
    expect(full.parts.every((p) => p.next === null)).toBe(true);
  });

  it('is deterministic and weighted', () => {
    const f: ReadinessFacts = {
      ...empty,
      german: { profile: 'A2', exam: 'B1', test: 'A1', activeCourse: false, examBooked: false },
      documents: { hasCase: true, approved: false, required: ['accepted', 'review', 'missing', 'missing'] },
    };
    const a = computeReadiness(f);
    expect(computeReadiness(f)).toEqual(a);
    // language B1 = 70 → 21 points; documents (1 + 0.6) / 4 = 40 → 10 points.
    expect(a.parts.find((p) => p.key === 'language')).toMatchObject({ score: 70, points: 21 });
    expect(a.parts.find((p) => p.key === 'documents')).toMatchObject({ score: 40, points: 10 });
    expect(a.score).toBe(31);
  });

  it('language: best level, course boost below B1, next steps', () => {
    expect(bestLevel('A2', null, 'B1', 'none')).toBe('B1');
    expect(languagePart({ profile: null, exam: null, test: null, activeCourse: false, examBooked: false }).next?.key).toBe('placementTest');
    const a1 = languagePart({ profile: 'A1', exam: null, test: null, activeCourse: false, examBooked: false });
    expect(a1.score).toBe(25);
    expect(a1.next).toMatchObject({ key: 'bookCourse', to: '/account/german', gain: 3 });
    expect(languagePart({ profile: 'A1', exam: null, test: null, activeCourse: true, examBooked: false }).score).toBe(35);
    expect(languagePart({ profile: 'B1', exam: null, test: null, activeCourse: true, examBooked: false }).score).toBe(70);
    expect(languagePart({ profile: 'B2', exam: null, test: null, activeCourse: false, examBooked: false }).next?.key).toBe('nextLevel');
  });

  it('documents: no case, uploads waiting, approved', () => {
    expect(documentsPart({ hasCase: false, approved: false, required: [] })).toMatchObject({ score: 0, next: { key: 'startCase' } });
    expect(documentsPart({ hasCase: true, approved: false, required: ['review', 'review'] })).toMatchObject({ score: 60, next: { key: 'waitReview' } });
    expect(documentsPart({ hasCase: true, approved: false, required: ['missing'] }).next?.key).toBe('uploadMissing');
    expect(documentsPart({ hasCase: true, approved: true, required: ['missing'] }).score).toBe(100);
  });

  it('skills: CV first, then recognition', () => {
    expect(skillsPart({ cvPercent: 0, hasCv: false, recognition: null }).next?.key).toBe('createCv');
    expect(skillsPart({ cvPercent: 50, hasCv: true, recognition: null }).next?.key).toBe('completeCv');
    const r = skillsPart({ cvPercent: 100, hasCv: true, recognition: 'IN_REVIEW' });
    expect(r.score).toBe(80);
    expect(r.next?.key).toBe('followRecognition');
    expect(skillsPart({ cvPercent: 100, hasCv: true, recognition: 'NOT_REQUIRED' }).score).toBe(100);
  });

  it('housing: strongest signal wins', () => {
    expect(housingPart({ signals: ['SEARCHING', 'ARRANGED'], stepsDone: 2, stepsTotal: 8, approved: true })).toMatchObject({ score: 80, next: { key: 'anmeldung' } });
    expect(housingPart({ signals: [], stepsDone: 4, stepsTotal: 8, approved: true }).score).toBe(25);
    expect(housingPart({ signals: [], stepsDone: 0, stepsTotal: 8, approved: false }).next?.key).toBe('learnHousing');
  });

  it('money: self-check, tolerant reading of stored answers', () => {
    expect(moneyPart({}).next?.key).toBe('selfCheck');
    expect(moneyPoints({ savings: '1to2', firstMonth: 'no', travelCosts: 'partly', bankCard: 'yes' })).toBe(55);
    expect(moneyPart({ savings: '1to2', firstMonth: 'no', travelCosts: 'partly', bankCard: 'yes' }).next?.key).toBe('planBudget');
    expect(readMoney({ savings: 'gt2', bogus: 'x', firstMonth: 'maybe' })).toEqual({ savings: 'gt2' });
    expect(readMoney({ savings: 'gt2', bogus: 'x' })).toEqual({ savings: 'gt2' });
    expect(readMoney(null)).toEqual({});
  });
});
