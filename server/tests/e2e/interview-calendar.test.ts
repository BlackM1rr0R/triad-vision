import { beforeEach, describe, expect, it } from 'vitest';
import { anon, asStaff } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';
import { zonedDay, zonedToUtc } from '../../src/lib/ics.js';
import { runInviteNudges } from '../../src/jobs/interviews.js';
import { asCandidate, asCompany, createVacancy } from './vacancies.fixtures';
import { cleanOps } from './ops.fixtures';

beforeEach(async () => {
  await prisma.interviewInvite.deleteMany();
  await prisma.interviewAvailability.deleteMany();
  await prisma.interviewSchedulingSettings.deleteMany();
  await prisma.reminderLog.deleteMany({ where: { key: { startsWith: 'interview-invite-' } } });
  await cleanOps();
});

/**
 * A German calendar day five days ahead (by German date, not "now + n × 24 h" arithmetic on
 * instants) and a helper for German wall-clock times on it.
 */
const germanDay = () => {
  const d = zonedDay(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), 'Europe/Berlin');
  const day = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  const at = (h: number, m = 0) => zonedToUtc(d.y, d.m, d.d, h, m, 'Europe/Berlin');
  return { day, at, weekday: ((d.weekday + 6) % 7) + 1 };
};

const bakuTime = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baku', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

const setup = async () => {
  const companyA = await asCompany();
  const companyB = await asCompany();
  const candidate = await asCandidate({}, { locale: 'en' });
  const vacancy = await createVacancy({ companyId: companyA.company.id });
  const application = await prisma.vacancyApplication.create({ data: { vacancyId: vacancy.id, userId: candidate.user.id, status: 'PROPOSED', matchScore: 80 } });
  return { companyA, companyB, candidate, application };
};

