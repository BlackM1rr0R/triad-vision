import { afterEach, describe, expect, it } from 'vitest';
import { computePlaces, countOccupying, fullLast, OCCUPYING_CASE_STATUSES, visaTypeOfVacancy } from '../../src/lib/vacancyPlaces/places.js';
import { defaultPolicy } from '../../src/lib/vacancyPlaces/policy.js';

describe('vacancy places: computePlaces', () => {
  it('free = positions − filled, never below zero', () => {
    expect(computePlaces({ positions: 3, filledAdjustment: 0 }, 1)).toEqual({ positions: 3, filled: 1, free: 2 });
    expect(computePlaces({ positions: 3, filledAdjustment: 0 }, 3)).toEqual({ positions: 3, filled: 3, free: 0 });
    expect(computePlaces({ positions: 2, filledAdjustment: 0 }, 5)).toEqual({ positions: 2, filled: 5, free: 0 });
  });

  it('applies the staff correction and never reports negative filled places', () => {
    expect(computePlaces({ positions: 5, filledAdjustment: 2 }, 1)).toEqual({ positions: 5, filled: 3, free: 2 });
    expect(computePlaces({ positions: 5, filledAdjustment: -3 }, 1)).toEqual({ positions: 5, filled: 0, free: 5 });
    expect(computePlaces({ positions: 1, filledAdjustment: null }, 0)).toEqual({ positions: 1, filled: 0, free: 1 });
  });
});

describe('vacancy places: countOccupying', () => {
  it('counts each person once per vacancy (accepted application + its case = one place)', () => {
    const counts = countOccupying(
      [
        { vacancyId: 'v1', userId: 'a' },
        { vacancyId: 'v1', userId: 'b' },
        { vacancyId: 'v2', userId: 'a' },
      ],
      [
        { vacancyId: 'v1', clientId: 'a' }, // same person as the accepted application
        { vacancyId: 'v1', clientId: 'c' },
        { vacancyId: null, clientId: 'd' }, // case without vacancy: ignored
      ],
    );
    expect(counts.get('v1')).toBe(3);
    expect(counts.get('v2')).toBe(1);
    expect(counts.has('v3')).toBe(false);
  });

  it('only contract / visa stages of a case occupy a place', () => {
    expect(OCCUPYING_CASE_STATUSES).toContain('CONTRACT_SIGNED');
    expect(OCCUPYING_CASE_STATUSES).toContain('APPROVED');
    for (const s of ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'REJECTED', 'CANCELLED']) expect(OCCUPYING_CASE_STATUSES).not.toContain(s);
  });
});

describe('vacancy places: ordering and visa type', () => {
  it('lists full vacancies after the open ones and keeps the order inside each group', () => {
    const items = [
      { id: 'a', free: 0 },
      { id: 'b', free: 2 },
      { id: 'c', free: 0 },
      { id: 'd', free: 1 },
    ];
    expect(fullLast(items, (x) => x.free <= 0).map((x) => x.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('derives the visa type of a case from the vacancy', () => {
    expect(visaTypeOfVacancy({ employmentType: 'AUSBILDUNG' })).toBe('AUSBILDUNG');
    expect(visaTypeOfVacancy({ employmentType: 'FULL_TIME', visaCategory: { slug: 'ausbildung' } })).toBe('AUSBILDUNG');
    expect(visaTypeOfVacancy({ employmentType: 'FULL_TIME', visaCategory: { slug: 'fachkraefte' } })).toBe('WORK');
    expect(visaTypeOfVacancy({ employmentType: 'SEASONAL', visaCategory: null })).toBe('WORK');
  });
});

describe('vacancy application policy defaults', () => {
  const saved = process.env.VACANCY_POLICY_DEFAULTS;
  afterEach(() => {
    if (saved === undefined) delete process.env.VACANCY_POLICY_DEFAULTS;
    else process.env.VACANCY_POLICY_DEFAULTS = saved;
  });

  it('is strict by default (owner request): only our vacancies, no external applications', () => {
    delete process.env.VACANCY_POLICY_DEFAULTS;
    expect(defaultPolicy()).toEqual({ clientsOnlyActiveVacancies: true, allowExternalApplications: false });
  });

  it('keeps the old behaviour for the legacy test setup', () => {
    process.env.VACANCY_POLICY_DEFAULTS = 'legacy';
    expect(defaultPolicy()).toEqual({ clientsOnlyActiveVacancies: false, allowExternalApplications: true });
  });
});
