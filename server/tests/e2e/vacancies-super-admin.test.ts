import { beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { cleanJobs, createCompany, createVacancy } from './vacancies.fixtures';

// SUPER_ADMIN edits everything on a vacancy, in every state (employer-made, closed, expired); changes are audited.

beforeEach(cleanJobs);

const DAY = 24 * 60 * 60 * 1000;

describe('PATCH /api/admin/vacancies/:id as SUPER_ADMIN', () => {
  it('edits all fields of a closed, expired employer vacancy, incl. status and dates, with an audited diff', async () => {
    const sa = await asSuperAdmin();
    const employer = await createCompany({ status: 'PENDING' });
    const other = await createCompany();
    const visa = await prisma.visaCategory.findFirst({ select: { id: true } });
    const v = await createVacancy({ companyId: employer.id, status: 'CLOSED', closesAt: new Date(Date.now() - 3 * DAY), publishedAt: new Date('2026-01-10T08:00:00Z') });

    const res = await sa.agent.patch(`/api/admin/vacancies/${v.id}`).send({
      title: { az: 'Sürücü', de: 'Fahrer', en: 'Driver', ru: 'Водитель' },
      description: { de: 'Neue Beschreibung' },
      requirements: { de: ['Führerschein CE'] },
      companyId: other.id,
      ...(visa ? { visaCategoryId: visa.id } : {}),
      profession: 'Berufskraftfahrer',
      salaryMin: 3000,
      salaryMax: 3600,
      closesAt: new Date(Date.now() - DAY).toISOString().slice(0, 10), // a past date: allowed for the super admin
      status: 'OPEN',
      publishedAt: '2026-02-01',
      slug: 'fahrer-ce-neu',
    });
    expect(res.status).toBe(200);
    expect(res.body.vacancy).toMatchObject({ status: 'OPEN', companyId: other.id, profession: 'Berufskraftfahrer', salaryMin: 3000, salaryMax: 3600, slug: 'fahrer-ce-neu' });
    expect(res.body.vacancy.publishedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(res.body.vacancy.title.en).toBe('Driver');

    const row = await waitFor(() => prisma.auditLog.findFirst({ where: { action: 'VACANCY_UPDATED', target: `vacancy:${v.id}` } }));
    const details = row.details as { by?: string; changes: Record<string, unknown> };
    expect(details.by).toBe('SUPER_ADMIN');
    expect(details.changes.status).toEqual({ from: 'CLOSED', to: 'OPEN' });
    expect(details.changes.companyId).toEqual({ from: employer.id, to: other.id });
    expect(details.changes.title).toBe('changed');
    expect(details.changes).not.toHaveProperty('city'); // unchanged fields are not listed
  });

  it('opening directly sets a first publication date; publishing for an inactive employer is allowed', async () => {
    const sa = await asSuperAdmin();
    const pending = await createCompany({ status: 'PENDING' });
    const draft = await createVacancy({ companyId: pending.id, status: 'DRAFT', publishedAt: null });
    const opened = await sa.agent.patch(`/api/admin/vacancies/${draft.id}`).send({ status: 'OPEN' });
    expect(opened.status).toBe(200);
    expect(opened.body.vacancy.publishedAt).toBeTruthy();

    const v2 = await createVacancy({ companyId: pending.id, status: 'PENDING' });
    const approved = await sa.agent.post(`/api/admin/vacancies/${v2.id}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.vacancy.status).toBe('OPEN');
  });
});

describe('restrictions stay for STAFF / ADMIN', () => {
  it('status and publication date are SUPER_ADMIN only; a new past closing date is refused, the stored one may be sent back', async () => {
    const expired = await createVacancy({ status: 'OPEN', closesAt: new Date(Date.now() - 2 * DAY) });
    const storedDay = expired.closesAt!.toISOString().slice(0, 10);
    for (const actor of [await asStaff(), await asAdmin()]) {
      const s = await actor.agent.patch(`/api/admin/vacancies/${expired.id}`).send({ status: 'CLOSED' });
      expect(s.status).toBe(403);
      expect(s.body.error).toBe('SUPER_ADMIN_ONLY');
      expect((await actor.agent.patch(`/api/admin/vacancies/${expired.id}`).send({ publishedAt: '2026-01-01' })).status).toBe(403);
      // Editing an expired vacancy: the form sends its stored closing date back unchanged.
      const ok = await actor.agent.patch(`/api/admin/vacancies/${expired.id}`).send({ city: 'Bremen', closesAt: storedDay });
      expect(ok.status).toBe(200);
      expect(ok.body.vacancy.city).toBe('Bremen');
      const past = await actor.agent.patch(`/api/admin/vacancies/${expired.id}`).send({ closesAt: new Date(Date.now() - 10 * DAY).toISOString().slice(0, 10) });
      expect(past.status).toBe(400);
      expect(past.body.error).toBe('DATE_NOT_IN_FUTURE');
    }
    const staff = await asStaff();
    const pending = await createCompany({ status: 'PENDING' });
    const v = await createVacancy({ companyId: pending.id, status: 'PENDING' });
    const res = await staff.agent.post(`/api/admin/vacancies/${v.id}/approve`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('COMPANY_NOT_ACTIVE');
  });
});
