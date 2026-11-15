import { describe, expect, it } from 'vitest';
import { DEFAULT_ANSWERS, QUIZ_CITIES, decodeAnswers, encodeAnswers, rankCities, type Answers } from './score';

const ask = (over: Partial<Answers>) => ({ ...DEFAULT_ANSWERS, ...over });

describe('which German city quiz', () => {
  it('scores the 14 city-guide cities deterministically', () => {
    expect(QUIZ_CITIES).toHaveLength(14);
    const a = ask({ field: 'it' });
    expect(rankCities(a)).toEqual(rankCities(a));
    expect(rankCities(a)[0].match).toBe(rankCities(a)[0].match);
  });

  it('a tight budget, a large community and logistics pick a cheaper city', () => {
    const top = rankCities(ask({ budget: 'tight', field: 'logistics', community: 'important', size: 'mid' }))[0];
    expect(['leipzig', 'dortmund', 'bremen', 'essen', 'hannover', 'duesseldorf']).toContain(top.city.slug);
    expect(top.reasons).toContain('budget');
  });

  it('a big city, nightlife, no car and English first pick a metropolis', () => {
    const top = rankCities(ask({ size: 'metropolis', lifestyle: 'nightlife', transport: 'noCar', language: 'englishFirst', budget: 'comfortable', field: 'it' }))[0];
    expect(['berlin', 'hamburg', 'muenchen']).toContain(top.city.slug);
    expect(top.match).toBeGreaterThan(80);
  });

  it('sunny + nature + industry favours the south', () => {
    const top = rankCities(ask({ climate: 'sunny', lifestyle: 'nature', field: 'industry', budget: 'comfortable' }))[0];
    expect(['muenchen', 'stuttgart']).toContain(top.city.slug);
  });

  it('encodes answers as one digit per question and rejects bad strings', () => {
    const a = ask({ climate: 'sunny', field: 'industry' });
    const code = encodeAnswers(a);
    expect(code).toMatch(/^\d{8}$/);
    expect(decodeAnswers(code)).toEqual(a);
    expect(decodeAnswers('9999')).toBeNull();
    expect(decodeAnswers('09000000')).toBeNull();
    expect(decodeAnswers(null)).toBeNull();
  });
});
