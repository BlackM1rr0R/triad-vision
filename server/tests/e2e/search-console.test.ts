import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asStaff } from '../helpers/api';

describe('admin: Search Console performance (/api/admin/search-console)', () => {
  it('is ADMIN+ only and shows the setup state while GSC_* is not configured', async () => {
    delete process.env.GSC_SERVICE_ACCOUNT_JSON;
    delete process.env.GSC_SITE_URL;
    expect((await anon().get('/api/admin/search-console')).status).toBe(401);
    const { agent: staff } = await asStaff();
    expect((await staff.get('/api/admin/search-console')).status).toBe(403);
    const { agent: admin } = await asAdmin();
    const res = await admin.get('/api/admin/search-console');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ configured: false, reason: 'MISSING_CREDENTIALS', siteUrl: null, serviceAccountEmail: null });
  });
});
