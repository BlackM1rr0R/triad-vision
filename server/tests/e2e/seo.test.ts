import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient, createPost, createService, createVisaCategory, l10n } from '../helpers/factories';

const ORIGIN = 'http://localhost:5173';

// Vacancies, companies and reviews are not wiped by resetDb (yet), so this file cleans up its own rows.
const wipeOwn = async () => {
  await prisma.review.deleteMany({ where: { caseId: { startsWith: 'seo-case-' } } });
  await prisma.vacancy.deleteMany({ where: { slug: { startsWith: 'seo-job-' } } });
  await prisma.company.deleteMany({ where: { name: { startsWith: 'SEO Co' } } });
};
beforeEach(wipeOwn);
afterEach(wipeOwn);

const day = 86_400_000;

const createJob = async (over: Record<string, unknown> = {}) => {
  const company = await prisma.company.create({ data: { name: 'SEO Co Logistik GmbH', status: 'ACTIVE', website: 'https://seo-co.example' } });
  return prisma.vacancy.create({
    data: {
      slug: `seo-job-${Math.random().toString(36).slice(2, 8)}`,
      companyId: company.id,
      title: l10n('Driver'),
      description: l10n('Drive trucks'),
      city: 'Hamburg',
      employmentType: 'FULL_TIME',
      salaryMin: 2800,
      salaryMax: 3400,
      status: 'OPEN',
      publishedAt: new Date(Date.now() - day),
      closesAt: new Date(Date.now() + 30 * day),
      ...over,
    } as never,
  });
};

