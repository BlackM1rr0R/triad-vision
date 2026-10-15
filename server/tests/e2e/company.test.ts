import { beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, ORIGIN } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { ADMIN_INBOX } from '../helpers/testEnv';
import { asCandidate, asCompany, cleanJobs, createCompany, createVacancy } from './vacancies.fixtures';

beforeEach(cleanJobs);

const registration = (over: Record<string, unknown> = {}) => ({
  company: { name: 'Nord Logistik GmbH', legalForm: 'GmbH', sector: 'logistics', city: 'Hamburg', phone: '+49 40 555 000', website: 'nord-logistik.de' },
  user: { firstName: 'Hans', lastName: 'Becker', email: 'hans@nord-logistik.de', password: 'Sicher123' },
  locale: 'de',
  acceptTerms: true,
  ...over,
});

describe('POST /api/company/register', () => {
  it('creates a PENDING company with an employer user, logs in and notifies admins', async () => {
    const admin = await asAdmin();
    const res = await anon().post('/api/company/register').set('Origin', ORIGIN).send(registration());
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ role: 'COMPANY', email: 'hans@nord-logistik.de', locale: 'de' });
    expect(res.body.company).toMatchObject({ name: 'Nord Logistik GmbH', status: 'PENDING', website: 'https://nord-logistik.de/' });
    expect(res.body.company.note).toBeUndefined();
    expect(String(res.headers['set-cookie'])).toContain('tv_session=');

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'hans@nord-logistik.de' } });
    expect(user.role).toBe('COMPANY');
    expect(user.companyId).toBe(res.body.company.id);
    const n = await prisma.notification.findFirst({ where: { userId: admin.user.id, type: 'STAFF' } });
    expect(n?.title).toContain('Nord Logistik GmbH');
    expect(n?.link).toBe(`/admin/companies?id=${res.body.company.id}`);
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: ADMIN_INBOX } }));

    // The session works for the employer portal.
    const cookie = String(res.headers['set-cookie']).split(';')[0];
    const me = await anon().get('/api/company/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.company.status).toBe('PENDING');
  });

  it('rejects a taken email, weak passwords and missing consent', async () => {
    await asClient({ email: 'taken@example.com' });
    const taken = await anon().post('/api/company/register').send(registration({ user: { firstName: 'A', lastName: 'B', email: 'taken@example.com', password: 'Sicher123' } }));
    expect(taken.status).toBe(409);
    expect(taken.body.error).toBe('EMAIL_TAKEN');
    const weak = await anon().post('/api/company/register').send(registration({ user: { firstName: 'A', lastName: 'B', email: 'x@example.com', password: 'short' } }));
    expect(weak.status).toBe(400);
    const noTerms = await anon().post('/api/company/register').send(registration({ acceptTerms: false }));
    expect(noTerms.status).toBe(400);
    const badSector = await anon().post('/api/company/register').send(registration({ company: { ...registration().company, sector: 'space' } }));
    expect(badSector.status).toBe(400);
    expect(await prisma.company.count()).toBe(0);
  });
});

describe('employer portal access', () => {
  it('is only for COMPANY users that belong to a company', async () => {
    const client = await asClient();
    expect((await client.agent.get('/api/company/me')).status).toBe(403);
    const admin = await asAdmin();
    expect((await admin.agent.get('/api/company/me')).status).toBe(403);
    expect((await anon().get('/api/company/me')).status).toBe(401);
    const orphan = await asCompany();
    await prisma.user.update({ where: { id: orphan.user.id }, data: { companyId: null } });
    const res = await orphan.agent.get('/api/company/me');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NO_COMPANY');
  });

  it('keeps employers out of the admin API and candidate-only actions', async () => {
    const { agent } = await asCompany();
    expect((await agent.get('/api/admin/candidates')).status).toBe(403);
    expect((await agent.get('/api/admin/companies')).status).toBe(403);
    const v = await createVacancy();
    const apply = await agent.post(`/api/vacancies/${v.slug}/apply`).send({});
    expect(apply.status).toBe(403);
    expect(apply.body.error).toBe('CANDIDATES_ONLY');
    expect((await agent.get('/api/vacancies/my/applications')).status).toBe(403);
  });

  it('lets a suspended company only see its status', async () => {
    const { agent } = await asCompany('SUSPENDED');
    expect((await agent.get('/api/company/me')).body.company.status).toBe('SUSPENDED');
    const res = await agent.get('/api/company/vacancies');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('COMPANY_SUSPENDED');
  });

  it('updates the company profile without exposing the staff note', async () => {
    const { agent, company } = await asCompany();
    await prisma.company.update({ where: { id: company.id }, data: { note: 'internal: slow payer' } });
    const res = await agent.patch('/api/company/me').send({ city: 'Bremen', vatId: 'DE123456789', website: '' });
    expect(res.status).toBe(200);
    expect(res.body.company).toMatchObject({ city: 'Bremen', vatId: 'DE123456789', website: null });
    expect(JSON.stringify(res.body)).not.toContain('slow payer');
    expect((await agent.patch('/api/company/me').send({ status: 'ACTIVE' })).body.company.status).toBe('ACTIVE');
    // status is not an editable field: the unknown key is ignored
    const pending = await asCompany('PENDING');
    expect((await pending.agent.patch('/api/company/me').send({ status: 'ACTIVE' })).body.company.status).toBe('PENDING');
  });
});

