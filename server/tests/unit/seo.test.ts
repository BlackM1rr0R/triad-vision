import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  isPrivatePath,
  jobPostingLd,
  localBusinessLd,
  normalizePath,
  organizationLd,
  pageUrl,
  parseLocale,
  parseOpeningHours,
  pick,
  renderHead,
  renderRobots,
  renderRss,
  renderSitemap,
  renderSitemapGroup,
  renderSitemapIndex,
  safeJsonLd,
  splitLocalePath,
  truncate,
  type SeoData,
} from '../../src/lib/seo.js';
import { GENERIC_META, SEO_LOCALES, SITE_NAME, SITEMAP_STATIC, STATIC_PAGES, textIn } from '../../src/lib/seoCatalogue.js';
import { renderBody } from '../../src/lib/seoBody.js';
import type { GuideRow } from '../../src/lib/guides/service.js';

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

const guide = (over: Partial<GuideRow> = {}): GuideRow => ({
  id: `g-${over.locale ?? 'az'}`,
  key: 'chancenkarte',
  locale: 'az',
  slug: 'almaniya-imkan-karti',
  title: 'İmkan Kartı 2026',
  description: 'Almaniya İmkan Kartı haqqında ətraflı bələdçi: şərtlər, xallar və müraciət qaydası.',
  body: '## Şərtlər\n\nMətn [konsultasiya](/booking) və [Mavi Kart](guide:blue-card).\n\n| A | B |\n|---|---|\n| 1 | 2 |',
  faq: [{ q: 'Sual?', a: 'Cavab.' }],
  published: true,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-20T00:00:00Z'),
  ...over,
});

