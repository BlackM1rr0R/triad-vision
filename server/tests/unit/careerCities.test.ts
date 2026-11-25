import { describe, expect, it } from 'vitest';
import { DEFAULT_CITY_COSTS, type CityCostData } from '../../src/lib/budget/cities.js';
import { CITY_ROWS, cityRowsOf } from '../../src/lib/careerPages/cities.js';
import { cityPage, cityPages, hubContent } from '../../src/lib/careerPages/index.js';
import { pageStatus, renderHead, sitemapUrls, type SeoData } from '../../src/lib/seo.js';
import { renderBody } from '../../src/lib/seoBody.js';

/**
 * City pages (lib/careerPages/cities.ts) take their figures from the active CityCost rows of the database
 * (SeoData.cities: the rows the budget calculator reads) and fall back to the seed defaults while there are none.
 */

const data = (jobs: SeoData['jobs'] = [], cities?: CityCostData[]): SeoData => ({ visas: [], services: [], posts: [], faqs: [], jobs, settings: {}, rating: null, ...(cities ? { cities } : {}) });
const job = (over: Partial<SeoData['jobs'][number]> = {}): SeoData['jobs'][number] => ({
  slug: 'koch-kitzingen',
  title: { de: 'Koch (m/w/d)', az: 'Aşpaz' },
  description: { de: 'Kurz' },
  requirements: null,
  benefits: null,
  city: 'Kitzingen',
  employmentType: 'FULL_TIME',
  salaryMin: 2600,
  salaryMax: 3000,
  positions: 1,
  showCompany: false,
  publishedAt: new Date('2026-10-01T00:00:00Z'),
  closesAt: new Date(Date.now() + 86_400_000),
  createdAt: new Date('2026-09-30T00:00:00Z'),
  updatedAt: new Date('2026-10-02T00:00:00Z'),
  company: { name: 'Hidden GmbH', website: null },
  profession: 'cook',
  ...over,
});
const seed = (slug: string, over: Partial<CityCostData> = {}): CityCostData => ({ ...DEFAULT_CITY_COSTS.find((r) => r.slug === slug)!, ...over });

/** Table rows as an admin left them: Hamburg edited, Berlin as seeded, Würzburg added, Köln and the rest deactivated. */
const ROWS: CityCostData[] = [
  seed('berlin'),
  seed('hamburg', { flat1ColdMin: 610, flat1ColdMax: 790, wgMin: 650, wgMax: 760 }),
  seed('kempten', { slug: 'wuerzburg', name: 'Würzburg', aliases: 'Kitzingen, Ochsenfurt', state: 'BY', sizeClass: 'MEDIUM' }),
  seed('other-large'),
];

describe('city pages: figures from the CityCost rows', () => {
  it('fall back to the seed rows while the table gives none; generic rows never become pages', () => {
    expect(cityRowsOf(undefined)).toBe(CITY_ROWS);
    expect(cityRowsOf([])).toBe(CITY_ROWS);
    expect(cityRowsOf(ROWS).map((r) => r.slug)).toEqual(['berlin', 'hamburg', 'wuerzburg']);
    expect(cityPage('hamburg', 'az', [], () => '')!.costs.flat1).toEqual([seed('hamburg').flat1ColdMin, seed('hamburg').flat1ColdMax]);
  });

  it('show the edited figures as estimates, drop cities without an active row and add new ones', () => {
    const rows = cityRowsOf(ROWS);
    const hamburg = cityPage('hamburg', 'az', [job()], () => 'Aşpaz', rows)!;
    expect(hamburg.costs.flat1).toEqual([610, 790]);
    expect(hamburg.costs.wg).toEqual([650, 760]);
    expect(hamburg.texts.labels.estimate).toBe('Təxmini');
    expect(hamburg.texts.description).toContain('610–790 €');
    expect(hamburg.others.map((o) => o.slug)).toEqual(['berlin', 'wuerzburg']);
    expect(cityPage('koeln', 'az', [job()], () => '', rows)).toBeNull();
    const wuerzburg = cityPage('wuerzburg', 'de', [job()], () => 'Koch', rows)!;
    expect(wuerzburg).toMatchObject({ name: 'Würzburg', state: 'Bayern', total: 1 });
    expect(cityPages([job()], rows).map((c) => c.row.slug)).toEqual(['berlin', 'hamburg', 'wuerzburg']);
    expect(hubContent('cook', 'ru', [job()], rows)!.cities.map((c) => c.slug)).toEqual(['wuerzburg']);
  });

  it('SEO status, head, crawler body and sitemap follow SeoData.cities', () => {
    const d = data([job()], ROWS);
    expect(pageStatus('/cities/wuerzburg', d)).toBe(200);
    expect(pageStatus('/cities/koeln', d)).toBe(404);
    expect(pageStatus('/cities/koeln', data([job()]))).toBe(200); // seed rows: Köln is a metropolis
    expect(pageStatus('/cities/wuerzburg', data([job()]))).toBe(404); // not a seed city
    expect(renderHead('/de/cities/hamburg', null, d)).toContain('610–790');
    expect(renderBody('/cities/hamburg', d)).toContain('610–790 €');
    const locs = sitemapUrls(d, 'pages').map((u) => u.loc);
    expect(locs.some((u) => u.endsWith('/ru/cities/wuerzburg'))).toBe(true);
    expect(locs.some((u) => u.endsWith('/cities/koeln'))).toBe(false);
  });
});
