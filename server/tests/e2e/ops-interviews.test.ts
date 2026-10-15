import { beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';
import { runInterviewReminders } from '../../src/jobs/interviews.js';
import { asCandidate, asCompany, createVacancy } from './vacancies.fixtures';
import { cleanOps, inHours } from './ops.fixtures';

beforeEach(cleanOps);

/** Company A with a vacancy and a candidate presented to it (PROPOSED). */
const setup = async () => {
  const companyA = await asCompany();
  const companyB = await asCompany();
  const candidate = await asCandidate({}, { locale: 'en' });
  const vacancy = await createVacancy({ companyId: companyA.company.id });
  const application = await prisma.vacancyApplication.create({ data: { vacancyId: vacancy.id, userId: candidate.user.id, status: 'PROPOSED', matchScore: 80 } });
  return { companyA, companyB, candidate, vacancy, application };
};

describe('interview lifecycle', () => {
  it('staff schedules → candidate is notified with .ics, confirms; company sees an anonymised view; cancel notifies everyone', async () => {
    const { companyA, candidate, application } = await setup();
    const staff = await asStaff({ locale: 'az' });
    const startsAt = inHours(48);

    const created = expectStatus(
      await staff.agent.post('/api/interviews').send({ applicationId: application.id, startsAt: startsAt.toISOString(), minutes: 30, notes: 'Zoom yox, Jitsi' }),
      201,
    );
    const i = created.body.interview;
    expect(i.status).toBe('PROPOSED');
    expect(i.meetingUrl).toMatch(/^https:\/\/meet\.jit\.si\/TriadVision-[0-9a-f]{20}$/);
    expect(new Date(i.endsAt).getTime() - new Date(i.startsAt).getTime()).toBe(30 * 60 * 1000);
    expect(i.company.id).toBe(companyA.company.id);
    expect(i.candidate).toMatchObject({ id: candidate.user.id, name: 'Ali Məmmədov', email: candidate.user.email });
    expect(i.staff.id).toBe(staff.user.id);
    // Proposing an interview moves the application along.
    expect((await prisma.vacancyApplication.findUniqueOrThrow({ where: { id: application.id } })).status).toBe('INTERVIEW');

    // Candidate: in-app (English) + e-mail with the calendar attachment.
    const n = await prisma.notification.findFirst({ where: { userId: candidate.user.id, type: 'INTERVIEW_SCHEDULED' } });
    expect(n?.title).toContain('Interview proposed');
    expect(n?.link).toBe('/account/interviews');
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: candidate.user.email, subject: { contains: 'Interview proposed' } } }));
    // Employer users (German) get it too.
    const cn = await prisma.notification.findFirst({ where: { userId: companyA.user.id, type: 'INTERVIEW_SCHEDULED' } });
    expect(cn?.title).toContain('Vorstellungsgespräch');

    // Candidate view hides nothing they need; the company view is anonymised.
    const mine = expectStatus(await candidate.agent.get('/api/interviews/mine'), 200);
    expect(mine.body.upcoming).toHaveLength(1);
    expect(mine.body.upcoming[0].meetingUrl).toBe(i.meetingUrl);
    const forCompany = expectStatus(await companyA.agent.get(`/api/interviews/${i.id}`), 200);
    expect(forCompany.body.interview.candidate).toEqual({ id: candidate.user.id, name: 'Ali M.', profession: 'Sürücü' });
    expect(forCompany.body.interview.candidate.email).toBeUndefined();

    // ICS download for an involved party.
    const ics = await candidate.agent.get(`/api/interviews/${i.id}/ics`);
    expect(ics.status).toBe(200);
    expect(ics.headers['content-type']).toContain('text/calendar');
    expect(ics.text).toContain('BEGIN:VEVENT');
    expect(ics.text).toContain(`UID:interview-${i.id}@triad-vision.de`);

    // Candidate confirms → staff and company hear about it.
    const confirmed = expectStatus(await candidate.agent.post(`/api/interviews/${i.id}/confirm`), 200);
    expect(confirmed.body.interview.status).toBe('CONFIRMED');
    expect(await prisma.notification.findFirst({ where: { userId: staff.user.id, type: 'INTERVIEW_CONFIRMED' } })).not.toBeNull();
    expect(await prisma.notification.findFirst({ where: { userId: companyA.user.id, type: 'INTERVIEW_CONFIRMED' } })).not.toBeNull();
    expect((await candidate.agent.post(`/api/interviews/${i.id}/confirm`)).status).toBe(409);

    // Company cancels with a reason → candidate notified.
    const cancelled = expectStatus(await companyA.agent.patch(`/api/interviews/${i.id}`).send({ status: 'CANCELLED', reason: 'Position filled' }), 200);
    expect(cancelled.body.interview.status).toBe('CANCELLED');
    expect(cancelled.body.interview.meetingUrl).toBeNull();
    const cancelNote = await prisma.notification.findFirst({ where: { userId: candidate.user.id, type: 'INTERVIEW_CANCELLED' } });
    expect(cancelNote?.body).toContain('Position filled');
  });

  it('rescheduling resets the status to PROPOSED and re-arms reminders; decline tells staff and company', async () => {
    const { companyA, candidate, application } = await setup();
    const staff = await asStaff();
    const i = expectStatus(await staff.agent.post('/api/interviews').send({ applicationId: application.id, startsAt: inHours(30).toISOString() }), 201).body.interview;
    expectStatus(await candidate.agent.post(`/api/interviews/${i.id}/confirm`), 200);

    const moved = expectStatus(await companyA.agent.patch(`/api/interviews/${i.id}`).send({ startsAt: inHours(50).toISOString(), minutes: 60 }), 200);
    expect(moved.body.interview.status).toBe('PROPOSED');
    expect(new Date(moved.body.interview.endsAt).getTime() - new Date(moved.body.interview.startsAt).getTime()).toBe(60 * 60 * 1000);
    expect(await prisma.notification.findFirst({ where: { userId: candidate.user.id, type: 'INTERVIEW_RESCHEDULED' } })).not.toBeNull();

    const declined = expectStatus(await candidate.agent.post(`/api/interviews/${i.id}/decline`).send({ reason: 'Travelling' }), 200);
    expect(declined.body.interview.status).toBe('CANCELLED');
    const forStaff = await prisma.notification.findFirst({ where: { userId: staff.user.id, type: 'INTERVIEW_DECLINED' } });
    expect(forStaff?.title).toContain('Ali Məmmədov');
    const forCompany = await prisma.notification.findFirst({ where: { userId: companyA.user.id, type: 'INTERVIEW_DECLINED' } });
    expect(forCompany?.title).toContain('Ali M.');
    expect(forCompany?.title).not.toContain('Məmmədov');
  });

  it('refuses overlapping, past and malformed times', async () => {
    const { candidate, application } = await setup();
    const staff = await asStaff();
    const at = inHours(24);
    expectStatus(await staff.agent.post('/api/interviews').send({ applicationId: application.id, startsAt: at.toISOString(), minutes: 45 }), 201);
    const overlap = await staff.agent.post('/api/interviews').send({ candidateId: candidate.user.id, startsAt: new Date(at.getTime() + 20 * 60000).toISOString(), minutes: 30 });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error).toBe('CANDIDATE_BUSY');
    expect((await staff.agent.post('/api/interviews').send({ candidateId: candidate.user.id, startsAt: inHours(-5).toISOString() })).body.error).toBe('TIME_IN_PAST');
    expect((await staff.agent.post('/api/interviews').send({ candidateId: candidate.user.id, startsAt: inHours(72).toISOString(), minutes: 2 })).status).toBe(400);
    expect((await staff.agent.post('/api/interviews').send({ startsAt: inHours(72).toISOString() })).body.error).toBe('CANDIDATE_REQUIRED');
  });
});

