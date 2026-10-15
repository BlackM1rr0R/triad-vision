import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  isPrivatePath,
  jobPostingLd,
  normalizePath,
  organizationLd,
  pageUrl,
  parseLocale,
  pick,
  renderHead,
  renderRobots,
  renderSitemap,
  safeJsonLd,
  truncate,
  type SeoData,
} from '../../src/lib/seo.js';
import { GENERIC_META, SEO_LOCALES, SITE_NAME, SITEMAP_STATIC, STATIC_PAGES } from '../../src/lib/seoCatalogue.js';

const ORIGIN = 'http://localhost:5173';
const l10n = (base: string) => ({ az: `${base} az`, de: `${base} de`, en: `${base} en`, ru: `${base} ru` });

const emptyData = (over: Partial<SeoData> = {}): SeoData => ({
  visas: [],
  services: [],
  posts: [],
  faqs: [],
  jobs: [],
  settings: {},
  rating: null,
  ...over,
});

const job = (over: Partial<SeoData['jobs'][number]> = {}): SeoData['jobs'][number] => ({
  slug: 'lkw-hamburg',
  title: l10n('Driver'),
  description: l10n('Line one\n\nLine two'),
  requirements: { de: ['CE'] },
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
  company: { name: 'Hidden GmbH', website: 'https://hidden.example' },
  ...over,
});

