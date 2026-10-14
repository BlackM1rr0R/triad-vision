import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { anon, asAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { contentPayload, l10n, type ContentResource } from '../helpers/factories';
import { PNG_BUFFER } from '../helpers/files';
import { TEST_UPLOADS_DIR } from '../helpers/testEnv';

/** A field to update per resource and an invalid body that must be refused. */
const cases: Record<ContentResource, { update: Record<string, unknown>; invalid: Record<string, unknown> }> = {
  'visa-categories': { update: { title: l10n('Pflegekräfte') }, invalid: { slug: 'Has Spaces' } },
  services: { update: { audience: 'company' }, invalid: { audience: 'aliens' } },
  partners: { update: { name: 'Neue GmbH' }, invalid: { name: '' } },
  'visa-samples': { update: { visaLabel: '§16d' }, invalid: { profession: { az: 'only az' } } },
  testimonials: { update: { kind: 'candidate' }, invalid: { kind: 'robot' } },
  stats: { update: { value: 500 }, invalid: { value: 1.5 } },
  faqs: { update: { audience: 'candidate' }, invalid: { question: 'not localized' } },
  posts: { update: { published: false }, invalid: { publishedAt: 'not a date' } },
};

describe('content CRUD', () => {
  for (const [resource, spec] of Object.entries(cases) as [ContentResource, (typeof cases)[ContentResource]][]) {
    describe(resource, () => {
      const url = `/api/admin/content/${resource}`;

      it('create → list → update → delete', async () => {
        const { agent } = await asAdmin();
        expect((await agent.get(url)).body).toEqual({ items: [] });

        const body = contentPayload[resource]();
        const created = await agent.post(url).send(body);
        expect(created.status).toBe(201);
        expect(created.body.item.id).toEqual(expect.any(String));
        const id = created.body.item.id as string;

        const list = await agent.get(url);
        expect(list.status).toBe(200);
        expect(list.body.items).toHaveLength(1);
        expect(list.body.items[0].id).toBe(id);

        const updated = await agent.put(`${url}/${id}`).send(spec.update);
        expect(updated.status).toBe(200);
        expect(updated.body.item).toMatchObject({ id, ...spec.update });

        const del = await agent.delete(`${url}/${id}`);
        expect(del.status).toBe(200);
        expect(del.body).toEqual({ ok: true });
        expect((await agent.get(url)).body.items).toEqual([]);
        expect((await agent.delete(`${url}/${id}`)).status).toBe(404);
      });

      it('validates create and update bodies', async () => {
        const { agent } = await asAdmin();
        const empty = await agent.post(url).send({});
        expect(empty.status).toBe(400);
        expect(empty.body.error).toBe('VALIDATION');
        const bad = await agent.post(url).send({ ...contentPayload[resource](), ...spec.invalid });
        expect(bad.status).toBe(400);

        const id = (await agent.post(url).send(contentPayload[resource]())).body.item.id;
        expect((await agent.put(`${url}/${id}`).send(spec.invalid)).status).toBe(400);
        expect((await agent.put(`${url}/nope`).send(spec.update)).status).toBe(404);
      });
    });
  }

  it.each(['visa-categories', 'services', 'posts'] as const)('%s: duplicate slug → 409 DUPLICATE', async (resource) => {
    const { agent } = await asAdmin();
    const url = `/api/admin/content/${resource}`;
    expect((await agent.post(url).send(contentPayload[resource]({ slug: 'same-slug' }))).status).toBe(201);
    const dup = await agent.post(url).send(contentPayload[resource]({ slug: 'same-slug' }));
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('DUPLICATE');

    const other = await agent.post(url).send(contentPayload[resource]({ slug: 'other-slug' }));
    const rename = await agent.put(`${url}/${other.body.item.id}`).send({ slug: 'same-slug' });
    expect(rename.status).toBe(409);
  });

  it('unknown resources → 404 UNKNOWN_RESOURCE', async () => {
    const { agent } = await asAdmin();
    const res = await agent.get('/api/admin/content/users');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('UNKNOWN_RESOURCE');
    expect((await agent.post('/api/admin/content/users').send({})).status).toBe(404);
  });

  it('a visa category in use can be deleted; its cases keep running without it', async () => {
    const { agent } = await asAdmin();
    const visa = (await agent.post('/api/admin/content/visa-categories').send(contentPayload['visa-categories']())).body.item;
    const client = await prisma.user.create({ data: { email: 'c@test.local', passwordHash: 'x', firstName: 'C', lastName: 'L' } });
    const c = await prisma.case.create({ data: { clientId: client.id, number: 'TV-2000-0001', profession: 'Driver', visaCategoryId: visa.id } });
    expect((await agent.delete(`/api/admin/content/visa-categories/${visa.id}`)).status).toBe(200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).visaCategoryId).toBeNull();
  });

  it('published=false hides content from the public site immediately', async () => {
    const { agent } = await asAdmin();
    const post = (await agent.post('/api/admin/content/posts').send(contentPayload.posts({ slug: 'news' }))).body.item;
    expect((await anon().get('/api/public/posts')).body.posts).toHaveLength(1);
    expect((await anon().get('/api/public/posts/news')).status).toBe(200);
    await agent.put(`/api/admin/content/posts/${post.id}`).send({ published: false });
    expect((await anon().get('/api/public/posts')).body.posts).toHaveLength(0);
    expect((await anon().get('/api/public/posts/news')).status).toBe(404);
  });
});

