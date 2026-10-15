import { describe, expect, it } from 'vitest';
import {
  MATCH_WEIGHTS,
  canonicalProfession,
  coveredLicences,
  germanRank,
  licenceCovers,
  matchCandidate,
  normaliseText,
  parseLicences,
  professionSimilarity,
} from '../../src/lib/matching.js';
import { anonymisedName, fillL10n, fillL10nList, slugify } from '../../src/lib/vacancies.js';

describe('germanRank', () => {
  it('orders none < A1 < … < C2 and treats unknown as none', () => {
    expect(['none', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(germanRank)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(germanRank(null)).toBe(0);
    expect(germanRank('b1')).toBe(3);
    expect(germanRank('fluent')).toBe(0);
  });
});

describe('normaliseText', () => {
  it('folds Azerbaijani and German letters and punctuation', () => {
    expect(normaliseText('Tibb bacısı')).toBe('tibb bacisi');
    expect(normaliseText('LKW-Fahrer')).toBe('lkw fahrer');
    expect(normaliseText('Schweißer')).toBe('schweisser');
    expect(normaliseText('  Aşpaz!! ')).toBe('aspaz');
  });
});

describe('canonicalProfession', () => {
  it.each([
    ['Truck driver', 'truck_driver'],
    ['LKW-Fahrer CE', 'truck_driver'],
    ['Berufskraftfahrer', 'truck_driver'],
    ['Sürücü', 'truck_driver'],
    ['Водитель', 'truck_driver'],
    ['дальнобойщик', 'truck_driver'],
    ['Водитель автобуса', 'bus_driver'],
    ['bus driver', 'bus_driver'],
    ['Nurse', 'nurse'],
    ['Pflegefachkraft', 'nurse'],
    ['Tibb bacısı', 'nurse'],
    ['Медсестра', 'nurse'],
    ['Koch', 'cook'],
    ['aşpaz', 'cook'],
    ['Повар', 'cook'],
    ['Schweißer', 'welder'],
    ['qaynaqçı', 'welder'],
    ['Bauarbeiter', 'construction_worker'],
    ['inşaat fəhləsi', 'construction_worker'],
    ['Lagerarbeiter', 'warehouse'],
    ['кладовщик', 'warehouse'],
    ['Elektriker', 'electrician'],
    ['электрик', 'electrician'],
    ['Softwareentwickler', 'it'],
    ['программист', 'it'],
  ])('%s → %s', (text, key) => {
    expect(canonicalProfession(text)).toBe(key);
  });

  it('returns null for unknown or empty text', () => {
    expect(canonicalProfession('astronaut')).toBeNull();
    expect(canonicalProfession('')).toBeNull();
    expect(canonicalProfession(null)).toBeNull();
  });
});

describe('professionSimilarity', () => {
  it('is 1 for synonyms across languages', () => {
    expect(professionSimilarity('Sürücü', 'LKW-Fahrer')).toBe(1);
    expect(professionSimilarity('Tibb bacısı', 'Pflegekraft')).toBe(1);
  });
  it('gives partial credit within a family', () => {
    expect(professionSimilarity('Kurier', 'LKW-Fahrer')).toBe(0.6);
    expect(professionSimilarity('Schweißer', 'Bauarbeiter')).toBe(0.6);
  });
  it('is 0 for unrelated professions and missing candidate profession', () => {
    expect(professionSimilarity('Koch', 'LKW-Fahrer')).toBe(0);
    expect(professionSimilarity(null, 'Koch')).toBe(0);
  });
  it('is 1 when the vacancy does not ask for a profession', () => {
    expect(professionSimilarity('anything', null)).toBe(1);
  });
  it('falls back to shared words for unknown professions', () => {
    expect(professionSimilarity('Glass facade installer', 'Facade installer')).toBe(0.5);
    expect(professionSimilarity('Glass blower', 'Facade installer')).toBe(0);
    expect(professionSimilarity('Facade installer', 'facade  INSTALLER')).toBe(1);
  });
});

describe('driving licences', () => {
  it('parses lists, suffixes and Cyrillic look-alikes', () => {
    expect(parseLicences('B, C/CE (95)')).toEqual(['B', 'C', 'CE']);
    expect(parseLicences('В, С')).toEqual(['B', 'C']);
    expect(parseLicences('')).toEqual([]);
    expect(parseLicences('none')).toEqual([]);
  });
  it('applies CE ⊇ C ⊇ B', () => {
    expect(licenceCovers('CE', 'C')).toBe(true);
    expect(licenceCovers('CE', 'B')).toBe(true);
    expect(licenceCovers('C', 'B')).toBe(true);
    expect(licenceCovers('C', 'CE')).toBe(false);
    expect(licenceCovers('B', 'C')).toBe(false);
    expect(licenceCovers(null, 'B')).toBe(false);
    expect(licenceCovers(null, null)).toBe(true);
    expect(licenceCovers('B, D', 'D1')).toBe(true);
    expect(licenceCovers('C', 'C, D')).toBe(false);
    expect(coveredLicences('CE').has('C1E')).toBe(true);
  });
});

describe('matchCandidate', () => {
  const vacancy = { profession: 'LKW-Fahrer', germanLevel: 'A2', minExperience: 3, drivingLicence: 'CE' };

  it('scores a perfect candidate 100 with no gaps', () => {
    const r = matchCandidate({ profession: 'Sürücü', germanLevel: 'B1', experienceYears: 5, drivingLicence: 'B, C, CE' }, vacancy);
    expect(r).toEqual({ score: 100, gaps: [] });
  });

  it('scores 100 when the vacancy asks for nothing', () => {
    expect(matchCandidate({}, {}).score).toBe(100);
  });

  it('lists every gap with what is required', () => {
    const r = matchCandidate({ profession: 'Koch', germanLevel: 'none', experienceYears: 0, drivingLicence: 'B' }, vacancy);
    expect(r.gaps.map((g) => g.code)).toEqual(['PROFESSION', 'GERMAN', 'EXPERIENCE', 'LICENCE']);
    expect(r.gaps.find((g) => g.code === 'GERMAN')).toEqual({ code: 'GERMAN', required: 'A2', actual: 'none' });
    expect(r.gaps.find((g) => g.code === 'LICENCE')).toMatchObject({ required: 'CE', actual: 'B' });
    // Visa share (no visa category = fully met) + German two levels below (20 % of its weight).
    expect(r.score).toBe(MATCH_WEIGHTS.visa + MATCH_WEIGHTS.german * 0.2);
  });

  it('gives partial credit for one German level below and partial experience', () => {
    const r = matchCandidate({ profession: 'LKW-Fahrer', germanLevel: 'A1', experienceYears: 1, drivingLicence: 'CE' }, vacancy);
    // 35 + 25*0.5 + 15*(1/3) + 15 + 10 = 77.5 → 78
    expect(r.score).toBe(78);
    expect(r.gaps.map((g) => g.code)).toEqual(['GERMAN', 'EXPERIENCE']);
  });

  it('gives partial licence credit for C when CE is required', () => {
    const withC = matchCandidate({ profession: 'LKW-Fahrer', germanLevel: 'B1', experienceYears: 5, drivingLicence: 'C' }, vacancy);
    const withB = matchCandidate({ profession: 'LKW-Fahrer', germanLevel: 'B1', experienceYears: 5, drivingLicence: 'B' }, vacancy);
    expect(withC.score).toBeGreaterThan(withB.score);
    expect(withC.score).toBeLessThan(100);
  });

  it('checks visa-category fit: German minimum and a qualification for §18b', () => {
    const v = { ...vacancy, germanLevel: null, visaCategory: { visaLabel: '§18b', germanLevel: 'B1' } };
    const weak = matchCandidate({ profession: 'LKW-Fahrer', germanLevel: 'A2', experienceYears: 5, drivingLicence: 'CE', education: 'school' }, v);
    expect(weak.gaps.map((g) => g.code)).toEqual(['VISA_GERMAN', 'VISA_EDUCATION']);
    expect(weak.score).toBe(90);
    const ok = matchCandidate({ profession: 'LKW-Fahrer', germanLevel: 'B1', experienceYears: 5, drivingLicence: 'CE', education: 'vocational' }, v);
    expect(ok).toEqual({ score: 100, gaps: [] });
    // Seasonal work has no qualification requirement.
    const seasonal = matchCandidate({ education: null }, { visaCategory: { visaLabel: 'Saisonarbeit', germanLevel: null } });
    expect(seasonal.score).toBe(100);
  });

  it('always stays within 0..100', () => {
    const r = matchCandidate({}, { profession: 'Koch', germanLevel: 'C2', minExperience: 40, drivingLicence: 'DE', visaCategory: { visaLabel: '§18a', germanLevel: 'C2' } });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBe(0);
  });
});

describe('vacancy helpers', () => {
  it('fills missing languages with the source text', () => {
    expect(fillL10n({ de: 'Fahrer' })).toEqual({ az: 'Fahrer', de: 'Fahrer', en: 'Fahrer', ru: 'Fahrer' });
    expect(fillL10n({ az: 'Sürücü', en: 'Driver' })).toEqual({ az: 'Sürücü', de: 'Driver', en: 'Driver', ru: 'Driver' });
    expect(fillL10nList({ ru: ['a'] })).toEqual({ az: ['a'], de: ['a'], en: ['a'], ru: ['a'] });
    expect(fillL10nList({ ru: [] })).toBeNull();
  });
  it('builds readable slugs from any language', () => {
    expect(slugify('LKW-Fahrer (m/w/d) Hamburg')).toBe('lkw-fahrer-m-w-d-hamburg');
    expect(slugify('Pflegefachkraft für Köln')).toBe('pflegefachkraft-fuer-koeln');
    expect(slugify('Водитель грузовика')).toBe('voditel-gruzovika');
    expect(slugify('Aşpaz köməkçisi')).toBe('aspaz-koemekcisi');
  });
  it('anonymises names to first name + last initial', () => {
    expect(anonymisedName({ firstName: 'Ali', lastName: 'Məmmədov' })).toBe('Ali M.');
    expect(anonymisedName({ firstName: 'Ali', lastName: '' })).toBe('Ali');
  });
});
