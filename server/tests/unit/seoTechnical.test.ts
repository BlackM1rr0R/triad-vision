import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderHead, resolvePage, TOOL_PAGES, type SeoData } from '../../src/lib/seo.js';
import { renderBody } from '../../src/lib/seoBody.js';
import { PRIVATE_PREFIXES, SEO_LOCALES, SITE_NAME, STATIC_PAGES, textIn, type SeoLocale } from '../../src/lib/seoCatalogue.js';
import { GUIDE_TOOLS, guideTools, orderGuidesForTool, TOOL_GUIDES } from '../../src/lib/seoLinks.js';
import type { GuideRow } from '../../src/lib/guides/service.js';

/*
 * Technical SEO checks across every public page and language: titles / descriptions (length, uniqueness, the
 * search terms people type), canonical and hreflang (no ?lng= variants, reciprocal sets, x-default), JSON-LD
 * shape per schema.org type, the ?lng= redirect rules of deploy/Caddyfile and the guide ↔ tool links.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'http://localhost:5173';

const full = (base: string) => Object.fromEntries(SEO_LOCALES.map((l) => [l, `${base} ${l}`]));
const guide = (locale: SeoLocale, key = 'blue-card'): GuideRow => ({
  id: `g-${key}-${locale}`,
  key,
  locale,
  slug: `${key}-${locale}`,
  title: `Guide ${key} ${locale}`,
  description: 'A long enough guide description for the tests, about work and visas in Germany.',
  body: '## Part\n\nText.',
  faq: [{ q: 'Question?', a: 'Answer.' }],
  published: true,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-20T00:00:00Z'),
});

const data: SeoData = {
  visas: [{ slug: 'lkw-fahrer', title: full('LKW-Fahrer'), summary: full('Kurz'), image: 'https://img.example/v.jpg', updatedAt: new Date(), faq: [{ q: full('Q?'), a: full('A.') }] }],
  services: [{ slug: 'recruiting', title: full('Recruiting'), summary: full('Auswahl'), image: '', updatedAt: new Date() }],
  posts: [{ slug: 'law', title: full('Gesetz'), excerpt: full('Neu'), cover: '', publishedAt: new Date('2026-01-01'), updatedAt: new Date('2026-02-01') }],
  faqs: [{ question: full('Frage'), answer: full('Antwort') }],
  jobs: [
    {
      slug: 'lkw-hamburg',
      title: full('Fahrer'),
      description: full('Kurz'),
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
    },
  ],
  guides: [...SEO_LOCALES.map((l) => guide(l)), ...SEO_LOCALES.map((l) => guide(l, 'salary-net'))],
  settings: {
    contact: {
      phone: '+994 51 414 14 01',
      email: 'info@example.com',
      hours: { en: 'Mon – Fri, 09:00 – 18:00' },
      offices: [
        { city: { az: 'Bakı', en: 'Baku' }, address: 'Nizami 96', lat: 40.3, lng: 49.8 },
        { city: { en: 'Berlin' }, address: 'Str. 1, 10117 Berlin' },
      ],
    },
  },
  rating: null,
};

const url = (p: string, l: SeoLocale) => (l === 'az' ? p : p === '/' ? `/${l}` : `/${l}${p}`);
const indexablePages = Object.entries(STATIC_PAGES).filter(([, m]) => m.index !== false);
const detail = ['/visas/lkw-fahrer', '/services/recruiting', '/news/law', '/jobs/lkw-hamburg'];

const ldBlocks = (html: string) =>
  [...html.matchAll(/<script data-seo type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]) as Record<string, unknown>);
const links = (html: string, rel: string) =>
  [...html.matchAll(new RegExp(`<link data-seo rel="${rel}"(?: hreflang="([^"]+)")? href="([^"]+)">`, 'g'))].map((m) => ({ hreflang: m[1], href: m[2] }));

describe('titles and descriptions', () => {
  it('fit the search result: title ≤ 60, description 120–160 characters on every indexable page and language', () => {
    for (const [p, m] of indexablePages) {
      for (const l of SEO_LOCALES) {
        const title = m.fullTitle ? textIn(m.title, l) : `${textIn(m.title, l)} | ${SITE_NAME}`;
        expect(title.length, `${p} ${l} title`).toBeLessThanOrEqual(60);
        const d = textIn(m.description, l);
        expect(d.length, `${p} ${l} description "${d}"`).toBeGreaterThanOrEqual(120);
        expect(d.length, `${p} ${l} description`).toBeLessThanOrEqual(160);
        // The rendered tags are the catalogue texts, not shortened.
        expect(resolvePage(p, l, data).title, `${p} ${l}`).toBe(title);
      }
    }
  });

  it('are unique per language across all static and detail pages', () => {
    for (const l of SEO_LOCALES) {
      const pages = [...indexablePages.map(([p]) => p), ...detail];
      const titles = pages.map((p) => resolvePage(p, l, data).title);
      const descriptions = pages.map((p) => resolvePage(p, l, data).description);
      const dup = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);
      expect(dup(titles), `${l} duplicate titles`).toEqual([]);
      expect(dup(descriptions), `${l} duplicate descriptions`).toEqual([]);
    }
  });

  it('carry the search terms people use (Search Console queries), keyword first', () => {
    const t = (p: string, l: SeoLocale) => resolvePage(p, l, data).title.toLowerCase();
    expect(t('/salary-calculator', 'ru')).toMatch(/^калькулятор налогов/);
    expect(t('/salary-calculator', 'ru')).toContain('германи');
    expect(t('/salary-calculator', 'uk')).toMatch(/^податковий калькулятор німеччин/);
    expect(t('/salary-calculator', 'de')).toMatch(/^brutto netto rechner/);
    expect(t('/salary-calculator', 'en')).toMatch(/^salary calculator germany/);
    expect(t('/salary-calculator', 'tr')).toMatch(/^almanya maaş hesaplama/);
    expect(t('/chancenkarte-calculator', 'de')).toMatch(/^chancenkarte punkterechner/);
    expect(t('/chancenkarte-calculator', 'de')).toContain('punktesystem');
    expect(t('/cities', 'az')).toMatch(/^almaniya şəhərləri/);
    expect(t('/cities', 'de')).toContain('lebenshaltungskosten');
    expect(t('/blue-card-check', 'de')).toContain('gehaltsgrenze');
    expect(t('/anerkennung', 'ru')).toMatch(/^подтверждение .*диплома в германии/);
    // The calculators name the year (fresh results get the click).
    for (const p of ['/salary-calculator', '/chancenkarte-calculator', '/blue-card-check', '/cities']) {
      for (const l of SEO_LOCALES) expect(t(p, l), `${p} ${l}`).toContain('2026');
    }
  });
});

describe('canonical and hreflang', () => {
  const allUrls = SEO_LOCALES.flatMap((l) => [...indexablePages.map(([p]) => p), ...detail, `/guides/blue-card-${l}`].map((p) => [p, l] as const));

  it('never point at a ?lng= (or any query) variant, also when a legacy ?lng= reaches the API', () => {
    for (const [p, l] of allUrls) {
      for (const lng of [null, 'de', 'ru'] as const) {
        const html = renderHead(url(p, l), lng, data);
        for (const x of [...links(html, 'canonical'), ...links(html, 'alternate')]) expect(x.href, `${p} ${l}`).not.toMatch(/[?#]/);
        expect(html, `${p} ${l}`).not.toContain('lng=');
      }
    }
  });

  it('are reciprocal: every language version lists the same set, includes itself and x-default = the az URL', () => {
    for (const [p] of indexablePages) {
      const sets = SEO_LOCALES.map((l) => {
        const html = renderHead(url(p, l), null, data);
        const canonical = links(html, 'canonical')[0]?.href;
        const alts = links(html, 'alternate').filter((x) => x.hreflang);
        expect(canonical, `${p} ${l}`).toBe(`${ORIGIN}${url(p, l) === '/' ? '/' : url(p, l)}`);
        expect(alts.find((x) => x.hreflang === l)?.href, `${p} ${l} self`).toBe(canonical);
        expect(alts.find((x) => x.hreflang === 'x-default')?.href, `${p} ${l} x-default`).toBe(`${ORIGIN}${p}`);
        return JSON.stringify(alts.map((x) => `${x.hreflang} ${x.href}`).sort());
      });
      expect(new Set(sets).size, p).toBe(1);
    }
  });

  it('guides: each language links the other languages by their own slug, and back', () => {
    const sets = SEO_LOCALES.map((l) =>
      JSON.stringify(links(renderHead(url(`/guides/blue-card-${l}`, l), null, data), 'alternate').filter((x) => x.hreflang).map((x) => `${x.hreflang} ${x.href}`).sort()),
    );
    expect(new Set(sets).size).toBe(1);
    expect(sets[0]).toContain(`ru ${ORIGIN}/ru/guides/blue-card-ru`);
    expect(sets[0]).toContain(`x-default ${ORIGIN}/guides/blue-card-az`);
  });
});

/** Minimal schema.org shape rules per @type (the properties Google needs for each feature). */
const isUrl = (v: unknown) => typeof v === 'string' && /^https?:\/\/[^\s?#]+(#[\w-]+)?$/.test(v);
const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
const SHAPES: Record<string, (b: Record<string, unknown>) => string[]> = {
  Organization: (b) => [!nonEmpty(b.name) && 'name', !isUrl(b.url) && 'url', !(b.logo as { url?: unknown })?.url && 'logo'].filter(Boolean) as string[],
  WebSite: (b) => [!nonEmpty(b.name) && 'name', !isUrl(b.url) && 'url'].filter(Boolean) as string[],
  ProfessionalService: (b) => [!nonEmpty(b.name) && 'name', !(b.address as { streetAddress?: unknown })?.streetAddress && 'address', !nonEmpty(b.telephone) && 'telephone'].filter(Boolean) as string[],
  BreadcrumbList: (b) => {
    const items = b.itemListElement as { position: number; name: string; item: string }[];
    if (!Array.isArray(items) || items.length < 2) return ['itemListElement'];
    return items.flatMap((x, i) => [x.position !== i + 1 && `position ${i}`, !nonEmpty(x.name) && `name ${i}`, !isUrl(x.item) && `item ${i}`].filter(Boolean) as string[]);
  },
  WebApplication: (b) => {
    const offers = b.offers as { price?: unknown; priceCurrency?: unknown } | undefined;
    return [
      !nonEmpty(b.name) && 'name',
      !isUrl(b.url) && 'url',
      !nonEmpty(b.applicationCategory) && 'applicationCategory',
      !nonEmpty(b.operatingSystem) && 'operatingSystem',
      offers?.price !== 0 && 'offers.price 0',
      !nonEmpty(offers?.priceCurrency) && 'offers.priceCurrency',
    ].filter(Boolean) as string[];
  },
  FAQPage: (b) => {
    const q = b.mainEntity as { '@type': string; name: string; acceptedAnswer: { '@type': string; text: string } }[];
    if (!Array.isArray(q) || !q.length) return ['mainEntity'];
    return q.flatMap((x, i) => [x['@type'] !== 'Question' && `Question ${i}`, !nonEmpty(x.name) && `name ${i}`, (x.acceptedAnswer?.['@type'] !== 'Answer' || !nonEmpty(x.acceptedAnswer?.text)) && `answer ${i}`].filter(Boolean) as string[]);
  },
  Article: (b) => [!nonEmpty(b.headline) && 'headline', String(b.headline).length > 110 && 'headline ≤ 110', !b.datePublished && 'datePublished', !b.dateModified && 'dateModified', !Array.isArray(b.image) && 'image', !b.author && 'author'].filter(Boolean) as string[],
  NewsArticle: (b) => SHAPES.Article(b),
  JobPosting: (b) =>
    [
      !nonEmpty(b.title) && 'title',
      !nonEmpty(b.description) && 'description',
      !b.datePosted && 'datePosted',
      !nonEmpty((b.hiringOrganization as { name?: string })?.name) && 'hiringOrganization',
      (b.jobLocation as { address?: { addressCountry?: string } })?.address?.addressCountry !== 'DE' && 'jobLocation',
    ].filter(Boolean) as string[],
  ItemList: (b) => {
    const items = b.itemListElement as { position: number; url: string }[];
    if (!Array.isArray(items) || !items.length) return ['itemListElement'];
    return items.flatMap((x, i) => [x.position !== i + 1 && `position ${i}`, !isUrl(x.url) && `url ${i}`].filter(Boolean) as string[]);
  },
  Service: (b) => [!nonEmpty(b.name) && 'name', !b.provider && 'provider'].filter(Boolean) as string[],
};

describe('JSON-LD', () => {
  it('has the required properties of its type on every page and language, and no self-serving ratings', () => {
    const seen = new Set<string>();
    for (const l of SEO_LOCALES) {
      for (const p of [...indexablePages.map(([x]) => x), ...detail, `/guides/blue-card-${l}`]) {
        const html = renderHead(url(p, l), null, data);
        for (const b of ldBlocks(html)) {
          expect(b['@context'], `${p} ${l}`).toBe('https://schema.org');
          const type = String(b['@type']);
          seen.add(type);
          const check = SHAPES[type];
          if (check) expect(check(b), `${type} on ${l} ${p}`).toEqual([]);
          expect(JSON.stringify(b)).not.toMatch(/aggregateRating|"Review"/i);
        }
      }
    }
    for (const type of ['Organization', 'WebSite', 'ProfessionalService', 'BreadcrumbList', 'WebApplication', 'FAQPage', 'Article', 'NewsArticle', 'JobPosting', 'ItemList', 'Service']) {
      expect(seen, type).toContain(type);
    }
  });

  it('marks every calculator and check up as a free WebApplication', () => {
    for (const p of ['/salary-calculator', '/chancenkarte-calculator', '/blue-card-check', '/cities', '/eligibility', '/uygunluq-testi', '/cost-calculator', '/budget']) {
      expect(TOOL_PAGES.has(p), p).toBe(true);
      for (const l of SEO_LOCALES) {
        const app = ldBlocks(renderHead(url(p, l), null, data)).find((b) => b['@type'] === 'WebApplication');
        expect(app, `${p} ${l}`).toBeDefined();
        expect(app!.url).toBe(`${ORIGIN}${url(p, l)}`);
        expect(app!.inLanguage).toBe(l);
      }
    }
    // Not on pages without an interactive tool.
    for (const p of ['/about', '/contact', '/guides', '/jobs']) expect(ldBlocks(renderHead(p, null, data)).some((b) => b['@type'] === 'WebApplication'), p).toBe(false);
  });

  it('puts a BreadcrumbList on every page below the home page', () => {
    for (const l of SEO_LOCALES) {
      for (const p of [...indexablePages.map(([x]) => x).filter((x) => x !== '/'), ...detail, `/guides/blue-card-${l}`]) {
        expect(ldBlocks(renderHead(url(p, l), null, data)).some((b) => b['@type'] === 'BreadcrumbList'), `${p} ${l}`).toBe(true);
      }
    }
    expect(ldBlocks(renderHead('/', null, data)).some((b) => b['@type'] === 'BreadcrumbList')).toBe(false);
  });

  it('keeps Organization, offices and footer NAP on the phone number from the settings', () => {
    const html = renderHead('/contact', null, data);
    const blocks = ldBlocks(html);
    const org = blocks.find((b) => b['@type'] === 'Organization')!;
    const offices = blocks.filter((b) => b['@type'] === 'ProfessionalService');
    expect(org.telephone).toBe('+994 51 414 14 01');
    expect(offices).toHaveLength(2);
    for (const o of offices) {
      expect(o.telephone).toBe(org.telephone);
      expect(o.parentOrganization).toEqual({ '@id': org['@id'] });
    }
    expect(renderBody('/contact', data)).toContain('+994 51 414 14 01');
  });
});

describe('legacy ?lng= redirect (deploy/Caddyfile)', () => {
  const caddy = readFileSync(path.resolve(here, '../../../deploy/Caddyfile'), 'utf8');
  const block = /@lnglegacy \{([\s\S]*?)\n\t\}/.exec(caddy)?.[1] ?? '';

  it('skips exactly the private areas of the site (PRIVATE_PREFIXES) plus the technical paths', () => {
    const m = /not path_regexp \^\(\/\(de\|en\|ru\|tr\|uk\)\)\?\/\(([^)]*)\)\(\/\|\$\)/.exec(block);
    expect(m, 'exclusion regex').not.toBeNull();
    const listed = new Set(m![1].split('|'));
    for (const p of PRIVATE_PREFIXES) expect(listed, p).toContain(p.slice(1));
    const technical = [...listed].filter((x) => !PRIVATE_PREFIXES.includes(`/${x}`));
    expect(technical.sort()).toEqual(['__seo', '__ssr', 'assets', 'feeds', 'og', 'sitemaps', 'uploads']);
  });

  it('answers every lng value with a permanent redirect whose target carries no lng (no loop)', () => {
    expect(block).toContain('query lng=*');
    const handle = /handle @lnglegacy \{([\s\S]*?)\n\t\}/.exec(caddy)?.[1] ?? '';
    expect(handle).toContain('uri query -lng');
    // All three redirects come after the parameter is removed and are permanent.
    const removed = handle.indexOf('uri query -lng');
    const redirs = [...handle.matchAll(/\bredir @\w+ (\S+) permanent/g)];
    expect(redirs).toHaveLength(3);
    for (const r of redirs) {
      expect(r.index!).toBeGreaterThan(removed);
      expect(r[1]).not.toMatch(/lng=|query\.lng|\{query\}/);
      expect(r[1]).toContain('{?query}'); // the query after `uri query -lng`: other parameters kept
    }
    for (const l of ['de', 'en', 'ru', 'tr', 'uk']) expect(handle).toMatch(new RegExp(`~\\(\\?i\\)\\^${l}\\(\\[-_,\\]\\.\\*\\)\\?\\$ /${l}`));
  });
});

