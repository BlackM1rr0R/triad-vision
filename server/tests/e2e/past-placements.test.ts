import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asStaff } from '../helpers/api';
import { uniq } from '../helpers/factories';
import { prisma } from '../helpers/db';
import { auditsSettled } from '../../src/lib/audit.js';

/**
 * Past placements (/api/admin/past-placements): STAFF read, ADMIN+ write; real historical numbers entered by admins
 * are added to the case-derived counts of the public map (GET /api/growth/map) with the ≥ 3 threshold on the
 * combined total; every change is audited and clears the public cache.
 */

const approvedCase = async (city: string, profession: string) => {
  const u = await prisma.user.create({ data: { email: `${uniq('pp')}@test.local`, passwordHash: 'x', firstName: 'A', lastName: 'B' } });
  const company = await prisma.company.create({ data: { name: 'Firma', city } });
  return prisma.case.create({ data: { number: uniq('TV-'), clientId: u.id, profession, status: 'APPROVED', companyId: company.id } });
};

const mapCities = async () =>
  ((await anon().get('/api/growth/map').expect(200)).body.cities as { city: string; workers: number }[]).map((c) => [c.city, c.workers]);

describe('past placements', () => {
  it('is readable by staff, writable only by admins, and validates input', async () => {
    const staff = await asStaff();
    const list = await staff.agent.get('/api/admin/past-placements').expect(200);
    expect(list.body).toMatchObject({ rows: [], total: 0, preview: { minPerCity: 3 } });
    expect(list.body.options.professions.length).toBeGreaterThan(0);
    await staff.agent.post('/api/admin/past-placements').send({ city: 'Berlin', count: 5 }).expect(403);
    await anon().get('/api/admin/past-placements').expect(401);

    const admin = await asAdmin();
    await admin.agent.post('/api/admin/past-placements').send({ city: 'Berlin', count: 0 }).expect(400);
    await admin.agent.post('/api/admin/past-placements').send({ city: 'Berlin', count: 3, profession: 'astronaut' }).expect(400);
    await admin.agent.post('/api/admin/past-placements').send({ city: 'Berlin', count: 3, year: new Date().getUTCFullYear() + 1 }).expect(400);
    await admin.agent.put('/api/admin/past-placements/nope').send({ city: 'Berlin', count: 3 }).expect(404);
    expect(await prisma.pastPlacement.count()).toBe(0);
  });

  it('adds past numbers to the case counts; only combined totals ≥ 3 are published; audited; cache cleared', async () => {
    await approvedCase('Frankfurt', 'Koch');
    await approvedCase('Frankfurt', 'Koch');
    expect(await mapCities()).toEqual([]); // 2 < 3, and the response is now cached

    const admin = await asAdmin();
    // Same city via the city table ("Frankfurt am Main" ↔ cases in "Frankfurt"): 2 + 1 = 3 → published.
    const ffm = await admin.agent
      .post('/api/admin/past-placements')
      .send({ city: 'frankfurt am main', count: 1, profession: 'cook', year: 2021, note: 'Excel archive 2019–2024' })
      .expect(201);
    expect(ffm.body.row).toMatchObject({ city: 'Frankfurt am Main', citySlug: 'frankfurt', state: 'HE', count: 1, year: 2021 });
    // Past only, two rows of one city: 1 + 1 = 2 → withheld.
    await admin.agent.post('/api/admin/past-placements').send({ city: 'Leipzig', count: 1 }).expect(201);
    const lpz = await admin.agent.post('/api/admin/past-placements').send({ city: 'Leipzig', count: 1, year: 2020 }).expect(201);

    expect(await mapCities()).toEqual([['Frankfurt', 3]]);

    // Update → Leipzig reaches 3 (2 + 1); the public map changes right away (cache cleared).
    await admin.agent.put(`/api/admin/past-placements/${lpz.body.row.id}`).send({ city: 'Leipzig', count: 2, year: 2020 }).expect(200);
    expect(await mapCities()).toEqual([
      ['Frankfurt', 3],
      ['Leipzig', 3],
    ]);

    const preview = (await admin.agent.get('/api/admin/past-placements').expect(200)).body;
    expect(preview.total).toBe(4);
    expect(preview.preview.cities.find((c: { city: string }) => c.city === 'Frankfurt')).toMatchObject({ workers: 3, computed: 2, past: 1, published: true });

    // Delete → Frankfurt back to 2 → withheld again.
    await admin.agent.delete(`/api/admin/past-placements/${ffm.body.row.id}`).expect(200);
    expect(await mapCities()).toEqual([['Leipzig', 3]]);

    await auditsSettled();
    const actions = (await prisma.auditLog.findMany({ where: { action: { startsWith: 'PAST_PLACEMENT_' } } })).map((a) => a.action).sort();
    expect(actions).toEqual(['PAST_PLACEMENT_CREATED', 'PAST_PLACEMENT_CREATED', 'PAST_PLACEMENT_CREATED', 'PAST_PLACEMENT_DELETED', 'PAST_PLACEMENT_UPDATED']);
  });
});
