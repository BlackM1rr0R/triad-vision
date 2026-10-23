import { beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { asCandidate, asCompany, cleanJobs, createCompany, createVacancy } from './vacancies.fixtures';

const expectAdd = (res: { status: number; body: any }) => {
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { application: Record<string, unknown> };
};

beforeEach(cleanJobs);

describe('admin candidates', () => {
  it('is staff-only', async () => {
    const client = await asClient();
    expect((await client.agent.get('/api/admin/candidates')).status).toBe(403);
    const employer = await asCompany();
    expect((await employer.agent.get('/api/admin/candidates')).status).toBe(403);
  });

  it('lists only candidates, with filters (German minimum, licence coverage, verified, active case)', async () => {
    const { agent } = await asStaff();
    const a = await asCandidate({ firstName: 'Ali', germanLevel: 'B1', drivingLicence: 'CE', city: 'Bakı' });
    const b = await asCandidate({ firstName: 'Bəxtiyar', germanLevel: 'A1', drivingLicence: 'B', profession: 'Koch' }, { verified: false });
    await prisma.case.create({ data: { number: 'TV-2026-0501', clientId: b.user.id, profession: 'Koch' } });
    await asCompany();

    const all = await agent.get('/api/admin/candidates');
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(2);
    const ids = async (qs: string) => (await agent.get(`/api/admin/candidates?${qs}`)).body.items.map((i: { id: string }) => i.id);
    expect(await ids('germanLevel=A2')).toEqual([a.user.id]);
    expect(await ids('licence=C')).toEqual([a.user.id]);
    expect(await ids('licence=B')).toHaveLength(2);
    expect(await ids('verified=false')).toEqual([b.user.id]);
    expect(await ids('hasCase=true')).toEqual([b.user.id]);
    expect(await ids('search=Bəxtiyar')).toEqual([b.user.id]);
    expect(await ids('profession=Koch')).toEqual([b.user.id]);
    const withCase = all.body.items.find((i: { id: string }) => i.id === b.user.id);
    expect(withCase.activeCase).toMatchObject({ number: 'TV-2026-0501', status: 'DOCUMENTS_PENDING' });
    expect(withCase.emailVerifiedAt).toBeNull();
  });

  it('ranks candidates for a vacancy by match score', async () => {
    const { agent } = await asStaff();
    const v = await createVacancy({ germanLevel: 'B1', drivingLicence: 'CE' });
    const weak = await asCandidate({ profession: 'Koch', germanLevel: 'none', drivingLicence: null });
    const strong = await asCandidate();
    const res = await agent.get(`/api/admin/candidates?vacancyId=${v.id}`);
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([strong.user.id, weak.user.id]);
    expect(res.body.items[0].match.score).toBe(100);
    expect(res.body.items[1].match.gaps.length).toBeGreaterThan(0);
    expect((await agent.get('/api/admin/candidates?vacancyId=nope')).status).toBe(400);

    const sugg = await agent.get(`/api/admin/vacancies/${v.id}/suggestions`);
    expect(sugg.body.items[0].id).toBe(strong.user.id);
  });

  it('shows a candidate with applications and cases', async () => {
    const { agent } = await asStaff();
    const c = await asCandidate();
    const v = await createVacancy();
    await prisma.vacancyApplication.create({ data: { vacancyId: v.id, userId: c.user.id } });
    const res = await agent.get(`/api/admin/candidates/${c.user.id}`);
    expect(res.status).toBe(200);
    expect(res.body.candidate.applications).toHaveLength(1);
    expect(res.body.candidate.applications[0].match.score).toBe(100);
    const staff = await asStaff();
    expect((await agent.get(`/api/admin/candidates/${staff.user.id}`)).status).toBe(404);
  });
});

describe('add to vacancy (Admin → Candidates)', () => {
  it('lists every assignable vacancy (open first, with status) and supports search and the candidate marker', async () => {
    const staff = await asStaff();
    const company = await createCompany({ name: 'Nord Logistik' });
    const draft = await createVacancy({ status: 'DRAFT', publishedAt: null, title: { az: 'Kuryer', de: 'Kurier', en: 'Courier', ru: 'Курьер' }, city: 'Berlin' });
    const pending = await createVacancy({ status: 'PENDING', publishedAt: null, companyId: company.id });
    const open = await createVacancy({ status: 'OPEN' });
    await createVacancy({ status: 'CLOSED' });

    const res = await staff.agent.get('/api/admin/vacancies/options');
    expect(res.status).toBe(200);
    expect(res.body.items.map((v: { id: string }) => v.id)).toEqual([open.id, pending.id, draft.id]);
    expect(res.body.items[1]).toMatchObject({ status: 'PENDING', company: { name: 'Nord Logistik' } });
    expect(res.body.total).toBe(3);

    const ids = async (qs: string) => (await staff.agent.get(`/api/admin/vacancies/options?${qs}`)).body.items.map((v: { id: string }) => v.id);
    expect(await ids('search=Kurier')).toEqual([draft.id]);
    expect(await ids('search=Nord')).toEqual([pending.id]);

    const cand = await asCandidate();
    expectAdd(await staff.agent.post(`/api/admin/candidates/${cand.user.id}/applications`).send({ vacancyId: open.id }));
    const marked = (await staff.agent.get(`/api/admin/vacancies/options?userId=${cand.user.id}`)).body.items;
    expect(marked.find((v: { id: string }) => v.id === open.id).applicationStatus).toBe('SHORTLISTED');
    expect(marked.find((v: { id: string }) => v.id === draft.id).applicationStatus).toBeNull();

    // Clients and employers never see the list.
    expect((await cand.agent.get('/api/admin/vacancies/options')).status).toBe(403);
    expect((await (await asCompany()).agent.get('/api/admin/vacancies/options')).status).toBe(403);
  });

  it('adds a candidate to a draft or pending vacancy as SHORTLISTED (in-app notification only), refuses closed ones', async () => {
    const staff = await asStaff();
    const cand = await asCandidate({}, { locale: 'az' });
    const draft = await createVacancy({ status: 'DRAFT', publishedAt: null, title: { az: 'Kuryer', de: 'Kurier', en: 'Courier', ru: 'Курьер' } });
    const closed = await createVacancy({ status: 'CLOSED' });

    const add = expectAdd(await staff.agent.post(`/api/admin/candidates/${cand.user.id}/applications`).send({ vacancyId: draft.id, note: 'Phone screen ok' }));
    expect(add.application).toMatchObject({ status: 'SHORTLISTED', staffNote: 'Phone screen ok', vacancyId: draft.id, userId: cand.user.id });
    const n = await prisma.notification.findFirst({ where: { userId: cand.user.id, type: 'APPLICATION_STATUS' } });
    expect(n?.title).toContain('Kuryer');
    expect(await prisma.auditLog.count({ where: { action: 'APPLICATION_ADDED' } })).toBe(1);
    // Shortlisting is minor: no e-mail.
    expect(await prisma.emailLog.count({ where: { to: cand.user.email } })).toBe(0);

    const detail = await staff.agent.get(`/api/admin/candidates/${cand.user.id}`);
    expect(detail.body.candidate.applications.map((a: { vacancy: { id: string }; status: string }) => [a.vacancy.id, a.status])).toEqual([[draft.id, 'SHORTLISTED']]);

    expect((await staff.agent.post(`/api/admin/candidates/${cand.user.id}/applications`).send({ vacancyId: closed.id })).body.error).toBe('VACANCY_CLOSED');
    expect((await staff.agent.post(`/api/admin/candidates/${cand.user.id}/applications`).send({ vacancyId: 'nope' })).body.error).toBe('INVALID_VACANCY');
    expect((await staff.agent.post(`/api/admin/candidates/${cand.user.id}/applications`).send({ vacancyId: draft.id })).body.error).toBe('ALREADY_APPLIED');
  });
});

describe('application pipeline', () => {
  it('shortlist → propose (employer notified) → accept → visa case linked to the employer', async () => {
    const staff = await asStaff();
    const employer = await asCompany('ACTIVE', { locale: 'de' });
    const v = await createVacancy({ companyId: employer.company.id, title: { az: 'Sürücü', de: 'LKW-Fahrer', en: 'Truck driver', ru: 'Водитель' } });
    const cand = await asCandidate({}, { locale: 'en' });

    const add = await staff.agent.post(`/api/admin/candidates/${cand.user.id}/applications`).send({ vacancyId: v.id, note: 'Good fit' });
    expect(add.status).toBe(201);
    expect(add.body.application).toMatchObject({ status: 'SHORTLISTED', matchScore: 100, staffNote: 'Good fit' });
    expect((await staff.agent.post(`/api/admin/candidates/${cand.user.id}/applications`).send({ vacancyId: v.id })).status).toBe(409);
    const shortlistN = await prisma.notification.findFirst({ where: { userId: cand.user.id, type: 'APPLICATION_STATUS' } });
    expect(shortlistN?.title).toBe('Application: Shortlisted · Truck driver');

    const appId = add.body.application.id;
    // Not proposed yet: the employer sees nothing.
    expect((await employer.agent.get('/api/company/candidates')).body.items).toHaveLength(0);

    const propose = await staff.agent.patch(`/api/admin/candidates/applications/${appId}`).send({ status: 'PROPOSED' });
    expect(propose.status).toBe(200);
    const employerN = await prisma.notification.findFirst({ where: { userId: employer.user.id, type: 'CANDIDATE_PROPOSED' } });
    expect(employerN?.title).toBe('Neuer Kandidat vorgestellt');
    expect(employerN?.body).toContain('LKW-Fahrer');
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: employer.user.email, subject: 'Triad Vision · Neuer Kandidat vorgestellt' } }));
    expect((await employer.agent.get('/api/company/candidates')).body.items).toHaveLength(1);

    // Employer accepts from the portal.
    expect((await employer.agent.post(`/api/company/candidates/${appId}/decision`).send({ action: 'ACCEPT' })).status).toBe(200);

    const caseRes = await staff.agent.post(`/api/admin/candidates/applications/${appId}/case`).send({});
    expect(caseRes.status).toBe(201);
    expect(caseRes.body.created).toBe(true);
    const c = await prisma.case.findUniqueOrThrow({ where: { id: caseRes.body.case.id } });
    expect(c).toMatchObject({ clientId: cand.user.id, companyId: employer.company.id, vacancyId: v.id, profession: 'LKW-Fahrer' });
    // Employer now sees the worker.
    const workers = await employer.agent.get('/api/company/workers');
    expect(workers.body.items).toHaveLength(1);
    expect(workers.body.items[0].name).toBe('Ali M.');

    // Linking again re-uses the active case.
    const again = await staff.agent.post(`/api/admin/candidates/applications/${appId}/case`).send({});
    expect(again.status).toBe(200);
    expect(again.body.case.id).toBe(c.id);
    expect(await prisma.auditLog.count({ where: { action: 'APPLICATION_STATUS_CHANGED' } })).toBe(1);
  });

  it('only creates cases for ACCEPTED applications and validates case ownership', async () => {
    const staff = await asStaff();
    const v = await createVacancy();
    const cand = await asCandidate();
    const other = await asCandidate();
    const foreignCase = await prisma.case.create({ data: { number: 'TV-2026-0701', clientId: other.user.id, profession: 'X' } });
    const app = await prisma.vacancyApplication.create({ data: { vacancyId: v.id, userId: cand.user.id, status: 'INTERVIEW' } });
    expect((await staff.agent.post(`/api/admin/candidates/applications/${app.id}/case`).send({})).status).toBe(409);
    await prisma.vacancyApplication.update({ where: { id: app.id }, data: { status: 'ACCEPTED' } });
    expect((await staff.agent.post(`/api/admin/candidates/applications/${app.id}/case`).send({ caseId: foreignCase.id })).status).toBe(400);
  });

  it('does not propose to a company that is not active, and never changes withdrawn applications', async () => {
    const staff = await asStaff();
    const company = await createCompany({ status: 'PENDING' });
    const v = await createVacancy({ companyId: company.id });
    const cand = await asCandidate();
    const app = await prisma.vacancyApplication.create({ data: { vacancyId: v.id, userId: cand.user.id } });
    expect((await staff.agent.patch(`/api/admin/candidates/applications/${app.id}`).send({ status: 'PROPOSED' })).body.error).toBe('COMPANY_NOT_ACTIVE');
    await prisma.vacancyApplication.update({ where: { id: app.id }, data: { status: 'WITHDRAWN' } });
    expect((await staff.agent.patch(`/api/admin/candidates/applications/${app.id}`).send({ status: 'SHORTLISTED' })).status).toBe(409);
    // Notes can still be kept.
    const note = await staff.agent.patch(`/api/admin/candidates/applications/${app.id}`).send({ staffNote: 'withdrew by phone' });
    expect(note.body.application.staffNote).toBe('withdrew by phone');
  });
});