describe('interview permissions', () => {
  it('a company only proposes for its own presented applicants and never touches other companies’ interviews', async () => {
    const { companyA, companyB, candidate, application } = await setup();
    const staff = await asStaff();

    // Company A proposes for its applicant; the companyId is forced to its own.
    const own = expectStatus(await companyA.agent.post('/api/interviews').send({ applicationId: application.id, startsAt: inHours(40).toISOString(), companyId: companyB.company.id }), 201);
    expect(own.body.interview.company.id).toBe(companyA.company.id);
    expect(own.body.interview.candidate.name).toBe('Ali M.');
    // Staff got a notification (the creator is a company user, so the "staff" slot is empty → nobody): the candidate did.
    expect(await prisma.notification.findFirst({ where: { userId: candidate.user.id, type: 'INTERVIEW_SCHEDULED' } })).not.toBeNull();

    // Company B: not its applicant.
    const foreign = await companyB.agent.post('/api/interviews').send({ applicationId: application.id, startsAt: inHours(60).toISOString() });
    expect(foreign.status).toBe(404);
    // Without an application an employer cannot schedule at all.
    expect((await companyB.agent.post('/api/interviews').send({ candidateId: candidate.user.id, startsAt: inHours(60).toISOString() })).body.error).toBe('APPLICATION_REQUIRED');
    // A NEW application (not yet presented) is invisible to the employer.
    const hidden = await prisma.vacancyApplication.create({ data: { vacancyId: (await createVacancy({ companyId: companyB.company.id })).id, userId: (await asCandidate()).user.id, status: 'NEW' } });
    expect((await companyB.agent.post('/api/interviews').send({ applicationId: hidden.id, startsAt: inHours(60).toISOString() })).status).toBe(404);

    const id = own.body.interview.id;
    expect((await companyB.agent.get(`/api/interviews/${id}`)).status).toBe(404);
    expect((await companyB.agent.patch(`/api/interviews/${id}`).send({ status: 'CANCELLED' })).status).toBe(404);
    expect((await companyB.agent.get('/api/interviews')).body.items).toHaveLength(0);
    expect((await companyA.agent.get('/api/interviews')).body.items).toHaveLength(1);
    // A company cannot set staff-only statuses / fields, delete, or answer as the candidate.
    expectStatus(await candidate.agent.post(`/api/interviews/${id}/confirm`), 200);
    expect((await companyA.agent.patch(`/api/interviews/${id}`).send({ status: 'PROPOSED' })).status).toBe(403);
    expect((await companyA.agent.patch(`/api/interviews/${id}`).send({ staffId: staff.user.id })).status).toBe(403);
    expect((await companyA.agent.delete(`/api/interviews/${id}`)).status).toBe(403);
    expect((await companyA.agent.post(`/api/interviews/${id}/confirm`)).status).toBe(403);
    // Candidates cannot create, patch or see others' interviews.
    const other = await asClient();
    expect((await candidate.agent.post('/api/interviews').send({ candidateId: candidate.user.id, startsAt: inHours(70).toISOString() })).status).toBe(403);
    expect((await candidate.agent.patch(`/api/interviews/${id}`).send({ notes: 'x' })).status).toBe(403);
    expect((await other.agent.get(`/api/interviews/${id}`)).status).toBe(404);
    expect((await other.agent.post(`/api/interviews/${id}/confirm`)).status).toBe(404);
    // Anonymous: 401.
    expect((await anon().get('/api/interviews/mine')).status).toBe(401);
    // Staff deletes (cancelling first → candidate notified).
    expectStatus(await staff.agent.delete(`/api/interviews/${id}`), 200);
    expect(await prisma.interview.findUnique({ where: { id } })).toBeNull();
    expect(await prisma.notification.findFirst({ where: { userId: candidate.user.id, type: 'INTERVIEW_CANCELLED' } })).not.toBeNull();
  });

  it('lists applicants an employer may invite', async () => {
    const { companyA, companyB, application } = await setup();
    const list = expectStatus(await companyA.agent.get('/api/interviews/applicants'), 200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ applicationId: application.id, name: 'Ali M.', status: 'PROPOSED' });
    expect((await companyB.agent.get('/api/interviews/applicants')).body.items).toHaveLength(0);
    expect((await (await asAdmin()).agent.get('/api/interviews/applicants')).status).toBe(403);
  });
});