describe('employer vacancies', () => {
  const body = {
    title: { de: 'LKW-Fahrer (m/w/d) CE' },
    description: { de: 'Wir suchen Fahrer im Fernverkehr.' },
    requirements: { de: ['Führerschein CE', 'Deutsch A2'] },
    city: 'Hamburg',
    sector: 'logistics',
    profession: 'LKW-Fahrer',
    germanLevel: 'A2',
    minExperience: 2,
    drivingLicence: 'CE',
    salaryMin: 2800,
    salaryMax: 3500,
    positions: 5,
    employmentType: 'FULL_TIME',
  };

  it('creates a DRAFT with all languages filled and a readable slug', async () => {
    const { agent, company } = await asCompany('PENDING');
    const res = await agent.post('/api/company/vacancies').send(body);
    expect(res.status).toBe(201);
    const v = res.body.vacancy;
    expect(v).toMatchObject({ status: 'DRAFT', companyId: company.id, slug: 'lkw-fahrer-m-w-d-ce-hamburg' });
    expect(v.title).toEqual({ az: 'LKW-Fahrer (m/w/d) CE', de: 'LKW-Fahrer (m/w/d) CE', en: 'LKW-Fahrer (m/w/d) CE', ru: 'LKW-Fahrer (m/w/d) CE' });
    expect(v.requirements.ru).toEqual(['Führerschein CE', 'Deutsch A2']);
    const second = await agent.post('/api/company/vacancies').send(body);
    expect(second.body.vacancy.slug).toBe('lkw-fahrer-m-w-d-ce-hamburg-2');
  });

  it('validates input', async () => {
    const { agent } = await asCompany();
    expect((await agent.post('/api/company/vacancies').send({ ...body, title: {} })).status).toBe(400);
    expect((await agent.post('/api/company/vacancies').send({ ...body, salaryMin: 4000, salaryMax: 3000 })).status).toBe(400);
    expect((await agent.post('/api/company/vacancies').send({ ...body, germanLevel: 'D1' })).status).toBe(400);
    expect((await agent.post('/api/company/vacancies').send({ ...body, closesAt: '2001-01-01' })).status).toBe(400);
  });

  it('a pending company cannot submit; an active one submits for review (staff notified)', async () => {
    const pending = await asCompany('PENDING');
    const draft = (await pending.agent.post('/api/company/vacancies').send(body)).body.vacancy;
    const blocked = await pending.agent.post(`/api/company/vacancies/${draft.id}/submit`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe('COMPANY_NOT_APPROVED');

    const admin = await asAdmin();
    const active = await asCompany('ACTIVE');
    const v = (await active.agent.post('/api/company/vacancies').send(body)).body.vacancy;
    expect((await active.agent.post(`/api/company/vacancies/${v.id}/submit`)).status).toBe(200);
    expect((await prisma.vacancy.findUniqueOrThrow({ where: { id: v.id } })).status).toBe('PENDING');
    expect((await active.agent.post(`/api/company/vacancies/${v.id}/submit`)).status).toBe(409);
    const n = await prisma.notification.findFirst({ where: { userId: admin.user.id, link: `/admin/vacancies?id=${v.id}` } });
    expect(n).not.toBeNull();
  });

  it('editing an OPEN vacancy sends it back to review; closed ones are locked', async () => {
    const { agent, company } = await asCompany();
    const v = await createVacancy({ companyId: company.id });
    const res = await agent.patch(`/api/company/vacancies/${v.id}`).send({ title: { de: 'Neuer Titel' } });
    expect(res.status).toBe(200);
    expect(res.body.vacancy.status).toBe('PENDING');
    expect(res.body.vacancy.title.en).toBe('Neuer Titel');
    expect((await agent.post(`/api/company/vacancies/${v.id}/close`)).status).toBe(200);
    expect((await agent.patch(`/api/company/vacancies/${v.id}`).send({ city: 'Kiel' })).status).toBe(409);
  });

  it('only sees and changes its own vacancies', async () => {
    const mine = await asCompany();
    const other = await createCompany();
    const foreign = await createVacancy({ companyId: other.id, status: 'DRAFT' });
    await createVacancy({ companyId: mine.company.id });
    const list = await mine.agent.get('/api/company/vacancies');
    expect(list.body.items).toHaveLength(1);
    expect((await mine.agent.get(`/api/company/vacancies/${foreign.id}`)).status).toBe(404);
    expect((await mine.agent.patch(`/api/company/vacancies/${foreign.id}`).send({ city: 'X' })).status).toBe(404);
    expect((await mine.agent.post(`/api/company/vacancies/${foreign.id}/submit`)).status).toBe(404);
    expect((await mine.agent.delete(`/api/company/vacancies/${foreign.id}`)).status).toBe(404);
  });

  it('deletes drafts without applications only', async () => {
    const { agent, company } = await asCompany();
    const draft = await createVacancy({ companyId: company.id, status: 'DRAFT' });
    const open = await createVacancy({ companyId: company.id });
    expect((await agent.delete(`/api/company/vacancies/${open.id}`)).status).toBe(409);
    expect((await agent.delete(`/api/company/vacancies/${draft.id}`)).status).toBe(200);
  });
});

describe('proposed candidates', () => {
  const setup = async () => {
    const employer = await asCompany();
    const vacancy = await createVacancy({ companyId: employer.company.id });
    const proposed = await asCandidate({ firstName: 'Ali', lastName: 'Məmmədov' });
    const fresh = await asCandidate({ firstName: 'Rəşad', lastName: 'Quliyev' });
    const rejectedEarly = await asCandidate({ firstName: 'Nərmin', lastName: 'Əliyeva' });
    const app = await prisma.vacancyApplication.create({ data: { vacancyId: vacancy.id, userId: proposed.user.id, status: 'PROPOSED', matchScore: 92, staffNote: 'secret staff note' } });
    await prisma.vacancyApplication.create({ data: { vacancyId: vacancy.id, userId: fresh.user.id, status: 'SHORTLISTED' } });
    await prisma.vacancyApplication.create({ data: { vacancyId: vacancy.id, userId: rejectedEarly.user.id, status: 'REJECTED' } });
    return { employer, vacancy, proposed, app };
  };

  it('shows only PROPOSED (or later) applications, anonymised', async () => {
    const { employer } = await setup();
    const res = await employer.agent.get('/api/company/candidates');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    const item = res.body.items[0];
    expect(item.candidate).toEqual({
      name: 'Ali M.',
      profession: 'Sürücü',
      experienceYears: 5,
      germanLevel: 'B1',
      education: 'vocational',
      drivingLicence: 'B, C, CE',
      city: 'Gəncə',
    });
    expect(item.matchScore).toBe(92);
    const raw = JSON.stringify(res.body);
    for (const secret of ['Məmmədov', '@test.local', '+994', '1990', 'Nizami', 'secret staff note', 'userId']) expect(raw).not.toContain(secret);
  });

  it('does not show candidates of other companies', async () => {
    await setup();
    const other = await asCompany();
    expect((await other.agent.get('/api/company/candidates')).body.items).toHaveLength(0);
  });

  it('interview → accept notifies staff and the candidate', async () => {
    const { employer, proposed, app } = await setup();
    const admin = await asAdmin();
    const interview = await employer.agent.post(`/api/company/candidates/${app.id}/decision`).send({ action: 'INTERVIEW', note: 'Video call next week' });
    expect(interview.status).toBe(200);
    expect(interview.body.status).toBe('INTERVIEW');
    const staffN = await prisma.notification.findFirst({ where: { userId: admin.user.id, title: { contains: 'İşəgötürən qərarı' } } });
    expect(staffN?.body).toContain('Video call next week');
    const candN = await prisma.notification.findFirst({ where: { userId: proposed.user.id, type: 'APPLICATION_STATUS' } });
    expect(candN?.link).toBe('/account/applications');

    expect((await employer.agent.post(`/api/company/candidates/${app.id}/decision`).send({ action: 'INTERVIEW' })).status).toBe(409);
    const accept = await employer.agent.post(`/api/company/candidates/${app.id}/decision`).send({ action: 'ACCEPT' });
    expect(accept.body.status).toBe('ACCEPTED');
    expect((await prisma.vacancyApplication.findUniqueOrThrow({ where: { id: app.id } })).companyNote).toBe('Video call next week');
    expect(await prisma.auditLog.count({ where: { action: 'EMPLOYER_DECISION' } })).toBe(2);
  });

  it('a rejected candidate stays visible to the employer who rejected', async () => {
    const { employer, app } = await setup();
    expect((await employer.agent.post(`/api/company/candidates/${app.id}/decision`).send({ action: 'REJECT' })).status).toBe(200);
    const list = await employer.agent.get('/api/company/candidates?status=REJECTED');
    expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([app.id]);
  });

  it('cannot decide on applications that were not proposed or belong to someone else', async () => {
    const { employer, vacancy } = await setup();
    const shortlisted = await prisma.vacancyApplication.findFirstOrThrow({ where: { vacancyId: vacancy.id, status: 'SHORTLISTED' } });
    expect((await employer.agent.post(`/api/company/candidates/${shortlisted.id}/decision`).send({ action: 'ACCEPT' })).status).toBe(404);
    const other = await asCompany();
    const { app } = await setup();
    expect((await other.agent.post(`/api/company/candidates/${app.id}/decision`).send({ action: 'ACCEPT' })).status).toBe(404);
  });
});

describe('dashboard and our workers', () => {
  it('shows only this company’s workers with their visa step, no documents or notes', async () => {
    const employer = await asCompany();
    const otherCo = await createCompany();
    const vacancy = await createVacancy({ companyId: employer.company.id });
    const w1 = await asCandidate({ firstName: 'Ali', lastName: 'Məmmədov' });
    const w2 = await asCandidate({ firstName: 'Orxan', lastName: 'Həsənov' });
    const visa = await prisma.visaCategory.create({
      data: { slug: 'v18b', icon: 'Truck', image: 'x', visaLabel: '§18b', title: { az: 'V', de: 'V', en: 'V', ru: 'V' }, summary: {}, items: {}, body: {}, processingMin: 8, processingMax: 12 },
    });
    await prisma.case.create({ data: { number: 'TV-2026-9001', clientId: w1.user.id, profession: 'LKW-Fahrer', status: 'EMBASSY_REVIEW', companyId: employer.company.id, vacancyId: vacancy.id, visaCategoryId: visa.id, staffNote: 'private note' } });
    await prisma.case.create({ data: { number: 'TV-2026-9002', clientId: w2.user.id, profession: 'LKW-Fahrer', status: 'APPROVED', companyId: employer.company.id } });
    await prisma.case.create({ data: { number: 'TV-2026-9003', clientId: w2.user.id, profession: 'Koch', status: 'DOCUMENTS_PENDING', companyId: otherCo.id } });

    const res = await employer.agent.get('/api/company/workers');
    expect(res.status).toBe(200);
    expect(res.body.stepCount).toBe(6);
    expect(res.body.items).toHaveLength(2);
    const ali = res.body.items.find((i: { name: string }) => i.name === 'Ali M.');
    expect(ali).toMatchObject({ step: 2, status: 'EMBASSY_REVIEW', profession: 'LKW-Fahrer' });
    expect(ali.expectedDecision).not.toBeNull();
    const raw = JSON.stringify(res.body);
    for (const secret of ['private note', 'Məmmədov', 'documents', 'TV-2026-900', '@test.local']) expect(raw).not.toContain(secret);

    await prisma.vacancyApplication.create({ data: { vacancyId: vacancy.id, userId: w1.user.id, status: 'PROPOSED' } });
    await prisma.vacancyApplication.create({ data: { vacancyId: vacancy.id, userId: w2.user.id, status: 'NEW' } });
    const dash = await employer.agent.get('/api/company/dashboard');
    expect(dash.body.vacancies).toEqual({ OPEN: 1 });
    expect(dash.body.applications).toEqual({ PROPOSED: 1 });
    expect(dash.body.workers).toMatchObject({ total: 2, approved: 1, byStep: [0, 0, 1, 0, 0, 1] });
    expect(dash.body.awaitingDecision[0].candidate.name).toBe('Ali M.');
  });
});