describe('admin companies', () => {
  it('lists, filters and shows details with counts', async () => {
    const { agent } = await asStaff();
    const pending = await asCompany('PENDING');
    await createCompany({ name: 'Süd Bau AG', status: 'ACTIVE', city: 'München' });
    const list = await agent.get('/api/admin/companies');
    expect(list.body.total).toBe(2);
    expect(list.body.counts).toEqual({ PENDING: 1, ACTIVE: 1 });
    expect(list.body.items[0]._count).toBeDefined();
    expect((await agent.get('/api/admin/companies?status=PENDING')).body.items.map((c: { id: string }) => c.id)).toEqual([pending.company.id]);
    expect((await agent.get('/api/admin/companies?search=München')).body.items[0].name).toBe('Süd Bau AG');
    const detail = await agent.get(`/api/admin/companies/${pending.company.id}`);
    expect(detail.body.company.users[0].email).toBe(pending.user.email);
  });

  it('approves and suspends with a notification in the employer’s language', async () => {
    const admin = await asAdmin();
    const employer = await asCompany('PENDING', { locale: 'ru' });
    const approve = await admin.agent.post(`/api/admin/companies/${employer.company.id}/status`).send({ status: 'ACTIVE' });
    expect(approve.status).toBe(200);
    const n = await prisma.notification.findFirst({ where: { userId: employer.user.id, type: 'COMPANY_APPROVED' } });
    expect(n?.title).toBe('Аккаунт вашей компании одобрен');
    expect((await admin.agent.post(`/api/admin/companies/${employer.company.id}/status`).send({ status: 'ACTIVE' })).status).toBe(409);

    const v = await createVacancy({ companyId: employer.company.id });
    await admin.agent.post(`/api/admin/companies/${employer.company.id}/status`).send({ status: 'SUSPENDED', reason: 'Unpaid invoices' });
    const s = await prisma.notification.findFirst({ where: { userId: employer.user.id, type: 'COMPANY_SUSPENDED' } });
    expect(s?.body).toContain('Unpaid invoices');
    expect((await prisma.vacancy.findUniqueOrThrow({ where: { id: v.id } })).status).toBe('CLOSED');
    expect(await prisma.auditLog.count({ where: { action: 'COMPANY_STATUS_CHANGED' } })).toBe(2);
  });

  it('creates a company, invites a user by email and edits details and the internal note', async () => {
    const { agent } = await asStaff();
    const res = await agent.post('/api/admin/companies').send({
      company: { name: 'West Pflege GmbH', sector: 'healthcare', city: 'Köln' },
      invite: { firstName: 'Anna', lastName: 'Schulz', email: 'anna@west-pflege.de', locale: 'de' },
    });
    expect(res.status).toBe(201);
    expect(res.body.company.status).toBe('ACTIVE');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'anna@west-pflege.de' } });
    expect(user).toMatchObject({ role: 'COMPANY', companyId: res.body.company.id });
    const mail = await waitFor(() => prisma.emailLog.findFirst({ where: { to: 'anna@west-pflege.de' } }));
    expect(mail.subject).toContain('Arbeitgeberportal');
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);

    const dup = await agent.post(`/api/admin/companies/${res.body.company.id}/users`).send({ firstName: 'A', lastName: 'B', email: 'anna@west-pflege.de' });
    expect(dup.status).toBe(409);

    const patch = await agent.patch(`/api/admin/companies/${res.body.company.id}`).send({ note: 'Key account', vatId: 'DE999' });
    // Staff see tax ids masked (sensitive-data masking); the stored value is the plaintext.
    expect(patch.body.company).toMatchObject({ note: 'Key account', vatId: '••••' });
    expect((await prisma.company.findUniqueOrThrow({ where: { id: res.body.company.id } })).vatId).toBe('DE999');
    expect(await prisma.auditLog.count({ where: { action: { in: ['COMPANY_CREATED', 'COMPANY_UPDATED'] } } })).toBe(2);
  });
});