describe('interview calendar: employer free hours → candidate picks a time', () => {
  it('availability, invite, free slots in both time zones, booking, moving within the limit, staff override, cancellation', async () => {
    const { companyA, companyB, candidate, application } = await setup();
    const g = germanDay();

    // Free hours 09:00–12:00 German time that day, 10:00–11:00 blocked; one-hour slots.
    expect((await companyA.agent.put('/api/interview-calendar/availability').send({ dates: [{ day: g.day, startTime: '12:00', endTime: '09:00' }] })).body.error).toBe('INVALID_AVAILABILITY');
    const saved = expectStatus(
      await companyA.agent.put('/api/interview-calendar/availability').send({
        settings: { slotMinutes: 60, bufferMinutes: 0, minNoticeHours: 24, horizonDays: 30, cancelCutoffHours: 12, maxReschedules: 1 },
        weekly: [],
        dates: [{ day: g.day, startTime: '09:00', endTime: '12:00' }],
        blocks: [{ day: g.day, startTime: '10:00', endTime: '11:00', note: 'Team meeting' }],
      }),
      200,
    );
    expect(saved.body.settings).toMatchObject({ slotMinutes: 60, maxReschedules: 1 });
    expect(saved.body.dates).toHaveLength(1);
    expect(saved.body.blocks[0].note).toBe('Team meeting');
    const preview = expectStatus(await companyA.agent.get('/api/interview-calendar/availability/preview'), 200);
    expect(preview.body.slots.map((s: { startsAt: string }) => s.startsAt)).toEqual([g.at(9).toISOString(), g.at(11).toISOString()]);

    // Company B cannot invite A's applicant.
    expect((await companyB.agent.post('/api/interview-calendar/invites').send({ applicationId: application.id })).status).toBe(404);

    const created = expectStatus(await companyA.agent.post('/api/interview-calendar/invites').send({ applicationId: application.id, notes: 'Bitte Führerschein bereithalten' }), 201);
    const invite = created.body.invite;
    expect(invite).toMatchObject({ status: 'OPEN', minutes: 60, candidate: { name: 'Ali M.' } });
    expect((await prisma.vacancyApplication.findUniqueOrThrow({ where: { id: application.id } })).status).toBe('INTERVIEW');
    expect((await prisma.notification.findFirst({ where: { userId: candidate.user.id, type: 'INTERVIEW_INVITED' } }))?.title).toContain('Choose your interview time');
    expect((await companyA.agent.post('/api/interview-calendar/invites').send({ applicationId: application.id })).body.error).toBe('INVITE_EXISTS');

    // The candidate sees the invite and the free slots, in German and in Baku time.
    const mine = expectStatus(await candidate.agent.get('/api/interview-calendar/invites'), 200);
    expect(mine.body.items.map((i: { id: string }) => i.id)).toEqual([invite.id]);
    const slots = expectStatus(await candidate.agent.get(`/api/interview-calendar/invites/${invite.id}/slots`), 200).body.slots;
    expect(slots).toHaveLength(2);
    expect(slots[0].berlin).toMatchObject({ day: g.day, time: '09:00', until: '10:00' });
    expect(slots[0].baku.time).toBe(bakuTime(g.at(9)));

    // An event in the employer's own calendar takes the 11:00 slot away.
    const event = await prisma.calendarEvent.create({ data: { ownerId: companyA.user.id, title: 'Lieferant', startsAt: g.at(11, 15), endsAt: g.at(11, 30) } });
    expect(expectStatus(await candidate.agent.get(`/api/interview-calendar/invites/${invite.id}/slots`), 200).body.slots).toHaveLength(1);

    // Booking: only free slot starts, never as the employer, never forced by the candidate.
    expect((await candidate.agent.post(`/api/interview-calendar/invites/${invite.id}/book`).send({ startsAt: g.at(10).toISOString() })).body.error).toBe('SLOT_UNAVAILABLE');
    expect((await candidate.agent.post(`/api/interview-calendar/invites/${invite.id}/book`).send({ startsAt: g.at(11).toISOString() })).body.error).toBe('SLOT_UNAVAILABLE');
    expect((await companyA.agent.post(`/api/interview-calendar/invites/${invite.id}/book`).send({ startsAt: g.at(9).toISOString() })).status).toBe(403);
    expect((await candidate.agent.post(`/api/interview-calendar/invites/${invite.id}/book`).send({ startsAt: g.at(10).toISOString(), force: true })).status).toBe(403);
    const booked = expectStatus(await candidate.agent.post(`/api/interview-calendar/invites/${invite.id}/book`).send({ startsAt: g.at(9).toISOString() }), 201);
    expect(booked.body.interview).toMatchObject({ status: 'CONFIRMED', startsAt: g.at(9).toISOString(), endsAt: g.at(10).toISOString(), inviteId: invite.id, notes: 'Bitte Führerschein bereithalten' });
    expect(booked.body.interview.meetingUrl).toMatch(/^https:\/\/meet\.jit\.si\/TriadVision-[0-9a-f]{20}$/);
    expect(booked.body.invite).toMatchObject({ status: 'BOOKED', canMove: true, reschedulesLeft: 1 });
    // Confirmation for the candidate, "booked" for the employer — both by e-mail with the calendar invite.
    expect(await prisma.notification.findFirst({ where: { userId: candidate.user.id, type: 'INTERVIEW_CONFIRMED' } })).not.toBeNull();
    expect((await prisma.notification.findFirst({ where: { userId: companyA.user.id, type: 'INTERVIEW_BOOKED' } }))?.title).toContain('Termin gewählt');
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: candidate.user.email, subject: { contains: 'Interview confirmed' } } }));
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: companyA.user.email, subject: { contains: 'Termin gewählt' } } }));
    const ics = await companyA.agent.get(`/api/interviews/${booked.body.interview.id}/ics`);
    expect(ics.text).toContain('BEGIN:VEVENT');
    // The booked hour is no longer free for anyone else.
    expect(expectStatus(await companyA.agent.get('/api/interview-calendar/availability/preview'), 200).body.slots).toHaveLength(0);

    // Moving: once (maxReschedules = 1), to a free slot.
    await prisma.calendarEvent.delete({ where: { id: event.id } });
    const moved = expectStatus(await candidate.agent.post(`/api/interview-calendar/invites/${invite.id}/book`).send({ startsAt: g.at(11).toISOString() }), 200);
    expect(moved.body.interview).toMatchObject({ id: booked.body.interview.id, status: 'CONFIRMED', startsAt: g.at(11).toISOString() });
    expect(moved.body.invite).toMatchObject({ reschedules: 1, canMove: false, canCancel: true });
    expect(await prisma.notification.findFirst({ where: { userId: companyA.user.id, type: 'INTERVIEW_MOVED' } })).not.toBeNull();
    expect((await candidate.agent.post(`/api/interview-calendar/invites/${invite.id}/book`).send({ startsAt: g.at(9).toISOString() })).body.error).toBe('RESCHEDULE_LIMIT');

    // Staff override: any time, outside the free hours — but never over another interview of the candidate.
    const staff = await asStaff();
    const forced = expectStatus(await staff.agent.post(`/api/interview-calendar/invites/${invite.id}/book`).send({ startsAt: g.at(15).toISOString(), force: true }), 200);
    expect(forced.body.interview.startsAt).toBe(g.at(15).toISOString());
    expect(forced.body.invite.reschedules).toBe(1);

    // The candidate gives the time back → invite closed, no re-booking on their own.
    expectStatus(await candidate.agent.post(`/api/interviews/${booked.body.interview.id}/decline`).send({ reason: 'Sick' }), 200);
    expect((await prisma.interviewInvite.findUniqueOrThrow({ where: { id: invite.id } })).status).toBe('CANCELLED');
    expect((await candidate.agent.post(`/api/interview-calendar/invites/${invite.id}/book`).send({ startsAt: g.at(9).toISOString() })).body.error).toBe('INVITE_CLOSED');
  });

  it('enforces the cut-off for moving and cancelling, the minimum notice, and scopes everything per party', async () => {
    const { companyA, companyB, candidate, application } = await setup();
    const g = germanDay();
    // Weekly hours on that weekday; a cut-off of 7 days means the booked interview (5 days ahead) is fixed at once.
    expectStatus(
      await companyA.agent.put('/api/interview-calendar/availability').send({ settings: { slotMinutes: 30, bufferMinutes: 0, cancelCutoffHours: 168 }, weekly: [{ weekday: g.weekday, startTime: '14:00', endTime: '15:00' }] }),
      200,
    );
    const invite = expectStatus(await companyA.agent.post('/api/interview-calendar/invites').send({ applicationId: application.id }), 201).body.invite;

    // Other parties: company B and another candidate see nothing; anonymous is refused.
    expect((await companyB.agent.get(`/api/interview-calendar/invites/${invite.id}/slots`)).status).toBe(404);
    expect((await companyB.agent.get('/api/interview-calendar/invites')).body.items).toHaveLength(0);
    expect((await (await asCandidate()).agent.get(`/api/interview-calendar/invites/${invite.id}/slots`)).status).toBe(404);
    expect((await anon().get('/api/interview-calendar/invites')).status).toBe(401);
    expect((await candidate.agent.put('/api/interview-calendar/availability').send({ weekly: [] })).status).toBe(403);
    // Staff read any company's calendar but must say which.
    const staff = await asStaff();
    expect((await staff.agent.get('/api/interview-calendar/availability')).body.error).toBe('COMPANY_REQUIRED');
    expect(expectStatus(await staff.agent.get(`/api/interview-calendar/availability?companyId=${companyA.company.id}`), 200).body.weekly).toHaveLength(1);

    const slots = expectStatus(await candidate.agent.get(`/api/interview-calendar/invites/${invite.id}/slots`), 200).body.slots;
    expect(slots.map((s: { startsAt: string }) => s.startsAt)).toContain(g.at(14).toISOString());
    const booked = expectStatus(await candidate.agent.post(`/api/interview-calendar/invites/${invite.id}/book`).send({ startsAt: g.at(14).toISOString() }), 201);
    expect(booked.body.invite).toMatchObject({ canMove: false, canCancel: false });
    expect((await candidate.agent.post(`/api/interview-calendar/invites/${invite.id}/book`).send({ startsAt: g.at(14, 30).toISOString() })).body.error).toBe('RESCHEDULE_TOO_LATE');
    expect((await candidate.agent.post(`/api/interviews/${booked.body.interview.id}/decline`)).body.error).toBe('CANCEL_TOO_LATE');
    // The employer still can cancel; that closes the invite too.
    expectStatus(await companyA.agent.patch(`/api/interviews/${booked.body.interview.id}`).send({ status: 'CANCELLED', reason: 'Krank' }), 200);
    expect((await prisma.interviewInvite.findUniqueOrThrow({ where: { id: invite.id } })).status).toBe('CANCELLED');

    // Minimum notice of 14 days with a 7-day horizon: nothing is bookable.
    await companyA.agent.put('/api/interview-calendar/availability').send({ settings: { minNoticeHours: 336, horizonDays: 7 } });
    const second = expectStatus(await companyA.agent.post('/api/interview-calendar/invites').send({ applicationId: application.id }), 201).body.invite;
    expect(expectStatus(await candidate.agent.get(`/api/interview-calendar/invites/${second.id}/slots`), 200).body.slots).toHaveLength(0);
    expect((await candidate.agent.post(`/api/interview-calendar/invites/${second.id}/book`).send({ startsAt: g.at(14).toISOString() })).body.error).toBe('SLOT_UNAVAILABLE');
    // Withdrawn by the employer.
    expectStatus(await companyA.agent.delete(`/api/interview-calendar/invites/${second.id}`), 200);
    expect((await companyA.agent.delete(`/api/interview-calendar/invites/${second.id}`)).body.error).toBe('INVITE_CLOSED');
  });

  it('nudges a candidate once who has not picked a time after two days', async () => {
    const { companyA, candidate, application } = await setup();
    await companyA.agent.put('/api/interview-calendar/availability').send({ weekly: [{ weekday: 1, startTime: '09:00', endTime: '12:00' }] });
    const invite = expectStatus(await companyA.agent.post('/api/interview-calendar/invites').send({ applicationId: application.id }), 201).body.invite;
    const now = new Date();
    expect(await runInviteNudges(now)).toBe(0);
    await prisma.interviewInvite.update({ where: { id: invite.id }, data: { createdAt: new Date(now.getTime() - 49 * 60 * 60 * 1000) } });
    expect(await runInviteNudges(now)).toBe(1);
    expect(await runInviteNudges(now)).toBe(0);
    expect(await prisma.notification.findFirst({ where: { userId: candidate.user.id, type: 'INTERVIEW_INVITE_NUDGE' } })).not.toBeNull();
  });
});
