import { describe, expect, it } from 'vitest';
import { anon } from '../helpers/api';
import { prisma } from '../helpers/db';
import { uniq } from '../helpers/factories';
import { clearCache } from '../../src/lib/cache.js';

/** Career pages (routes/careerPages.ts, lib/careerPages): hub SEO blocks, Ausbildung occupations, city pages. */

const l10n = (s: string) => ({ az: s, de: s, en: s, ru: s });
const vacancy = (title: string, o: Record<string, unknown> = {}) =>
  prisma.vacancy.create({ data: { slug: uniq('career-'), title: l10n(title), description: l10n('x'), status: 'OPEN', city: 'Bonn', publishedAt: new Date(), ...o } });

describe('GET /api/career', () => {
  it('serves the hub blocks in the career languages (null in uk) with the cities of its live vacancies', async () => {
    await vacancy('Koch (m/w/d)');
    const res = await anon().get('/api/career/hubs/cook?lng=ru').expect(200);
    expect(res.body.visa.path).toBe('/visas/gastronomie-hotel');
    expect(res.body.faq.length).toBeGreaterThanOrEqual(7);
    expect(res.body.cities.map((c: { slug: string }) => c.slug)).toContain('bonn');
    const uk = await anon().get('/api/career/hubs/cook?lng=uk').expect(200);
    expect(uk.body).toBeNull();
    await anon().get('/api/career/hubs/astronaut').expect(404);
  });

  it('serves the Ausbildung occupations (404 for unknown slugs and in uk)', async () => {
    const list = await anon().get('/api/career/ausbildung?lng=tr').expect(200);
    expect(list.body.items.map((i: { slug: string }) => i.slug)).toContain('pflege');
    const page = await anon().get('/api/career/ausbildung/koch?lng=az').expect(200);
    expect(page.body.allowance).toHaveLength(2);
    expect(page.body.hub.path).toBe('/for/cook');
    await anon().get('/api/career/ausbildung/koch?lng=uk').expect(404);
    await anon().get('/api/career/ausbildung/zahnarzt').expect(404);
  });

  it('serves city pages for metropolises and cities with live vacancies, without employer names', async () => {
    await anon().get('/api/career/cities/bonn?lng=de').expect(404);
    const company = await prisma.company.findFirst();
    await vacancy('Koch (m/w/d)', company ? { companyId: company.id } : {});
    clearCache(); // the SEO data (live vacancies) is cached like in production
    const bonn = await anon().get('/api/career/cities/bonn?lng=de').expect(200);
    expect(bonn.body.total).toBe(1);
    if (company) expect(JSON.stringify(bonn.body)).not.toContain(company.name);
    const berlin = await anon().get('/api/career/cities/berlin?lng=en').expect(200);
    expect(berlin.body.total).toBe(0);
    const list = await anon().get('/api/career/cities?lng=az').expect(200);
    expect(list.body.items.map((c: { slug: string }) => c.slug)).toEqual(expect.arrayContaining(['berlin', 'bonn']));
    expect((await anon().get('/__seo/status').query({ path: '/ru/cities/bonn' })).text).not.toBe('404');
    expect((await anon().get('/__seo/status').query({ path: '/uk/ausbildung/pflege' })).text).toBe('404');
  });
});
