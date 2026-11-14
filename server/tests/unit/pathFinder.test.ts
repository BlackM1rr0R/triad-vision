import { describe, expect, it } from 'vitest';
import {
  AUSBILDUNG_GROSS,
  REFERENCE_GROSS,
  finderPaths,
  packageFor,
  professionSalary,
  salaryForPath,
  toEligibilityAnswers,
  vacanciesOfProfession,
  type PathFinderAnswers,
} from '../../src/lib/publicAi/pathFinder.js';
import { quickNetMonthly } from '../../src/lib/budget/salary.js';

const base: PathFinderAnswers = { profession: 'driver', education: 'school', german: 'A2', experience: '2_5', age: '26_35' };
const vac = (profession: string | null, salaryMin: number | null, salaryMax: number | null, title = 'x') => ({ profession, title: { az: title, de: title }, salaryMin, salaryMax });

describe('path finder answers', () => {
  it('fills the questions the wizard does not ask with neutral defaults', () => {
    expect(toEligibilityAnswers(base)).toMatchObject({ licence: 'CE', family: 'single', goal: 'work' });
    expect(toEligibilityAnswers({ ...base, profession: 'care', experience: 'none' })).toMatchObject({ licence: 'none', goal: 'ausbildung' });
    expect(toEligibilityAnswers({ ...base, profession: 'it', education: 'university', experience: 'none' }).goal).toBe('work');
  });

  it('recommends the driver path for a professional driver and never family reunion', () => {
    const paths = finderPaths(base);
    expect(paths[0].key).toBe('drivers_19c');
    expect(paths.length).toBeLessThanOrEqual(3);
    expect(paths.some((p) => p.key === 'family')).toBe(false);
    expect(paths[0].reasons).toContain('LICENCE_OK');
  });

  it('recommends a skilled-worker route for a qualified, experienced person with German B1', () => {
    const paths = finderPaths({ profession: 'care', education: 'vocational', german: 'B1', experience: '5p', age: '26_35' });
    expect(paths.map((p) => p.key)).toContain('skilled_18b');
    expect(paths[0].fit).toBe('high');
  });

  it('suggests Ausbildung to a young school leaver', () => {
    expect(finderPaths({ profession: 'none', education: 'school', german: 'B1', experience: 'none', age: '18_25' })[0].key).toBe('ausbildung_16a');
  });
});

describe('salary range', () => {
  it('uses live vacancies of the profession family (by profession field or title) when there are enough', () => {
    const list = [vac('LKW-Fahrer', 2800, 3200), vac(null, 3000, 3600, 'Berufskraftfahrer CE'), vac('truck_driver', 3100, null), vac('Koch', 2400, 2600), vac('Busfahrer', null, null)];
    expect(vacanciesOfProfession(list, 'driver')).toHaveLength(4);
    const s = professionSalary(list, 'driver');
    expect(s).toMatchObject({ kind: 'job', source: 'vacancies', vacancies: 3 });
    expect(s.grossMin).toBeGreaterThanOrEqual(2800);
    expect(s.grossMax).toBeLessThanOrEqual(3600);
    expect(s.grossMax).toBeGreaterThanOrEqual(s.grossMin);
    expect(s.netMin).toBe(quickNetMonthly(s.grossMin));
    expect(s.netMin).toBeLessThan(s.grossMin);
  });

  it('falls back to the reference table with too few vacancies or no profession family', () => {
    expect(professionSalary([vac('LKW-Fahrer', 2800, 3200)], 'driver')).toMatchObject({ source: 'reference', grossMin: REFERENCE_GROSS.driver[0], grossMax: REFERENCE_GROSS.driver[1], vacancies: 0 });
    expect(professionSalary([vac('Koch', 2400, 2600), vac('Koch', 2400, 2600)], 'other').source).toBe('reference');
  });

  it('shows the training allowance for Ausbildung and nothing for studies', () => {
    const job = professionSalary([], 'care');
    expect(salaryForPath('ausbildung_16a', job)).toMatchObject({ kind: 'ausbildung', grossMin: AUSBILDUNG_GROSS[0] });
    expect(salaryForPath('study_16b', job)).toBeNull();
    expect(salaryForPath('skilled_18b', job)).toBe(job);
  });
});

describe('package for a path', () => {
  const pkg = (slug: string, visaTypes: string[] | null, priceCents: number, highlight = false, sortOrder = 0) => ({ id: slug, slug, tier: 'BASIC', visaTypes, title: {}, priceCents, currency: 'EUR', highlight, sortOrder });

  it('prefers a package made for the visa type, then the highlighted one, then the cheapest', () => {
    const list = [pkg('all-cheap', null, 50000), pkg('all-star', null, 90000, true), pkg('work', ['WORK'], 120000), pkg('work-star', ['WORK', 'FAMILY'], 150000, true)];
    expect(packageFor(list, 'WORK')?.slug).toBe('work-star');
    expect(packageFor(list, 'AUSBILDUNG')?.slug).toBe('all-star');
    expect(packageFor([pkg('a', null, 90000), pkg('b', [], 50000)], 'STUDY')?.slug).toBe('b');
    expect(packageFor([pkg('fam', ['FAMILY'], 1)], 'WORK')).toBeNull();
  });
});