describe('/api/admin/settings', () => {
  it('gets and upserts JSON settings, visible publicly at once', async () => {
    const { agent } = await asAdmin();
    expect((await agent.get('/api/admin/settings')).body).toEqual({ settings: {} });
    expect((await anon().get('/api/public/content')).body.settings).toEqual({});

    const contact = { phone: '+994 50 748 70 48', email: 'info@triad-vision.de' };
    const put = await agent.put('/api/admin/settings/contact').send({ value: contact });
    expect(put.status).toBe(200);
    expect(put.body.setting).toEqual({ key: 'contact', value: contact });
    await agent.put('/api/admin/settings/social.instagram').send({ value: 'https://instagram.com/triad' });
    await agent.put('/api/admin/settings/contact').send({ value: { ...contact, phone: '+49 1' } });

    const all = await agent.get('/api/admin/settings');
    expect(all.body.settings).toEqual({ contact: { ...contact, phone: '+49 1' }, 'social.instagram': 'https://instagram.com/triad' });
    expect((await anon().get('/api/public/content')).body.settings).toEqual(all.body.settings);
  });

  it('validates key and value', async () => {
    const { agent } = await asAdmin();
    const badKey = await agent.put(`/api/admin/settings/${encodeURIComponent('bad key!')}`).send({ value: 1 });
    expect(badKey.status).toBe(400);
    expect((await agent.put(`/api/admin/settings/${'k'.repeat(65)}`).send({ value: 1 })).status).toBe(400);
    const noValue = await agent.put('/api/admin/settings/contact').send({});
    expect(noValue.status).toBe(400);
    expect(noValue.body.error).toBe('VALUE_REQUIRED');
    expect(await prisma.setting.count()).toBe(0);
  });
});

describe('POST /api/admin/upload', () => {
  it.each([
    ['logo.png', 'image/png'],
    ['photo.jpg', 'image/jpeg'],
    ['photo.webp', 'image/webp'],
    ['photo.avif', 'image/avif'],
    ['icon.svg', 'image/svg+xml'],
  ])('accepts %s and serves it publicly with a locked-down CSP', async (filename, contentType) => {
    const { agent } = await asAdmin();
    const data = contentType === 'image/svg+xml' ? Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') : PNG_BUFFER;
    const res = await agent.post('/api/admin/upload').attach('file', data, { filename, contentType });
    expect(res.status).toBe(201);
    const ext = path.extname(filename);
    expect(res.body.url).toMatch(new RegExp(`^/uploads/\\d+-[0-9a-f]{24}\\${ext}$`));
    expect(fs.existsSync(path.join(TEST_UPLOADS_DIR, 'public', path.basename(res.body.url)))).toBe(true);

    const served = await anon().get(res.body.url);
    expect(served.status).toBe(200);
    expect(served.headers['content-security-policy']).toBe("default-src 'none'; style-src 'unsafe-inline'");
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers['cache-control']).toContain('max-age=604800');
  });

  it.each([
    ['doc.pdf', 'application/pdf'],
    ['page.html', 'text/html'],
    ['run.exe', 'application/x-msdownload'],
  ])('rejects %s', async (filename, contentType) => {
    const { agent } = await asAdmin();
    const res = await agent.post('/api/admin/upload').attach('file', Buffer.from('x'), { filename, contentType });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('needs a file and caps images at 8 MB', async () => {
    const { agent } = await asAdmin();
    const none = await agent.post('/api/admin/upload');
    expect(none.status).toBe(400);
    expect(none.body.error).toBe('FILE_REQUIRED');
    const big = await agent
      .post('/api/admin/upload')
      .attach('file', Buffer.alloc(8 * 1024 * 1024 + 1), { filename: 'big.png', contentType: 'image/png' });
    expect(big.status).toBe(413);
  });

  it('private case documents are not reachable through /uploads', async () => {
    const res = await anon().get('/uploads/private/anything.pdf');
    expect(res.status).toBe(404);
  });
});
