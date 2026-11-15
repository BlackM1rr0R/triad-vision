import { describe, expect, it } from 'vitest';
import { isKnownRoute, pageStatus, renderHead, resolvePage, SITEMAP_GROUPS, sitemapUrls, type SeoData } from '../../src/lib/seo.js';
import { renderBody } from '../../src/lib/seoBody.js';
import { SEO_LOCALES, STATIC_PAGES, textIn } from '../../src/lib/seoCatalogue.js';
import { programmeTitle, shortProgrammeName, shortUniversity, type StudySeoRow } from '../../src/lib/study/seo.js';
import { parseProgrammesCsv } from '../../src/lib/study/csv.js';

const row = (over: Partial<StudySeoRow> = {}): StudySeoRow => ({
  slug: 'data-engineering-and-analytics-tum',
  name: 'Data Engineering and Analytics, Master of Science (M.Sc.)',
  university: 'Technical University of Munich (TUM)',
  city: 'Garching bei München',
  federalState: 'BY',
  degree: 'MASTER',
  subjectArea: 'data-science',
  teachingLanguage: 'EN',
  languageRequirement: 'IELTS 6.5 / TOEFL iBT 88',
  durationSemesters: 4,
  tuitionPerSemester: 6000,
  semesterContribution: 97,
  deadlines: [
    { intake: 'WINTER', from: '02-01', to: '05-31', note: null },
    { intake: 'SUMMER', from: '10-01', to: '11-30', note: null },
  ],
  applicationRoute: 'VPD',
  officialUrl: 'https://www.tum.de/en/studies/degree-programs/detail/data-engineering-and-analytics-master-of-science-msc',
  description: { az: 'Qısa təsvir', de: 'Kurzbeschreibung', en: 'Short description', ru: 'Описание' },
  requirements: { az: ['Bakalavr'], de: ['Bachelor'], en: ["Bachelor's degree"], ru: ['Бакалавр'] },
  featured: false,
  updatedAt: new Date('2026-11-15T10:00:00Z'),
  ...over,
});

const data = (study: StudySeoRow[]): SeoData => ({ visas: [], services: [], posts: [], faqs: [], jobs: [], settings: {}, rating: null, study });

describe('study SEO', () => {
  const d = data([row(), row({ slug: 'mmm-mannheim', name: 'Mannheim Master in Management (MMM), M.Sc.', university: 'University of Mannheim', city: 'Mannheim', federalState: 'BW', tuitionPerSemester: 1500, subjectArea: 'business' })]);

  it('/study: static page in six languages with an ItemList; known route; in the pages sitemap', () => {
    for (const lng of SEO_LOCALES) {
      const p = resolvePage('/study', lng, d);
      expect(p.index).toBe(true);
      expect(p.title.length).toBeLessThanOrEqual(60);
      expect(p.description.length).toBeGreaterThanOrEqual(120);
      expect(p.description.length).toBeLessThanOrEqual(155);
      const list = p.jsonLd.find((x) => (x as { '@type': string })['@type'] === 'ItemList') as { itemListElement: { url: string }[] };
      expect(list.itemListElement).toHaveLength(2);
      expect(list.itemListElement[0].url).toContain('/study/');
    }
    expect(new Set(SEO_LOCALES.map((l) => textIn(STATIC_PAGES['/study'].description, l))).size).toBe(6);
    expect(sitemapUrls(d, 'pages').some((u) => u.loc.endsWith('/study'))).toBe(true);
  });

  it('/study/:slug: title ≤ 60, description ≤ 155 per language, EducationalOccupationalProgram, breadcrumb, all six hreflang', () => {
    for (const lng of SEO_LOCALES) {
      const p = resolvePage('/study/data-engineering-and-analytics-tum', lng, d);
      expect(p.index).toBe(true);
      expect(p.title.length).toBeLessThanOrEqual(60);
      expect(p.description.length).toBeLessThanOrEqual(155);
      expect(p.description).toContain('TUM');
      expect(p.crumbs.map((c) => c.path)).toEqual(['/', '/study', '/study/data-engineering-and-analytics-tum']);
      expect(p.alternates).toBeUndefined(); // every language
      const ld = p.jsonLd[0] as Record<string, unknown>;
      expect(ld['@type']).toBe('EducationalOccupationalProgram');
      expect(ld).toMatchObject({
        name: 'Data Engineering and Analytics, Master of Science (M.Sc.)',
        timeToComplete: 'P24M',
        provider: { '@type': 'CollegeOrUniversity', name: 'Technical University of Munich (TUM)', address: { addressCountry: 'DE', addressRegion: 'Bayern' } },
        offers: { '@type': 'Offer', price: 6000, priceCurrency: 'EUR' },
      });
      expect(String(ld.applicationDeadline)).toMatch(/^\d{4}-(05-31|11-30)$/);
    }
    // Titles keep the keyword part and the short university name when they fit.
    expect(programmeTitle(row())).toBe('Data Engineering and Analytics — TUM | Triad Vision');
    expect(shortProgrammeName('Information Technology (INFOTECH), M.Sc.')).toBe('Information Technology (INFOTECH)');
    expect(shortProgrammeName('Statistics and Data Science (Master), M.Sc.')).toBe('Statistics and Data Science');
    expect(shortUniversity('RWTH Aachen University')).toBe('RWTH Aachen University');

    const head = renderHead('/de/study/data-engineering-and-analytics-tum', null, d);
    expect(head).toMatch(/<link data-seo rel="canonical" href="https?:\/\/[^"]+\/de\/study\/data-engineering-and-analytics-tum">/);
    for (const l of SEO_LOCALES) expect(head).toContain(`hreflang="${l}"`);
    expect(head).toContain('hreflang="x-default"');
    expect(head).toContain('EducationalOccupationalProgram');
    expect(head).not.toContain('noindex');
  });

  it('status codes, route list and sitemap group', () => {
    expect(isKnownRoute('/study')).toBe(true);
    expect(isKnownRoute('/study/x')).toBe(true);
    expect(pageStatus('/study/data-engineering-and-analytics-tum', d)).toBe(200);
    expect(pageStatus('/ru/study/mmm-mannheim', d)).toBe(200);
    expect(pageStatus('/study/unpublished-or-missing', d)).toBe(404);
    expect(pageStatus('/study/a/b', d)).toBe(404);
    expect(resolvePage('/study/missing', 'en', d).index).toBe(false);
    expect(SITEMAP_GROUPS).toContain('study');
    const urls = sitemapUrls(d, 'study');
    expect(urls).toHaveLength(2 * SEO_LOCALES.length);
    expect(urls[0].alternates.map(([l]) => l)).toEqual([...SEO_LOCALES, 'x-default']);
  });

  it('crawler body: facts, deadlines, nofollow official link, apply link, other programmes; /study list and empty state', () => {
    const body = renderBody('/en/study/data-engineering-and-analytics-tum', d);
    expect(body).toContain('<h1>Data Engineering and Analytics, Master of Science (M.Sc.)</h1>');
    expect(body).toContain('Application deadlines');
    expect(body).toMatch(/Winter semester \d{4}\/\d{2}/);
    expect(body).toContain('rel="nofollow noopener"');
    expect(body).toContain('href="/en/study/data-engineering-and-analytics-tum#apply"');
    expect(body).toContain('href="/en/study/mmm-mannheim"');
    expect(body).toContain('Short description');
    expect(body).toContain("Bachelor&#39;s degree");

    const list = renderBody('/de/study', d);
    expect(list).toContain('href="/de/study/mmm-mannheim"');
    expect(list).toContain('Nächste Frist');
    const empty = renderBody('/study', data([]));
    expect(empty).toContain('Kataloq hazırlanır');
    // Footer links the catalogue.
    expect(empty).toContain('href="/study"');
  });
});

