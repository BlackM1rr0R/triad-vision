import { beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createVisaCategory, uniq } from '../helpers/factories';
import { asCandidate, asCompany, cleanJobs } from './vacancies.fixtures';

beforeEach(cleanJobs);

const request = (over: Record<string, unknown> = {}) => ({
  title: '10 LKW-Fahrer für Hamburg',
  profession: 'LKW-Fahrer',
  quantity: 2,
  germanLevel: 'A2',
  drivingLicence: 'CE',
  minExperience: 2,
  city: 'Hamburg',
  startDate: '2027-03-01',
  salaryMin: 2800,
  salaryMax: 3400,
  notes: 'Schichtarbeit',
  ...over,
});

describe('employer candidate requests', () => {
  it('creates, lists, edits and cancels a request; notifies admins', async () => {
    const admin = await asAdmin();
    const { agent, company } = await asCompany();
    const created = await agent.post('/api/company/requests').send(request());
    expect(created.status).toBe(201);
    expect(created.body.request).toMatchObject({ title: '10 LKW-Fahrer für Hamburg', quantity: 2, status: 'OPEN', progress: { proposed: 0, accepted: 0, quantity: 2 } });
    expect(created.body.request.staffNote).toBeUndefined();
    const id = created.body.request.id;
    const row = await prisma.candidateRequest.findUniqueOrThrow({ where: { id } });
    expect(row.companyId).toBe(company.id);

    const n = await prisma.notification.findFirst({ where: { userId: admin.user.id } });
    expect(n?.title).toContain(company.name);
    expect(n?.link).toBe(`/admin/candidate-requests/${id}`);

    const list = await agent.get('/api/company/requests');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);

    const patched = await agent.patch(`/api/company/requests/${id}`).send({ quantity: 5, city: '' });
    expect(patched.status).toBe(200);
    expect(patched.body.request).toMatchObject({ quantity: 5, city: null });

    expect((await agent.patch(`/api/company/requests/${id}`).send({ salaryMin: 5000 })).body.error).toBe('SALARY_RANGE');

    const cancelled = await agent.post(`/api/company/requests/${id}/cancel`).send({ reason: 'Bedarf entfallen' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.request.status).toBe('CANCELLED');
    // Only open requests are editable; a cancelled one cannot be cancelled again.
    expect((await agent.patch(`/api/company/requests/${id}`).send({ quantity: 3 })).status).toBe(409);
    expect((await agent.post(`/api/company/requests/${id}/cancel`).send({})).status).toBe(409);
  });

  it('validates input', async () => {
    const { agent } = await asCompany();
    expect((await agent.post('/api/company/requests').send(request({ quantity: 0 }))).status).toBe(400);
    expect((await agent.post('/api/company/requests').send(request({ quantity: 201 }))).status).toBe(400);
    expect((await agent.post('/api/company/requests').send(request({ germanLevel: 'D9' }))).status).toBe(400);
    expect((await agent.post('/api/company/requests').send(request({ salaryMin: 4000, salaryMax: 3000 }))).status).toBe(400);
    expect((await agent.post('/api/company/requests').send(request({ visaCategoryId: 'nope' }))).body.error).toBe('INVALID_VISA_CATEGORY');
  });

  it('is for active companies only and isolates companies', async () => {
    const pending = await asCompany('PENDING');
    const res = await pending.agent.post('/api/company/requests').send(request());
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('COMPANY_NOT_APPROVED');
    expect((await pending.agent.get('/api/company/requests')).status).toBe(403);
    const suspended = await asCompany('SUSPENDED');
    expect((await suspended.agent.get('/api/company/requests')).status).toBe(403);

    const a = await asCompany();
    const b = await asCompany();
    const id = (await a.agent.post('/api/company/requests').send(request())).body.request.id;
    expect((await b.agent.get(`/api/company/requests/${id}`)).status).toBe(404);
    expect((await b.agent.patch(`/api/company/requests/${id}`).send({ quantity: 1 })).status).toBe(404);
    expect((await b.agent.post(`/api/company/requests/${id}/cancel`).send({})).status).toBe(404);
    expect((await b.agent.get('/api/company/requests')).body.items).toHaveLength(0);

    const staff = await asStaff();
    expect((await staff.agent.get('/api/company/requests')).status).toBe(403);
    expect((await a.agent.get('/api/admin/candidate-requests')).status).toBe(403);
  });
});

