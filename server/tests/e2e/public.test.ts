import { describe, expect, it } from 'vitest';
import { anon, asAdmin } from '../helpers/api';
import { emailsTo, prisma } from '../helpers/db';
import { ADMIN_INBOX } from '../helpers/testEnv';
import { contentPayload, createPost, createService, createVisaCategory, l10n } from '../helpers/factories';
import { staffNotifications } from '../helpers/notify';

const seedContent = async () => {
  const v1 = await createVisaCategory({ slug: 'lkw', sortOrder: 2 });
  const v0 = await createVisaCategory({ slug: 'pflege', sortOrder: 1 });
  await createVisaCategory({ slug: 'hidden-visa', published: false });
  await createService({ slug: 'recruiting', sortOrder: 0 });
  await createService({ slug: 'hidden-service', published: false });
  await prisma.partner.create({ data: contentPayload.partners({ name: 'Visible' }) as never });
  await prisma.partner.create({ data: contentPayload.partners({ name: 'Hidden', published: false }) as never });
  await prisma.visaSample.create({ data: contentPayload['visa-samples']() as never });
  await prisma.visaSample.create({ data: contentPayload['visa-samples']({ published: false }) as never });
  await prisma.testimonial.create({ data: contentPayload.testimonials() as never });
  await prisma.testimonial.create({ data: contentPayload.testimonials({ published: false }) as never });
  await prisma.faq.create({ data: contentPayload.faqs() as never });
  await prisma.faq.create({ data: contentPayload.faqs({ published: false }) as never });
  await prisma.stat.create({ data: contentPayload.stats({ sortOrder: 1, value: 2 }) as never });
  await prisma.stat.create({ data: contentPayload.stats({ sortOrder: 0, value: 1 }) as never });
  for (let i = 1; i <= 8; i++) {
    await createPost({ slug: `post-${i}`, publishedAt: new Date(Date.UTC(2026, 0, i)) });
  }
  await createPost({ slug: 'draft', published: false, publishedAt: new Date(Date.UTC(2027, 0, 1)) });
  await prisma.setting.create({ data: { key: 'contact', value: { phone: '+994 50 748 70 48' } } });
  return { v0, v1 };
};

describe('GET /api/public/content', () => {
  it('returns empty collections on an empty database', async () => {
    const res = await anon().get('/api/public/content');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      stats: [],
      visaCategories: [],
      services: [],
      partners: [],
      samples: [],
      testimonials: [],
      faqs: [],
      posts: [],
      settings: {},
    });
  });

  it('returns only published content, sorted, with settings as a map and cache headers', async () => {
    const { v0, v1 } = await seedContent();
    const res = await anon().get('/api/public/content');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60, stale-while-revalidate=600');
    const b = res.body;
    expect(b.visaCategories.map((v: { id: string }) => v.id)).toEqual([v0.id, v1.id]);
    expect(b.services.map((s: { slug: string }) => s.slug)).toEqual(['recruiting']);
    expect(b.partners.map((p: { name: string }) => p.name)).toEqual(['Visible']);
    expect(b.samples).toHaveLength(1);
    expect(b.testimonials).toHaveLength(1);
    expect(b.faqs).toHaveLength(1);
    expect(b.stats.map((s: { value: number }) => s.value)).toEqual([1, 2]);
    // latest 6 published posts, newest first, without body
    expect(b.posts.map((p: { slug: string }) => p.slug)).toEqual(['post-8', 'post-7', 'post-6', 'post-5', 'post-4', 'post-3']);
    expect(b.posts[0].body).toBeUndefined();
    expect(b.settings).toEqual({ contact: { phone: '+994 50 748 70 48' } });
  });

  it('is cached in memory until an admin write clears it', async () => {
    const svc = await createService({ slug: 'cached', title: l10n('Original') });
    expect((await anon().get('/api/public/services')).body.services[0].title.en).toBe('Original en');

    // a direct DB edit is not visible yet: the response comes from the cache
    await prisma.service.update({ where: { id: svc.id }, data: { summary: l10n('Direct') } });
    expect((await anon().get('/api/public/services')).body.services[0].summary.en).toBe('Summary en');

    const { agent } = await asAdmin();
    const put = await agent.put(`/api/admin/content/services/${svc.id}`).send({ title: l10n('Renamed') });
    expect(put.status).toBe(200);

    const after = await anon().get('/api/public/services');
    expect(after.body.services[0].title.en).toBe('Renamed en');
    expect(after.body.services[0].summary.en).toBe('Direct en');
    expect((await anon().get('/api/public/content')).body.services[0].title.en).toBe('Renamed en');
  });

  it('a rejected admin write does not clear the cache, settings writes do', async () => {
    const svc = await createService({ slug: 'cached2', title: l10n('One') });
    await anon().get('/api/public/content');
    await prisma.service.update({ where: { id: svc.id }, data: { title: l10n('Two') } });
    const { agent } = await asAdmin();

    expect((await agent.put(`/api/admin/content/services/${svc.id}`).send({ slug: 'Bad Slug' })).status).toBe(400);
    expect((await anon().get('/api/public/content')).body.services[0].title.en).toBe('One en');

    expect((await agent.put('/api/admin/settings/contact').send({ value: { email: 'info@test.local' } })).status).toBe(200);
    const fresh = (await anon().get('/api/public/content')).body;
    expect(fresh.services[0].title.en).toBe('Two en');
    expect(fresh.settings.contact).toEqual({ email: 'info@test.local' });
  });
});

