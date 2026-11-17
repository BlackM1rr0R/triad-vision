import { beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';
import { asCandidate, asCompany, cleanJobs, createVacancy } from './vacancies.fixtures';

/**
 * Free places per vacancy and "clients can only apply to active vacancies" (lib/vacancyPlaces):
 *   - places on the public board (list / detail / options), full vacancies listed last, never hidden;
 *   - apply / start a case: 404 VACANCY_NOT_FOUND, 409 VACANCY_CLOSED, 409 VACANCY_FULL; the last place cannot be
 *     taken twice (employer accepts two candidates at the same moment);
 *   - the admin setting (default ON in production; the test env starts with the old behaviour) and the external
 *     "apply via Triad Vision" switch.
 */

beforeEach(cleanJobs);

const setPolicy = async (body: Record<string, boolean>) => {
  const admin = await asAdmin();
  return expectStatus(await admin.agent.put('/api/admin/vacancies/policy').send(body), 200).body.policy;
};

describe('free places on the public board', () => {
  it('shows positions / filled / free; full vacancies stay listed after the open ones', async () => {
    const full = await createVacancy({ slug: 'full-job', positions: 1, publishedAt: new Date() });
    const open = await createVacancy({ slug: 'open-job', positions: 3, publishedAt: new Date(Date.now() - 60_000) });
    const accepted = await asCandidate();
    await prisma.vacancyApplication.create({ data: { vacancyId: full.id, userId: accepted.user.id, status: 'ACCEPTED' } });
    // NEW / SHORTLISTED applications do not occupy a place; a case at contract stage does (once per person).
    const other = await asCandidate();
    await prisma.vacancyApplication.create({ data: { vacancyId: open.id, userId: other.user.id, status: 'SHORTLISTED' } });

    const list = expectStatus(await anon().get('/api/vacancies'), 200).body;
    expect(list.items.map((v: { slug: string }) => v.slug)).toEqual(['open-job', 'full-job']); // newest first, but full last
    expect(list.items[0]).toMatchObject({ positions: 3, filled: 0, free: 3 });
    expect(list.items[1]).toMatchObject({ positions: 1, filled: 1, free: 0 });
    expect(list.total).toBe(2);

    const detail = expectStatus(await anon().get('/api/vacancies/full-job'), 200).body.vacancy;
    expect(detail).toMatchObject({ positions: 1, filled: 1, free: 0 });

    const options = expectStatus(await anon().get('/api/vacancies/options'), 200).body.items;
    expect(options.map((v: { id: string; free: number }) => [v.id, v.free])).toEqual([
      [open.id, 3],
      [full.id, 0],
    ]);
    expect(options[0]).not.toHaveProperty('filledAdjustment');
  });

  it('staff correction (filledAdjustment) changes the count; employers cannot set it', async () => {
    const staff = await asStaff();
    const v = await createVacancy({ positions: 4 });
    expectStatus(await staff.agent.patch(`/api/admin/vacancies/${v.id}`).send({ filledAdjustment: 3 }), 200);
    expect(expectStatus(await staff.agent.get(`/api/admin/vacancies/${v.id}`), 200).body.vacancy).toMatchObject({ positions: 4, filled: 3, free: 1, filledAdjustment: 3 });
    const listed = expectStatus(await staff.agent.get('/api/admin/vacancies'), 200).body.items.find((x: { id: string }) => x.id === v.id);
    expect(listed).toMatchObject({ filled: 3, free: 1 });

    const employer = await asCompany();
    const own = await createVacancy({ companyId: employer.company.id, positions: 2 });
    await employer.agent.patch(`/api/company/vacancies/${own.id}`).send({ filledAdjustment: 2 });
    expect((await prisma.vacancy.findUniqueOrThrow({ where: { id: own.id } })).filledAdjustment).toBe(0);
    const mine = expectStatus(await employer.agent.get('/api/company/vacancies'), 200).body.items[0];
    expect(mine).toMatchObject({ positions: 2, filled: 0, free: 2 });
  });
});

describe('applying: server-side checks', () => {
  it('refuses a full vacancy (409 VACANCY_FULL), a closed one (409 VACANCY_CLOSED) and an unknown one (404)', async () => {
    const full = await createVacancy({ positions: 1, filledAdjustment: 1 });
    const draft = await createVacancy({ status: 'DRAFT', publishedAt: null });
    const { agent } = await asCandidate();
    const res = await agent.post(`/api/vacancies/${full.slug}/apply`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('VACANCY_FULL');
    const closed = await agent.post(`/api/vacancies/${draft.slug}/apply`).send({});
    expect(closed.status).toBe(409);
    expect(closed.body.error).toBe('VACANCY_CLOSED');
    const missing = await agent.post('/api/vacancies/does-not-exist/apply').send({});
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('VACANCY_NOT_FOUND');
    expect(await prisma.vacancyApplication.count()).toBe(0);

    // A place opens again (staff correction) → applying works.
    await prisma.vacancy.update({ where: { id: full.id }, data: { filledAdjustment: 0 } });
    expectStatus(await agent.post(`/api/vacancies/${full.slug}/apply`).send({}), 201);
  });

  it('the last place cannot be taken twice: two employer acceptances at the same moment → one 200, one 409', async () => {
    const employer = await asCompany();
    const v = await createVacancy({ companyId: employer.company.id, positions: 1 });
    const a = await asCandidate({ firstName: 'Ali' });
    const b = await asCandidate({ firstName: 'Rauf' });
    const appA = await prisma.vacancyApplication.create({ data: { vacancyId: v.id, userId: a.user.id, status: 'PROPOSED' } });
    const appB = await prisma.vacancyApplication.create({ data: { vacancyId: v.id, userId: b.user.id, status: 'PROPOSED' } });

    const results = await Promise.all([appA, appB].map((app) => employer.agent.post(`/api/company/candidates/${app.id}/decision`).send({ action: 'ACCEPT' })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)!.body.error).toBe('VACANCY_FULL');
    expect(await prisma.vacancyApplication.count({ where: { vacancyId: v.id, status: 'ACCEPTED' } })).toBe(1);
    // The vacancy stays on the board, full, and nobody else can apply.
    expect(expectStatus(await anon().get(`/api/vacancies/${v.slug}`), 200).body.vacancy).toMatchObject({ free: 0 });
    const c = await asCandidate();
    expect((await c.agent.post(`/api/vacancies/${v.slug}/apply`).send({})).body.error).toBe('VACANCY_FULL');
  });
});

describe('"Clients can only apply to active vacancies" (admin setting)', () => {
  it('ON: a client needs one of our open vacancies with a free place; the vacancy decides the visa type', async () => {
    const policy = await setPolicy({ clientsOnlyActiveVacancies: true });
    expect(policy.clientsOnlyActiveVacancies).toBe(true);
    expect(expectStatus(await anon().get('/api/vacancies/policy'), 200).body.policy.clientsOnlyActiveVacancies).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'VACANCY_APPLICATION_POLICY_UPDATED' } })).toBe(1);

    const client = await asCandidate();
    const free = await client.agent.post('/api/cases').send({ visaType: 'TOURIST', profession: 'Anything' });
    expect(free.status).toBe(400);
    expect(free.body.error).toBe('VACANCY_REQUIRED');
    expect((await client.agent.post('/api/cases').send({ vacancyId: 'nope' })).status).toBe(404);
    const full = await createVacancy({ positions: 1, filledAdjustment: 1 });
    expect((await client.agent.post('/api/cases').send({ vacancyId: full.id })).body.error).toBe('VACANCY_FULL');
    const closed = await createVacancy({ status: 'CLOSED' });
    expect((await client.agent.post('/api/cases').send({ vacancyId: closed.id })).body.error).toBe('VACANCY_CLOSED');
    expect(await prisma.case.count({ where: { clientId: client.user.id } })).toBe(0);

    const ausbildung = await createVacancy({ employmentType: 'AUSBILDUNG', profession: 'Pflegefachmann' });
    // Whatever the client sends as visa type, the vacancy decides.
    const ok = expectStatus(await client.agent.post('/api/cases').send({ vacancyId: ausbildung.id, visaType: 'TOURIST' }), 201).body.case;
    expect(ok).toMatchObject({ vacancyId: ausbildung.id, visaType: 'AUSBILDUNG', profession: 'Pflegefachmann' });
  });

  it('staff still create cases for any visa type; existing cases are untouched', async () => {
    const client = await asCandidate();
    const before = expectStatus(await client.agent.post('/api/cases').send({ visaType: 'FAMILY', profession: 'Aşpaz' }), 201).body.case; // legacy default in tests
    await setPolicy({ clientsOnlyActiveVacancies: true });
    expect((await prisma.case.findUniqueOrThrow({ where: { id: before.id } })).visaType).toBe('FAMILY');
    // Staff use the admin flows, which the setting does not touch: e.g. a case for an accepted candidate of a
    // vacancy that is now full.
    const staff = await asStaff();
    expect((await staff.agent.post('/api/cases').send({ visaType: 'WORK' })).body.error).toBe('CANDIDATES_ONLY');
    const v = await createVacancy({ positions: 1 });
    const cand = await asCandidate();
    const app = await prisma.vacancyApplication.create({ data: { vacancyId: v.id, userId: cand.user.id, status: 'ACCEPTED' } });
    const made = expectStatus(await staff.agent.post(`/api/admin/candidates/applications/${app.id}/case`).send({}), 201).body.case;
    expect((await prisma.case.findUniqueOrThrow({ where: { id: made.id } })).vacancyId).toBe(v.id);
  });

  it('OFF restores the old free choice of the visa type', async () => {
    await setPolicy({ clientsOnlyActiveVacancies: false });
    const client = await asCandidate({ profession: 'Kuryer' });
    const res = expectStatus(await client.agent.post('/api/cases').send({ visaType: 'JOB_SEEKER' }), 201).body.case;
    expect(res).toMatchObject({ visaType: 'JOB_SEEKER', vacancyId: null, profession: 'Kuryer' });
  });

  it('only ADMIN+ change the rules', async () => {
    const staff = await asStaff();
    expect((await staff.agent.get('/api/admin/vacancies/policy')).status).toBe(200);
    expect((await staff.agent.put('/api/admin/vacancies/policy').send({ clientsOnlyActiveVacancies: false })).status).toBe(403);
    const client = await asCandidate();
    expect((await client.agent.put('/api/admin/vacancies/policy').send({ clientsOnlyActiveVacancies: false })).status).toBe(403);
  });
});

describe('external Germany job listings ("apply via Triad Vision")', () => {
  it('blocked with 403 EXTERNAL_APPLICATIONS_DISABLED when switched off; /config says so', async () => {
    await setPolicy({ allowExternalApplications: false });
    expect(expectStatus(await anon().get('/api/germany-jobs/config'), 200).body.apply).toBe(false);
    const res = await anon().post('/api/germany-jobs/apply').field('name', 'Ali').field('email', 'ali@example.com').field('listingUrl', 'https://example.com/job/1');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('EXTERNAL_APPLICATIONS_DISABLED');
    expect(await prisma.inquiry.count()).toBe(0);

    await setPolicy({ allowExternalApplications: true });
    expect(expectStatus(await anon().get('/api/germany-jobs/config'), 200).body.apply).toBe(true);
    // Switched on: the request reaches validation again (400 for the incomplete form instead of 403).
    expect((await anon().post('/api/germany-jobs/apply').field('name', 'Ali')).status).toBe(400);
  });
});