describe('staff candidate requests', () => {
  it('suggests candidates filtered by German level and licence, ranked by match', async () => {
    const { agent } = await asCompany();
    const other = await asCompany();
    const staff = await asStaff();
    const id = (await agent.post('/api/company/requests').send(request({ germanLevel: 'B1' }))).body.request.id;

    const best = await asCandidate({ firstName: 'Best', profession: 'LKW-Fahrer', germanLevel: 'B2', drivingLicence: 'CE', experienceYears: 6 });
    const related = await asCandidate({ firstName: 'Related', profession: 'Busfahrer', germanLevel: 'B1', drivingLicence: 'CE, D', experienceYears: 1 });
    const lowGerman = await asCandidate({ firstName: 'LowGerman', profession: 'LKW-Fahrer', germanLevel: 'A2', drivingLicence: 'CE' });
    const noLicence = await asCandidate({ firstName: 'NoCE', profession: 'LKW-Fahrer', germanLevel: 'C1', drivingLicence: 'B' });
    const placed = await asCandidate({ firstName: 'Placed', profession: 'LKW-Fahrer', germanLevel: 'B2', drivingLicence: 'CE' });
    await prisma.case.create({ data: { number: uniq('TV-'), clientId: placed.user.id, profession: 'LKW-Fahrer', companyId: other.company.id } });

    const res = await staff.agent.get(`/api/admin/candidate-requests/${id}`);
    expect(res.status).toBe(200);
    const ids = res.body.suggestions.map((s: { user: { id: string } }) => s.user.id);
    expect(ids).toEqual([best.user.id, related.user.id]);
    expect(ids).not.toContain(lowGerman.user.id);
    expect(ids).not.toContain(noLicence.user.id);
    expect(ids).not.toContain(placed.user.id);
    const top = res.body.suggestions[0];
    expect(top.score).toBeGreaterThan(res.body.suggestions[1].score);
    expect(top.reasons).toEqual(expect.arrayContaining(['PROFESSION_EXACT', 'GERMAN_OK', 'LICENCE_OK', 'EXPERIENCE_OK']));
    expect(res.body.suggestions[1].reasons).toContain('PROFESSION_RELATED');
    expect(res.body.request.company.name).toBeTruthy();
  });

  it('creates the vacancy, proposes candidates, shows them anonymised and fills automatically', async () => {
    const visa = await createVisaCategory();
    const { agent, company, user: employer } = await asCompany();
    const staff = await asStaff();
    const id = (await agent.post('/api/company/requests').send(request({ visaCategoryId: visa.id }))).body.request.id;
    const c1 = await asCandidate({ firstName: 'Kamran', lastName: 'Əliyev', profession: 'LKW-Fahrer', germanLevel: 'B1', passportNumber: 'C1234567' } as never);
    const c2 = await asCandidate({ firstName: 'Rauf', lastName: 'Quliyev', profession: 'LKW-Fahrer', germanLevel: 'B1' });

    const v = await staff.agent.post(`/api/admin/candidate-requests/${id}/vacancy`).send({});
    expect(v.status).toBe(201);
    expect(v.body.vacancy).toMatchObject({ companyId: company.id, status: 'OPEN', positions: 2, profession: 'LKW-Fahrer', germanLevel: 'A2', drivingLicence: 'CE', visaCategoryId: visa.id });
    expect(v.body.vacancy.title.de).toBe('10 LKW-Fahrer für Hamburg');
    // Re-used on a second call.
    const again = await staff.agent.post(`/api/admin/candidate-requests/${id}/vacancy`).send({});
    expect(again.status).toBe(200);
    expect(again.body.vacancy.id).toBe(v.body.vacancy.id);
    expect((await prisma.candidateRequest.findUniqueOrThrow({ where: { id } })).vacancyId).toBe(v.body.vacancy.id);

    // An existing shortlisted application is moved on, too.
    await prisma.vacancyApplication.create({ data: { vacancyId: v.body.vacancy.id, userId: c2.user.id, status: 'SHORTLISTED' } });
    const p = await staff.agent.post(`/api/admin/candidate-requests/${id}/propose`).send({ userIds: [c1.user.id, c2.user.id] });
    expect(p.status).toBe(200);
    expect(p.body.proposed).toHaveLength(2);
    expect(p.body.status).toBe('IN_PROGRESS');
    const apps = await prisma.vacancyApplication.findMany({ where: { vacancyId: v.body.vacancy.id } });
    expect(apps.map((a) => a.status)).toEqual(['PROPOSED', 'PROPOSED']);
    expect(apps.every((a) => (a.matchScore ?? 0) > 0)).toBe(true);
    // Proposing again skips them.
    const dup = await staff.agent.post(`/api/admin/candidate-requests/${id}/propose`).send({ userIds: [c1.user.id] });
    expect(dup.body.skipped[0]).toMatchObject({ reason: 'ALREADY_PROPOSED' });

    // Notifications: employer once per batch, candidates each.
    expect(await prisma.notification.count({ where: { userId: employer.id, type: 'CANDIDATE_PROPOSED' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: c1.user.id, type: 'APPLICATION_STATUS' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'CANDIDATE_REQUEST_PROPOSED' } })).toBe(2);

    // Employer sees anonymised candidates only.
    const detail = await agent.get(`/api/company/requests/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.request).toMatchObject({ status: 'IN_PROGRESS', progress: { proposed: 2, accepted: 0 } });
    expect(detail.body.candidates).toHaveLength(2);
    const names = detail.body.candidates.map((x: { candidate: { name: string } }) => x.candidate.name).sort();
    expect(names).toEqual(['Kamran Ə.', 'Rauf Q.']);
    const raw = JSON.stringify(detail.body);
    for (const secret of ['+994501112233', 'C1234567', 'Nizami', c1.user.email, 'Əliyev', c1.user.id]) expect(raw).not.toContain(secret);

    // Employer accepts both through the existing decision flow → FILLED on the next read.
    for (const a of detail.body.candidates) {
      expect((await agent.post(`/api/company/candidates/${a.id}/decision`).send({ action: 'ACCEPT' })).status).toBe(200);
    }
    const list = await agent.get('/api/company/requests');
    expect(list.body.items[0]).toMatchObject({ status: 'FILLED', progress: { accepted: 2 } });
    expect((await prisma.candidateRequest.findUniqueOrThrow({ where: { id } })).status).toBe('FILLED');
    // Staff filter by status.
    const filled = await staff.agent.get('/api/admin/candidate-requests?status=FILLED');
    expect(filled.body.items.map((r: { id: string }) => r.id)).toEqual([id]);
    expect((await staff.agent.post(`/api/admin/candidate-requests/${id}/propose`).send({ userIds: [c1.user.id] })).status).toBe(409);
  });

  it('lists with filters and updates status / staff note', async () => {
    const a = await asCompany();
    const b = await asCompany();
    const staff = await asStaff();
    const ra = (await a.agent.post('/api/company/requests').send(request())).body.request.id;
    await b.agent.post('/api/company/requests').send(request({ title: 'Pflegekräfte', profession: 'Pflegefachkraft', drivingLicence: null }));

    const all = await staff.agent.get('/api/admin/candidate-requests');
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(2);
    expect(all.body.counts.OPEN).toBe(2);
    const byCompany = await staff.agent.get(`/api/admin/candidate-requests?companyId=${a.company.id}`);
    expect(byCompany.body.items.map((r: { id: string }) => r.id)).toEqual([ra]);
    expect(byCompany.body.items[0].company.name).toBe(a.company.name);

    const patched = await staff.agent.patch(`/api/admin/candidate-requests/${ra}`).send({ status: 'CANCELLED', staffNote: 'Kunde hat abgesagt' });
    expect(patched.status).toBe(200);
    expect(patched.body.request).toMatchObject({ status: 'CANCELLED', staffNote: 'Kunde hat abgesagt' });
    // The employer never sees the staff note.
    const own = await a.agent.get(`/api/company/requests/${ra}`);
    expect(JSON.stringify(own.body)).not.toContain('Kunde hat abgesagt');
    expect((await staff.agent.get('/api/admin/candidate-requests/missing')).status).toBe(404);
  });
});
