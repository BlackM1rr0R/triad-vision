import { describe, expect, it } from 'vitest';
import { CITIES } from '@/lib/cities/data';
import { LONG_DISTANCE, TRIP_ORIGINS, bahnUrl, osmSearchUrl, seasonOf, sortTrips, tripOrigin } from './data';

const LOCALES = ['az', 'de', 'en', 'ru'] as const;

describe('weekend trips data', () => {
  it('covers every real city of the city guide with exactly ten trips', () => {
    const cities = CITIES.filter((c) => c.slug !== 'small-town').map((c) => c.slug);
    expect(TRIP_ORIGINS.map((o) => o.city).sort()).toEqual([...cities].sort());
    for (const o of TRIP_ORIGINS) expect(o.trips, o.city).toHaveLength(10);
  });

  it('has unique ids, sane travel times and texts in all four content languages', () => {
    for (const o of TRIP_ORIGINS) {
      const ids = o.trips.map((t) => t.id);
      expect(new Set(ids).size, o.city).toBe(ids.length);
      for (const t of o.trips) {
        expect(t.minutes[0], t.id).toBeGreaterThan(0);
        expect(t.minutes[1], t.id).toBeGreaterThanOrEqual(t.minutes[0]);
        // A day trip: at most about 3.5 hours one way.
        expect(t.minutes[1], t.id).toBeLessThanOrEqual(210);
        expect(t.seasons.length, t.id).toBeGreaterThan(0);
        for (const l of LOCALES) {
          expect(t.why[l].trim().length, `${t.id} ${l}`).toBeGreaterThan(10);
          if (t.note) expect(t.note[l].trim(), `${t.id} note ${l}`).toBeTruthy();
        }
        expect(t.station.trim(), t.id).toBeTruthy();
      }
    }
  });

  it('never lists a long-distance train (ICE / IC / EC are not covered by the ticket)', () => {
    for (const o of TRIP_ORIGINS) for (const t of o.trips) expect(LONG_DISTANCE.test(t.lines), `${t.id}: ${t.lines}`).toBe(false);
    expect(LONG_DISTANCE.test('ICE 123')).toBe(true);
    expect(LONG_DISTANCE.test('RE1 · S7')).toBe(false);
  });

  it('does not send anyone to their own city', () => {
    for (const o of TRIP_ORIGINS) for (const t of o.trips) expect(t.station, `${o.city} → ${t.id}`).not.toBe(o.station);
  });

  it('builds bahn.de and OpenStreetMap links with encoded station names', () => {
    const url = bahnUrl('Köln Hbf', 'Bonn Hbf');
    expect(url.startsWith('https://www.bahn.de/buchung/fahrplan/suche#')).toBe(true);
    expect(url).toContain('so=K%C3%B6ln%20Hbf');
    expect(url).toContain('zo=Bonn%20Hbf');
    // Regional products only: no 00 (ICE) / 01 (IC/EC) / 02 (IR).
    expect(url).toContain('vm=03,04,05,06,07,08,09');
    expect(osmSearchUrl('Lübeck')).toBe('https://www.openstreetmap.org/search?query=L%C3%BCbeck%2C%20Deutschland');
  });

  it('sorts trips of the chosen season first, then by travel time', () => {
    const berlin = tripOrigin('berlin')!;
    const summer = sortTrips(berlin.trips, 'summer');
    const firstOff = summer.findIndex((t) => !t.seasons.includes('summer'));
    if (firstOff >= 0) expect(summer.slice(firstOff).every((t) => !t.seasons.includes('summer'))).toBe(true);
    const plain = sortTrips(berlin.trips, null);
    for (let i = 1; i < plain.length; i++) expect(plain[i].minutes[0]).toBeGreaterThanOrEqual(plain[i - 1].minutes[0]);
    expect(tripOrigin('nowhere')).toBeUndefined();
  });

  it('maps months to meteorological seasons', () => {
    expect(seasonOf(1)).toBe('winter');
    expect(seasonOf(4)).toBe('spring');
    expect(seasonOf(7)).toBe('summer');
    expect(seasonOf(10)).toBe('autumn');
    expect(seasonOf(12)).toBe('winter');
  });
});
