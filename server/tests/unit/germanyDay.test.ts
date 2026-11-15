import { afterEach, describe, expect, it } from 'vitest';
import { BADGES, documentFacts, earnedKeys, highestLevel, type BadgeFacts } from '../../src/lib/badges/rules.js';
import { setWeatherFetch, weatherFor, WEATHER_TTL_MS } from '../../src/lib/clientPlus/weather.js';
import { climateFor } from '../../src/lib/departure/climate.js';
import { dayWeather, FORECAST_WEEK } from '../../src/lib/departure/dayWeather.js';

const none: BadgeFacts = {
  profilePercent: 0,
  docsUploaded: false,
  docsAccepted: false,
  contractSigned: false,
  visaApproved: false,
  arrived: false,
  bestStreak: 0,
  wordsLearned: 0,
  level: null,
};

describe('badge rules', () => {
  it('nothing earned without facts; every key is unique', () => {
    expect(earnedKeys(none)).toEqual([]);
    expect(new Set(BADGES.map((b) => b.key)).size).toBe(BADGES.length);
  });

  it('journey badges follow their facts', () => {
    expect(earnedKeys({ ...none, profilePercent: 90 })).toEqual([]);
    expect(earnedKeys({ ...none, profilePercent: 100, docsUploaded: true, contractSigned: true })).toEqual(['PROFILE_COMPLETE', 'DOCS_UPLOADED', 'CONTRACT_SIGNED']);
    expect(earnedKeys({ ...none, docsAccepted: true, visaApproved: true, arrived: true })).toEqual(['DOCS_ACCEPTED', 'VISA_APPROVED', 'ARRIVED']);
  });

  it('streak and word thresholds are inclusive; progress is capped at the goal', () => {
    expect(earnedKeys({ ...none, bestStreak: 6 })).toEqual([]);
    expect(earnedKeys({ ...none, bestStreak: 7 })).toEqual(['STREAK_7']);
    expect(earnedKeys({ ...none, bestStreak: 30, wordsLearned: 100 })).toEqual(['STREAK_7', 'STREAK_30', 'WORDS_100']);
    expect(earnedKeys({ ...none, wordsLearned: 500 })).toEqual(['WORDS_100', 'WORDS_500']);
    const w500 = BADGES.find((b) => b.key === 'WORDS_500')!;
    expect(w500.progress!({ ...none, wordsLearned: 120 })).toEqual({ value: 120, goal: 500 });
    expect(w500.progress!({ ...none, wordsLearned: 900 })).toEqual({ value: 500, goal: 500 });
  });

  it('level badges: every level up to the one reached', () => {
    expect(earnedKeys({ ...none, level: 'none' })).toEqual([]);
    expect(earnedKeys({ ...none, level: 'A2' })).toEqual(['LEVEL_A1', 'LEVEL_A2']);
    expect(earnedKeys({ ...none, level: 'c1' })).toEqual(['LEVEL_A1', 'LEVEL_A2', 'LEVEL_B1', 'LEVEL_B2']);
    expect(highestLevel('none', 'A2', null, 'B1', 'xx')).toBe('B1');
    expect(highestLevel(null, 'none')).toBeNull();
  });

  it('documents: all required uploaded (non-rejected) / accepted; optional ones do not count', () => {
    expect(documentFacts([])).toEqual({ uploaded: false, accepted: false });
    expect(documentFacts([{ required: false, documents: [] }])).toEqual({ uploaded: false, accepted: false });
    const reqs = [
      { required: true, documents: [{ status: 'ACCEPTED' }] },
      { required: true, documents: [{ status: 'REJECTED' }, { status: 'PENDING' }] },
      { required: false, documents: [] },
    ];
    expect(documentFacts(reqs)).toEqual({ uploaded: true, accepted: false });
    expect(documentFacts([{ required: true, documents: [{ status: 'REJECTED' }] }])).toEqual({ uploaded: false, accepted: false });
    expect(documentFacts([{ required: true, documents: [{ status: 'ACCEPTED' }] }])).toEqual({ uploaded: true, accepted: true });
  });
});

describe('My Germany day weather', () => {
  afterEach(() => setWeatherFetch(null));

  const forecast = (n: number) => ({
    daily: {
      time: Array.from({ length: n }, (_, i) => `2026-11-${String(15 + i).padStart(2, '0')}`),
      weather_code: Array.from({ length: n }, () => 3),
      temperature_2m_max: Array.from({ length: n }, () => 8.6),
      temperature_2m_min: Array.from({ length: n }, () => 1.2),
      precipitation_probability_max: Array.from({ length: n }, () => 40),
    },
  });

  it('within 16 days: the week forecast, cached for 3 hours (per city and length)', async () => {
    const calls: string[] = [];
    setWeatherFetch(async (url) => {
      calls.push(url);
      return url.includes('geocoding') ? { results: [{ name: 'Berlin', latitude: 52.52, longitude: 13.4, country_code: 'DE' }] } : forecast(7);
    });
    const now = new Date('2026-11-15T10:00:00Z');
    const w = await dayWeather('Berlin', 10, new Date('2026-11-25T10:00:00Z'), now);
    expect(w).toMatchObject({ mode: 'forecast', city: 'Berlin', country: 'DE' });
    expect(w && w.mode === 'forecast' ? w.days : []).toHaveLength(FORECAST_WEEK);
    expect(calls[1]).toContain('forecast_days=7');
    await dayWeather('Berlin', 9, new Date('2026-11-24T10:00:00Z'), now);
    expect(calls).toHaveLength(2); // cached
    // The 4-day portal strip is a separate cache entry.
    await weatherFor('Berlin');
    expect(calls).toHaveLength(4);
    expect(calls[3]).toContain('forecast_days=4');
    expect(WEATHER_TTL_MS).toBe(3 * 60 * 60 * 1000);
  });

  it('further than 16 days: typical climate of the departure month, no upstream call', async () => {
    let called = 0;
    setWeatherFetch(async () => {
      called++;
      return {};
    });
    const w = await dayWeather('München (Bayern)', 40, new Date('2027-01-10T08:00:00Z'), new Date('2026-12-01T08:00:00Z'));
    expect(called).toBe(0);
    expect(w).toEqual({ mode: 'climate', city: 'München', month: 1, avgMax: 3, avgMin: -4, generic: false });
  });

  it('Open-Meteo down: falls back to the climate of the current month', async () => {
    setWeatherFetch(async () => {
      throw new Error('down');
    });
    const w = await dayWeather('Hamburg', 5, new Date('2026-11-20T08:00:00Z'), new Date('2026-11-15T08:00:00Z'));
    expect(w).toMatchObject({ mode: 'climate', city: 'Hamburg', month: 11, generic: false });
  });

  it('unknown city or none: Germany profile / nothing', async () => {
    expect(climateFor('Kleinkleckersdorf', 7)).toMatchObject({ generic: true, month: 7, avgMax: 24 });
    expect(climateFor('Frankfurt am Main', 7)).toMatchObject({ generic: false, avgMax: 26 });
    expect(await dayWeather(null, 3, new Date(), new Date())).toBeNull();
  });
});