const ld = (html: string) =>
  [...html.matchAll(/<script data-seo type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

describe('GET /robots.txt', () => {
  it('serves plain text with the private areas disallowed and the sitemap URL', async () => {
    const res = await anon().get('/robots.txt');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(res.text).toContain('Disallow: /admin\n');
    expect(res.text).toContain('Disallow: /api/\n');
    expect(res.text).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });
});

describe('GET /sitemap.xml', () => {
  it('lists static pages and only published/open dynamic pages with alternates', async () => {
    await createVisaCategory({ slug: 'lkw-fahrer' });
    await createVisaCategory({ slug: 'hidden-visa', published: false });
    await createService({ slug: 'recruiting' });
    await createService({ slug: 'hidden-service', published: false });
    await createPost({ slug: 'news-1' });
    await createPost({ slug: 'draft-post', published: false });
    const open = await createJob();
    const expired = await createJob({ closesAt: new Date(Date.now() - day) });
    const closed = await createJob({ status: 'CLOSED' });
    const future = await createJob({ publishedAt: new Date(Date.now() + day) });

    const res = await anon().get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/xml/);
    const xml = res.text;
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    for (const p of ['/', '/about', '/jobs', '/booking', '/impressum', '/privacy', '/visas/lkw-fahrer', '/services/recruiting', '/news/news-1', `/jobs/${open.slug}`]) {
      expect(xml).toContain(`<loc>${ORIGIN}${p === '/' ? '/' : p}</loc>`);
      expect(xml).toContain(`<loc>${ORIGIN}${p}?lng=de</loc>`);
    }
    for (const slug of ['hidden-visa', 'hidden-service', 'draft-post', expired.slug, closed.slug, future.slug]) expect(xml).not.toContain(slug);
    expect(xml).toContain(`<xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}/visas/lkw-fahrer"/>`);
    expect(xml).toContain(`<xhtml:link rel="alternate" hreflang="ru" href="${ORIGIN}/visas/lkw-fahrer?lng=ru"/>`);
    expect(xml).not.toContain('/admin');
  });

  it('is cached and refreshed after a CMS write', async () => {
    const { agent: admin } = await asAdmin();
    expect((await anon().get('/sitemap.xml')).text).not.toContain('/visas/new-visa');
    await createVisaCategory({ slug: 'new-visa' });
    // Direct DB writes are not seen until the cache expires...
    expect((await anon().get('/sitemap.xml')).text).not.toContain('/visas/new-visa');
    // ...but any admin content write clears it.
    await admin.post('/api/admin/content/faqs').send({ question: l10n('Q'), answer: l10n('A'), audience: 'all', sortOrder: 0, published: true });
    expect((await anon().get('/sitemap.xml')).text).toContain('/visas/new-visa');
  });
});

describe('GET /api/seo/head', () => {
  it('returns localized tags for a visa page', async () => {
    await createVisaCategory({ slug: 'lkw-fahrer', title: l10n('LKW'), summary: l10n('Trucks across Europe') });
    const res = await anon().get('/api/seo/head').query({ path: '/visas/lkw-fahrer', lng: 'de' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/html/);
    expect(res.headers['cache-control']).toBe('public, max-age=60, stale-while-revalidate=600');
    expect(res.text).toContain('<title data-seo>LKW de | Triad Vision</title>');
    expect(res.text).toContain('name="description" content="Trucks across Europe de"');
    expect(res.text).toContain(`rel="canonical" href="${ORIGIN}/visas/lkw-fahrer?lng=de"`);
    expect(res.text).toContain(`hreflang="x-default" href="${ORIGIN}/visas/lkw-fahrer"`);
    expect(res.text).toContain('property="og:locale" content="de_DE"');
    expect(res.text).toContain('name="twitter:card" content="summary_large_image"');
    expect(res.text).toContain('property="og:image" content="https://example.com/v.jpg"');
    const blocks = ld(res.text);
    expect(blocks.map((b) => b['@type'])).toEqual(['Organization', 'BreadcrumbList']);
    expect(blocks[1].itemListElement.map((i: { name: string }) => i.name)).toEqual(['Startseite', 'Visa', 'LKW de']);
  });

  it('defaults to az with a bare canonical and ignores unknown languages', async () => {
    const res = await anon().get('/api/seo/head').query({ path: '/faq/', lng: 'fr' });
    expect(res.text).toContain('<title data-seo>Tez-tez verilən suallar | Triad Vision</title>');
    expect(res.text).toContain(`rel="canonical" href="${ORIGIN}/faq"`);
  });

  it('adds FAQPage from published FAQs only', async () => {
    await prisma.faq.create({ data: { question: l10n('Visible Q'), answer: l10n('Visible A') } });
    await prisma.faq.create({ data: { question: l10n('Hidden Q'), answer: l10n('Hidden A'), published: false } });
    const res = await anon().get('/api/seo/head').query({ path: '/faq', lng: 'en' });
    const faq = ld(res.text).find((b) => b['@type'] === 'FAQPage');
    expect(faq.mainEntity).toEqual([{ '@type': 'Question', name: 'Visible Q en', acceptedAnswer: { '@type': 'Answer', text: 'Visible A en' } }]);
  });

  it('adds Service and NewsArticle on detail pages', async () => {
    await createService({ slug: 'recruiting', title: l10n('Recruiting') });
    await createPost({ slug: 'law', title: l10n('New law'), excerpt: l10n('What changed') });
    const svc = ld((await anon().get('/api/seo/head').query({ path: '/services/recruiting', lng: 'en' })).text);
    expect(svc.find((b) => b['@type'] === 'Service')).toMatchObject({ name: 'Recruiting en', provider: { '@id': `${ORIGIN}/#organization` } });
    const postRes = await anon().get('/api/seo/head').query({ path: '/news/law', lng: 'ru' });
    expect(postRes.text).toContain('property="og:type" content="article"');
    expect(ld(postRes.text).find((b) => b['@type'] === 'NewsArticle')).toMatchObject({
      headline: 'New law ru',
      datePublished: '2026-01-01T00:00:00.000Z',
      inLanguage: 'ru',
    });
  });

  it('adds a JobPosting for open jobs and hides the employer unless showCompany', async () => {
    const hidden = await createJob();
    const shown = await createJob({ showCompany: true, employmentType: 'AUSBILDUNG' });
    const expired = await createJob({ closesAt: new Date(Date.now() - day) });

    const a = ld((await anon().get('/api/seo/head').query({ path: `/jobs/${hidden.slug}`, lng: 'de' })).text);
    const posting = a.find((b) => b['@type'] === 'JobPosting');
    expect(posting).toMatchObject({
      title: 'Driver de',
      description: '<p>Drive trucks de</p>',
      employmentType: 'FULL_TIME',
      hiringOrganization: { name: 'Triad Vision' },
      jobLocation: { address: { addressLocality: 'Hamburg', addressCountry: 'DE' } },
      baseSalary: { currency: 'EUR', value: { minValue: 2800, maxValue: 3400, unitText: 'MONTH' } },
      directApply: true,
    });
    expect(posting.validThrough).toBeDefined();
    expect(JSON.stringify(a)).not.toContain('SEO Co');

    const b = ld((await anon().get('/api/seo/head').query({ path: `/jobs/${shown.slug}` })).text);
    expect(b.find((x) => x['@type'] === 'JobPosting')).toMatchObject({
      hiringOrganization: { name: 'SEO Co Logistik GmbH', sameAs: 'https://seo-co.example' },
      employmentType: ['FULL_TIME', 'OTHER'],
    });

    const gone = await anon().get('/api/seo/head').query({ path: `/jobs/${expired.slug}` });
    expect(gone.text).toContain('content="noindex, nofollow"');
    expect(gone.text).not.toContain('JobPosting');
  });

  it('adds an AggregateRating only with three or more approved, consented reviews', async () => {
    const { user } = await createClient();
    const review = (i: number, over: Record<string, unknown> = {}) =>
      prisma.review.create({
        data: { userId: user.id, caseId: `seo-case-${i}`, tokenHash: `seo-token-${i}`, rating: 5, consentPublish: true, status: 'APPROVED', ...over } as never,
      });
    await review(1);
    await review(2, { rating: 4 });
    await review(3, { status: 'PENDING' });
    await review(4, { consentPublish: false });
    const org = () => anon().get('/api/seo/head').query({ path: '/' }).then((r) => ld(r.text)[0]);
    expect((await org()).aggregateRating).toBeUndefined();

    await review(5, { rating: 4 });
    // The SEO data is cached; a CMS write (or the TTL) refreshes it.
    const { agent: admin } = await asAdmin();
    await admin.put('/api/admin/settings/contact').send({ value: { phone: '+49 30 1234', email: 'info@triad.test' } });
    const o = await org();
    expect(o.aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: 4.3, reviewCount: 3, bestRating: 5, worstRating: 1 });
    expect(o.contactPoint[0]).toMatchObject({ telephone: '+49 30 1234', email: 'info@triad.test' });
  });

  it('marks private areas noindex', async () => {
    const res = await anon().get('/api/seo/head').query({ path: '/admin/cases' });
    expect(res.text).toContain('content="noindex, nofollow"');
    expect(res.text).not.toContain('canonical');
  });

  it('is also served on /__seo/head for the Caddy include, outside the /api rate limit', async () => {
    const res = await anon().get('/__seo/head').query({ path: '/', lng: 'en' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('"@type":"WebSite"');
    expect(res.headers['ratelimit-policy']).toBeUndefined();
  });
});
