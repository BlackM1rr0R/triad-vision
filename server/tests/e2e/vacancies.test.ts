import { beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { asCandidate, cleanJobs, createCompany, createVacancy } from './vacancies.fixtures';

beforeEach(cleanJobs);

const DAY = 24 * 60 * 60 * 1000;

describe('GET /api/vacancies (public board)', () => {
  it('lists only OPEN vacancies that are not past their closing date', async () => {
    const open = await createVacancy({ slug: 'open-one' });
    await createVacancy({ slug: 'future-close', closesAt: new Date(Date.now() + 10 * DAY) });
    await createVacancy({ slug: 'expired', closesAt: new Date(Date.now() - DAY) });
    await createVacancy({ slug: 'draft', status: 'DRAFT' });
    await createVacancy({ slug: 'pending', status: 'PENDING' });
    await createVacancy({ slug: 'closed', status: 'CLOSED' });
    const res = await anon().get('/api/vacancies');
    expect(res.status).toBe(200);
    expect(res.body.items.map((v: { slug: string }) => v.slug).sort()).toEqual(['future-close', 'open-one']);
    expect(res.body.total).toBe(2);
    expect(res.headers['cache-control']).toContain('public');
    const item = res.body.items.find((v: { slug: string }) => v.slug === open.slug);
    // Everything a JobPosting needs, nothing internal.
    expect(item).toMatchObject({ title: open.title, city: 'Hamburg', salaryMin: 2800, salaryMax: 3400, salaryCurrency: 'EUR', employmentType: 'FULL_TIME', companyName: null });
    expect(item.datePosted).toBeTruthy();
    expect(item).not.toHaveProperty('companyId');
    expect(item).not.toHaveProperty('status');
  });

  it('filters by sector, city, German level, employment type, salary and search', async () => {
    await createVacancy({ slug: 'lkw', sector: 'logistics', city: 'Hamburg', germanLevel: 'A2', salaryMin: 2800, salaryMax: 3400 });
    await createVacancy({ slug: 'pflege', sector: 'healthcare', city: 'Köln', germanLevel: 'B2', profession: 'Pflegekraft', salaryMin: 3200, salaryMax: 3900, title: { az: 'Tibb bacısı', de: 'Pflegefachkraft', en: 'Nurse', ru: 'Медсестра' } });
    await createVacancy({ slug: 'ernte', sector: 'agriculture', city: 'Bonn', germanLevel: null, employmentType: 'SEASONAL', salaryMin: 2100, salaryMax: null });
    const slugs = async (qs: string) => (await anon().get(`/api/vacancies?${qs}`)).body.items.map((v: { slug: string }) => v.slug).sort();
    expect(await slugs('sector=healthcare')).toEqual(['pflege']);
    expect(await slugs('city=k%C3%B6ln')).toEqual(['pflege']);
    expect(await slugs('germanLevel=A2')).toEqual(['ernte', 'lkw']);
    expect(await slugs('germanLevel=C1')).toEqual(['ernte', 'lkw', 'pflege']);
    expect(await slugs('employmentType=SEASONAL')).toEqual(['ernte']);
    expect(await slugs('salaryMin=3500')).toEqual(['pflege']);
    expect(await slugs('salaryMin=2000')).toEqual(['ernte', 'lkw', 'pflege']);
    expect(await slugs('search=Nurse')).toEqual(['pflege']);
    expect(await slugs('search=Pflegekraft')).toEqual(['pflege']);
    expect((await anon().get('/api/vacancies?sector=space')).status).toBe(400);
    const facets = (await anon().get('/api/vacancies')).body.facets;
    expect(facets.sectors).toHaveLength(3);
  });

  it('sorts and paginates', async () => {
    await createVacancy({ slug: 'low', salaryMin: 2000, salaryMax: 2200, publishedAt: new Date(Date.now() - 3 * DAY) });
    await createVacancy({ slug: 'high', salaryMin: 3000, salaryMax: 4000, publishedAt: new Date(Date.now() - 2 * DAY) });
    await createVacancy({ slug: 'mid', salaryMin: 2500, salaryMax: 3000, publishedAt: new Date(Date.now() - DAY) });
    const newest = await anon().get('/api/vacancies');
    expect(newest.body.items.map((v: { slug: string }) => v.slug)).toEqual(['mid', 'high', 'low']);
    const salary = await anon().get('/api/vacancies?sort=salary');
    expect(salary.body.items.map((v: { slug: string }) => v.slug)).toEqual(['high', 'mid', 'low']);
    const page2 = await anon().get('/api/vacancies?pageSize=2&page=2');
    expect(page2.body.items.map((v: { slug: string }) => v.slug)).toEqual(['low']);
    expect(page2.body.total).toBe(3);
  });

  it('shows the employer name only when the company allows it', async () => {
    const company = await createCompany({ name: 'Nord Logistik GmbH' });
    await createVacancy({ slug: 'hidden', companyId: company.id, showCompany: false });
    await createVacancy({ slug: 'shown', companyId: company.id, showCompany: true });
    const hidden = await anon().get('/api/vacancies/hidden');
    expect(hidden.body.vacancy.companyName).toBeNull();
    expect(JSON.stringify(hidden.body)).not.toContain('Nord Logistik');
    expect((await anon().get('/api/vacancies/shown')).body.vacancy.companyName).toBe('Nord Logistik GmbH');
    // The hidden name is not searchable either.
    expect((await anon().get('/api/vacancies?search=Nord')).body.items.map((v: { slug: string }) => v.slug)).toEqual(['shown']);
  });
});

describe('GET /api/vacancies/:slug', () => {
  it('returns open vacancies with their visa category and 404s for closed, draft or expired ones', async () => {
    const visa = await prisma.visaCategory.create({
      data: { slug: 'skilled', icon: 'Truck', image: 'x', visaLabel: '§18b', title: { az: 'V', de: 'V', en: 'V', ru: 'V' }, summary: {}, items: {}, body: {} },
    });
    await createVacancy({ slug: 'live', visaCategoryId: visa.id });
    await createVacancy({ slug: 'old', closesAt: new Date(Date.now() - DAY) });
    await createVacancy({ slug: 'shut', status: 'CLOSED' });
    await createVacancy({ slug: 'wip', status: 'DRAFT' });
    const res = await anon().get('/api/vacancies/live');
    expect(res.status).toBe(200);
    expect(res.body.vacancy.visaCategory).toEqual({ slug: 'skilled', title: { az: 'V', de: 'V', en: 'V', ru: 'V' }, visaLabel: '§18b' });
    for (const slug of ['old', 'shut', 'wip', 'missing']) expect((await anon().get(`/api/vacancies/${slug}`)).status).toBe(404);
  });

  it('gives a signed-in candidate their match score and gaps', async () => {
    await createVacancy({ slug: 'ce-job', germanLevel: 'B2', drivingLicence: 'CE', minExperience: 2 });
    const { agent } = await asCandidate({ germanLevel: 'A2', drivingLicence: 'B' });
    const res = await agent.get('/api/vacancies/ce-job/me');
    expect(res.status).toBe(200);
    expect(res.body.application).toBeNull();
    expect(res.body.emailVerified).toBe(true);
    expect(res.body.match.score).toBeLessThan(100);
    expect(res.body.match.gaps.map((g: { code: string }) => g.code)).toEqual(['GERMAN', 'LICENCE']);
    expect(res.body.match.gaps[0]).toMatchObject({ required: 'B2', actual: 'A2' });
    expect((await anon().get('/api/vacancies/ce-job/me')).status).toBe(401);
    const staff = await asStaff();
    expect((await staff.agent.get('/api/vacancies/ce-job/me')).status).toBe(403);
  });
});

describe('applying', () => {
  it('requires a signed-in candidate with a verified email', async () => {
    const v = await createVacancy();
    expect((await anon().post(`/api/vacancies/${v.slug}/apply`).send({})).status).toBe(401);
    const unverified = await asCandidate({}, { verified: false });
    const res = await unverified.agent.post(`/api/vacancies/${v.slug}/apply`).send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('EMAIL_NOT_VERIFIED');
    expect(await prisma.vacancyApplication.count()).toBe(0);
  });

  it('creates an application with the match score, notifies staff and prevents duplicates', async () => {
    const admin = await asAdmin();
    const v = await createVacancy();
    const { agent, user } = await asCandidate();
    const res = await agent.post(`/api/vacancies/${v.slug}/apply`).send({ message: 'I have 5 years of CE experience.' });
    expect(res.status).toBe(201);
    expect(res.body.application).toMatchObject({ status: 'NEW', matchScore: 100 });
    const stored = await prisma.vacancyApplication.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.message).toBe('I have 5 years of CE experience.');
    const n = await prisma.notification.findFirst({ where: { userId: admin.user.id, type: 'STAFF' } });
    expect(n?.body).toContain('100%');

    const dup = await agent.post(`/api/vacancies/${v.slug}/apply`).send({});
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('ALREADY_APPLIED');
    expect((await agent.get(`/api/vacancies/${v.slug}/me`)).body.application.status).toBe('NEW');
  });

  it('cannot apply to closed or expired vacancies', async () => {
    const closed = await createVacancy({ status: 'CLOSED' });
    const expired = await createVacancy({ closesAt: new Date(Date.now() - DAY) });
    const { agent } = await asCandidate();
    expect((await agent.post(`/api/vacancies/${closed.slug}/apply`).send({})).status).toBe(404);
    expect((await agent.post(`/api/vacancies/${expired.slug}/apply`).send({})).status).toBe(404);
  });

  it('lists my applications and lets me withdraw (and re-apply later)', async () => {
    const v = await createVacancy();
    const other = await createVacancy({ status: 'CLOSED' });
    const { agent, user } = await asCandidate();
    await agent.post(`/api/vacancies/${v.slug}/apply`).send({});
    await prisma.vacancyApplication.create({ data: { vacancyId: other.id, userId: user.id, status: 'ACCEPTED', staffNote: 'internal' } });

    const mine = await agent.get('/api/vacancies/my/applications');
    expect(mine.status).toBe(200);
    expect(mine.body.items).toHaveLength(2);
    const closedItem = mine.body.items.find((a: { vacancy: { id: string } }) => a.vacancy.id === other.id);
    expect(closedItem.vacancy.isOpen).toBe(false);
    expect(JSON.stringify(mine.body)).not.toContain('internal');

    const app = mine.body.items.find((a: { vacancy: { id: string } }) => a.vacancy.id === v.id);
    expect((await agent.post(`/api/vacancies/my/applications/${app.id}/withdraw`)).status).toBe(200);
    expect((await prisma.vacancyApplication.findUniqueOrThrow({ where: { id: app.id } })).status).toBe('WITHDRAWN');
    expect((await agent.post(`/api/vacancies/my/applications/${app.id}/withdraw`)).status).toBe(409);
    const accepted = closedItem;
    expect((await agent.post(`/api/vacancies/my/applications/${accepted.id}/withdraw`)).status).toBe(409);

    const again = await agent.post(`/api/vacancies/${v.slug}/apply`).send({});
    expect(again.status).toBe(201);
    expect(again.body.application.id).toBe(app.id);
  });

  it('cannot withdraw someone else’s application', async () => {
    const v = await createVacancy();
    const owner = await asCandidate();
    const intruder = await asCandidate();
    const app = await prisma.vacancyApplication.create({ data: { vacancyId: v.id, userId: owner.user.id } });
    expect((await intruder.agent.post(`/api/vacancies/my/applications/${app.id}/withdraw`)).status).toBe(404);
  });
});
