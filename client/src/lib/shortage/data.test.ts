import { describe, expect, it } from 'vitest';
import { GERMANY_STATES } from './germanyStatesPaths';
import { REGIONS, REGION_STATES, SHORTAGE_PROFESSIONS, categoryOfScore, parseRating, rankedRegions, regionOfState, regionalLevels, type Rating } from './data';

/** The BA label must match its thresholds; a rounded 2.0 may still be "unter Beobachtung" (unrounded mean < 2.0). */
const consistent = (r: Rating) => r.cat === categoryOfScore(r.score) || (r.cat === 'B' && r.score === 2);

describe('shortage barometer data (BA Engpassanalyse 2025)', () => {
  it('parses ratings', () => {
    expect(parseRating('E2.7')).toEqual({ cat: 'E', score: 2.7 });
    expect(parseRating('K0.8')).toEqual({ cat: 'K', score: 0.8 });
    expect(parseRating('-')).toBeNull();
  });

  it('every label agrees with the published thresholds', () => {
    for (const p of SHORTAGE_PROFESSIONS) {
      for (const occ of p.national) for (const r of [...Object.values(occ.ratings), ...Object.values(occ.prev ?? {})]) expect(consistent(r!), `${p.key} ${occ.kldb}`).toBe(true);
      for (const row of p.regional ?? []) {
        expect(consistent(row.national), `${p.key} ${row.group}`).toBe(true);
        for (const r of Object.values(row.states)) expect(consistent(r!), `${p.key} ${row.group} ${row.level}`).toBe(true);
      }
    }
  });

  it('keys are unique and every profession has a national rating', () => {
    expect(new Set(SHORTAGE_PROFESSIONS.map((p) => p.key)).size).toBe(SHORTAGE_PROFESSIONS.length);
    for (const p of SHORTAGE_PROFESSIONS) expect(p.national.some((o) => Object.keys(o.ratings).length > 0), p.key).toBe(true);
  });

  it('maps the 12 BA regions onto exactly the 16 Länder of the map', () => {
    const states = REGIONS.flatMap((r) => REGION_STATES[r]).sort();
    expect(states).toEqual(GERMANY_STATES.map((s) => s.code).sort());
    expect(regionOfState('HB')).toBe('NI_HB');
    expect(regionOfState('BE')).toBe('BB_BE');
    expect(regionOfState('XX')).toBeNull();
  });

  it('never shows a map for truck drivers (no fitting Länder data)', () => {
    const truck = SHORTAGE_PROFESSIONS.find((p) => p.key === 'truck')!;
    expect(truck.regional).toBeNull();
    expect(regionalLevels(truck)).toEqual([]);
  });

  it('ranks regions by score with unrated ones last', () => {
    const nursing = SHORTAGE_PROFESSIONS.find((p) => p.key === 'nursing')!;
    const ranked = rankedRegions(nursing.regional!.find((r) => r.level === 'S')!);
    expect(ranked[0].region).toBe('BY');
    expect(ranked.at(-1)!.rating).toBeNull();
    expect(ranked).toHaveLength(12);
  });
});
