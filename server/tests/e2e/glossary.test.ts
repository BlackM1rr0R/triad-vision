import { describe, expect, it } from 'vitest';
import { anon } from '../helpers/api';
import { GLOSSARY_TERMS } from '../../src/lib/glossary/index.js';

/** German bureaucracy glossary (/api/glossary, static data in lib/glossary): list, term detail, SEO output. */
describe('glossary API', () => {
  it('lists every term with the short definition in the requested language', async () => {
    const res = await anon().get('/api/glossary?lng=ru');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('public');
    expect(res.body.items).toHaveLength(GLOSSARY_TERMS.length);
    const anmeldung = res.body.items.find((i: { slug: string }) => i.slug === 'anmeldung');
    expect(anmeldung).toMatchObject({ term: 'Anmeldung', article: 'die', category: 'residence' });
    expect(anmeldung.short).toBe(GLOSSARY_TERMS.find((t) => t.slug === 'anmeldung')!.short.ru);
    expect(res.body.categories.length).toBe(9);
    // Unknown language → az.
    const az = await anon().get('/api/glossary?lng=xx');
    expect(az.body.items.find((i: { slug: string }) => i.slug === 'anmeldung').short).toBe(GLOSSARY_TERMS.find((t) => t.slug === 'anmeldung')!.short.az);
  });

  it('gives one term with related terms; tr falls back to the English explanation; unknown slug 404', async () => {
    const de = await anon().get('/api/glossary/kaution?lng=de');
    expect(de.status).toBe(200);
    expect(de.body.term).toMatchObject({ slug: 'kaution', term: 'Kaution', longFallback: null });
    expect(de.body.related.length).toBeGreaterThan(0);
    const tr = await anon().get('/api/glossary/kaution?lng=tr');
    expect(tr.body.term.longFallback).toBe('en');
    const missing = await anon().get('/api/glossary/does-not-exist');
    expect(missing.status).toBe(404);
    expect(missing.body.code ?? missing.body.error).toBeTruthy();
  });

  it('serves SEO head, crawler body, status and the sitemap group', async () => {
    expect((await anon().get('/__seo/status?path=/de/glossary/anmeldung')).text).toBe('');
    expect((await anon().get('/__seo/status?path=/glossary/nope')).text).toBe('404');
    const head = await anon().get('/api/seo/head?path=/en/glossary/anmeldung');
    expect(head.text).toContain('DefinedTerm');
    expect(head.text).toContain('hreflang="ru"');
    const body = await anon().get('/__seo/body?path=/glossary/anmeldung');
    expect(body.text).toContain('<h1 lang="de">die Anmeldung</h1>');
    const sitemap = await anon().get('/sitemaps/glossary.xml');
    expect(sitemap.status).toBe(200);
    expect(sitemap.text).toContain('/glossary/anmeldung');
    expect((await anon().get('/sitemap.xml')).text).toContain('/sitemaps/glossary.xml');
  });
});
