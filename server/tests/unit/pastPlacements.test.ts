import { describe, expect, it } from 'vitest';
import type { CityAggregate } from '../../src/lib/growth/map.js';
import { applyThreshold, groupPast, mergePast, type PastRow } from '../../src/lib/pastPlacements/aggregate.js';

const SLUGS: Record<string, string> = { frankfurt: 'frankfurt', 'frankfurt am main': 'frankfurt', leipzig: 'leipzig', hamburg: 'hamburg' };
const slugOf = (city: string) => SLUGS[city.toLowerCase()] ?? null;
const label = (key: string) => ({ cook: 'Koch/Köchin', truck_driver: 'LKW-Fahrer/in' })[key] ?? key;

const computed = (city: string, workers: number, professions: string[] = []): [string, CityAggregate] => [
  city.toLowerCase(),
  { cityKey: city.toLowerCase(), city, workers, professions, lat: null, lng: null, source: 'computed', computed: workers, past: 0 },
];
const past = (city: string, count: number, over: Partial<PastRow> = {}): PastRow => ({
  city,
  cityKey: city.toLowerCase(),
  citySlug: slugOf(city),
  profession: null,
  count,
  ...over,
});

describe('past placements aggregation', () => {
  it('groups rows per city (slug first) and ignores non-positive counts', () => {
    const g = groupPast([past('Leipzig', 2), past('Leipzig', 1, { profession: 'cook' }), past('Leipzig', 0), past('Kleinstadt', 4)], label);
    expect([...g.values()].map((x) => [x.city, x.count])).toEqual([
      ['Leipzig', 3],
      ['Kleinstadt', 4],
    ]);
    expect([...g.values()][0].professions.get('Koch/Köchin')).toBe(1);
  });

  it('adds past numbers to the case city with the same slug and creates past-only cities', () => {
    const out = new Map([computed('Frankfurt', 2, ['Koch']), computed('Hamburg', 5, ['LKW-Fahrer'])]);
    mergePast(out, [past('Frankfurt am Main', 1, { profession: 'cook' }), past('Leipzig', 2), past('Leipzig', 2, { profession: 'truck_driver' })], slugOf, label);
    expect(out.get('frankfurt')).toMatchObject({ city: 'Frankfurt', workers: 3, computed: 2, past: 1, source: 'mixed', professions: ['Koch', 'Koch/Köchin'] });
    expect(out.get('hamburg')).toMatchObject({ workers: 5, past: 0, source: 'computed' });
    expect(out.get('leipzig')).toMatchObject({ city: 'Leipzig', workers: 4, computed: 0, past: 4, source: 'manual', professions: ['LKW-Fahrer/in'] });
  });

  it('applies the threshold (never below 3) to the combined total', () => {
    const out = new Map([computed('Frankfurt', 2), computed('Hamburg', 1)]);
    mergePast(out, [past('Frankfurt', 1), past('Leipzig', 2), past('Kleinstadt', 3)], slugOf, label);
    expect(applyThreshold(out.values(), 3).map((c) => [c.city, c.workers])).toEqual([
      ['Frankfurt', 3],
      ['Kleinstadt', 3],
    ]);
    expect(applyThreshold(out.values(), 1).map((c) => c.city)).toEqual(['Frankfurt', 'Kleinstadt']); // min cannot go below 3
    expect(applyThreshold(out.values(), 3, false).map((c) => c.city)).toEqual(['Frankfurt', 'Kleinstadt', 'Leipzig', 'Hamburg']);
  });

  it('leaves the map unchanged without past rows', () => {
    const out = new Map([computed('Hamburg', 4)]);
    mergePast(out, [], slugOf, label);
    expect([...out.values()]).toEqual([computed('Hamburg', 4)[1]]);
  });
});
