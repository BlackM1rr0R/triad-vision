import { describe, expect, it } from 'vitest';
import { aggregateVacancyCities } from '../../src/lib/growth/vacancyCities.js';

describe('aggregateVacancyCities', () => {
  it('groups by city, counts vacancies and merges the salary range', () => {
    const out = aggregateVacancyCities([
      { city: 'Hamburg, Deutschland', salaryMin: 2800, salaryMax: 3200 },
      { city: 'hamburg ', salaryMin: 2600, salaryMax: null },
      { city: 'Bonn', salaryMin: null, salaryMax: null },
      { city: null, salaryMin: 1, salaryMax: 2 },
    ]);
    expect(out).toEqual([
      { city: 'Hamburg', count: 2, salaryMin: 2600, salaryMax: 3200 },
      { city: 'Bonn', count: 1, salaryMin: null, salaryMax: null },
    ]);
  });
  it('exposes only city, count and salary', () => {
    const [row] = aggregateVacancyCities([{ city: 'Köln', salaryMin: 3000, salaryMax: 3000, employer: 'Secret GmbH' } as never]);
    expect(Object.keys(row).sort()).toEqual(['city', 'count', 'salaryMax', 'salaryMin']);
  });
});
