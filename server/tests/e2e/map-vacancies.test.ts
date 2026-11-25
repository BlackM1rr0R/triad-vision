import { beforeEach, describe, expect, it } from 'vitest';
import { anon } from '../helpers/api';
import { clearCache } from '../../src/lib/cache.js';
import { setWeatherFetch } from '../../src/lib/clientPlus/weather.js';
import { cleanJobs, createCompany, createVacancy } from './vacancies.fixtures';

beforeEach(async () => {
  await cleanJobs();
  clearCache();
});

describe('GET /api/growth/map/vacancies (public map layer)', () => {
  it('counts open vacancies with free places per city, with salary range and without employer data', async () => {
    const company = await createCompany({ name: 'Geheim GmbH' });
    await createVacancy({ city: 'Hamburg', status: 'OPEN', publishedAt: new Date(), positions: 2, salaryMin: 2800, salaryMax: 3200, companyId: company.id });
    await createVacancy({ city: 'Hamburg', status: 'OPEN', publishedAt: new Date(), positions: 1, salaryMin: 3000, salaryMax: 3600, companyId: company.id });
    await createVacancy({ city: 'Bonn', status: 'OPEN', publishedAt: new Date(), positions: 1, filledAdjustment: 1 }); // full
    await createVacancy({ city: 'Köln', status: 'CLOSED', publishedAt: new Date() }); // deactivated
    await createVacancy({ city: 'Essen', status: 'DRAFT' });

    const res = await anon().get('/api/growth/map/vacancies');
    expect(res.status).toBe(200);
    expect(res.body.cities).toEqual([{ city: 'Hamburg', count: 2, salaryMin: 2800, salaryMax: 3600 }]);
    expect(res.body.total).toBe(2);
    expect(JSON.stringify(res.body)).not.toContain('Geheim');
  });
});

describe('GET /api/life/city-profile', () => {
  it('returns weather and an approximate flight time for a known city, null for an unknown one', async () => {
    setWeatherFetch(async (url) => {
      if (url.includes('geocoding')) return url.includes('Berlin') ? { results: [{ name: 'Berlin', latitude: 52.52, longitude: 13.405, country_code: 'DE' }] } : {};
      return { current: { temperature_2m: 11.4, weather_code: 3, is_day: 1, wind_speed_10m: 9 } };
    });
    try {
      const ok = await anon().get('/api/life/city-profile').query({ city: 'Berlin' });
      expect(ok.status).toBe(200);
      expect(ok.body.profile.city).toBe('Berlin');
      expect(ok.body.profile.weather.temp).toBe(11);
      expect(ok.body.profile.flight.minutes).toBeGreaterThan(200);
      const none = await anon().get('/api/life/city-profile').query({ city: 'Nirgendwo' });
      expect(none.body.profile).toBeNull();
    } finally {
      setWeatherFetch(null);
    }
  });
});
