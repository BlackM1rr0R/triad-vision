import { describe, expect, it } from 'vitest';
import { availabilityBand, buildCatalogue, experienceBand, germanBand, GROUP_KEYS, K_MIN, type CatalogueRow } from '../../src/lib/candidateCatalogue/index.js';
import { PROFESSION_LABELS } from '../../src/lib/candidateCatalogue/labels.js';
import { PROFESSION_KEYS } from '../../src/lib/matching.js';

const NOW = new Date('2026-11-16T00:00:00Z');
const row = (p: Partial<CatalogueRow> = {}): CatalogueRow => ({ profession: 'LKW-Fahrer', germanLevel: 'B1', experienceYears: 5, availability: 'IMMEDIATE', earliestStart: null, ...p });

describe('candidate catalogue: generalisation', () => {
  it('bands', () => {
    expect([null, 'A1', 'A2', 'B1', 'B2', 'C1'].map(germanBand)).toEqual(['A0_A2', 'A0_A2', 'A0_A2', 'B1', 'B2_PLUS', 'B2_PLUS']);
    expect([null, 0, 2, 3, 5, 6, 10, 25].map(experienceBand)).toEqual(['0_2', '0_2', '0_2', '3_5', '3_5', '6_10', '10_PLUS', '10_PLUS']);
    expect(availabilityBand({ availability: null, earliestStart: new Date('2026-12-01T00:00:00Z') }, NOW)).toBe('NOW');
    expect(availabilityBand({ availability: 'IMMEDIATE', earliestStart: new Date('2027-02-01T00:00:00Z') }, NOW)).toBe('SOON');
    expect(availabilityBand({ availability: 'LATER', earliestStart: null }, NOW)).toBe('LATER');
    expect(availabilityBand({ availability: null, earliestStart: null }, NOW)).toBe('LATER');
  });

  it('every canonical profession has a label in six languages', () => {
    for (const k of PROFESSION_KEYS) expect(Object.keys(PROFESSION_LABELS[k] ?? {}).sort(), k).toEqual(['az', 'de', 'en', 'ru', 'tr', 'uk']);
  });
});

describe('candidate catalogue: k-anonymity', () => {
  it('publishes only groups of at least k identical generalised profiles', () => {
    const rows = [
      row(),
      row({ profession: 'Berufskraftfahrer', experienceYears: 4 }),
      row({ profession: 'водитель грузовика', experienceYears: 3 }), // 3 alike → published
      row({ profession: 'Koch', germanLevel: 'A2', experienceYears: 12 }),
      row({ profession: 'Koch', germanLevel: 'A1', experienceYears: 11 }), // only 2 → suppressed
      row({ profession: 'Astronaut' }),
      row({ profession: 'Astronaut' }),
      row({ profession: 'Astronaut' }), // free text, not canonical → never published
    ];
    const c = buildCatalogue(rows, NOW);
    expect(K_MIN).toBe(3);
    expect(c.groups).toEqual([{ profession: 'truck_driver', german: 'B1', experience: '3_5', availability: 'NOW', count: 3 }]);
    expect(c.professions).toEqual([{ profession: 'truck_driver', count: 3 }]);
    expect(c.total).toBe(3);
    expect(c.suppressed).toBe(5);
  });

  it('never leaks identifiers: only whitelisted keys, profession counts = sum of published groups', () => {
    const rows: CatalogueRow[] = [];
    for (let i = 0; i < 7; i++) rows.push(row({ experienceYears: 1 }));
    for (let i = 0; i < 4; i++) rows.push(row({ profession: 'Schweißer', germanLevel: 'B2', experienceYears: 8, availability: 'THREE_MONTHS' }));
    rows.push(row({ experienceYears: 20 })); // a lone senior driver: suppressed, not visible in the driver count
    const c = buildCatalogue(rows, NOW);
    for (const g of c.groups) {
      expect(Object.keys(g).sort()).toEqual([...GROUP_KEYS].sort());
      expect(g.count).toBeGreaterThanOrEqual(K_MIN);
    }
    expect(c.professions.find((p) => p.profession === 'truck_driver')?.count).toBe(7);
    expect(c.suppressed).toBe(1);
    const json = JSON.stringify(c);
    for (const forbidden of ['code', 'userId', 'email', 'name', 'birth', 'city', 'region']) expect(json.includes(`"${forbidden}"`)).toBe(false);
    expect(json).not.toContain('TV-K');
  });

  it('k can be raised', () => {
    expect(buildCatalogue([row(), row(), row()], NOW, 4).groups).toEqual([]);
  });
});