/** All JSON-LD blocks of a head fragment, parsed. */
const ldBlocks = (html: string) =>
  [...html.matchAll(/<script data-seo type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

describe('SEO catalogue', () => {
  it('has titles ≤ 60 and descriptions ≤ 155 characters in every language', () => {
    for (const [path, page] of Object.entries(STATIC_PAGES)) {
      for (const l of SEO_LOCALES) {
        const title = page.fullTitle ? page.title[l] : `${page.title[l]} | ${SITE_NAME}`;
        expect(title.length, `${path} ${l} title`).toBeLessThanOrEqual(60);
        expect(page.description[l].length, `${path} ${l} description`).toBeLessThanOrEqual(155);
        expect(page.description[l].length, `${path} ${l} description`).toBeGreaterThan(30);
        expect(page.name[l]).toBeTruthy();
      }
    }
    for (const l of SEO_LOCALES) expect(GENERIC_META.title[l].length).toBeLessThanOrEqual(60);
  });

  it('lists every public static route in the sitemap', () => {
    expect(SITEMAP_STATIC).toEqual(
      expect.arrayContaining([
        '/', '/about', '/services', '/visas', '/partners', '/stories', '/ausbildung', '/eligibility', '/faq', '/news',
        '/contact', '/cooperation', '/jobs', '/booking', '/impressum', '/privacy', '/accessibility',
      ]),
    );
    expect(SITEMAP_STATIC).not.toContain('/login');
  });
});

describe('helpers', () => {
  it('escapes HTML', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('serialises JSON-LD that cannot break out of its script block and still parses', () => {
    const data = { name: '</script><script>alert(1)</script><!--tv:x:tv--> {{ .Req }} & \u2028', n: { a: [1] } };
    const out = safeJsonLd(data);
    expect(out).not.toMatch(/<|>|&|\{\{/);
    expect(out).not.toContain(String.fromCharCode(0x2028));
    expect(out.startsWith('{"name"')).toBe(true);
    expect(JSON.parse(out)).toEqual(data);
  });

  it('truncates on a word boundary', () => {
    expect(truncate('short text', 20)).toBe('short text');
    const t = truncate('one two three four five six seven eight nine ten', 20);
    expect(t.length).toBeLessThanOrEqual(20);
    expect(t).toBe('one two three four…');
    expect(truncate('  many   spaces\n\nhere ', 50)).toBe('many spaces here');
  });

  it('normalises paths and locales', () => {
    expect(normalizePath('/visas/lkw/')).toBe('/visas/lkw');
    expect(normalizePath('//visas//x?y=1#z')).toBe('/visas/x');
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('http://evil')).toBe('/');
    expect(normalizePath(undefined)).toBe('/');
    expect(normalizePath(['/a'])).toBe('/');
    expect(normalizePath('/%E2%82%AC')).toBe('/€');
    expect(normalizePath('/%E0%A4%A')).toBe('/%E0%A4%A');
    expect(parseLocale('de')).toBe('de');
    expect(parseLocale('fr')).toBeNull();
    expect(parseLocale(['de'])).toBeNull();
  });

  it('builds language URLs (bare URL = x-default)', () => {
    expect(pageUrl('/', null)).toBe(`${ORIGIN}/`);
    expect(pageUrl('/faq', 'de')).toBe(`${ORIGIN}/faq?lng=de`);
    expect(pageUrl('/news/ü', null)).toBe(`${ORIGIN}/news/%C3%BC`);
  });

  it('picks a language with fallbacks', () => {
    expect(pick({ az: 'A', de: 'D' }, 'de')).toBe('D');
    expect(pick({ az: 'A', de: '' }, 'de')).toBe('A');
    expect(pick({ ru: 'R' }, 'en')).toBe('R');
    expect(pick(null, 'en')).toBe('');
    expect(pick('plain', 'en')).toBe('plain');
  });

  it('recognises private areas on segment boundaries', () => {
    for (const p of ['/admin', '/admin/cases', '/account/profile', '/company/vacancies', '/booking/manage', '/review', '/login/2fa', '/reset-password', '/verify-email']) {
      expect(isPrivatePath(p), p).toBe(true);
    }
    for (const p of ['/', '/booking', '/login', '/companyx', '/jobs', '/reviews-info']) expect(isPrivatePath(p), p).toBe(false);
  });
});

describe('renderHead', () => {
  it('describes the bare URL in az with a self canonical and full hreflang set', () => {
    const html = renderHead('/faq', null, emptyData());
    expect(html).toContain(`<title data-seo>${STATIC_PAGES['/faq'].title.az} | Triad Vision</title>`);
    expect(html).toContain(`<link data-seo rel="canonical" href="${ORIGIN}/faq">`);
    for (const l of SEO_LOCALES) expect(html).toContain(`hreflang="${l}" href="${ORIGIN}/faq?lng=${l}"`);
    expect(html).toContain(`hreflang="x-default" href="${ORIGIN}/faq"`);
    expect(html).toContain('content="az_AZ"');
    expect(html).toContain('name="robots" content="index, follow');
    expect(html.match(/<title/g)).toHaveLength(1);
  });

  it('uses the requested language for text, canonical, og:url and breadcrumbs', () => {
    const html = renderHead('/about/', 'ru', emptyData());
    expect(html).toContain(`<title data-seo>${STATIC_PAGES['/about'].title.ru} | Triad Vision</title>`);
    expect(html).toContain(`rel="canonical" href="${ORIGIN}/about?lng=ru"`);
    expect(html).toContain(`property="og:url" content="${ORIGIN}/about?lng=ru"`);
    expect(html).toContain('property="og:locale" content="ru_RU"');
    const crumbs = ldBlocks(html).find((b) => b['@type'] === 'BreadcrumbList');
    expect(crumbs.itemListElement.map((i: { item: string }) => i.item)).toEqual([`${ORIGIN}/?lng=ru`, `${ORIGIN}/about?lng=ru`]);
  });

  it('adds WebSite on the home page and the Organization everywhere', () => {
    const types = ldBlocks(renderHead('/', 'en', emptyData())).map((b) => b['@type']);
    expect(types).toEqual(['Organization', 'WebSite']);
  });

  it('marks private and unknown paths noindex without canonical or hreflang', () => {
    for (const p of ['/admin/cases', '/account', '/does-not-exist', '/visas/missing']) {
      const html = renderHead(p, 'de', emptyData());
      expect(html, p).toContain('content="noindex, nofollow"');
      expect(html, p).not.toContain('rel="canonical"');
      expect(html, p).not.toContain('hreflang');
      expect(ldBlocks(html).map((b) => b['@type']), p).toEqual(['Organization']);
    }
  });

  it('escapes database text in tags', () => {
    const data = emptyData({
      visas: [{ slug: 'x', title: { az: '<b>"Visa"</b>' }, summary: { az: `It's <script>` }, image: 'data:image/png;base64,AA', updatedAt: new Date() }],
    });
    const html = renderHead('/visas/x', null, data);
    expect(html).toContain('&lt;b&gt;&quot;Visa&quot;&lt;/b&gt; | Triad Vision');
    expect(html).toContain('content="It&#39;s &lt;script&gt;"');
    expect(html).not.toContain('<b>');
    // data: URIs are not usable as og:image; the default image is used instead.
    expect(html).toContain(`property="og:image" content="${ORIGIN}/og-default.png"`);
  });

  it('keeps generated titles within 60 characters', () => {
    const long = 'A very long visa title that goes on and on and on and on and on and on';
    const data = emptyData({ visas: [{ slug: 'x', title: { az: long }, summary: { az: long.repeat(5) }, image: '/uploads/public/v.jpg', updatedAt: new Date() }] });
    const html = renderHead('/visas/x', null, data);
    const title = /<title data-seo>([^<]*)<\/title>/.exec(html)![1];
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith('… | Triad Vision')).toBe(true);
    const desc = /name="description" content="([^"]*)"/.exec(html)![1];
    expect(desc.length).toBeLessThanOrEqual(155);
    expect(html).toContain(`property="og:image" content="${ORIGIN}/uploads/public/v.jpg"`);
  });
});

describe('JSON-LD builders', () => {
  it('builds a JobPosting with Triad Vision as hiring organisation when the company is hidden', () => {
    const ld = jobPostingLd(job(), 'de', `${ORIGIN}/jobs/lkw-hamburg?lng=de`);
    expect(ld).toMatchObject({
      '@type': 'JobPosting',
      title: 'Driver de',
      datePosted: '2026-10-01T00:00:00.000Z',
      employmentType: 'FULL_TIME',
      hiringOrganization: { '@type': 'Organization', name: 'Triad Vision' },
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Hamburg', addressCountry: 'DE' } },
      baseSalary: { '@type': 'MonetaryAmount', currency: 'EUR', value: { minValue: 2800, maxValue: 3400, unitText: 'MONTH' } },
      directApply: true,
    });
    expect(ld.description).toBe('<p>Line one</p><p>Line two de</p><p><strong>Anforderungen</strong></p><ul><li>CE</li></ul>');
    expect(JSON.stringify(ld)).not.toContain('Hidden GmbH');
    expect(ld.validThrough).toBeDefined();
  });

  it('names the employer when showCompany is set and maps employment types and salaries', () => {
    const shown = jobPostingLd(job({ showCompany: true, employmentType: 'SEASONAL', salaryMax: null, closesAt: null }), 'en', 'u');
    expect(shown.hiringOrganization).toEqual({ '@type': 'Organization', name: 'Hidden GmbH', sameAs: 'https://hidden.example' });
    expect(shown.employmentType).toBe('TEMPORARY');
    expect(shown.baseSalary).toMatchObject({ value: { value: 2800, unitText: 'MONTH' } });
    expect(shown.validThrough).toBeUndefined();
    expect(jobPostingLd(job({ employmentType: 'AUSBILDUNG' }), 'en', 'u').employmentType).toEqual(['FULL_TIME', 'OTHER']);
    expect(jobPostingLd(job({ salaryMin: null, salaryMax: null }), 'en', 'u').baseSalary).toBeUndefined();
    const desc = jobPostingLd(job({ description: { en: '<img src=x onerror=alert(1)>' }, requirements: null }), 'en', 'u').description;
    expect(desc).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  });

  it('builds the Organization from settings and adds AggregateRating only with enough reviews', () => {
    const settings = {
      contact: { phone: '+49 1', email: 'info@x.de', offices: [{ city: { en: 'Berlin', de: 'Berlin' }, address: 'Str. 1' }] },
      social: { instagram: 'https://instagram.com/x', bad: 'javascript:alert(1)', empty: '' },
      legal: { companyName: 'Triad Vision GmbH' },
    };
    const org = organizationLd(emptyData({ settings }), 'de');
    expect(org).toMatchObject({
      '@type': 'Organization',
      legalName: 'Triad Vision GmbH',
      telephone: '+49 1',
      contactPoint: [{ '@type': 'ContactPoint', telephone: '+49 1', email: 'info@x.de' }],
      address: [{ streetAddress: 'Str. 1', addressLocality: 'Berlin' }],
      sameAs: ['https://instagram.com/x'],
    });
    expect(org.aggregateRating).toBeUndefined();
    const rated = organizationLd(emptyData({ rating: { count: 3, average: 4.7 } }), 'az');
    expect(rated.aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: 4.7, reviewCount: 3, bestRating: 5, worstRating: 1 });
  });
});

