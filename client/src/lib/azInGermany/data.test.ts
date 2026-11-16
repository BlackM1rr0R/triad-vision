import { describe, expect, it } from 'vitest';
import { AZ_PLACES, PLACE_TYPES, clusterByCity, filterPlaces, osmMapUrl, osmUrl, placeCities } from './data';
import { GERMANY_PATH, OUTLINE, project } from './germanyOutline';

const LOCALES = ['az', 'de', 'en', 'ru'] as const;

describe('Azerbaijan in Germany data', () => {
  it('has unique ids, a known type, sources, a check date and notes in four languages', () => {
    expect(new Set(AZ_PLACES.map((p) => p.id)).size).toBe(AZ_PLACES.length);
    for (const p of AZ_PLACES) {
      expect(PLACE_TYPES, p.id).toContain(p.type);
      expect(p.sources.length, p.id).toBeGreaterThan(0);
      for (const s of p.sources) expect(s.url.startsWith('https://'), `${p.id} ${s.url}`).toBe(true);
      if (p.website) expect(p.website.startsWith('https://'), p.id).toBe(true);
      expect(p.verifiedOn, p.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (p.osm) expect(p.osm, p.id).toMatch(/^(node|way|relation)\/\d+$/);
      for (const l of LOCALES) expect(p.note[l].trim().length, `${p.id} ${l}`).toBeGreaterThan(10);
    }
  });

  it('places every entry inside Germany on the drawn map', () => {
    for (const p of AZ_PLACES) {
      expect(p.lat, p.id).toBeGreaterThan(47.2);
      expect(p.lat, p.id).toBeLessThan(55.1);
      expect(p.lon, p.id).toBeGreaterThan(5.8);
      expect(p.lon, p.id).toBeLessThan(15.1);
      const { x, y } = project(p.lon, p.lat);
      expect(x, p.id).toBeGreaterThan(0);
      expect(x, p.id).toBeLessThan(OUTLINE.width);
      expect(y, p.id).toBeGreaterThan(0);
      expect(y, p.id).toBeLessThan(OUTLINE.height);
    }
    expect(GERMANY_PATH.startsWith('M')).toBe(true);
    expect(GERMANY_PATH.length).toBeGreaterThan(1000);
  });

  it('projects the corners of the outline box', () => {
    expect(project(OUTLINE.lon0, OUTLINE.lat1)).toEqual({ x: 0, y: 0 });
    const br = project(OUTLINE.lon1, OUTLINE.lat0);
    expect(br.x).toBeCloseTo(OUTLINE.width, 6);
    expect(br.y).toBeCloseTo(OUTLINE.height, 6);
  });

  it('filters by type and city and clusters by city', () => {
    expect(filterPlaces(AZ_PLACES, null, null)).toHaveLength(AZ_PLACES.length);
    expect(filterPlaces(AZ_PLACES, 'official', null).every((p) => p.type === 'official')).toBe(true);
    expect(filterPlaces(AZ_PLACES, null, 'Berlin').every((p) => p.city === 'Berlin')).toBe(true);
    expect(filterPlaces(AZ_PLACES, 'food', 'Karlstadt')).toHaveLength(0);
    const clusters = clusterByCity(AZ_PLACES);
    expect(clusters.reduce((n, c) => n + c.items.length, 0)).toBe(AZ_PLACES.length);
    expect(new Set(clusters.map((c) => c.city)).size).toBe(clusters.length);
    expect(placeCities()[0]).toBe('Berlin');
  });

  it('builds OpenStreetMap links', () => {
    expect(osmUrl('node/548141332')).toBe('https://www.openstreetmap.org/node/548141332');
    expect(osmMapUrl(52.5, 13.4)).toBe('https://www.openstreetmap.org/?mlat=52.50000&mlon=13.40000#map=17/52.50000/13.40000');
  });
});
