import { describe, expect, it } from 'vitest';
import { citySlug, findJobLanding, jobLandings, jobLandingTexts, jobProfession, landingOfJob, parseJobLandingPath, relatedLandings } from '../../src/lib/jobLandings.js';
import { isKnownRoute, pageStatus, renderHead, renderSitemapGroup, resolvePage, type SeoData } from '../../src/lib/seo.js';
import { renderBody } from '../../src/lib/seoBody.js';
import { SEO_LOCALES } from '../../src/lib/seoCatalogue.js';

const ORIGIN = 'http://localhost:5173';

const job = (over: Partial<SeoData['jobs'][number]> = {}): SeoData['jobs'][number] => ({
  slug: 'lkw-hamburg-1',
  title: { de: 'LKW-Fahrer CE (m/w/d)', en: 'Truck driver CE', az: 'Yük maşını sürücüsü' },
  description: { de: 'Touren im Nahverkehr.', en: 'Regional tours.' },
  requirements: null,
  benefits: null,
  city: 'Hamburg',
  employmentType: 'FULL_TIME',
  salaryMin: 2800,
  salaryMax: 3400,
  positions: 2,
  showCompany: false,
  publishedAt: new Date('2026-10-01T00:00:00Z'),
  closesAt: new Date(Date.now() + 86_400_000),
  createdAt: new Date('2026-09-30T00:00:00Z'),
  updatedAt: new Date('2026-10-02T00:00:00Z'),
  company: null,
  profession: 'LKW-Fahrer',
  ...over,
});

const data = (jobs: SeoData['jobs']): SeoData => ({ visas: [], services: [], posts: [], faqs: [], jobs, settings: {}, rating: null });

const JOBS = [
  job(),
  job({ slug: 'lkw-hamburg-2', city: 'Hamburg (Billbrook)', salaryMin: 3000, salaryMax: 3600, publishedAt: new Date('2026-10-05T00:00:00Z'), employmentType: 'SEASONAL' }),
  job({ slug: 'koch-hamburg', profession: null, title: { de: 'Koch / Köchin', en: 'Cook' }, salaryMin: null, salaryMax: null }),
  job({ slug: 'lkw-muenchen', city: 'München' }),
  job({ slug: 'unknown-job', profession: 'Astronaut', title: { en: 'Astronaut' } }),
  job({ slug: 'no-city', city: null }),
  job({ slug: 'closed-lkw-bremen', city: 'Bremen', closesAt: new Date(Date.now() - 1000) }),
];

describe('profession × city landing pages: grouping', () => {
  it('slugs cities and recognises professions from the profession field or the title', () => {
    expect(citySlug('Frankfurt am Main')).toBe('frankfurt-am-main');
    expect(citySlug('München')).toBe('muenchen');
    expect(citySlug('Hamburg (Billbrook)')).toBe('hamburg');
    expect(citySlug('Düsseldorf, NRW')).toBe('duesseldorf');
    expect(jobProfession({ profession: 'Berufskraftfahrer', title: {} })).toBe('truck_driver');
    expect(jobProfession({ profession: null, title: { de: 'Koch / Köchin' } })).toBe('cook');
    expect(jobProfession({ profession: null, title: { en: 'Astronaut' } })).toBeNull();
    expect(parseJobLandingPath('/jobs/in/hamburg/lkw-fahrer')).toEqual({ citySlug: 'hamburg', professionSlug: 'lkw-fahrer' });
    expect(parseJobLandingPath('/jobs/in/hamburg/astronaut')).toBeNull();
    expect(parseJobLandingPath('/jobs/in/hamburg')).toBeNull();
  });

  it('makes one page per combination with live vacancies only (no empty pages), most vacancies first', () => {
    const live = JOBS.filter((j) => !j.closesAt || j.closesAt.getTime() > Date.now());
    const pages = jobLandings(live);
    expect(pages.map((p) => p.path)).toEqual(['/jobs/in/hamburg/lkw-fahrer', '/jobs/in/hamburg/koch', '/jobs/in/muenchen/lkw-fahrer']);
    const hh = pages[0];
    expect(hh.city).toBe('Hamburg');
    expect(hh.jobs.map((j) => j.slug)).toEqual(['lkw-hamburg-2', 'lkw-hamburg-1']); // newest first
    expect(findJobLanding(live, 'bremen', 'lkw-fahrer')).toBeNull();
    expect(landingOfJob(live, JOBS[0])?.path).toBe('/jobs/in/hamburg/lkw-fahrer');
    expect(landingOfJob(live, JOBS[4])).toBeNull();
    const rel = relatedLandings(pages, hh);
    expect(rel.sameCity.map((p) => p.path)).toEqual(['/jobs/in/hamburg/koch']);
    expect(rel.sameProfession.map((p) => p.path)).toEqual(['/jobs/in/muenchen/lkw-fahrer']);
  });

  it('writes unique, SEO-sized texts in every language from the page facts', () => {
    const pages = jobLandings(JOBS.slice(0, 4));
    const seen = new Set<string>();
    for (const p of pages) {
      for (const lng of SEO_LOCALES) {
        const t = jobLandingTexts(p, lng, 'Bayern');
        const where = `${p.path} ${lng}`;
        expect(t.title.length, where).toBeLessThanOrEqual(60);
        expect(t.description.length, where).toBeGreaterThan(50);
        expect(t.description.length, where).toBeLessThanOrEqual(155);
        expect(t.h1, where).toContain(t.cityName);
        expect(t.intro.length, where).toBe(2);
        for (const x of [t.title, t.description, t.h1]) {
          expect(seen.has(x), `${where}: ${x}`).toBe(false);
          seen.add(x);
        }
      }
    }
    const de = jobLandingTexts(pages[0], 'de', null);
    expect(de.h1).toBe('LKW-Fahrer/in Jobs in Hamburg');
    expect(de.description).toContain('2 offene Stellen');
    expect(de.description).toContain('2.800–3.600 €');
    expect(jobLandingTexts(pages[0], 'ru', null).h1).toBe('Водитель грузовика: работа в городе Гамбург');
    expect(jobLandingTexts(pages[2], 'en', null).h1).toBe('Truck driver jobs in Munich, Germany');
    expect(jobLandingTexts(pages[0], 'uk', null).intro[0]).toContain('2 відкриті вакансії');
  });
});

