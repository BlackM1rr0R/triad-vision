import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { contentPayload, createPost, l10n } from '../helpers/factories';
import { seedGuides, GUIDES } from '../../prisma/seed/guides/index.js';

const ORIGIN = 'http://localhost:5173';

const ld = (html: string) =>
  [...html.matchAll(/<script data-seo type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

const createGuide = (over: Record<string, unknown> = {}) =>
  prisma.guidePage.create({
    data: {
      key: 'chancenkarte',
      locale: 'de',
      slug: 'chancenkarte-deutschland',
      title: 'Chancenkarte 2026',
      description: 'Alles zur Chancenkarte: Voraussetzungen, Punkte, Antrag und Arbeit in Deutschland.',
      body: '## Voraussetzungen\n\nText mit [Termin](/booking) und [Blaue Karte](guide:blue-card).\n\n## Punkte\n\n| A | B |\n|---|---|\n| 1 | 2 |',
      faq: [{ q: 'Wie viele Punkte?', a: 'Mindestens 6.' }],
      ...over,
    } as never,
  });

describe('public guides API', () => {
  it('lists the guides of a language and renders one with TOC, FAQ, alternates and related guides', async () => {
    await createGuide();
    await createGuide({ locale: 'tr', slug: 'almanya-firsat-karti', title: 'Fırsat Kartı 2026' });
    await createGuide({ key: 'blue-card', slug: 'blaue-karte-eu', title: 'Blaue Karte EU 2026' });
    await createGuide({ key: 'hidden', slug: 'versteckt', title: 'Versteckt', published: false });

    const list = await anon().get('/api/guides').query({ lng: 'de' });
    expect(list.status).toBe(200);
    expect(list.body.items.map((g: { slug: string }) => g.slug).sort()).toEqual(['blaue-karte-eu', 'chancenkarte-deutschland']);
    expect(list.body.items[0].path).toMatch(/^\/de\/guides\//);

    const res = await anon().get('/api/guides/chancenkarte-deutschland').query({ lng: 'de' });
    expect(res.status).toBe(200);
    const g = res.body.guide;
    expect(g.toc).toEqual([
      { id: 'voraussetzungen', text: 'Voraussetzungen' },
      { id: 'punkte', text: 'Punkte' },
    ]);
    expect(g.html).toContain('href="/de/booking"');
    expect(g.html).toContain('href="/de/guides/blaue-karte-eu"');
    expect(g.faq).toEqual([{ q: 'Wie viele Punkte?', a: 'Mindestens 6.' }]);
    expect(g.alternates).toEqual({ de: '/de/guides/chancenkarte-deutschland', tr: '/tr/guides/almanya-firsat-karti' });
    expect(g.related.map((r: { slug: string }) => r.slug)).toEqual(['blaue-karte-eu']);
  });

  it('redirects a slug of another language to the requested language and 404s unknown or hidden guides', async () => {
    await createGuide();
    await createGuide({ locale: 'tr', slug: 'almanya-firsat-karti' });
    await createGuide({ key: 'hidden', slug: 'versteckt', published: false });
    expect((await anon().get('/api/guides/chancenkarte-deutschland').query({ lng: 'tr' })).body).toEqual({ redirect: '/tr/guides/almanya-firsat-karti' });
    expect((await anon().get('/api/guides/nope').query({ lng: 'de' })).status).toBe(404);
    expect((await anon().get('/api/guides/versteckt').query({ lng: 'de' })).status).toBe(404);
  });
});

describe('admin guides CMS', () => {
  const body = {
    key: 'pflege',
    locale: 'uk',
    slug: 'robota-medsestroiu',
    title: 'Робота медсестрою 2026',
    description: 'Визнання диплома, мова, віза та зарплата медсестри в Німеччині — докладний посібник.',
    body: '## Визнання\n\nТекст.',
    faq: [{ q: 'Яка мова?', a: 'Зазвичай B2.' }],
    published: true,
  };

  it('creates, previews, updates and deletes language versions (ADMIN only) and refreshes the public site', async () => {
    const { agent: admin } = await asAdmin();
    const { agent: staff } = await asStaff();
    expect((await staff.get('/api/admin/guides')).status).toBe(403);

    expect((await anon().get('/api/guides').query({ lng: 'uk' })).body.items).toEqual([]);
    const created = await admin.post('/api/admin/guides').send(body);
    expect(created.status).toBe(201);
    // The public cache was cleared by the write.
    expect((await anon().get('/api/guides').query({ lng: 'uk' })).body.items).toHaveLength(1);

    expect((await admin.post('/api/admin/guides').send({ ...body, key: 'other-topic' })).body.error).toBe('GUIDE_SLUG_TAKEN');
    expect((await admin.post('/api/admin/guides').send({ ...body, slug: 'insha-adresa' })).body.error).toBe('GUIDE_LOCALE_EXISTS');
    expect((await admin.post('/api/admin/guides').send({ ...body, locale: 'fr' })).status).toBe(400);
    expect((await admin.post('/api/admin/guides').send({ ...body, slug: 'Bad Slug' })).status).toBe(400);

    const preview = await admin.post('/api/admin/guides/preview').send({ body: '## Hi <b>\n\n[x](/jobs)', locale: 'uk' });
    expect(preview.body.html).toContain('href="/uk/jobs"');
    expect(preview.body.html).toContain('&lt;b&gt;');

    const id = created.body.item.id;
    const updated = await admin.put(`/api/admin/guides/${id}`).send({ title: 'Нова назва', published: false });
    expect(updated.body.item).toMatchObject({ title: 'Нова назва', published: false });
    expect((await anon().get('/api/guides').query({ lng: 'uk' })).body.items).toEqual([]);

    expect((await admin.get('/api/admin/guides')).body.items[0]).toMatchObject({ key: 'pflege', locale: 'uk', path: '/uk/guides/robota-medsestroiu' });
    expect((await admin.delete(`/api/admin/guides/${id}`)).status).toBe(200);
    expect((await admin.get(`/api/admin/guides/${id}`)).status).toBe(404);
  });
});

describe('guide seed', () => {
  it('creates every language version once and never re-creates or overwrites edited / deleted ones', async () => {
    const created = await seedGuides(prisma);
    expect(created).toBe(36);
    expect(await prisma.guidePage.count()).toBe(36);
    const one = await prisma.guidePage.findFirstOrThrow({ where: { key: 'chancenkarte', locale: 'tr' } });
    expect(one.slug).toBe(GUIDES.find((g) => g.key === 'chancenkarte')!.pages.tr.slug);
    await prisma.guidePage.update({ where: { id: one.id }, data: { title: 'Edited' } });
    await prisma.guidePage.deleteMany({ where: { key: 'pflege', locale: 'de' } });
    expect(await seedGuides(prisma)).toBe(0);
    expect((await prisma.guidePage.findUniqueOrThrow({ where: { id: one.id } })).title).toBe('Edited');
    expect(await prisma.guidePage.count({ where: { key: 'pflege', locale: 'de' } })).toBe(0);
  });
});

describe('guide pages in head, body, sitemap and RSS', () => {
  it('serves guide head tags, crawlable body, the guides sitemap and RSS items', async () => {
    await createGuide();
    await createGuide({ locale: 'az', slug: 'almaniya-imkan-karti', title: 'İmkan Kartı 2026' });

    const head = await anon().get('/__seo/head').query({ path: '/de/guides/chancenkarte-deutschland' });
    expect(head.text).toContain(`rel="canonical" href="${ORIGIN}/de/guides/chancenkarte-deutschland"`);
    expect(head.text).toContain(`hreflang="az" href="${ORIGIN}/guides/almaniya-imkan-karti"`);
    expect(ld(head.text).map((b) => b['@type'])).toEqual(['Organization', 'BreadcrumbList', 'Article', 'FAQPage']);

    const body = await anon().get('/__seo/body').query({ path: '/de/guides/chancenkarte-deutschland' });
    expect(body.status).toBe(200);
    expect(body.headers['content-type']).toMatch(/^text\/html/);
    expect(body.text).toContain('<h1>Chancenkarte 2026</h1>');
    expect(body.text).toContain('<h2 id="voraussetzungen">Voraussetzungen</h2>');
    expect(body.text).toContain('Wie viele Punkte?');
    expect(body.headers['ratelimit-policy']).toBeUndefined();
    expect((await anon().get('/__seo/body').query({ path: '/admin' })).text).toBe('');

    const sm = await anon().get('/sitemaps/guides.xml');
    expect(sm.text).toContain(`<loc>${ORIGIN}/de/guides/chancenkarte-deutschland</loc>`);
    expect(sm.text).toContain(`hreflang="x-default" href="${ORIGIN}/guides/almaniya-imkan-karti"`);

    const rss = await anon().get('/de/rss.xml');
    expect(rss.status).toBe(200);
    expect(rss.headers['content-type']).toMatch(/^application\/rss\+xml/);
    expect(rss.text).toContain('Chancenkarte 2026');
    expect((await anon().get('/rss.xml').query({ lang: 'de' })).text).toContain('Chancenkarte 2026');
    expect((await anon().get('/xx/rss.xml')).status).toBe(404);
  });
});

describe('content SEO fields', () => {
  it('saves overrides from the admin, uses them in the head and drops noindex items from the sitemap', async () => {
    const { agent: admin } = await asAdmin();
    const res = await admin.post('/api/admin/content/posts').send(
      contentPayload.posts({
        slug: 'seo-post',
        seoTitle: { az: 'Xüsusi başlıq', de: 'Eigener Titel', en: '', ru: '' },
        seoDescription: { de: 'Eigene Beschreibung für Google' },
        ogImage: '/uploads/public/og.png',
        noindex: false,
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.item.seoTitle).toMatchObject({ de: 'Eigener Titel' });
    const head = await anon().get('/api/seo/head').query({ path: '/de/news/seo-post' });
    expect(head.text).toContain('<title data-seo>Eigener Titel</title>');
    expect(head.text).toContain('name="description" content="Eigene Beschreibung für Google"');
    expect(head.text).toContain(`property="og:image" content="${ORIGIN}/uploads/public/og.png"`);
    expect((await anon().get('/sitemaps/content.xml')).text).toContain('/news/seo-post');

    await admin.put(`/api/admin/content/posts/${res.body.item.id}`).send({ noindex: true, seoTitle: null });
    expect((await anon().get('/sitemaps/content.xml')).text).not.toContain('/news/seo-post');
    expect((await anon().get('/api/seo/head').query({ path: '/news/seo-post' })).text).toContain('noindex, nofollow');
    expect((await admin.post('/api/admin/content/posts').send(contentPayload.posts({ ogImage: 'javascript:alert(1)' }))).status).toBe(400);
  });
});

describe('Open Graph cards, Blue Card thresholds and client config', () => {
  it('renders a PNG title card for existing pages only', async () => {
    await createPost({ slug: 'og-post', title: l10n('Neues Gesetz 2026') });
    const res = await anon().get('/og/news/de/og-post.png');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toContain('max-age=86400');
    const png = res.body as Buffer;
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect((await anon().get('/og/news/de/missing.png')).status).toBe(404);
    expect((await anon().get('/og/evil/de/og-post.png')).status).toBe(404);
  });

  it('exposes the admin-maintained Blue Card thresholds', async () => {
    const res = await anon().get('/api/seo/blue-card');
    expect(res.status).toBe(200);
    expect(res.body.thresholds['2026']).toEqual({ standard: 50_700, shortage: 45_934.2 });
    expect(res.body.year).toBe('2026');
  });

  it('returns the GA4 id only when one is configured and valid', async () => {
    expect((await anon().get('/api/seo/config')).body).toEqual({ ga4Id: null });
    const { agent: admin } = await asAdmin();
    await prisma.setting.create({ data: { key: 'analytics', value: { ga4Id: 'G-ABC123XYZ' } } });
    await admin.post('/api/admin/content/faqs').send({ question: l10n('Q'), answer: l10n('A'), audience: 'all', sortOrder: 0, published: true }); // clears the cache
    expect((await anon().get('/api/seo/config')).body).toEqual({ ga4Id: 'G-ABC123XYZ' });
  });
});