describe('GET /api/public/visa/:slug', () => {
  it('returns a published visa category, 404 for unpublished or missing', async () => {
    await seedContent();
    const ok = await anon().get('/api/public/visa/lkw');
    expect(ok.status).toBe(200);
    expect(ok.body.visa).toMatchObject({ slug: 'lkw', title: l10n('Visa') });
    expect((await anon().get('/api/public/visa/hidden-visa')).status).toBe(404);
    const missing = await anon().get('/api/public/visa/nope');
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('NOT_FOUND');
  });
});

describe('services', () => {
  it('lists published services and returns one by slug', async () => {
    await seedContent();
    const list = await anon().get('/api/public/services');
    expect(list.status).toBe(200);
    expect(list.body.services.map((s: { slug: string }) => s.slug)).toEqual(['recruiting']);
    const one = await anon().get('/api/public/services/recruiting');
    expect(one.status).toBe(200);
    expect(one.body.service).toMatchObject({ slug: 'recruiting', features: { en: ['Feature en'] } });
    expect((await anon().get('/api/public/services/hidden-service')).status).toBe(404);
    expect((await anon().get('/api/public/services/nope')).status).toBe(404);
  });
});

describe('posts', () => {
  it('lists all published posts newest first without bodies', async () => {
    await seedContent();
    const res = await anon().get('/api/public/posts');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('max-age=60');
    expect(res.body.posts).toHaveLength(8);
    expect(res.body.posts[0].slug).toBe('post-8');
    expect(res.body.posts.some((p: { slug: string }) => p.slug === 'draft')).toBe(false);
    expect(res.body.posts[0].body).toBeUndefined();
  });

  it('returns one published post with its body, 404 for drafts and unknown slugs', async () => {
    await seedContent();
    const res = await anon().get('/api/public/posts/post-3');
    expect(res.status).toBe(200);
    expect(res.body.post).toMatchObject({ slug: 'post-3', body: l10n('Body') });
    expect((await anon().get('/api/public/posts/draft')).status).toBe(404);
    expect((await anon().get('/api/public/posts/nope')).status).toBe(404);
  });
});

// The inquiry limiter allows 10 requests per hour per IP in this file's app instance.
describe('POST /api/public/inquiries', () => {
  it('stores a company inquiry and notifies the admins and the admin inbox', async () => {
    const admin = await asAdmin();
    const res = await anon().post('/api/public/inquiries').send({
      kind: 'company',
      companyName: 'Müller Logistik GmbH',
      contactName: 'Hans Müller',
      email: 'hans@mueller.de',
      phone: '+49 30 123',
      sector: 'Logistik',
      workersNeeded: '12',
      message: 'Wir suchen 12 LKW-Fahrer.',
      locale: 'de',
      website: '',
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, id: expect.any(String) });

    const row = await prisma.inquiry.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row).toMatchObject({ kind: 'company', companyName: 'Müller Logistik GmbH', workersNeeded: 12, status: 'NEW', locale: 'de' });

    const [n] = await staffNotifications(admin.user.id);
    expect(n.title).toBe('Yeni əməkdaşlıq təklifi: Müller Logistik GmbH');
    expect(n.body).toContain('Lazım olan işçi sayı: 12');
    expect(n.link).toBe('/admin/inquiries');
    const mails = await emailsTo(ADMIN_INBOX);
    expect(mails.some((m) => m.subject === '[Triad Vision] Yeni əməkdaşlıq təklifi: Müller Logistik GmbH')).toBe(true);
  });

  it('a company inquiry without a company name is titled by the contact name', async () => {
    const admin = await asAdmin();
    const res = await anon()
      .post('/api/public/inquiries')
      .send({ kind: 'company', contactName: 'Hans Müller', email: 'hans@test.local', message: 'Wir suchen Fahrer.' });
    expect(res.status).toBe(201);
    expect((await staffNotifications(admin.user.id))[0].title).toBe('Yeni əməkdaşlıq təklifi: Hans Müller');
  });

  it('stores a contact message with the default locale', async () => {
    const res = await anon()
      .post('/api/public/inquiries')
      .send({ kind: 'contact', contactName: 'Aysel', email: 'aysel@test.local', message: 'Salam, sualım var.' });
    expect(res.status).toBe(201);
    expect(await prisma.inquiry.findUniqueOrThrow({ where: { id: res.body.id } })).toMatchObject({
      kind: 'contact',
      locale: 'az',
      companyName: null,
    });
  });

  it.each([
    ['unknown kind', { kind: 'spam', contactName: 'Ab', email: 'a@test.local', message: 'hello there' }],
    ['invalid email', { kind: 'contact', contactName: 'Ab', email: 'nope', message: 'hello there' }],
    ['too short message', { kind: 'contact', contactName: 'Ab', email: 'a@test.local', message: 'hi' }],
    ['zero workers', { kind: 'company', contactName: 'Ab', email: 'a@test.local', message: 'hello there', workersNeeded: 0 }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await anon().post('/api/public/inquiries').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
    expect(await prisma.inquiry.count()).toBe(0);
  });
});