describe('guide ↔ tool links', () => {
  it('agree between the crawler HTML (seoLinks.ts) and the pages (client lib/guideTools.ts)', async () => {
    const client = (await import(/* @vite-ignore */ pathToFileURL(path.resolve(here, '../../../client/src/lib/guideTools.ts')).href)) as {
      GUIDE_TOOLS: Record<string, string[]>;
      TOOL_GUIDES: Record<string, string[]>;
      TOOL_LABEL_KEY: Record<string, string>;
      guideTools: (k: string) => string[];
    };
    expect(client.GUIDE_TOOLS).toEqual(GUIDE_TOOLS);
    expect(client.TOOL_GUIDES).toEqual(TOOL_GUIDES);
    for (const k of [...Object.keys(GUIDE_TOOLS), 'anerkennung-koch', 'employer-drivers', 'unknown']) {
      expect(client.guideTools(k), k).toEqual(guideTools(k));
      for (const p of guideTools(k)) {
        expect(STATIC_PAGES[p], `${k} → ${p}`).toBeDefined();
        expect(client.TOOL_LABEL_KEY[p], `label of ${p}`).toBeTruthy();
      }
    }
    for (const p of Object.keys(TOOL_GUIDES)) expect(STATIC_PAGES[p], p).toBeDefined();
  });

  it('links each guide to its tools and each tool to its guides first, in the crawler HTML', () => {
    const g = renderBody('/de/guides/blue-card-de', data);
    expect(g).toContain('<a href="/de/blue-card-check">');
    expect(g).toContain('<a href="/de/salary-calculator">');
    expect(g).toContain('<a href="/de/eligibility">');
    const s = renderBody('/ru/salary-calculator', data);
    const salaryGuide = s.indexOf('/ru/guides/salary-net-ru');
    expect(salaryGuide).toBeGreaterThan(0);
    expect(salaryGuide).toBeLessThan(s.indexOf('/ru/guides/blue-card-ru'));
    expect(renderBody('/cities', data)).toContain('/guides/salary-net-az');
    expect(orderGuidesForTool('/cities', [{ key: 'x' }, { key: 'salary-net' }, { key: 'first-month' }]).map((x) => x.key)).toEqual(['first-month', 'salary-net', 'x']);
    expect(guideTools('anerkennung-koch')).toEqual(['/anerkennung', '/salary-calculator', '/eligibility']);
  });
});