describe('admin vacancies', () => {
  it('approves a submitted vacancy (OPEN, publishedAt, employer notified) or rejects it with a reason', async () => {
    const staff = await asStaff();
    const employer = await asCompany('ACTIVE', { locale: 'az' });
    const v1 = await createVacancy({ companyId: employer.company.id, status: 'PENDING', publishedAt: null });
    const v2 = await createVacancy({ companyId: employer.company.id, status: 'PENDING', publishedAt: null });

    const ok = await staff.agent.post(`/api/admin/vacancies/${v1.id}/approve`);
    expect(ok.status).toBe(200);
    expect(ok.body.vacancy.status).toBe('OPEN');
    expect(ok.body.vacancy.publishedAt).toBeTruthy();
    const n = await prisma.notification.findFirst({ where: { userId: employer.user.id, type: 'VACANCY_APPROVED' } });
    expect(n?.title).toBe('Vakansiya dərc edildi');

    expect((await staff.agent.post(`/api/admin/vacancies/${v2.id}/reject`).send({})).status).toBe(400);
    const rej = await staff.agent.post(`/api/admin/vacancies/${v2.id}/reject`).send({ reason: 'Salary is missing' });
    expect(rej.body.vacancy.status).toBe('DRAFT');
    const r = await prisma.notification.findFirst({ where: { userId: employer.user.id, type: 'VACANCY_REJECTED' } });
    expect(r?.body).toContain('Salary is missing');

    expect((await staff.agent.post(`/api/admin/vacancies/${v1.id}/close`)).body.vacancy.status).toBe('CLOSED');
    expect((await staff.agent.post(`/api/admin/vacancies/${v1.id}/close`)).status).toBe(409);
  });

  it('staff create a vacancy without a company, edit all four languages and the slug', async () => {
    const { agent } = await asStaff();
    const res = await agent.post('/api/admin/vacancies').send({
      title: { az: 'Aşpaz', de: 'Koch (m/w/d)', en: 'Cook', ru: 'Повар' },
      description: { de: 'Restaurant in Berlin' },
      city: 'Berlin',
      employmentType: 'FULL_TIME',
      publish: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.vacancy).toMatchObject({ status: 'OPEN', companyId: null, slug: 'koch-m-w-d-berlin' });
    expect(res.body.vacancy.description.ru).toBe('Restaurant in Berlin');
    const id = res.body.vacancy.id;
    const patch = await agent.patch(`/api/admin/vacancies/${id}`).send({ description: { az: 'Restoran', de: 'Restaurant', en: 'Restaurant', ru: 'Ресторан' }, slug: 'koch-berlin' });
    expect(patch.body.vacancy.description.ru).toBe('Ресторан');
    expect(patch.body.vacancy.slug).toBe('koch-berlin');
    await createVacancy({ slug: 'taken-slug' });
    expect((await agent.patch(`/api/admin/vacancies/${id}`).send({ slug: 'taken-slug' })).status).toBe(409);
    expect((await agent.patch(`/api/admin/vacancies/${id}`).send({ companyId: 'nope' })).status).toBe(400);
    expect((await agent.patch(`/api/admin/vacancies/${id}`).send({ salaryMin: 5000, salaryMax: 100 })).status).toBe(400);
    expect((await agent.get(`/api/vacancies/koch-berlin`)).status).toBe(200);
    const list = await agent.get('/api/admin/vacancies?status=OPEN');
    expect(list.body.total).toBe(2);
  });

  it('does not publish vacancies of companies that are not active', async () => {
    const { agent } = await asStaff();
    const company = await createCompany({ status: 'PENDING' });
    const v = await createVacancy({ companyId: company.id, status: 'PENDING' });
    const res = await agent.post(`/api/admin/vacancies/${v.id}/approve`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('COMPANY_NOT_ACTIVE');
  });
});

describe('PATCH /api/admin/cases/:id — employer link', () => {
  it('links a case to a vacancy (and its company) with validation', async () => {
    const { agent } = await asStaff();
    const cand = await asCandidate();
    const company = await createCompany();
    const otherCompany = await createCompany();
    const v = await createVacancy({ companyId: company.id });
    const c = await prisma.case.create({ data: { number: 'TV-2026-0801', clientId: cand.user.id, profession: 'LKW-Fahrer' } });
    const res = await agent.patch(`/api/admin/cases/${c.id}`).send({ vacancyId: v.id });
    expect(res.status).toBe(200);
    expect(res.body.case).toMatchObject({ vacancyId: v.id, companyId: company.id });
    expect((await agent.patch(`/api/admin/cases/${c.id}`).send({ vacancyId: v.id, companyId: otherCompany.id })).body.error).toBe('VACANCY_COMPANY_MISMATCH');
    expect((await agent.patch(`/api/admin/cases/${c.id}`).send({ companyId: 'missing' })).body.error).toBe('INVALID_COMPANY');
    expect((await agent.patch(`/api/admin/cases/${c.id}`).send({ vacancyId: 'missing' })).body.error).toBe('INVALID_VACANCY');
    const unlink = await agent.patch(`/api/admin/cases/${c.id}`).send({ companyId: null, vacancyId: null });
    expect(unlink.body.case).toMatchObject({ companyId: null, vacancyId: null });
  });

  it('never accepts an employer account as assigned staff', async () => {
    const { agent } = await asStaff();
    const cand = await asCandidate();
    const employer = await asCompany();
    const c = await prisma.case.create({ data: { number: 'TV-2026-0802', clientId: cand.user.id, profession: 'X' } });
    expect((await agent.patch(`/api/admin/cases/${c.id}`).send({ assignedStaffId: employer.user.id })).body.error).toBe('INVALID_STAFF');
  });
});
