import { afterEach, describe, expect, it } from 'vitest';
import { cleanCity, iconFor, setWeatherFetch, weatherFor } from '../../src/lib/clientPlus/weather.js';
import { normaliseMarks, readMarks, reviewMarksSchema } from '../../src/lib/review/marks.js';

describe('weather helpers', () => {
  afterEach(() => setWeatherFetch(null));

  it('WMO codes → icons', () => {
    expect([0, 1, 3, 45, 51, 63, 81, 73, 86, 95, 99].map(iconFor)).toEqual(['sun', 'partly', 'cloud', 'fog', 'drizzle', 'rain', 'rain', 'snow', 'snow', 'storm', 'storm']);
  });

  it('city names are cleaned', () => {
    expect(cleanCity('München (Bayern)')).toBe('München');
    expect(cleanCity('Frankfurt am Main, Hessen')).toBe('Frankfurt am Main');
    expect(cleanCity(' ')).toBeNull();
    expect(cleanCity(null)).toBeNull();
  });

  it('no network in tests by default; concurrent misses share one upstream call', async () => {
    expect(await weatherFor('Berlin')).toBeNull();
    let n = 0;
    setWeatherFetch(async (url) => {
      n++;
      return url.includes('geocoding') ? { results: [{ name: 'Berlin', latitude: 52.5, longitude: 13.4, country_code: 'DE' }] } : { daily: { time: ['2026-11-01'], weather_code: [2], temperature_2m_max: [9], temperature_2m_min: [1], precipitation_probability_max: [20] } };
    });
    const [a, b] = await Promise.all([weatherFor('Berlin'), weatherFor('berlin')]);
    expect(a).toEqual(b);
    expect(a?.days[0]).toMatchObject({ icon: 'partly', max: 9 });
    expect(n).toBe(2);
  });
});

describe('review marks', () => {
  it('validates and normalises', () => {
    expect(reviewMarksSchema.safeParse([{ x: 0, y: 0, w: 1, h: 1 }]).success).toBe(true);
    expect(reviewMarksSchema.safeParse([{ x: 0.5, y: 0, w: 0.6, h: 0.1 }]).success).toBe(false);
    expect(reviewMarksSchema.safeParse([{ x: 0, y: 0, w: 0.001, h: 0.1 }]).success).toBe(false);
    expect(normaliseMarks([{ page: 1, x: 0.33333, y: 0.5, w: 0.66670, h: 0.5, note: '' }])[0]).toEqual({ page: 1, x: 0.3333, y: 0.5, w: 0.6667, h: 0.5, note: '' });
    expect(readMarks('garbage')).toEqual([]);
  });
});