describe('interview reminders and webhooks', () => {
  it('sends 24 h and 1 h reminders once per start time to candidate, company and staff', async () => {
    const { companyA, candidate, application } = await setup();
    const staff = await asStaff();
    const DAY = 24 * 60 * 60 * 1000;
    const soon = await prisma.interview.create({
      data: {
        applicationId: application.id, companyId: companyA.company.id, candidateId: candidate.user.id, staffId: staff.user.id, createdById: staff.user.id,
        startsAt: inHours(20), endsAt: inHours(20.5), status: 'CONFIRMED', meetingUrl: 'https://meet.jit.si/TriadVision-test', updatedAt: new Date(Date.now() - 2 * DAY),
      },
    });
    const now = new Date();
    expect(await runInterviewReminders(now)).toBe(1);
    expect(await runInterviewReminders(now)).toBe(0);
    for (const uid of [candidate.user.id, companyA.user.id, staff.user.id]) {
      expect(await prisma.notification.findFirst({ where: { userId: uid, type: 'INTERVIEW_REMINDER24H' } }), uid).not.toBeNull();
    }
    // Moving it to within the hour → a 1 h reminder (fresh key).
    await prisma.interview.update({ where: { id: soon.id }, data: { startsAt: inHours(0.5), endsAt: inHours(1) } });
    expect(await runInterviewReminders(new Date())).toBe(1);
    expect(await prisma.notification.findFirst({ where: { userId: candidate.user.id, type: 'INTERVIEW_REMINDER1H' } })).not.toBeNull();
    // Proposed (unconfirmed) and cancelled interviews are not reminded.
    await prisma.interview.update({ where: { id: soon.id }, data: { status: 'PROPOSED', startsAt: inHours(10), endsAt: inHours(10.5) } });
    expect(await runInterviewReminders(new Date())).toBe(0);
  });

  it('records interview.scheduled / interview.updated deliveries for the company’s webhook', async () => {
    const { companyA, companyB, candidate, application } = await setup();
    const staff = await asStaff();
    const hookA = await prisma.webhook.create({ data: { url: 'https://a.example/hook', secret: 's', events: ['interview.scheduled', 'interview.updated'], companyId: companyA.company.id } });
    await prisma.webhook.create({ data: { url: 'https://b.example/hook', secret: 's', events: ['interview.scheduled'], companyId: companyB.company.id } });
    const global = await prisma.webhook.create({ data: { url: 'https://all.example/hook', secret: 's', events: ['interview.scheduled'], companyId: null } });

    const i = expectStatus(await staff.agent.post('/api/interviews').send({ applicationId: application.id, startsAt: inHours(26).toISOString() }), 201).body.interview;
    const scheduled = await prisma.webhookDelivery.findMany({ where: { event: 'interview.scheduled' } });
    expect(scheduled.map((d) => d.webhookId).sort()).toEqual([hookA.id, global.id].sort());
    expect((scheduled[0].payload as { data: { candidate: { name: string } } }).data.candidate.name).toBe('Ali M.');

    expectStatus(await candidate.agent.post(`/api/interviews/${i.id}/confirm`), 200);
    const updated = await prisma.webhookDelivery.findMany({ where: { event: 'interview.updated' } });
    expect(updated).toHaveLength(1);
    expect(updated[0].webhookId).toBe(hookA.id);
    expect(updated[0].status).toBe('PENDING');
  });
});
