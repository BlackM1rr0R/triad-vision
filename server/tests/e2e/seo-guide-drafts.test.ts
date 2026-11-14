import { describe, expect, it } from 'vitest';
import { anon, asAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { GUIDE_DRAFTS, PUBLISHED_ON_CREATE, seedGuideDrafts } from '../../prisma/seed/guideDrafts/index.js';
import { guidePlaceholders } from '../../src/lib/guides/placeholders.js';

const pathOf = (d: (typeof GUIDE_DRAFTS)[number]) => `${d.locale === 'az' ? '' : `/${d.locale}`}/guides/${d.slug}`;

describe('SEO guide drafts', () => {
  it('are seeded unpublished, once, and stay invisible to the public site and crawlers (tr/uk: published)', async () => {
    expect(await seedGuideDrafts(prisma)).toBe(GUIDE_DRAFTS.length);
    expect(await seedGuideDrafts(prisma)).toBe(0);
    const live = GUIDE_DRAFTS.filter((d) => PUBLISHED_ON_CREATE.includes(d.locale));
    const drafts = GUIDE_DRAFTS.filter((d) => !PUBLISHED_ON_CREATE.includes(d.locale));
    expect(live).toHaveLength(10);
    expect(await prisma.guidePage.count({ where: { published: true } })).toBe(live.length);
    expect(await prisma.guidePage.count({ where: { published: false } })).toBe(drafts.length);

    const sitemap = (await anon().get('/sitemaps/guides.xml')).text;
    for (const lng of ['az', 'de', 'en', 'ru']) {
      expect((await anon().get('/api/guides').query({ lng })).body.items, lng).toEqual([]);
    }
    for (const d of drafts) {
      const path = pathOf(d);
      expect(sitemap, path).not.toContain(d.slug);
      expect((await anon().get(`/api/guides/${d.slug}`).query({ lng: d.locale })).status, path).toBe(404);
      expect((await anon().get('/__seo/status').query({ path })).text, path).toBe('404');
    }
    for (const d of live) {
      const path = pathOf(d);
      expect(sitemap, path).toContain(d.slug);
      const res = await anon().get(`/api/guides/${d.slug}`).query({ lng: d.locale });
      expect(res.status, path).toBe(200);
      // hreflang by key: the tr and uk versions of a key are alternates of each other.
      const other = live.find((o) => o.key === d.key && o.locale !== d.locale)!;
      expect(res.body.guide.alternates[other.locale], path).toContain(other.slug);
      expect((await anon().get('/__seo/status').query({ path })).text, path).toBe('');
    }
  });

  it('cannot be published while review placeholders remain; published after the review', async () => {
    await seedGuideDrafts(prisma);
    // The shipped drafts are fact-checked; the owner's own edit adds a placeholder back.
    const d = GUIDE_DRAFTS[0];
    expect(guidePlaceholders(d)).toEqual([]);
    const seeded = await prisma.guidePage.findUniqueOrThrow({ where: { key_locale: { key: d.key, locale: d.locale } } });
    const row = await prisma.guidePage.update({ where: { id: seeded.id }, data: { body: `${seeded.body}

Fee [PRÜFEN: 411 €] confirmed.` } });
    const { agent: admin } = await asAdmin();

    const refused = await admin.put(`/api/admin/guides/${row.id}`).send({ published: true });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('GUIDE_HAS_PLACEHOLDERS');

    const clean = (s: string) => s.replace(/\s?\[(?:YOXLA|PRÜFEN|ПРОВЕРИТЬ|CHECK):[^\]]*\]/g, '');
    const ok = await admin.put(`/api/admin/guides/${row.id}`).send({
      published: true,
      title: clean(row.title),
      description: clean(row.description),
      body: clean(row.body),
      faq: (row.faq as { q: string; a: string }[]).map((f) => ({ q: clean(f.q), a: clean(f.a) })),
    });
    expect(ok.status).toBe(200);

    const path = pathOf(d);
    expect((await anon().get('/__seo/status').query({ path })).text).toBe('');
    expect((await anon().get('/sitemaps/guides.xml')).text).toContain(d.slug);
  });
});
