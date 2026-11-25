import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db';
import { anon, asAdmin, asStaff } from '../helpers/api';
import { resetDb } from '../helpers/db';

describe('admin: Search Console explore, keyword tracker and sitemaps (not configured)', () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.GSC_SERVICE_ACCOUNT_JSON;
    delete process.env.GSC_SERVICE_ACCOUNT_FILE;
    delete process.env.GSC_SITE_URL;
  });

  it('is ADMIN+ only on every endpoint', async () => {
    const { agent: staff } = await asStaff();
    for (const url of ['/api/admin/search-console/explore', '/api/admin/search-console/keywords', '/api/admin/search-console/sitemaps']) {
      expect((await anon().get(url)).status, url).toBe(401);
      expect((await staff.get(url)).status, url).toBe(403);
    }
    expect((await staff.post('/api/admin/search-console/keywords').send({ keyword: 'almaniyada iş' })).status).toBe(403);
    expect((await staff.post('/api/admin/search-console/sitemaps/submit')).status).toBe(403);
  });

  it('shows the setup state and refuses to submit without credentials', async () => {
    const { agent: admin } = await asAdmin();
    const expected = { configured: false, reason: 'MISSING_CREDENTIALS', siteUrl: null, serviceAccountEmail: null };
    expect((await admin.get('/api/admin/search-console/explore')).body).toEqual(expected);
    expect((await admin.get('/api/admin/search-console/sitemaps')).body).toEqual(expected);
    expect((await admin.post('/api/admin/search-console/sitemaps/submit')).status).toBe(409);
  });

  it('keeps a keyword list without credentials: add, duplicate, validation, remove', async () => {
    const { agent: admin } = await asAdmin();
    const add = await admin.post('/api/admin/search-console/keywords').send({ keyword: '  Almaniyada   iş ', country: 'AZ' });
    expect(add.status).toBe(201);
    expect(add.body.synced).toBe(false);
    expect(add.body.keywords).toHaveLength(1);
    expect(add.body.keywords[0]).toMatchObject({ keyword: 'almaniyada iş', country: 'AZ', lastSyncedAt: null, days: [] });
    expect((await admin.post('/api/admin/search-console/keywords').send({ keyword: 'almaniyada iş', country: 'AZ' })).status).toBe(409);
    expect((await admin.post('/api/admin/search-console/keywords').send({ keyword: 'x' })).status).toBe(400);
    expect((await admin.post('/api/admin/search-console/keywords').send({ keyword: 'valid word', country: 'XX' })).status).toBe(400);
    const id = add.body.id as string;
    expect((await admin.get('/api/admin/search-console/keywords')).body.keywords).toHaveLength(1);
    expect((await admin.delete(`/api/admin/search-console/keywords/${id}`)).status).toBe(200);
    expect(await prisma.searchKeyword.count()).toBe(0);
    expect((await admin.delete(`/api/admin/search-console/keywords/${id}`)).status).toBe(404);
  });
});
