import { describe, expect, it } from 'vitest';
import {
  chancenkartePoints,
  eligibilityAnswersSchema,
  evaluateEligibility,
  scorePaths,
  weeksFromRanges,
  type EligibilityAnswers,
} from '../../src/lib/publicAi/eligibility.js';
import { DEFAULTS_BY_TYPE } from '../../src/lib/journey/forecast.js';

const base: EligibilityAnswers = {
  age: '26_35',
  profession: 'other',
  experience: '2_5',
  education: 'school',
  german: 'none',
  licence: 'B',
  family: 'single',
  goal: 'work',
};
const a = (over: Partial<EligibilityAnswers>): EligibilityAnswers => ({ ...base, ...over });
const keys = (x: EligibilityAnswers) => evaluateEligibility(x).map((p) => p.key);
const path = (x: EligibilityAnswers, key: string) => scorePaths(x).find((p) => p.key === key)!;

describe('eligibility scoring', () => {
  it('recommends the §19c driver path for a CE driver with A1 German', () => {
    const r = evaluateEligibility(a({ profession: 'driver', licence: 'CE', german: 'A1', experience: '5p' }));
    expect(r[0].key).toBe('drivers_19c');
    expect(r[0].fit).toBe('high');
    expect(r[0].reasons).toEqual(expect.arrayContaining(['LICENCE_OK', 'DRIVER', 'EXPERIENCE_OK']));
    expect(r[0].missing).toContainEqual({ code: 'GERMAN', from: 'A1', to: 'A2' });
    expect(r[0].missing).toContainEqual({ code: 'CODE95' });
  });

  it('asks a driver without a heavy licence for CE', () => {
    const p = path(a({ profession: 'driver', licence: 'B' }), 'drivers_19c');
    expect(p.missing).toContainEqual({ code: 'LICENCE', need: 'CE' });
    expect(p.score).toBeLessThan(path(a({ profession: 'driver', licence: 'CE' }), 'drivers_19c').score);
  });

  it('puts §18b first for a qualified worker with B1 and experience', () => {
    const r = evaluateEligibility(a({ education: 'vocational', profession: 'technical', german: 'B1', experience: '5p' }));
    expect(r[0].key).toBe('skilled_18b');
    expect(r[0].reasons).toEqual(expect.arrayContaining(['QUALIFIED', 'GERMAN_OK', 'EXPERIENCE_OK', 'GOAL_MATCH']));
    expect(r[0].missing).toContainEqual({ code: 'RECOGNITION' });
    expect(r.map((p) => p.key)).toContain('chancenkarte');
  });

  it('never recommends §18b or the Chancenkarte without a qualification', () => {
    const x = a({ education: 'school', german: 'B2' });
    expect(path(x, 'skilled_18b').missing).toContainEqual({ code: 'QUALIFICATION' });
    expect(path(x, 'skilled_18b').score).toBeLessThan(40);
    expect(path(x, 'chancenkarte').score).toBeLessThan(40);
    expect(keys(x)).not.toContain('skilled_18b');
  });

  it('recommends Ausbildung for a young school leaver and names the missing German level', () => {
    const r = evaluateEligibility(a({ age: '18_25', goal: 'ausbildung', german: 'A2', experience: 'none' }));
    expect(r[0].key).toBe('ausbildung_16a');
    expect(r[0].missing).toContainEqual({ code: 'GERMAN', from: 'A2', to: 'B1' });
    expect(path(a({ age: '46p', goal: 'ausbildung' }), 'ausbildung_16a').missing).toContainEqual({ code: 'AGE' });
  });

  it('counts Chancenkarte points and reports a shortfall', () => {
    const strong = a({ education: 'university', profession: 'it', german: 'B1', experience: '5p', age: '26_35' });
    expect(chancenkartePoints(strong)).toBe(8);
    expect(path(strong, 'chancenkarte').reasons).toContain('POINTS_OK');
    const weak = a({ education: 'vocational', german: 'A1', experience: 'lt2', age: '46p' });
    expect(chancenkartePoints(weak)).toBe(0);
    expect(path(weak, 'chancenkarte').missing).toContainEqual({ code: 'POINTS', have: 0, need: 6 });
  });

  it('shows family reunion only with a family member in Germany', () => {
    const x = a({ family: 'family_in_de', goal: 'family', german: 'none' });
    const r = evaluateEligibility(x);
    expect(r[0].key).toBe('family');
    expect(r[0].missing).toContainEqual({ code: 'GERMAN', from: 'none', to: 'A1' });
    expect(path(a({ goal: 'family' }), 'family').missing).toContainEqual({ code: 'FAMILY_MEMBER' });
    expect(keys(a({ goal: 'work' }))).not.toContain('family');
  });

  it('favours study for a B2 student and halves it for other goals', () => {
    expect(keys(a({ goal: 'study', german: 'B2', age: '18_25' }))[0]).toBe('study_16b');
    expect(path(a({ goal: 'work', german: 'B2', age: '18_25' }), 'study_16b').score).toBeLessThan(40);
  });

  it('always returns between one and three paths, best first, scores within 0–100', () => {
    for (const age of ['u18', '18_25', '46p'] as const)
      for (const education of ['school', 'university'] as const)
        for (const goal of ['work', 'ausbildung', 'study', 'family'] as const) {
          const r = evaluateEligibility(a({ age, education, goal }));
          expect(r.length).toBeGreaterThanOrEqual(1);
          expect(r.length).toBeLessThanOrEqual(3);
          for (let i = 1; i < r.length; i++) expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score);
          for (const p of scorePaths(a({ age, education, goal }))) {
            expect(p.score).toBeGreaterThanOrEqual(0);
            expect(p.score).toBeLessThanOrEqual(100);
          }
        }
  });

  it('validates answers strictly', () => {
    expect(eligibilityAnswersSchema.safeParse(base).success).toBe(true);
    expect(eligibilityAnswersSchema.safeParse({ ...base, german: 'C2' }).success).toBe(false);
    expect(eligibilityAnswersSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });

  it('turns forecast day ranges into week ranges', () => {
    const toRanges = (r: Record<string, [number, number]>) => Object.fromEntries(Object.entries(r).map(([k, [minDays, maxDays]]) => [k, { minDays, maxDays }]));
    expect(weeksFromRanges(toRanges(DEFAULTS_BY_TYPE.WORK))).toEqual({ minWeeks: 8, maxWeeks: 21 });
    expect(weeksFromRanges(toRanges(DEFAULTS_BY_TYPE.FAMILY))).toEqual({ minWeeks: 12, maxWeeks: 34 });
    expect(weeksFromRanges({})).toEqual({ minWeeks: 1, maxWeeks: 1 });
  });
});
