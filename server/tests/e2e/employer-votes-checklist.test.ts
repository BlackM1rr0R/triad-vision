import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../helpers/db';
import { asAdmin, asStaff, sessionAgent } from '../helpers/api';
import { createUser, uniq } from '../helpers/factories';
import { asCandidate, asCompany, cleanJobs, createVacancy } from './vacancies.fixtures';
import { runFirstDayReminders } from '../../src/lib/employerArrival';

beforeEach(cleanJobs);

const DAY = 24 * 60 * 60 * 1000;

/** A second portal user of the same company. */
const colleague = async (companyId: string, firstName = 'Petra') => {
  const u = await createUser({ firstName, lastName: 'Schulz', locale: 'de', role: 'COMPANY' });
  await prisma.user.update({ where: { id: u.user.id }, data: { companyId } });
  return { user: u.user, agent: sessionAgent(u.token) };
};

const proposed = async () => {
  const employer = await asCompany();
  const candidate = await asCandidate({ firstName: 'Elvin', lastName: 'Rzayev' });
  const vacancy = await createVacancy({ companyId: employer.company.id });
  const app = await prisma.vacancyApplication.create({ data: { vacancyId: vacancy.id, userId: candidate.user.id, status: 'PROPOSED' } });
  return { employer, candidate, vacancy, app };
};

describe('employer candidate votes', () => {
  it('several users vote, see who voted what; staff see the votes and get notified', async () => {
    const admin = await asAdmin();
    const { employer, candidate, app } = await proposed();
    const petra = await colleague(employer.company.id);

    const r1 = await employer.agent.put(`/api/company/candidates/${app.id}/vote`).send({ vote: 'LIKE', comment: 'Guter Eindruck' });
    expect(r1.status).toBe(200);
    expect(r1.body).toMatchObject({ ok: true, interviewRequested: false, status: 'PROPOSED', vote: { vote: 'LIKE', voterName: 'Hans Becker', mine: true } });

    const r2 = await petra.agent.put(`/api/company/candidates/${app.id}/vote`).send({ vote: 'REJECT', rejectReason: 'GERMAN', comment: 'Deutsch zu schwach' });
    expect(r2.status).toBe(200);
    expect(r2.body.vote).toMatchObject({ vote: 'REJECT', rejectReason: 'GERMAN' });

    // A reject reason is dropped for other votes; changing the own vote updates the row (one vote per user).
    const r3 = await employer.agent.put(`/api/company/candidates/${app.id}/vote`).send({ vote: 'LIKE', rejectReason: 'SALARY' });
    expect(r3.body.vote.rejectReason).toBeNull();

    const list = await employer.agent.get('/api/company/candidates');
    expect(list.status).toBe(200);
    const item = list.body.items.find((i: { id: string }) => i.id === app.id);
    expect(item.votes).toHaveLength(2);
    expect(item.voteSummary).toEqual({ LIKE: 1, INTERVIEW: 0, REJECT: 1 });
    expect(item.votes.find((v: { voterName: string }) => v.voterName === 'Petra Schulz')).toMatchObject({ vote: 'REJECT', mine: false, comment: 'Deutsch zu schwach' });
    // Privacy: still the anonymised candidate.
    expect(JSON.stringify(list.body)).not.toContain('Rzayev');

    // Staff: votes on the candidate card and on the request detail.
    const card = await admin.agent.get(`/api/admin/candidates/${candidate.user.id}`);
    expect(card.status).toBe(200);
    expect(card.body.candidate.applications[0].employerVotes).toHaveLength(2);

    await vi.waitFor(
      async () => {
        const n = await prisma.notification.findMany({ where: { userId: admin.user.id, title: { contains: 'İşəgötürən səsi' } } });
        expect(n.length).toBe(2); // LIKE (new) + REJECT (new); the unchanged LIKE re-save does not notify
      },
      { timeout: 3000 },
    );

    // Withdraw own vote.
    expect((await petra.agent.delete(`/api/company/candidates/${app.id}/vote`)).status).toBe(200);
    expect(await prisma.employerCandidateVote.count({ where: { applicationId: app.id } })).toBe(1);
  });

  it('"invite to interview" requests the interview through the existing status flow', async () => {
    const { employer, app } = await proposed();
    const res = await employer.agent.put(`/api/company/candidates/${app.id}/vote`).send({ vote: 'INTERVIEW' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ interviewRequested: true, status: 'INTERVIEW' });
    expect((await prisma.vacancyApplication.findUnique({ where: { id: app.id } }))!.status).toBe('INTERVIEW');
    // A second interview vote does not transition again.
    const petra = await colleague(employer.company.id);
    const again = await petra.agent.put(`/api/company/candidates/${app.id}/vote`).send({ vote: 'INTERVIEW' });
    expect(again.body.interviewRequested).toBe(false);
  });

  it('another company cannot vote or see votes; closed applications cannot be voted on', async () => {
    const { app, employer } = await proposed();
    const other = await asCompany();
    expect((await other.agent.put(`/api/company/candidates/${app.id}/vote`).send({ vote: 'LIKE' })).status).toBe(404);
    expect((await employer.agent.put(`/api/company/candidates/${app.id}/vote`).send({ vote: 'MAYBE' })).status).toBe(400);
    await prisma.vacancyApplication.update({ where: { id: app.id }, data: { status: 'ACCEPTED' } });
    expect((await employer.agent.put(`/api/company/candidates/${app.id}/vote`).send({ vote: 'LIKE' })).status).toBe(409);
  });
});

