import { beforeEach, describe, expect, it } from 'vitest';
import { anon } from '../helpers/api';
import { uniq } from '../helpers/factories';
import { prisma } from '../helpers/db';
import { clearCache } from '../../src/lib/cache.js';

// Home counters: GET /api/growth/home-stats = placement map total (cities >= 3 workers) + open vacancies. Counts only.

const vacancy = (over: Record<string, unknown> = {}) =>
  prisma.vacancy.create({ data: { slug: uniq('hs-'), title: { az: 'x' }, description: { az: 'x' }, status: 'OPEN', ...over } });

describe('GET /api/growth/home-stats', () => {
  beforeEach(() => clearCache());

  it('counts open vacancies (not closed or expired ones) and hides the placed figure below the privacy threshold', async () => {
    await vacancy();
    await vacancy();
    await vacancy({ status: 'CLOSED' });
    await vacancy({ closesAt: new Date(Date.now() - 86_400_000) });

    const res = await anon().get('/api/growth/home-stats').expect(200);
    expect(res.headers['cache-control']).toContain('max-age=300');
    expect(res.body).toEqual({ placed: null, vacancies: 2 });
  });

  it('shows the placed total once cities reach 3 workers, and nothing personal', async () => {
    for (let i = 0; i < 3; i++) {
      const u = await prisma.user.create({ data: { email: `${uniq('hs')}@test.local`, passwordHash: 'x', firstName: 'A', lastName: 'B' } });
      const company = await prisma.company.create({ data: { name: 'Firma', city: 'Hamburg' } });
      await prisma.case.create({ data: { number: uniq('TV-'), clientId: u.id, profession: 'Koch', status: 'APPROVED', companyId: company.id } });
    }
    const res = await anon().get('/api/growth/home-stats').expect(200);
    expect(res.body.placed).toBe(3);
    expect(Object.keys(res.body).sort()).toEqual(['placed', 'vacancies']);
  });
});
