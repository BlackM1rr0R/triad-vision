import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROFESSION_HUB_PATHS, PROFESSION_HUB_SLUGS, PROFESSION_HUBS, hubBySlug, hubMatches, hubOfPath } from '../../src/lib/professionHubs.js';
import { PROFESSION_SLUGS, jobProfession } from '../../src/lib/jobLandings.js';
import { STATIC_PAGES, SITEMAP_STATIC, SEO_LOCALES, textIn } from '../../src/lib/seoCatalogue.js';
import { isKnownRoute, renderHead, resolvePage } from '../../src/lib/seo.js';
import { renderBody } from '../../src/lib/seoBody.js';

const emptyData = () => ({ visas: [], services: [], posts: [], faqs: [], jobs: [], settings: {} }) as unknown as Parameters<typeof renderHead>[2];

describe('profession hubs', () => {
  it('has one hub per slug, each with known professions and tool pages', () => {
    expect(PROFESSION_HUBS.map((h) => h.slug)).toEqual([...PROFESSION_HUB_SLUGS]);
    for (const h of PROFESSION_HUBS) {
      expect(h.professions.length, h.slug).toBeGreaterThan(0);
      for (const p of h.professions) expect(Object.keys(PROFESSION_SLUGS), `${h.slug} ${p}`).toContain(p);
      for (const t of h.tools) expect(STATIC_PAGES[t], `${h.slug} ${t}`).toBeTruthy();
    }
  });

  it('registers every hub as an indexable static page in six languages (sitemap, known route)', () => {
    for (const p of PROFESSION_HUB_PATHS) {
      expect(STATIC_PAGES[p], p).toBeTruthy();
      expect(SITEMAP_STATIC).toContain(p);
      expect(isKnownRoute(p)).toBe(true);
      for (const l of SEO_LOCALES) expect(textIn(STATIC_PAGES[p].title, l), `${p} ${l}`).toBeTruthy();
    }
  });

  it('puts hubs under the workers page in the breadcrumbs and lists the hub tools in the crawlable body', () => {
    const page = resolvePage('/for/cook', 'de', emptyData());
    expect(page.crumbs.map((c) => c.path)).toEqual(['/', '/for-workers', '/for/cook']);
    const body = renderBody('/de/for/cook', emptyData());
    expect(body).toContain('href="/de/work-scenes/restaurant-kitchen"');
  });

  it('resolves hubs by slug and path and matches canonical professions', () => {
    expect(hubBySlug('nope')).toBeNull();
    expect(hubOfPath('/for/nurse')?.slug).toBe('nurse');
    expect(hubOfPath('/for/nurse/x')).toBeNull();
    const driver = hubBySlug('truck-driver')!;
    expect(hubMatches(driver, jobProfession({ profession: null, title: { de: 'LKW-Fahrer CE (m/w/d)' } }))).toBe(true);
    expect(hubMatches(driver, jobProfession({ profession: 'Koch', title: {} }))).toBe(false);
    expect(hubMatches(hubBySlug('cook')!, jobProfession({ profession: 'Koch', title: {} }))).toBe(true);
  });

  it('is mirrored by the client data module (same slugs and professions)', () => {
    const client = readFileSync(new URL('../../../client/src/lib/professionHubs.ts', import.meta.url), 'utf8');
    for (const h of PROFESSION_HUBS) {
      expect(client, h.slug).toContain(`slug: '${h.slug}'`);
      expect(client, h.slug).toContain(`professions: [${h.professions.map((p) => `'${p}'`).join(', ')}]`);
    }
  });
});