describe('employer arrival checklist', () => {
  const placed = async () => {
    const employer = await asCompany();
    const worker = await asCandidate({ firstName: 'Nicat', lastName: 'Kərimov' });
    const c = await prisma.case.create({ data: { number: uniq('TV-'), clientId: worker.user.id, profession: 'LKW-Fahrer', companyId: employer.company.id, status: 'APPROVED' } });
    return { employer, worker, c };
  };

  it('seeds defaults, ticks items with who/when, custom items, staff and worker views', async () => {
    const { employer, worker, c } = await placed();
    const start = new Date(Date.UTC(2027, 0, 4));
    await prisma.employmentContract.create({ data: { caseId: c.id, companyId: employer.company.id, startDate: start } });

    const res = await employer.agent.get(`/api/company/workers/${c.id}/checklist`);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { key: string }) => i.key)).toEqual(['HOUSING', 'ANMELDUNG', 'BANK_ACCOUNT', 'HEALTH_INSURANCE', 'TAX_ID', 'FIRST_DAY', 'WORKWEAR', 'SAFETY_BRIEFING']);
    expect(res.body.progress).toEqual({ done: 0, total: 8 });
    expect(res.body.firstDay).toBe(start.toISOString());

    const housing = res.body.items[0];
    const tick = await employer.agent.patch(`/api/company/workers/${c.id}/checklist/${housing.id}`).send({ done: true, note: 'WG Hamburg-Altona', dueDate: '2026-12-20' });
    expect(tick.status).toBe(200);
    expect(tick.body.item).toMatchObject({ done: true, doneByName: 'Hans Becker', note: 'WG Hamburg-Altona' });
    expect(tick.body.item.doneAt).toBeTruthy();
    // Default items cannot be renamed or removed.
    expect((await employer.agent.patch(`/api/company/workers/${c.id}/checklist/${housing.id}`).send({ label: 'x' })).status).toBe(400);
    expect((await employer.agent.delete(`/api/company/workers/${c.id}/checklist/${housing.id}`)).status).toBe(400);

    const add = await employer.agent.post(`/api/company/workers/${c.id}/checklist`).send({ label: 'Parkausweis', visibleToWorker: true });
    expect(add.status).toBe(201);
    expect(add.body.item).toMatchObject({ custom: true, label: 'Parkausweis', done: false });
    const hidden = await employer.agent.post(`/api/company/workers/${c.id}/checklist`).send({ label: 'Interne Kostenstelle' });
    expect(hidden.body.item.visibleToWorker).toBe(false);
    expect((await employer.agent.delete(`/api/company/workers/${c.id}/checklist/${hidden.body.item.id}`)).status).toBe(200);

    const overview = await employer.agent.get('/api/company/workers/checklists/overview');
    expect(overview.body.items).toHaveLength(1);
    expect(overview.body.items[0]).toMatchObject({ caseId: c.id, name: 'Nicat K.', progress: { done: 1, total: 9 } });

    // Staff: arrival view.
    const staff = await asStaff();
    await prisma.arrivalPlan.create({ data: { caseId: c.id, clientId: worker.user.id, status: 'SUBMITTED' } });
    const sv = await staff.agent.get(`/api/admin/arrivals/${c.id}`);
    expect(sv.status).toBe(200);
    expect(sv.body.employerChecklist.progress).toEqual({ done: 1, total: 9 });
    expect(sv.body.employerChecklist.items[0]).toMatchObject({ key: 'HOUSING', doneByName: 'Hans Becker', note: 'WG Hamburg-Altona' });
    const sl = await staff.agent.get('/api/admin/arrivals?status=all');
    expect(sl.body.items.find((p: { caseId: string }) => p.caseId === c.id).employerChecklist).toMatchObject({ done: 1, total: 9 });

    // Worker: read-only, visible items without notes or names.
    const wv = await worker.agent.get(`/api/arrival/${c.id}`);
    expect(wv.status).toBe(200);
    expect(wv.body.employerChecklist.items).toHaveLength(9);
    const raw = JSON.stringify(wv.body.employerChecklist);
    expect(raw).not.toContain('Hans');
    expect(raw).not.toContain('Altona');
  });

  it('is scoped to the company and to approved, not-left workers', async () => {
    const { employer, c } = await placed();
    const other = await asCompany();
    expect((await other.agent.get(`/api/company/workers/${c.id}/checklist`)).status).toBe(404);
    await prisma.case.update({ where: { id: c.id }, data: { status: 'DECISION_PENDING' } });
    expect((await employer.agent.get(`/api/company/workers/${c.id}/checklist`)).status).toBe(404);
  });

  it('reminds the company users before the first work day when items are open (once)', async () => {
    const { employer, c } = await placed();
    const petra = await colleague(employer.company.id);
    const now = new Date();
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + 2 * DAY);
    await prisma.employmentContract.create({ data: { caseId: c.id, companyId: employer.company.id, startDate: first } });
    await employer.agent.get(`/api/company/workers/${c.id}/checklist`).expect(200);

    expect(await runFirstDayReminders(now)).toBe(1);
    expect(await runFirstDayReminders(now)).toBe(0);
    for (const id of [employer.user.id, petra.user.id]) {
      const n = await prisma.notification.findMany({ where: { userId: id, type: 'EMPLOYER_ARRIVAL_CHECKLIST' } });
      expect(n).toHaveLength(1);
      expect(n[0].body).toContain('8');
    }

    // Moving the first work day re-arms the reminder.
    const firstDay = await prisma.employerArrivalItem.findFirstOrThrow({ where: { caseId: c.id, key: 'FIRST_DAY' } });
    const moved = new Date(first.getTime() + DAY).toISOString().slice(0, 10);
    await employer.agent.patch(`/api/company/workers/${c.id}/checklist/${firstDay.id}`).send({ dueDate: moved }).expect(200);
    expect((await prisma.employerArrivalItem.findUniqueOrThrow({ where: { id: firstDay.id } })).remindedAt).toBeNull();
  });
});
