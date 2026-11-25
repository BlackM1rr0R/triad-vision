import { beforeEach, describe, expect, it } from 'vitest';
import { anon, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { asCandidate, asCompany, createVacancy } from './vacancies.fixtures';
import { cleanOps } from './ops.fixtures';

// Employer tracking: the share page and the company candidate list show the visa stage of the candidate's case
// for THAT employer's vacancy (stage + dates + approximate arrival), nothing else, nothing for other employers.

beforeEach(cleanOps);

const tokenOf = (url: string) => url.split('/kandidat/')[1]!;

const setup = async (status: 'DOCUMENTS_REVIEW' | 'DECISION_PENDING' | 'REJECTED' = 'DECISION_PENDING') => {
  const staff = await asStaff();
  const employer = await asCompany();
  const other = await asCompany();
  const candidate = await asCandidate();
  const vacancy = await createVacancy({ companyId: employer.company.id });
  const otherVacancy = await createVacancy({ companyId: other.company.id });
  const application = await prisma.vacancyApplication.create({ data: { vacancyId: vacancy.id, userId: candidate.user.id, status: 'PROPOSED', matchScore: 90 } });
  const otherApplication = await prisma.vacancyApplication.create({ data: { vacancyId: otherVacancy.id, userId: candidate.user.id, status: 'PROPOSED', matchScore: 80 } });
  const kase = await prisma.case.create({ data: { number: 'TV-2026-VT01', clientId: candidate.user.id, profession: 'LKW-Fahrer', status, vacancyId: vacancy.id, companyId: employer.company.id, assignedStaffId: staff.user.id } });
  await prisma.caseEvent.create({ data: { caseId: kase.id, type: 'CASE_CREATED', toStatus: 'DOCUMENTS_PENDING', createdAt: new Date('2026-01-02T10:00:00Z') } });
  await prisma.caseEvent.create({ data: { caseId: kase.id, type: 'STATUS_CHANGED', fromStatus: 'DOCUMENTS_PENDING', toStatus: 'DOCUMENTS_REVIEW', createdAt: new Date('2026-01-08T10:00:00Z') } });
  return { staff, employer, other, candidate, vacancy, application, otherApplication, kase };
};

describe('employer visa tracking', () => {
  it('the share page shows stage, dates and an approximate arrival, without documents or ids', async () => {
    const { staff, candidate, application, kase } = await setup();
    const created = await staff.agent.post(`/api/admin/placement/candidates/${candidate.user.id}/share-links`).send({ applicationId: application.id });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const view = await anon().get(`/api/candidate-share/${tokenOf(created.body.url)}`);
    expect(view.status).toBe(200);
    const visa = view.body.share.visa;
    expect(visa.approximate).toBe(true);
    expect(visa.currentStep).toBe('decision');
    expect(visa.steps.map((s: { state: string }) => s.state)).toEqual(['done', 'done', 'done', 'done', 'current', 'upcoming']);
    expect(visa.steps[0].reachedAt).toBe('2026-01-02T10:00:00.000Z');
    expect(visa.steps[5].reachedAt).toBeNull();
    const raw = JSON.stringify(visa);
    for (const secret of [kase.id, kase.number, candidate.user.id, 'LKW-Fahrer']) expect(raw).not.toContain(secret);
    expect(Object.keys(visa).sort()).toEqual(['approximate', 'arrival', 'currentStep', 'steps']);
  });

  it('a link for another employer does not show the case of the first employer', async () => {
    const { staff, candidate, otherApplication } = await setup();
    const created = await staff.agent.post(`/api/admin/placement/candidates/${candidate.user.id}/share-links`).send({ applicationId: otherApplication.id });
    const view = await anon().get(`/api/candidate-share/${tokenOf(created.body.url)}`);
    expect(view.status).toBe(200);
    expect(view.body.share.visa).toBeNull();
  });

  it('refused / cancelled cases show nothing', async () => {
    const { staff, candidate, application } = await setup('REJECTED');
    const created = await staff.agent.post(`/api/admin/placement/candidates/${candidate.user.id}/share-links`).send({ applicationId: application.id });
    const view = await anon().get(`/api/candidate-share/${tokenOf(created.body.url)}`);
    expect(view.body.share.visa).toBeNull();
  });

  it('the company portal list carries the progress only for the company\'s own vacancy', async () => {
    const { employer, other, application } = await setup();
    const mine = await employer.agent.get('/api/company/candidates');
    expect(mine.status).toBe(200);
    const item = mine.body.items.find((i: { id: string }) => i.id === application.id);
    expect(item.visa.currentStep).toBe('decision');
    expect(JSON.stringify(item.visa)).not.toContain('TV-2026-VT01');

    const theirs = await other.agent.get('/api/company/candidates');
    expect(theirs.status).toBe(200);
    expect(theirs.body.items.every((i: { visa: unknown }) => i.visa === null)).toBe(true);
    expect(theirs.body.items.some((i: { id: string }) => i.id === application.id)).toBe(false);
  });
});