describe('study CSV import parsing', () => {
  const header =
    'slug;name;university;city;federalState;degree;subjectArea;teachingLanguage;languageRequirement;durationSemesters;tuitionPerSemester;semesterContribution;deadlines;applicationRoute;officialUrl;published;featured;description_en;requirements_en';
  it('parses rows (state names, case, yes/no, lists) and reports every bad row', () => {
    const csv = [
      header,
      ';Data Science M.Sc.;RWTH Aachen University;Aachen;Nordrhein-Westfalen;master;Data-Science;en;IELTS 6.5;4;0;;winter:12-01..03-01 non-EU | summer:06-01..09-01;direct;https://www.rwth-aachen.de/x;no;yes;Short;GRE | Bachelor',
      'x-y;Bad;Uni;City;XX;MASTER;engineering;EN;;4;0;;winter:07-15;DIRECT;https://a.de;no;no;;',
      'x-z;Bad date;Uni;City;BY;MASTER;engineering;EN;;4;0;;winter:31.07.;DIRECT;https://a.de;no;no;;',
      'x-y;Dup;Uni;City;BY;MASTER;engineering;EN;;4;0;;;DIRECT;ftp://a.de;no;no;;',
    ].join('\n');
    const r = parseProgrammesCsv(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].input).toMatchObject({
      federalState: 'NW',
      degree: 'MASTER',
      subjectArea: 'data-science',
      teachingLanguage: 'EN',
      durationSemesters: 4,
      tuitionPerSemester: 0,
      semesterContribution: null,
      applicationRoute: 'DIRECT',
      published: false,
      featured: true,
      deadlines: [
        { intake: 'WINTER', from: '12-01', to: '03-01', note: 'non-EU' },
        { intake: 'SUMMER', from: '06-01', to: '09-01', note: null },
      ],
    });
    expect(r.rows[0].input.requirements?.en).toEqual(['GRE', 'Bachelor']);
    expect(r.errors.map((e) => e.row)).toEqual([3, 4, 5]);
    expect(r.errors[1].error).toMatch(/^DEADLINE/);
  });

  it('missing columns', () => {
    expect(parseProgrammesCsv('name,city\nA,B').errors[0].error).toMatch(/^MISSING_COLUMNS/);
  });
});