describe('robots.txt and sitemap.xml', () => {
  it('disallows private areas and points to the sitemap', () => {
    const txt = renderRobots();
    for (const d of ['/admin', '/account', '/company', '/api/', '/booking/manage', '/review', '/verify-email', '/login/2fa', '/reset-password']) {
      expect(txt).toContain(`Disallow: ${d}\n`);
    }
    expect(txt).toContain('User-agent: *\nAllow: /\n');
    expect(txt).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });

  it('lists one <url> per language with hreflang alternates and escapes XML', () => {
    const xml = renderSitemap(emptyData({ posts: [{ slug: 'a&b', title: {}, excerpt: {}, cover: '', publishedAt: new Date(), updatedAt: new Date('2026-10-01T00:00:00Z') }] }));
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml.match(/<url>/g)).toHaveLength((SITEMAP_STATIC.length + 1) * 5);
    expect(xml).toContain(`<loc>${ORIGIN}/news/a&amp;b?lng=de</loc>`);
    expect(xml).toContain('<lastmod>2026-10-01T00:00:00.000Z</lastmod>');
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  it('leaves out expired jobs', () => {
    const xml = renderSitemap(emptyData({ jobs: [job({ slug: 'live' }), job({ slug: 'expired', closesAt: new Date(Date.now() - 1000) })] }));
    expect(xml).toContain('/jobs/live</loc>');
    expect(xml).not.toContain('/jobs/expired');
  });
});
