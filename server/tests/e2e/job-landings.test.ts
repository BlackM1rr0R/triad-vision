import { afterEach, describe, expect, it } from 'vitest';
import { anon } from '../helpers/api';
import { clearCache } from '../../src/lib/cache.js';
import { cleanJobs, createVacancy } from './vacancies.fixtures';

afterEach(cleanJobs);

describe('profession × city landing pages (/jobs/in/:city/:profession)', () => {
  it('serves the page data, links it from the vacancy, lists it in the sitemap and 404s empty combinations', async () => {
    const a = await createVacancy({ city: 'Hamburg', publishedAt: new Date(Date.now() - 60_000) });
    await createVacancy({ city: 'Hamburg', salaryMin: 3000, salaryMax: 3600, publishedAt: new Date(Date.now() - 30_000) });
    await createVacancy({ city: 'Hamburg', profession: 'Koch', title: { de: 'Koch', en: 'Cook' }, publishedAt: new Date(Date.now() - 60_000) });
    await createVacancy({ city: 'Bremen', status: 'CLOSED', publishedAt: new Date(Date.now() - 60_000) });
    clearCache();

    const res = await anon().get('/api/vacancies/landing/hamburg/lkw-fahrer').query({ lng: 'de' });
    expect(res.status).toBe(200);
    expect(res.body.landing).toMatchObject({ path: '/jobs/in/hamburg/lkw-fahrer', h1: 'LKW-Fahrer/in Jobs in Hamburg', cityName: 'Hamburg' });
    expect(res.body.landing.description).toContain('2.800–3.600 €');
    expect(res.body.items).toHaveLength(2);
    expect(res.body.related.sameCity).toEqual([{ path: '/jobs/in/hamburg/koch', label: expect.stringContaining('Hamburg') }]);
    expect((await anon().get('/api/vacancies/landing/hamburg/lkw-fahrer').query({ lng: 'ru' })).body.landing.h1).toBe('Водитель грузовика: работа в городе Гамбург');

    expect((await anon().get('/api/vacancies/landing/bremen/lkw-fahrer')).status).toBe(404);
    expect((await anon().get('/api/vacancies/landing/hamburg/pflegekraft')).status).toBe(404);

    const detail = await anon().get(`/api/vacancies/${a.slug}`);
    expect(detail.body.vacancy.landing).toMatchObject({ path: '/jobs/in/hamburg/lkw-fahrer', label: { de: 'LKW-Fahrer/in Jobs in Hamburg (2)' } });

    expect((await anon().get('/__seo/status').query({ path: '/de/jobs/in/hamburg/lkw-fahrer' })).text).toBe('');
    expect((await anon().get('/__seo/status').query({ path: '/jobs/in/bremen/lkw-fahrer' })).text).toBe('404');
    const sitemap = (await anon().get('/sitemaps/jobs.xml')).text;
    expect(sitemap).toContain('/jobs/in/hamburg/lkw-fahrer</loc>');
    expect(sitemap).toContain('/tr/jobs/in/hamburg/koch</loc>');
    expect(sitemap).not.toContain('/jobs/in/bremen/');
  });
});