/** All JSON-LD blocks of a head fragment, parsed. */
const ldBlocks = (html: string) =>
  [...html.matchAll(/<script data-seo type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

describe('SEO catalogue', () => {
  it('has titles ≤ 60 and descriptions ≤ 155 characters in every language (tr / uk included)', () => {
    for (const [path, page] of Object.entries(STATIC_PAGES)) {
      for (const l of SEO_LOCALES) {
        const title = page.fullTitle ? textIn(page.title, l) : `${textIn(page.title, l)} | ${SITE_NAME}`;
        expect(title.length, `${path} ${l} title`).toBeLessThanOrEqual(60);
        expect(textIn(page.description, l).length, `${path} ${l} description`).toBeLessThanOrEqual(155);
        expect(textIn(page.description, l).length, `${path} ${l} description`).toBeGreaterThan(30);
        expect(textIn(page.name, l)).toBeTruthy();
      }
    }
    for (const l of SEO_LOCALES) expect(textIn(GENERIC_META.title, l).length).toBeLessThanOrEqual(60);
  });

  it('has hand-written Turkish and Ukrainian texts for the core pages', () => {
    for (const p of ['/', '/visas', '/jobs', '/guides', '/chancenkarte-calculator', '/blue-card-check', '/contact']) {
      expect(STATIC_PAGES[p].title.tr, p).toBeTruthy();
      expect(STATIC_PAGES[p].description.uk, p).toBeTruthy();
    }
  });

  it('lists every public static route in the sitemap', () => {
    expect(SITEMAP_STATIC).toEqual(
      expect.arrayContaining([
        '/', '/about', '/services', '/visas', '/partners', '/stories', '/ausbildung', '/eligibility', '/faq', '/news',
        '/contact', '/cooperation', '/jobs', '/booking', '/impressum', '/privacy', '/accessibility', '/guides',
        '/chancenkarte-calculator', '/blue-card-check',
        '/tools', '/for-workers', '/for-employers',
      ]),
    );
    expect(SITEMAP_STATIC).not.toContain('/login');
  });

  it('has hand-written texts in all six languages for the tools hub and the audience pages', () => {
    for (const p of ['/tools', '/for-workers', '/for-employers']) {
      for (const l of SEO_LOCALES) {
        expect(STATIC_PAGES[p].name[l], `${p} ${l}`).toBeTruthy();
        expect(STATIC_PAGES[p].title[l], `${p} ${l}`).toBeTruthy();
        expect(STATIC_PAGES[p].description[l], `${p} ${l}`).toBeTruthy();
      }
    }
  });
});

describe('helpers', () => {
  it('escapes HTML', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('serialises JSON-LD that cannot break out of its script block and still parses', () => {
    const data = { name: '</script><script>alert(1)</script><!--tv:x:tv--> {{ .Req }} &  ', n: { a: [1] } };
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
    expect(parseLocale('tr')).toBe('tr');
    expect(parseLocale('uk')).toBe('uk');
    expect(parseLocale('fr')).toBeNull();
    expect(parseLocale(['de'])).toBeNull();
  });

  it('splits the language prefix off a path (az has none)', () => {
    expect(splitLocalePath('/de/visas/x')).toEqual({ lng: 'de', path: '/visas/x' });
    expect(splitLocalePath('/tr')).toEqual({ lng: 'tr', path: '/' });
    expect(splitLocalePath('/uk/')).toEqual({ lng: 'uk', path: '/' });
    expect(splitLocalePath('/visas')).toEqual({ lng: null, path: '/visas' });
    expect(splitLocalePath('/az/visas')).toEqual({ lng: null, path: '/az/visas' });
    expect(splitLocalePath('/deutsch')).toEqual({ lng: null, path: '/deutsch' });
  });

  it('builds language URLs with path prefixes (root = az = x-default)', () => {
    expect(pageUrl('/', null)).toBe(`${ORIGIN}/`);
    expect(pageUrl('/', 'az')).toBe(`${ORIGIN}/`);
    expect(pageUrl('/', 'de')).toBe(`${ORIGIN}/de`);
    expect(pageUrl('/faq', 'de')).toBe(`${ORIGIN}/de/faq`);
    expect(pageUrl('/faq', 'uk')).toBe(`${ORIGIN}/uk/faq`);
    expect(pageUrl('/news/ü', null)).toBe(`${ORIGIN}/news/%C3%BC`);
  });

  it('picks a language with fallbacks (tr / uk read English)', () => {
    expect(pick({ az: 'A', de: 'D' }, 'de')).toBe('D');
    expect(pick({ az: 'A', de: '' }, 'de')).toBe('A');
    expect(pick({ ru: 'R' }, 'en')).toBe('R');
    expect(pick({ az: 'A', en: 'E' }, 'tr')).toBe('E');
    expect(pick({ az: 'A', en: '' }, 'uk')).toBe('A');
    expect(pick(null, 'en')).toBe('');
    expect(pick('plain', 'en')).toBe('plain');
  });

  it('recognises private areas on segment boundaries', () => {
    for (const p of ['/admin', '/admin/cases', '/account/profile', '/company/vacancies', '/booking/manage', '/review', '/login/2fa', '/reset-password', '/verify-email', '/agent/x', '/partner']) {
      expect(isPrivatePath(p), p).toBe(true);
    }
    for (const p of ['/', '/booking', '/login', '/companyx', '/jobs', '/reviews-info', '/guides']) expect(isPrivatePath(p), p).toBe(false);
  });

  it('parses opening hours from the English contact text', () => {
    expect(parseOpeningHours('Mon – Fri, 09:00 – 18:00')).toEqual({ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '18:00' });
    expect(parseOpeningHours('by appointment')).toBeNull();
  });
});

describe('renderHead', () => {
  it('describes the root URL in az with a self canonical and the full hreflang set (6 languages + x-default)', () => {
    const html = renderHead('/faq', null, emptyData());
    expect(html).toContain(`<title data-seo>${STATIC_PAGES['/faq'].title.az} | Triad Vision</title>`);
    expect(html).toContain(`<link data-seo rel="canonical" href="${ORIGIN}/faq">`);
    expect(html).toContain(`hreflang="az" href="${ORIGIN}/faq"`);
    for (const l of ['de', 'en', 'ru', 'tr', 'uk']) expect(html).toContain(`hreflang="${l}" href="${ORIGIN}/${l}/faq"`);
    expect(html).toContain(`hreflang="x-default" href="${ORIGIN}/faq"`);
    expect(html).toContain('content="az_AZ"');
    expect(html).toContain('name="robots" content="index, follow');
    expect(html).toContain(`type="application/rss+xml"`);
    expect(html.match(/<title/g)).toHaveLength(1);
  });

  it('takes the language from the path prefix: text, canonical, og:url, og:locale and breadcrumbs', () => {
    const html = renderHead('/ru/about/', null, emptyData());
    expect(html).toContain(`<title data-seo>${STATIC_PAGES['/about'].title.ru} | Triad Vision</title>`);
    expect(html).toContain(`rel="canonical" href="${ORIGIN}/ru/about"`);
    expect(html).toContain(`property="og:url" content="${ORIGIN}/ru/about"`);
    expect(html).toContain('property="og:locale" content="ru_RU"');
    expect(html).toContain('property="og:locale:alternate" content="tr_TR"');
    const crumbs = ldBlocks(html).find((b) => b['@type'] === 'BreadcrumbList');
    expect(crumbs.itemListElement.map((i: { item: string }) => i.item)).toEqual([`${ORIGIN}/ru`, `${ORIGIN}/ru/about`]);
  });

  it('renders Turkish and Ukrainian pages (catalogue text, English CMS fallback, tr_TR / uk_UA)', () => {
    const tr = renderHead('/tr/visas', null, emptyData());
    expect(tr).toContain(`<title data-seo>${STATIC_PAGES['/visas'].title.tr} | Triad Vision</title>`);
    expect(tr).toContain('property="og:locale" content="tr_TR"');
    const data = emptyData({ visas: [{ slug: 'x', title: { az: 'Viza', en: 'Visa EN' }, summary: { az: 'Xülasə', en: 'Summary EN' }, image: '', updatedAt: new Date() }] });
    const uk = renderHead('/uk/visas/x', null, data);
    expect(uk).toContain('<title data-seo>Visa EN | Triad Vision</title>');
    expect(uk).toContain('property="og:locale" content="uk_UA"');
    expect(uk).toContain(`rel="canonical" href="${ORIGIN}/uk/visas/x"`);
  });

  it('still honours a legacy ?lng= on unprefixed paths (canonical points to the prefixed URL)', () => {
    const html = renderHead('/faq', 'de', emptyData());
    expect(html).toContain(`rel="canonical" href="${ORIGIN}/de/faq"`);
    expect(html).toContain(STATIC_PAGES['/faq'].title.de);
  });

  it('adds WebSite and the offices (ProfessionalService) on the home page', () => {
    const settings = { contact: { phone: '+994 1', hours: { en: 'Mon – Fri, 09:00 – 18:00' }, offices: [{ city: { az: 'Bakı', en: 'Baku' }, address: 'Nizami 96', lat: 40.3, lng: 49.8 }] } };
    const types = ldBlocks(renderHead('/en', null, emptyData({ settings }))).map((b) => b['@type']);
    expect(types).toEqual(['Organization', 'WebSite', 'ProfessionalService']);
  });

  it('marks private and unknown paths noindex without canonical or hreflang', () => {
    for (const p of ['/admin/cases', '/account', '/does-not-exist', '/visas/missing', '/de/account', '/guides/missing']) {
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
    // data: URIs are not usable as og:image; the generated title card is used instead.
    expect(html).toContain(`property="og:image" content="${ORIGIN}/og/visas/az/x.png"`);
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

  it('uses the per-item SEO overrides and honours noindex', () => {
    const data = emptyData({
      posts: [
        {
          slug: 'p',
          title: l10n('Post'),
          excerpt: l10n('Excerpt'),
          cover: '',
          publishedAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:00:00Z'),
          seoTitle: { az: 'Öz SEO başlığı', de: '' },
          seoDescription: { de: 'Eigene Beschreibung' },
          ogImage: 'https://cdn.example/og.png',
        },
        { slug: 'hidden', title: l10n('Hidden'), excerpt: l10n('E'), cover: '', publishedAt: new Date(), updatedAt: new Date(), noindex: true },
      ],
    });
    const az = renderHead('/news/p', null, data);
    expect(az).toContain('<title data-seo>Öz SEO başlığı</title>');
    expect(az).toContain('property="og:image" content="https://cdn.example/og.png"');
    const de = renderHead('/de/news/p', null, data);
    expect(de).toContain('<title data-seo>Öz SEO başlığı</title>'); // empty de override → az override
    expect(de).toContain('name="description" content="Eigene Beschreibung"');
    const article = ldBlocks(de).find((b) => b['@type'] === 'NewsArticle');
    expect(article.dateModified).toBe('2026-02-01T00:00:00.000Z');
    expect(renderHead('/news/hidden', null, data)).toContain('content="noindex, nofollow"');
  });

  it('describes guides with per-language alternates, Article (dateModified) and FAQPage', () => {
    const guides = [guide(), guide({ locale: 'tr', slug: 'almanya-firsat-karti', title: 'Fırsat Kartı 2026' }), guide({ key: 'blue-card', slug: 'mavi-kart', title: 'Mavi Kart' })];
    const html = renderHead('/tr/guides/almanya-firsat-karti', null, emptyData({ guides }));
    expect(html).toContain('<title data-seo>Fırsat Kartı 2026 | Triad Vision</title>');
    expect(html).toContain(`rel="canonical" href="${ORIGIN}/tr/guides/almanya-firsat-karti"`);
    expect(html).toContain(`hreflang="az" href="${ORIGIN}/guides/almaniya-imkan-karti"`);
    expect(html).toContain(`hreflang="x-default" href="${ORIGIN}/guides/almaniya-imkan-karti"`);
    expect(html).not.toContain('hreflang="de"');
    expect(html).toContain(`property="og:image" content="${ORIGIN}/og/guides/tr/almanya-firsat-karti.png"`);
    const types = ldBlocks(html).map((b) => b['@type']);
    expect(types).toEqual(['Organization', 'BreadcrumbList', 'Article', 'FAQPage']);
    expect(ldBlocks(html)[2].dateModified).toBe('2026-10-20T00:00:00.000Z');
    // A slug of another language does not resolve.
    expect(renderHead('/de/guides/almanya-firsat-karti', null, emptyData({ guides }))).toContain('noindex');
  });

  it('adds WebApplication JSON-LD on the interactive tools', () => {
    const types = ldBlocks(renderHead('/de/blue-card-check', null, emptyData())).map((b) => b['@type']);
    expect(types).toContain('WebApplication');
  });

  it('describes the tools hub with an ItemList of the tool pages in that language', () => {
    const list = ldBlocks(renderHead('/de/tools', null, emptyData())).find((b) => b['@type'] === 'ItemList') as { itemListElement: { url: string; position: number }[] } | undefined;
    expect(list).toBeTruthy();
    expect(list!.itemListElement[0].position).toBe(1);
    expect(list!.itemListElement.map((i) => i.url)).toContain(`${ORIGIN}/de/blue-card-check`);
    // Tool pages sit under the hub in breadcrumbs.
    const crumbs = ldBlocks(renderHead('/de/salary-calculator', null, emptyData())).find((b) => b['@type'] === 'BreadcrumbList');
    expect(crumbs.itemListElement.map((i: { item: string }) => i.item)).toEqual([`${ORIGIN}/de`, `${ORIGIN}/de/tools`, `${ORIGIN}/de/salary-calculator`]);
  });

  it('gives landing pages one language: canonical in that language, no hreflang', () => {
    const data = emptyData({ landings: [{ slug: 'promo', locale: 'de', title: 'Promo', seoTitle: null, seoDescription: 'Kurz', ogImage: null, heroImage: null, heroSubtitle: null, updatedAt: new Date() }] });
    const html = renderHead('/l/promo', null, data);
    expect(html).toContain(`rel="canonical" href="${ORIGIN}/de/l/promo"`);
    expect(html).not.toContain('hreflang=');
  });
});

describe('JSON-LD builders', () => {
  it('builds a JobPosting with Triad Vision as hiring organisation when the company is hidden', () => {
    const ld = jobPostingLd(job(), 'de', `${ORIGIN}/de/jobs/lkw-hamburg`);
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
    expect(jobPostingLd(job({ requirements: { en: ['B1'] } }), 'tr', 'u').description).toContain('Aranan nitelikler');
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
      logo: { '@type': 'ImageObject', url: `${ORIGIN}/logo-512.png` },
    });
    expect(org.aggregateRating).toBeUndefined();
    const rated = organizationLd(emptyData({ rating: { count: 3, average: 4.7 } }), 'az');
    expect(rated.aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: 4.7, reviewCount: 3, bestRating: 5, worstRating: 1 });
  });

  it('builds one ProfessionalService per office with NAP, geo, hours and sameAs', () => {
    const settings = {
      contact: {
        phone: '+994 50 1',
        email: 'a@b.az',
        hours: { en: 'Mon – Fri, 09:00 – 18:00' },
        offices: [
          { city: { az: 'Bakı', en: 'Baku' }, address: 'Nizami küç. 96', lat: 40.37, lng: 49.86 },
          { city: { en: 'Berlin' }, address: 'Friedrichstraße 123, 10117 Berlin' },
        ],
      },
      social: { facebook: 'https://facebook.com/x' },
    };
    const [baku, berlin] = localBusinessLd(emptyData({ settings }), 'az');
    expect(baku).toMatchObject({
      '@type': 'ProfessionalService',
      name: 'Triad Vision — Bakı',
      telephone: '+994 50 1',
      address: { streetAddress: 'Nizami küç. 96', addressLocality: 'Baku', addressCountry: 'AZ' },
      geo: { latitude: 40.37, longitude: 49.86 },
      openingHoursSpecification: [{ opens: '09:00', closes: '18:00' }],
      sameAs: ['https://facebook.com/x'],
    });
    expect(berlin.address).toMatchObject({ addressCountry: 'DE' });
  });
});

describe('robots.txt, sitemaps and RSS', () => {
  it('disallows private areas and points to the sitemap index', () => {
    const txt = renderRobots();
    for (const d of ['/admin', '/account', '/company', '/api/', '/booking/manage', '/review', '/verify-email', '/login/2fa', '/reset-password', '/__seo/']) {
      expect(txt).toContain(`Disallow: ${d}\n`);
    }
    expect(txt).toContain('User-agent: *\nAllow: /\n');
    // "/partner" (portal) must not block the public /partners page.
    expect(txt).toContain('Disallow: /partner$\nDisallow: /partner/\n');
    expect(txt).not.toContain('Disallow: /partner\n');
    expect(txt).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });

  it('lists one <url> per language with prefixed hreflang alternates and escapes XML', () => {
    const xml = renderSitemap(emptyData({ posts: [{ slug: 'a&b', title: {}, excerpt: {}, cover: '', publishedAt: new Date(), updatedAt: new Date('2026-10-01T00:00:00Z') }] }));
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml.match(/<url>/g)).toHaveLength((SITEMAP_STATIC.length + 1) * 6);
    expect(xml).toContain(`<loc>${ORIGIN}/de/news/a&amp;b</loc>`);
    expect(xml).toContain(`<loc>${ORIGIN}/news/a&amp;b</loc>`);
    expect(xml).toContain(`hreflang="uk" href="${ORIGIN}/uk/news/a&amp;b"`);
    expect(xml).toContain(`hreflang="x-default" href="${ORIGIN}/news/a&amp;b"`);
    expect(xml).toContain('<lastmod>2026-10-01T00:00:00.000Z</lastmod>');
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  it('leaves out expired jobs and noindex items, and adds image entries for covers', () => {
    const xml = renderSitemap(
      emptyData({
        jobs: [job({ slug: 'live' }), job({ slug: 'expired', closesAt: new Date(Date.now() - 1000) })],
        visas: [
          { slug: 'shown', title: l10n('V'), summary: {}, image: 'https://img.example/v.jpg', updatedAt: new Date() },
          { slug: 'secret', title: l10n('S'), summary: {}, image: '', updatedAt: new Date(), noindex: true },
        ],
      }),
    );
    expect(xml).toContain('/jobs/live</loc>');
    expect(xml).not.toContain('/jobs/expired');
    expect(xml).not.toContain('/visas/secret');
    expect(xml).toContain('<image:loc>https://img.example/v.jpg</image:loc>');
    expect(xml).toContain('<image:title>V de</image:title>');
  });

  it('splits into a sitemap index of non-empty groups', () => {
    const data = emptyData({ guides: [guide()] });
    const index = renderSitemapIndex(data);
    expect(index).toContain('<sitemapindex');
    expect(index).toContain(`<loc>${ORIGIN}/sitemaps/pages.xml</loc>`);
    expect(index).toContain(`<loc>${ORIGIN}/sitemaps/guides.xml</loc>`);
    expect(index).not.toContain('/sitemaps/jobs.xml');
    const guides = renderSitemapGroup(data, 'guides');
    expect(guides).toContain(`<loc>${ORIGIN}/guides/almaniya-imkan-karti</loc>`);
    expect(guides).toContain(`hreflang="az" href="${ORIGIN}/guides/almaniya-imkan-karti"`);
  });

  it('renders an RSS feed per language with posts and guides', () => {
    const data = emptyData({
      posts: [{ slug: 'law', title: l10n('Law'), excerpt: l10n('What <changed>'), cover: '', publishedAt: new Date('2026-09-01T00:00:00Z'), updatedAt: new Date() }],
      guides: [guide()],
    });
    const az = renderRss(data, 'az');
    expect(az).toContain('<rss version="2.0"');
    expect(az).toContain(`<link>${ORIGIN}/news/law</link>`);
    expect(az).toContain('What &lt;changed&gt; az');
    expect(az).toContain(`<atom:link href="${ORIGIN}/rss.xml"`);
    expect(az).toContain('İmkan Kartı 2026');
    const de = renderRss(data, 'de');
    expect(de).toContain(`<link>${ORIGIN}/de/news/law</link>`);
    expect(de).toContain(`<atom:link href="${ORIGIN}/de/rss.xml"`);
    expect(renderRss(data, 'tr')).toContain('Law en');
  });
});

describe('crawlable body (/__seo/body)', () => {
  const data = emptyData({
    visas: [{ slug: 'lkw', title: l10n('Truck <b>'), summary: l10n('Summary'), image: '', updatedAt: new Date(), visaLabel: '§19c', body: l10n('Para one\n\nPara two'), requirements: { az: ['CE'], de: ['CE de'] } }],
    settings: { contact: { phone: '+994 50 1', offices: [{ city: { az: 'Bakı', en: 'Baku' }, address: 'Nizami 96' }] } },
    guides: [guide(), guide({ key: 'blue-card', slug: 'mavi-kart', title: 'Mavi Kart' })],
  });

  it('renders h1, breadcrumbs, language links, content and NAP for a public page, all escaped', () => {
    const html = renderBody('/de/visas/lkw', data);
    expect(html).toContain('<div class="ssr" lang="de">');
    expect(html).toContain('<h1>Truck &lt;b&gt; de</h1>');
    expect(html).toContain('<p>Para one de</p>'.replace('one de', 'one'));
    expect(html).toContain('<li>CE de</li>');
    expect(html).toContain('href="/de/visas"');
    expect(html).toContain('hreflang="tr" lang="tr"');
    expect(html).toContain('href="/tr/visas/lkw"');
    expect(html).toContain('Nizami 96');
    expect(html).toContain('href="tel:+994501"');
    expect(html).not.toContain('<b>');
  });

  it('renders guides with their markdown body, TOC and FAQ', () => {
    const html = renderBody('/guides/almaniya-imkan-karti', data);
    expect(html).toContain('<h1>İmkan Kartı 2026</h1>');
    expect(html).toContain('<h2 id="sertler">Şərtlər</h2>');
    expect(html).toContain('href="/booking"');
    expect(html).toContain('href="/guides/mavi-kart"');
    expect(html).toContain('<table>');
    expect(html).toContain('Sual?');
  });

  it('mirrors the site navigation and keeps both audiences crawlable on the home page', () => {
    const html = renderBody('/en', data);
    expect(html).toContain('href="/en/for-workers"');
    expect(html).toContain('href="/en/for-employers"');
    expect(html).toContain('href="/en/tools"');
    expect(html).toContain(STATIC_PAGES['/for-employers'].description.en);
  });

  it('renders the tools hub in groups and the audience pages with their own services and testimonials', () => {
    const svc = (slug: string, audience: string) => ({ slug, title: l10n(slug), summary: l10n('S'), image: '', updatedAt: new Date(), audience });
    const quote = (id: string, kind: string) => ({ id, quote: l10n(`Quote ${id}`), author: l10n('A'), role: l10n('R'), kind, videoUrl: null, posterUrl: null, profession: null, country: null, city: null, visaType: null });
    const d = { ...data, services: [svc('hiring', 'company'), svc('visa-help', 'candidate'), svc('docs', 'all')], testimonials: [quote('c1', 'company'), quote('w1', 'candidate')] };

    const tools = renderBody('/de/tools', d);
    expect(tools).toContain('<h2>Eignung prüfen</h2>');
    expect(tools).toContain('href="/de/salary-calculator"');
    expect(tools).toContain(STATIC_PAGES['/blue-card-check'].description.de);

    const employers = renderBody('/for-employers', d);
    expect(employers).toContain('href="/services/hiring"');
    expect(employers).toContain('href="/services/docs"');
    expect(employers).not.toContain('href="/services/visa-help"');
    expect(employers).toContain('Quote c1');
    expect(employers).not.toContain('Quote w1');
    expect(employers).toContain('href="/cooperation"');

    const workers = renderBody('/for-workers', d);
    expect(workers).toContain('href="/services/visa-help"');
    expect(workers).not.toContain('href="/services/hiring"');
    expect(workers).toContain('Quote w1');
  });

  it('returns nothing for private and unknown paths', () => {
    expect(renderBody('/admin/cases', data)).toBe('');
    expect(renderBody('/de/account', data)).toBe('');
    expect(renderBody('/nope', data)).toBe('');
  });
});
