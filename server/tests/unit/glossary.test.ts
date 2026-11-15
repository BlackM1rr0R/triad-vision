import { describe, expect, it } from 'vitest';
import { isKnownRoute, pageStatus, resolvePage, SITEMAP_GROUPS, sitemapUrls, type SeoData } from '../../src/lib/seo.js';
import { renderBody } from '../../src/lib/seoBody.js';
import { SEO_LOCALES, STATIC_PAGES, textIn, TOOL_GROUPS } from '../../src/lib/seoCatalogue.js';
import {
  alphabetical,
  GLOSSARY_CATEGORIES,
  GLOSSARY_LOCALES,
  GLOSSARY_LONG_LOCALES,
  GLOSSARY_TERMS,
  glossaryDetail,
  glossaryList,
  glossaryLocale,
  letterOf,
  relatedTerms,
} from '../../src/lib/glossary/index.js';
import { GLOSSARY_TEXTS } from '../../src/lib/glossary/texts.js';

const data: SeoData = { visas: [], services: [], posts: [], faqs: [], jobs: [], settings: {}, rating: null };

describe('glossary data', () => {
  it('has about 200 terms with unique, URL-safe slugs and unique German terms', () => {
    expect(GLOSSARY_TERMS.length).toBeGreaterThanOrEqual(195);
    const slugs = GLOSSARY_TERMS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s, s).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const terms = GLOSSARY_TERMS.map((t) => t.term.toLowerCase());
    expect(new Set(terms).size).toBe(terms.length);
  });

  it('covers every category', () => {
    for (const c of GLOSSARY_CATEGORIES) expect(GLOSSARY_TERMS.filter((t) => t.category === c).length, c).toBeGreaterThanOrEqual(10);
    for (const t of GLOSSARY_TERMS) expect(GLOSSARY_CATEGORIES, t.slug).toContain(t.category);
  });

  it('has every required text: short in all six languages (≤ 160), long in az/de/en/ru, example, pronunciation', () => {
    for (const t of GLOSSARY_TERMS) {
      for (const l of GLOSSARY_LOCALES) {
        const s = t.short[l]?.trim() ?? '';
        expect(s.length, `${t.slug} short ${l}`).toBeGreaterThan(15);
        expect(s.length, `${t.slug} short ${l}`).toBeLessThanOrEqual(160);
      }
      for (const l of GLOSSARY_LONG_LOCALES) expect(t.long[l]?.trim().length ?? 0, `${t.slug} long ${l}`).toBeGreaterThan(80);
      expect(t.example.trim().length, `${t.slug} example`).toBeGreaterThan(10);
      expect(t.pron, `${t.slug} pron`).toMatch(/^[A-Za-z][A-Za-z' -]*$/);
      expect(t.pron, `${t.slug} pron has a stressed syllable`).toMatch(/[A-Z]{2}|^[A-Z]/);
      expect(['der', 'die', 'das', null], t.slug).toContain(t.article);
    }
  });

  it('links only to existing terms (not to itself) and to https official pages', () => {
    const slugs = new Set(GLOSSARY_TERMS.map((t) => t.slug));
    for (const t of GLOSSARY_TERMS) {
      expect(t.related.length, `${t.slug} related`).toBeGreaterThanOrEqual(1);
      for (const r of t.related) {
        expect(slugs.has(r), `${t.slug} → ${r}`).toBe(true);
        expect(r, t.slug).not.toBe(t.slug);
      }
      if (t.link) {
        expect(t.link.url, t.slug).toMatch(/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/|$)/);
        expect(t.link.label.trim().length, t.slug).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the glossary neutral: no mention of Triad Vision in the definitions', () => {
    for (const t of GLOSSARY_TERMS) {
      const all = [...Object.values(t.short), ...Object.values(t.long)].join(' ');
      expect(all, t.slug).not.toMatch(/Triad Vision/i);
    }
  });
});

describe('glossary API shapes', () => {
  it('lists every term alphabetically (umlauts as base letters) in the requested language', () => {
    const list = glossaryList('de');
    expect(list.items).toHaveLength(GLOSSARY_TERMS.length);
    expect(list.categories.reduce((n, c) => n + c.count, 0)).toBe(GLOSSARY_TERMS.length);
    const letters = list.items.map((i) => letterOf(i.term));
    expect([...letters].sort((a, b) => a.localeCompare(b))).toEqual(letters);
    expect(list.items.find((i) => i.slug === 'anmeldung')?.short).toBe(GLOSSARY_TERMS.find((t) => t.slug === 'anmeldung')!.short.de);
    expect(letterOf('Überweisung')).toBe('U');
  });

  it('gives a term with related terms; tr / uk fall back to the English long text', () => {
    const az = glossaryDetail('anmeldung', 'az')!;
    expect(az.term.longFallback).toBeNull();
    expect(az.related.length).toBeGreaterThan(0);
    const tr = glossaryDetail('anmeldung', 'tr')!;
    expect(tr.term.longFallback).toBe('en');
    expect(tr.term.long).toBe(GLOSSARY_TERMS.find((t) => t.slug === 'anmeldung')!.long.en);
    expect(glossaryDetail('nope', 'en')).toBeNull();
    expect(glossaryLocale('ru-RU')).toBe('ru');
    expect(glossaryLocale('fr')).toBe('az');
    for (const t of GLOSSARY_TERMS) expect(relatedTerms(t).length, t.slug).toBeGreaterThanOrEqual(1);
    const sorted = alphabetical(GLOSSARY_TERMS);
    expect(glossaryDetail(sorted[0].slug, 'en')!.prev).toBeNull();
    expect(glossaryDetail(sorted.at(-1)!.slug, 'en')!.next).toBeNull();
  });

  it('has labels for every category in every language', () => {
    for (const l of SEO_LOCALES) for (const c of GLOSSARY_CATEGORIES) expect(GLOSSARY_TEXTS[l].categories[c], `${l} ${c}`).toBeTruthy();
  });
});

describe('glossary SEO', () => {
  it('/glossary: static page with a DefinedTermSet of every term, in the tools hub and the pages sitemap', () => {
    for (const lng of SEO_LOCALES) {
      const p = resolvePage('/glossary', lng, data);
      expect(p.index).toBe(true);
      expect(p.title.length).toBeLessThanOrEqual(60);
      expect(p.description.length).toBeLessThanOrEqual(155);
      const set = p.jsonLd.find((x) => (x as { '@type': string })['@type'] === 'DefinedTermSet') as { hasDefinedTerm: { url: string }[] };
      expect(set.hasDefinedTerm).toHaveLength(GLOSSARY_TERMS.length);
    }
    expect(new Set(SEO_LOCALES.map((l) => textIn(STATIC_PAGES['/glossary'].title, l))).size).toBe(6);
    expect(TOOL_GROUPS.flatMap((g) => g.paths)).toContain('/glossary');
    expect(sitemapUrls(data, 'pages').some((u) => u.loc.endsWith('/glossary'))).toBe(true);
  });

  it('every term page: title ≤ 60 and description ≤ 155 in all six languages, DefinedTerm, breadcrumb', () => {
    for (const t of GLOSSARY_TERMS) {
      const titles = new Set<string>();
      for (const lng of SEO_LOCALES) {
        const p = resolvePage(`/glossary/${t.slug}`, lng, data);
        expect(p.index, `${t.slug} ${lng}`).toBe(true);
        expect(p.title.length, `${t.slug} ${lng} title`).toBeLessThanOrEqual(60);
        expect(p.title, `${t.slug} ${lng} title`).toContain(t.term.length > 30 ? t.term.slice(0, 20) : t.term);
        expect(p.description.length, `${t.slug} ${lng} description`).toBeLessThanOrEqual(155);
        expect(p.description.length, `${t.slug} ${lng} description`).toBeGreaterThan(20);
        expect(p.alternates).toBeUndefined(); // same path in every language → all six hreflang
        const ld = p.jsonLd[0] as { '@type': string; name: string; inDefinedTermSet: { '@type': string } };
        expect(ld['@type']).toBe('DefinedTerm');
        expect(ld.name).toBe(t.term);
        expect(ld.inDefinedTermSet['@type']).toBe('DefinedTermSet');
        expect(p.crumbs.map((c) => c.path)).toEqual(['/', '/glossary', `/glossary/${t.slug}`]);
        titles.add(p.title);
      }
      // Localized titles, except for very long terms (then the term alone fits).
      if (t.term.length <= 25) expect(titles.size, t.slug).toBeGreaterThan(1);
    }
  });

  it('answers 200 for terms and 404 for unknown slugs; known route', () => {
    expect(pageStatus('/glossary/anmeldung', data)).toBe(200);
    expect(pageStatus('/de/glossary/kaution', data)).toBe(200);
    expect(pageStatus('/glossary', data)).toBe(200);
    expect(pageStatus('/glossary/nope', data)).toBe(404);
    expect(pageStatus('/glossary/anmeldung/more', data)).toBe(404);
    expect(isKnownRoute('/glossary/x')).toBe(true);
    expect(resolvePage('/glossary/nope', 'en', data).index).toBe(false);
  });

  it('has a sitemap group with every term in all six languages', () => {
    expect(SITEMAP_GROUPS).toContain('glossary');
    const urls = sitemapUrls(data, 'glossary');
    expect(urls).toHaveLength(GLOSSARY_TERMS.length * SEO_LOCALES.length);
    expect(urls[0].alternates.map(([l]) => l)).toEqual([...SEO_LOCALES, 'x-default']);
  });

  it('server-renders the definition, explanation, example and related links', () => {
    const t = GLOSSARY_TERMS.find((x) => x.slug === 'kaution')!;
    const html = renderBody('/ru/glossary/kaution', data);
    expect(html).toContain('<h1 lang="de">die Kaution</h1>');
    expect(html).toContain(t.long.ru.slice(0, 40));
    expect(html).toContain('<blockquote lang="de">');
    expect(html).toContain('href="/ru/glossary/');
    expect(html).toContain('href="/ru/glossary"');
    const tr = renderBody('/tr/glossary/kaution', data);
    expect(tr).toContain('lang="en"');
    const list = renderBody('/en/glossary', data);
    for (const c of GLOSSARY_CATEGORIES) expect(list).toContain(GLOSSARY_TEXTS.en.categories[c]);
    expect((list.match(/href="\/en\/glossary\//g) ?? []).length).toBeGreaterThanOrEqual(GLOSSARY_TERMS.length);
  });
});
