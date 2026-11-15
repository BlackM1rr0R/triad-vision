import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin } from '../helpers/api';
import { uniq } from '../helpers/factories';
import { prisma } from '../helpers/db';
import { clearCache } from '../../src/lib/cache.js';
import { setWeatherFetch } from '../../src/lib/clientPlus/weather.js';

// Home "world" pieces: Baku ↔ Berlin weather endpoint and the data behind the globe (placement map aggregates).

describe('GET /api/life/clock-weather (Baku ↔ Berlin)', () => {
  afterEach(() => setWeatherFetch(null));

  it('returns the current weather of both cities from Open-Meteo, cached for 30 minutes', async () => {
    const calls: string[] = [];
    setWeatherFetch(async (url) => {
      calls.push(url);
      const baku = url.includes('latitude=40.4093');
      return { current: baku ? { temperature_2m: 11.6, weather_code: 1, is_day: 1, wind_speed_10m: 21.4 } : { temperature_2m: -1.2, weather_code: 71, is_day: 0, wind_speed_10m: 8 } };
    });

    const res = await anon().get('/api/life/clock-weather').expect(200);
    expect(res.headers['cache-control']).toContain('max-age=1800');
    expect(res.body.source).toBe('open-meteo');
    expect(res.body.cities).toHaveLength(2);
    expect(res.body.cities[0]).toMatchObject({ key: 'baku', timeZone: 'Asia/Baku', weather: { temp: 12, code: 1, icon: 'partly', isDay: true, wind: 21 } });
    expect(res.body.cities[1]).toMatchObject({ key: 'berlin', timeZone: 'Europe/Berlin', weather: { temp: -1, code: 71, icon: 'snow', isDay: false, wind: 8 } });
    expect(calls).toHaveLength(2);
    for (const u of calls) {
      expect(u).toMatch(/^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/);
      expect(u).toContain('current=temperature_2m%2Cweather_code%2Cis_day%2Cwind_speed_10m');
    }
    expect(calls.some((u) => u.includes('latitude=52.5200') && u.includes('longitude=13.4050'))).toBe(true);

    // Second visitor: served from the cache, Open-Meteo is not called again.
    await anon().get('/api/life/clock-weather').expect(200);
    expect(calls).toHaveLength(2);
  });

  it('answers 200 without weather when Open-Meteo is down (and does not retry on every request)', async () => {
    let n = 0;
    setWeatherFetch(async () => {
      n++;
      throw new Error('down');
    });
    const res = await anon().get('/api/life/clock-weather').expect(200);
    expect(res.body.cities.map((c: { key: string; weather: unknown }) => [c.key, c.weather])).toEqual([
      ['baku', null],
      ['berlin', null],
    ]);
    await anon().get('/api/life/clock-weather').expect(200);
    expect(n).toBe(2);
  });

  it('treats a malformed upstream answer as no weather', async () => {
    setWeatherFetch(async () => ({ hourly: {} }));
    const res = await anon().get('/api/life/clock-weather').expect(200);
    expect(res.body.cities.every((c: { weather: unknown }) => c.weather === null)).toBe(true);
  });
});

// ─── Globe data: only aggregates of at least 3 workers per city ─────────

const approvedCase = async (city: string, profession: string) => {
  const u = await prisma.user.create({ data: { email: `${uniq('g')}@test.local`, passwordHash: 'x', firstName: 'Secret', lastName: 'Person' } });
  const company = await prisma.company.create({ data: { name: 'Firma GmbH', city } });
  return prisma.case.create({ data: { number: uniq('TV-'), clientId: u.id, profession, status: 'APPROVED', companyId: company.id } });
};

describe('globe data (GET /api/growth/map)', () => {
  beforeEach(() => clearCache());

  it('never contains a city with fewer than 3 workers, nor any personal data', async () => {
    for (let i = 0; i < 3; i++) await approvedCase('Hamburg', 'Lagerist');
    for (let i = 0; i < 2; i++) await approvedCase('Berlin', 'Koch');
    await approvedCase('Köln', 'Elektriker');

    const res = await anon().get('/api/growth/map').expect(200);
    expect(res.body).toMatchObject({ enabled: true, showOnHome: true, minPerCity: 3, total: 3 });
    expect(res.body.cities.map((c: { city: string; workers: number }) => [c.city, c.workers])).toEqual([['Hamburg', 3]]);
    for (const c of res.body.cities) expect(c.workers).toBeGreaterThanOrEqual(3);
    const raw = JSON.stringify(res.body);
    for (const secret of ['Secret', 'Person', '@test.local', 'Firma GmbH', 'TV-']) expect(raw).not.toContain(secret);
  });

  it('follows a stricter admin threshold and the home switch, and cannot go below 3', async () => {
    for (let i = 0; i < 3; i++) await approvedCase('Hamburg', 'Lagerist');
    for (let i = 0; i < 4; i++) await approvedCase('München', 'Pflegefachkraft');
    const admin = await asAdmin();

    await admin.agent.put('/api/admin/growth/map/settings').send({ enabled: true, showOnHome: true, minPerCity: 4 }).expect(200);
    let res = await anon().get('/api/growth/map').expect(200);
    expect(res.body.minPerCity).toBe(4);
    expect(res.body.cities.map((c: { city: string }) => c.city)).toEqual(['München']);

    // A manual entry below the threshold stays hidden too.
    await admin.agent.post('/api/admin/growth/map/entries').send({ city: 'Leipzig', mode: 'OVERRIDE', workers: 2 }).expect(201);
    res = await anon().get('/api/growth/map').expect(200);
    expect(res.body.cities.map((c: { city: string }) => c.city)).toEqual(['München']);

    await admin.agent.put('/api/admin/growth/map/settings').send({ enabled: true, minPerCity: 2 }).expect(400);

    // Home switch off: the globe section reads showOnHome = false and renders nothing.
    await admin.agent.put('/api/admin/growth/map/settings').send({ enabled: true, showOnHome: false, minPerCity: 3 }).expect(200);
    res = await anon().get('/api/growth/map').expect(200);
    expect(res.body.showOnHome).toBe(false);
  });
});
