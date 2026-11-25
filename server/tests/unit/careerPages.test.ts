import { describe, expect, it } from 'vitest';
import { PROFESSION_HUB_SLUGS } from '../../src/lib/professionHubs.js';
import { SEO_LOCALES, STATIC_PAGES } from '../../src/lib/seoCatalogue.js';
import { isKnownRoute, pageStatus, renderHead, resolvePage, sitemapUrls, type SeoData } from '../../src/lib/seo.js';
import { renderBody } from '../../src/lib/seoBody.js';
import { CAREER_COPY } from '../../src/lib/careerPages/content/index.js';
import { AUSBILDUNG_SLUGS, CAREER_LOCALES, HUB_FACTS, ausbildungPage, cityPage, cityPages, cityTexts, hubContent } from '../../src/lib/careerPages/index.js';
import { CITY_ROWS } from '../../src/lib/careerPages/cities.js';

const data = (jobs: SeoData['jobs'] = []): SeoData => ({ visas: [], services: [], posts: [], faqs: [], jobs, settings: {}, rating: null });
const job = (over: Partial<SeoData['jobs'][number]> = {}): SeoData['jobs'][number] => ({
  slug: 'koch-bonn',
  title: { de: 'Koch (m/w/d)', az: 'Aşpaz' },
  description: { de: 'Kurz' },
  requirements: null,
  benefits: null,
  city: 'Bonn',
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

/** CMS visa categories seeded in prisma/seed.ts (the hubs link them). */
const SEEDED_VISAS = ['lkw-fahrer', 'kurierfahrer', 'gastronomie-hotel', 'bau-handwerk', 'pflege-gesundheit', 'landwirtschaft', 'industrie-technik', 'ausbildung', 'it-buero'];

describe('career page texts', () => {
  it('cover every hub and Ausbildung occupation in the six career languages', () => {
    for (const l of CAREER_LOCALES) {
      const c = CAREER_COPY[l];
      expect(c.shared.steps, l).toHaveLength(5);
      expect(c.shared.faq.length, l).toBeGreaterThanOrEqual(2);
      for (const h of PROFESSION_HUB_SLUGS) {
        const x = c.hubs[h];
        expect(x.faq.length, `${l} ${h}`).toBeGreaterThanOrEqual(5);
        expect(x.requirements.length, `${l} ${h}`).toBeGreaterThanOrEqual(3);
        expect(x.keywords.length, `${l} ${h}`).toBeGreaterThanOrEqual(5);
        expect(x.visa.length, `${l} ${h}`).toBeGreaterThan(80);
      }
      for (const s of AUSBILDUNG_SLUGS) {
        const a = c.ausbildung[s];
        expect(a.title.length, `${l} ${s} title`).toBeLessThanOrEqual(60);
        expect(a.description.length, `${l} ${s} description`).toBeGreaterThanOrEqual(120);
        expect(a.description.length, `${l} ${s} description`).toBeLessThanOrEqual(155);
        expect(a.faq.length, `${l} ${s}`).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('link existing visa categories and keep the business rules (no translation / apostille / appointment service)', () => {
    for (const f of Object.values(HUB_FACTS)) expect(SEEDED_VISAS).toContain(f.visaSlug);
    for (const l of CAREER_LOCALES) {
      const faq = CAREER_COPY[l].shared.faq.map((f) => f.a).join(' ');
      // The shared answer says we do not translate, apostille or book appointments, and that the embassy decides.
      expect(faq, l).toMatch(/apostil|апостил|Apostille/i);
    }
    // Azerbaijani wording (docs/az-terminology.md): formal "Siz", işəgötürən, yaşayış icazəsi, görüş, məsləhət.
    const az = JSON.stringify(CAREER_COPY.az);
    for (const bad of [/(?<![\p{L}])(sən|sənin|səni|sənə|səndən)(?![\p{L}])/iu, /işverən/i, /(?<![\p{L}])[Iİi]qamə(?![\p{L}]*gah)/u, /randevu/i, /[Kk]onsultasiya/, /dedlayn|deadline/i]) expect(az).not.toMatch(bad);
  });

  it('generates city texts that fit the search snippet', () => {
    for (const l of CAREER_LOCALES)
      for (const r of CITY_ROWS)
        for (const n of [0, 4]) {
          const t = cityTexts(r, n, l);
          expect(t.title.length, `${l} ${r.slug}`).toBeLessThanOrEqual(60);
          expect(t.description.length, `${l} ${r.slug} ${n}`).toBeLessThanOrEqual(155);
          expect(t.description.length, `${l} ${r.slug} ${n}`).toBeGreaterThanOrEqual(115);
        }
  });
});

describe('Ausbildung occupation pages (/ausbildung/:slug)', () => {
  it('resolve with Article + FAQPage, breadcrumbs and hreflang for every career language', () => {
    const head = renderHead('/ru/ausbildung/pflege', null, data());
    expect(head).toContain('rel="canonical" href="');
    expect(head).toMatch(/"@type":"FAQPage"/);
    expect(head).toMatch(/"@type":"BreadcrumbList"/);
    for (const l of CAREER_LOCALES) expect(head).toContain(`hreflang="${l}"`);
    expect(head).toContain('hreflang="uk"');
    const page = resolvePage('/ausbildung/koch', 'az', data());
    expect(page.index).toBe(true);
    expect(page.title.length).toBeLessThanOrEqual(60);
    expect(page.crumbs.map((c) => c.path)).toEqual(['/', '/ausbildung', '/ausbildung/koch']);
  });

  it('answer 404 for an unknown occupation, 200 in every career language', () => {
    expect(pageStatus('/ausbildung/pflege', data())).toBe(200);
    expect(pageStatus('/tr/ausbildung/berufskraftfahrer', data())).toBe(200);
    expect(pageStatus('/uk/ausbildung/pflege', data())).toBe(200);
    expect(pageStatus('/ausbildung/zahnarzt', data())).toBe(404);
    expect(resolvePage('/ausbildung/pflege', 'uk', data()).index).toBe(true);
    expect(isKnownRoute('/ausbildung/x')).toBe(true);
    expect(ausbildungPage('pflege', 'uk')?.title).toBeTruthy();
    expect(ausbildungPage('pflege', 'xx')).toBeNull();
  });

  it('render the content for crawlers (requirements, allowance as an estimate, FAQ, related links)', () => {
    const body = renderBody('/tr/ausbildung/koch', data());
    expect(body).toContain('<h1>');
    expect(body).toContain('href="/tr/for/cook"');
    expect(body).toContain('href="/tr/visas/gastronomie-hotel"');
    expect(body).toContain('href="/tr/booking"');
    expect(renderBody('/ausbildung', data())).toContain('href="/ausbildung/mechatroniker"');
  });
});

describe('city pages (/cities/:slug)', () => {
  it('exist for the metropolises and for cities with live vacancies only', () => {
    expect(pageStatus('/cities/berlin', data())).toBe(200);
    expect(pageStatus('/cities/bonn', data())).toBe(404);
    expect(pageStatus('/cities/bonn', data([job()]))).toBe(200);
    expect(pageStatus('/uk/cities/berlin', data())).toBe(200);
    expect(pageStatus('/cities/atlantis', data())).toBe(404);
    expect(cityPages([job()]).map((c) => c.row.slug)).toEqual(expect.arrayContaining(['berlin', 'hamburg', 'muenchen', 'koeln', 'frankfurt', 'bonn']));
  });

  it('list the live vacancies without the employer and link professions, landings and other cities', () => {
    const page = cityPage('bonn', 'az', [job()], () => 'Aşpaz')!;
    expect(page.total).toBe(1);
    expect(JSON.stringify(page)).not.toContain('Hidden GmbH');
    expect(page.hubs).toContain('cook');
    expect(page.landings[0].path).toBe('/jobs/in/bonn/koch');
    const head = renderHead('/de/cities/bonn', null, data([job()]));
    expect(head).toMatch(/"@type":"ItemList"/);
    expect(head).not.toContain('Hidden GmbH');
    const body = renderBody('/cities/bonn', data([job()]));
    expect(body).toContain('href="/jobs/koch-bonn"');
    expect(body).toContain('href="/for/cook"');
  });
});

describe('profession hubs: SEO blocks', () => {
  it('add requirements, the visa path, FAQ (FAQPage JSON-LD) and related links in the career languages', () => {
    const c = hubContent('cook', 'ru', [job()])!;
    expect(c.visa.path).toBe('/visas/gastronomie-hotel');
    expect(c.ausbildung?.path).toBe('/ausbildung/koch');
    expect(c.cities.map((x) => x.slug)).toContain('bonn');
    expect(c.faq.length).toBeGreaterThanOrEqual(7);
    expect(hubContent('cook', 'uk', [])?.faq.length).toBeGreaterThanOrEqual(7);
    expect(hubContent('cook', 'xx', [])).toBeNull();
    expect(renderHead('/for/courier', null, data())).toMatch(/"@type":"FAQPage"/);
    expect(renderHead('/uk/for/courier', null, data())).toMatch(/"@type":"FAQPage"/);
    expect(renderBody('/tr/for/warehouse', data())).toContain('href="/tr/ausbildung/lagerlogistik"');
    for (const h of PROFESSION_HUB_SLUGS) for (const l of SEO_LOCALES) expect(STATIC_PAGES[`/for/${h}`].title[l], `${h} ${l}`).toBeTruthy();
  });
});

describe('sitemap', () => {
  it('lists the Ausbildung and city pages in the career languages with lastmod and alternates', () => {
    const urls = sitemapUrls(data([job()]), 'pages');
    const locs = urls.map((u) => u.loc);
    expect(locs.some((u) => u.endsWith('/ausbildung/pflege'))).toBe(true);
    expect(locs.some((u) => u.endsWith('/ru/ausbildung/pflege'))).toBe(true);
    expect(locs.some((u) => u.endsWith('/tr/cities/berlin'))).toBe(true);
    expect(locs.some((u) => u.endsWith('/cities/bonn'))).toBe(true);
    expect(locs.some((u) => u.endsWith('/uk/ausbildung/pflege'))).toBe(true);
    expect(locs.some((u) => u.endsWith('/uk/cities/berlin'))).toBe(true);
    const pflege = urls.find((u) => u.loc.endsWith('/de/ausbildung/pflege'))!;
    expect(pflege.alternates.map(([l]) => l).sort()).toEqual([...CAREER_LOCALES, 'x-default'].sort());
    for (const h of PROFESSION_HUB_SLUGS) expect(locs.some((u) => u.endsWith(`/for/${h}`)), h).toBe(true);
  });
});
