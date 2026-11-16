import { describe, expect, it } from 'vitest';
import { prisma } from '../helpers/db';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { uniq } from '../helpers/factories';
import { createCompany } from './vacancies.fixtures';

/** A placed worker (approved case) with a signed contract in a city of its own (keeps this file's groups apart). */
const placed = async (city: string, gross: number, over: { profession?: string; status?: 'APPROVED' | 'DECISION_PENDING'; signed?: boolean } = {}) => {
  const company = await createCompany({ city });
  const worker = await asClient({ firstName: 'Elvin', lastName: 'Həsənov' });
  const c = await prisma.case.create({
    data: { number: uniq('TV-'), clientId: worker.user.id, profession: over.profession ?? 'LKW-Fahrer CE', companyId: company.id, status: over.status ?? 'APPROVED' },
  });
  await prisma.employmentContract.create({
    data: { caseId: c.id, companyId: company.id, grossMonthly: gross, weeklyHours: 40, signedAt: over.signed === false ? null : new Date('2026-05-01') },
  });
  return { c, worker };
};

type Group = { profession: string; city: string | null; p25: number; median: number; p75: number; band: string };
const groupOf = (body: { groups: Group[] }, city: string) => body.groups.find((g) => g.city === city);

describe('real salaries: public ranges with k-anonymity', () => {
  it('publishes a city group only from 3 distinct workers, as rounded ranges with a band', async () => {
    const admin = await asAdmin();
    const city = `Salzstadt${uniq('')}`;
    await placed(city, 2810);
    await placed(city, 3020);

    let res = await admin.agent.post('/api/admin/real-salaries/recompute');
    expect(res.status).toBe(200);
    let pub = await anon().get('/api/real-salaries');
    expect(pub.status).toBe(200);
    expect(pub.body.kMin).toBe(3);
    expect(groupOf(pub.body, city)).toBeUndefined();

    const third = await placed(city, 3390);
    // An unsigned contract of a case without a visa decision does not count.
    await placed(city, 9000, { status: 'DECISION_PENDING', signed: false });
    res = await admin.agent.post('/api/admin/real-salaries/recompute');
    expect(res.status).toBe(200);
    pub = await anon().get('/api/real-salaries');
    expect(groupOf(pub.body, city)).toEqual({ profession: 'truck_driver', city, state: null, p25: 2900, median: 3000, p75: 3200, band: '3-5' });
    const text = JSON.stringify(pub.body);
    expect(text).not.toContain('2810');
    expect(text).not.toContain('3390');
    expect(text).not.toContain(third.c.id);

    // Staff exclude a record: after the next snapshot the group falls below k and disappears.
    const staff = await asStaff();
    expect((await staff.agent.post('/api/admin/real-salaries/exclusions').send({ caseId: third.c.id, reason: 'test' })).status).toBe(200);
    const overview = await staff.agent.get('/api/admin/real-salaries');
    expect(overview.status).toBe(200);
    expect(overview.body.records.find((r: { caseId: string }) => r.caseId === third.c.id)).toMatchObject({ excluded: true, skip: 'EXCLUDED' });
    // Only ADMIN+ recompute.
    expect((await staff.agent.post('/api/admin/real-salaries/recompute')).status).toBe(403);
    await admin.agent.post('/api/admin/real-salaries/recompute').expect(200);
    expect(groupOf((await anon().get('/api/real-salaries')).body, city)).toBeUndefined();

    expect((await staff.agent.delete(`/api/admin/real-salaries/exclusions/${third.c.id}`)).status).toBe(200);
    await admin.agent.post('/api/admin/real-salaries/recompute').expect(200);
    expect(groupOf((await anon().get('/api/real-salaries')).body, city)).toBeDefined();
  });

  it('hides a group in which one value dominates', async () => {
    const admin = await asAdmin();
    const city = `Gleichstadt${uniq('')}`;
    await placed(city, 3000, { profession: 'Elektriker' });
    await placed(city, 3010, { profession: 'Elektriker' });
    await placed(city, 3600, { profession: 'Elektriker' });
    await admin.agent.post('/api/admin/real-salaries/recompute').expect(200);
    expect(groupOf((await anon().get('/api/real-salaries')).body, city)).toBeUndefined();
    const overview = (await admin.agent.get('/api/admin/real-salaries')).body;
    const g = overview.groups.find((x: { city: string | null }) => x.city === city);
    expect(g).toMatchObject({ profession: 'electrician', workers: 3, result: { suppressed: 'DOMINANT_VALUE' } });
  });

  it('keeps the staff view and exclusions away from clients and anonymous visitors', async () => {
    const client = await asClient();
    expect((await client.agent.get('/api/admin/real-salaries')).status).toBe(403);
    expect((await anon().get('/api/admin/real-salaries')).status).toBe(401);
    expect((await client.agent.post('/api/admin/real-salaries/exclusions').send({ caseId: 'x' })).status).toBe(403);
  });
});