describe('profession × city landing pages: SEO output', () => {
  const d = data(JOBS);

  it('answers 200 for live combinations and 404 otherwise', () => {
    expect(isKnownRoute('/jobs/in/hamburg/lkw-fahrer')).toBe(true);
    expect(pageStatus('/jobs/in/hamburg/lkw-fahrer', d)).toBe(200);
    expect(pageStatus('/de/jobs/in/muenchen/lkw-fahrer', d)).toBe(200);
    expect(pageStatus('/jobs/in/bremen/lkw-fahrer', d)).toBe(404); // only a closed vacancy
    expect(pageStatus('/jobs/in/hamburg/pflegekraft', d)).toBe(404); // no vacancy
    expect(pageStatus('/jobs/in/hamburg/astronaut', d)).toBe(404); // unknown profession
    expect(pageStatus('/jobs/in/hamburg', d)).toBe(404);
  });

  it('renders indexable head tags with hreflang in all languages and an ItemList of the vacancies', () => {
    const page = resolvePage('/jobs/in/hamburg/lkw-fahrer', 'de', d);
    expect(page.index).toBe(true);
    expect(page.title).toContain('LKW-Fahrer/in Jobs in Hamburg');
    expect(page.crumbs.map((c) => c.path)).toEqual(['/', '/jobs', '/jobs/in/hamburg/lkw-fahrer']);
    const list = page.jsonLd[0] as { '@type': string; itemListElement: { url: string }[] };
    expect(list['@type']).toBe('ItemList');
    expect(list.itemListElement.map((i) => i.url)).toEqual([`${ORIGIN}/de/jobs/lkw-hamburg-2`, `${ORIGIN}/de/jobs/lkw-hamburg-1`]);
    const head = renderHead('/de/jobs/in/hamburg/lkw-fahrer', null, d);
    expect(head).toContain(`rel="canonical" href="${ORIGIN}/de/jobs/in/hamburg/lkw-fahrer"`);
    for (const l of SEO_LOCALES) expect(head).toContain(`hreflang="${l}"`);
    expect(head).toContain('hreflang="x-default"');
    expect(head).not.toContain('noindex');
    expect(resolvePage('/jobs/in/hamburg/pflegekraft', 'de', d).index).toBe(false);
  });

  it('lists the pages in the jobs sitemap (every language) and links them from the crawler HTML', () => {
    const xml = renderSitemapGroup(d, 'jobs');
    expect(xml).toContain(`<loc>${ORIGIN}/jobs/in/hamburg/lkw-fahrer</loc>`);
    expect(xml).toContain(`<loc>${ORIGIN}/uk/jobs/in/muenchen/lkw-fahrer</loc>`);
    expect(xml).not.toContain('/jobs/in/bremen/');

    const body = renderBody('/de/jobs/in/hamburg/lkw-fahrer', d);
    expect(body).toContain('<h1>LKW-Fahrer/in Jobs in Hamburg</h1>');
    expect(body).toContain('href="/de/jobs/lkw-hamburg-1"');
    expect(body).toContain('href="/de/jobs/in/hamburg/koch"'); // other professions in the city
    expect(body).toContain('href="/de/jobs/in/muenchen/lkw-fahrer"'); // same profession elsewhere

    // The vacancy page and the board link to the landing page.
    expect(renderBody('/de/jobs/lkw-hamburg-1', d)).toContain('href="/de/jobs/in/hamburg/lkw-fahrer"');
    expect(renderBody('/jobs', d)).toContain('href="/jobs/in/muenchen/lkw-fahrer"');
    expect(renderBody('/jobs/in/hamburg/pflegekraft', d)).toBe('');
  });
});
