import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, type Agent } from '../helpers/api';
import { prisma, settle, waitFor } from '../helpers/db';
import { createClient, createStaff, uniq } from '../helpers/factories';
import { expectStatus } from '../helpers/workflow';
import { runEventReminders } from '../../src/jobs/calendar.js';

const notes = (userId: string, type?: string) => prisma.notification.findMany({ where: { userId, ...(type ? { type } : {}) }, orderBy: { createdAt: 'asc' } });
const firstNote = (userId: string, type: string) => waitFor(() => prisma.notification.findFirst({ where: { userId, type }, orderBy: { createdAt: 'asc' } }));

const T = (s: string) => new Date(s).toISOString();
const mk = async (a: Agent, body: Record<string, unknown>) =>
  expectStatus(await a.post('/api/events').send({ title: 'Team sync', startsAt: T('2030-03-10T09:00:00Z'), endsAt: T('2030-03-10T10:00:00Z'), ...body }), 201).body.event as Record<string, unknown> & { id: string; attendees: { id: string; status: string }[] };
const range = async (a: Agent, from: string, to: string, extra = '') => expectStatus(await a.get(`/api/events?from=${encodeURIComponent(T(from))}&to=${encodeURIComponent(T(to))}${extra}`), 200).body as { events: Array<Record<string, unknown> & { id: string; title: string | null; busy: boolean; startsAt: string; occurrence: string | null }>; system: Array<Record<string, unknown> & { source: string; title: string }> };

describe('events: access', () => {
  it('requires a staff session', async () => {
    expect((await anon().get('/api/events?from=2030-01-01T00:00:00Z&to=2030-01-02T00:00:00Z')).status).toBe(401);
    const client = await asClient();
    expect((await client.agent.get('/api/events/summary')).status).toBe(403);
  });
});

describe('events: CRUD and permissions', () => {
  it('creates an event with attendees, notifies them in their language, and lists it for everyone involved', async () => {
    const owner = await asStaff({ firstName: 'Kamran', lastName: 'Aliyev' });
    const { user: bob } = await createStaff({ locale: 'de', firstName: 'Bob' });
    const { user: client } = await createClient();
    const c = await prisma.case.create({ data: { number: uniq('TV-'), clientId: client.id, profession: 'Driver' } });
    const e = await mk(owner.agent, { description: 'Agenda', location: 'Office', meetingUrl: 'https://meet.example/abc', attendeeIds: [bob.id, owner.user.id, client.id], reminderMinutes: 15, color: 'green', caseId: c.id });
    expect(e).toMatchObject({ title: 'Team sync', visibility: 'TEAM', isOwner: true, canEdit: true, color: 'green', reminderMinutes: 15, case: { id: c.id }, myStatus: null });
    expect(e.attendees).toEqual([expect.objectContaining({ id: bob.id, status: 'NEEDS_ACTION' })]); // owner and non-staff are not attendees
    const n = await firstNote(bob.id, 'CALENDAR_INVITE');
    expect(n.title).toBe('Einladung: Team sync');
    expect(n.body).toContain('Kamran Aliyev');
    expect(n.link).toBe(`/workspace/calendar?event=${e.id}`);
    expect(await notes(owner.user.id)).toHaveLength(0);

    const got = await owner.agent.get(`/api/events/${e.id}`);
    expect(got.status).toBe(200);
    expect(got.body.event.id).toBe(e.id);
    const listed = await range(owner.agent, '2030-03-10T00:00:00Z', '2030-03-11T00:00:00Z');
    expect(listed.events.map((x) => x.id)).toEqual([e.id]);
    expect((await range(owner.agent, '2030-03-11T00:00:00Z', '2030-03-12T00:00:00Z')).events).toEqual([]);
  });

  it('validates input', async () => {
    const s = await asStaff();
    expect((await s.agent.post('/api/events').send({ title: '', startsAt: T('2030-01-01T10:00:00Z'), endsAt: T('2030-01-01T11:00:00Z') })).status).toBe(400);
    expect((await s.agent.post('/api/events').send({ title: 'x', startsAt: T('2030-01-01T10:00:00Z'), endsAt: T('2030-01-01T09:00:00Z') })).status).toBe(400);
    expect((await s.agent.post('/api/events').send({ title: 'x', startsAt: T('2030-01-01T10:00:00Z'), endsAt: T('2030-01-01T11:00:00Z'), rrule: 'FREQ=HOURLY' })).status).toBe(400);
    expect((await s.agent.post('/api/events').send({ title: 'x', startsAt: T('2030-01-01T10:00:00Z'), endsAt: T('2030-01-01T11:00:00Z'), meetingUrl: 'javascript:alert(1)' })).status).toBe(400);
    expect((await s.agent.post('/api/events').send({ title: 'x', startsAt: T('2030-01-01T10:00:00Z'), endsAt: T('2030-01-01T11:00:00Z'), caseId: 'nope' })).status).toBe(400);
    expect((await s.agent.get('/api/events?from=2030-01-02T00:00:00Z&to=2030-01-01T00:00:00Z')).status).toBe(400);
    expect((await s.agent.get(`/api/events/${'nope'}`)).status).toBe(404);
  });

  it('owner / admin edit and delete; attendees may only change their own status; strangers are refused', async () => {
    const owner = await asStaff();
    const att = await asStaff({ locale: 'en' });
    const stranger = await asStaff();
    const admin = await asAdmin();
    const e = await mk(owner.agent, { attendeeIds: [att.user.id] });

    expect((await att.agent.patch(`/api/events/${e.id}`).send({ title: 'Hijacked' })).status).toBe(403);
    const resp = await att.agent.patch(`/api/events/${e.id}`).send({ status: 'ACCEPTED' });
    expect(resp.status).toBe(200);
    expect(resp.body.event.myStatus).toBe('ACCEPTED');
    expect((await stranger.agent.patch(`/api/events/${e.id}`).send({ title: 'x' })).status).toBe(403); // TEAM-visible, so 403 not 404
    expect((await stranger.agent.delete(`/api/events/${e.id}`)).status).toBe(403);

    // Moving the event asks attendees again and notifies them.
    const moved = await owner.agent.patch(`/api/events/${e.id}`).send({ startsAt: T('2030-03-10T11:00:00Z'), endsAt: T('2030-03-10T12:00:00Z'), title: 'Team sync (moved)' });
    expect(moved.status).toBe(200);
    expect(moved.body.event.attendees[0].status).toBe('NEEDS_ACTION');
    expect((await firstNote(att.user.id, 'CALENDAR_UPDATED')).title).toBe('Event changed: Team sync (moved)');

    // Attendee set changes: new ones invited, removed ones told.
    const { user: newbie } = await createStaff({ locale: 'en' });
    const re = await admin.agent.patch(`/api/events/${e.id}`).send({ attendeeIds: [newbie.id] });
    expect(re.status).toBe(200);
    expect(re.body.event.attendees.map((a: { id: string }) => a.id)).toEqual([newbie.id]);
    await firstNote(newbie.id, 'CALENDAR_INVITE');
    await firstNote(att.user.id, 'CALENDAR_CANCELLED');
    expect((await notes(newbie.id, 'CALENDAR_INVITE'))).toHaveLength(1);
    expect((await notes(att.user.id, 'CALENDAR_CANCELLED'))).toHaveLength(1);

    expect((await owner.agent.delete(`/api/events/${e.id}`)).status).toBe(200);
    await firstNote(newbie.id, 'CALENDAR_CANCELLED');
    expect((await notes(newbie.id, 'CALENDAR_CANCELLED'))).toHaveLength(1);
    expect((await owner.agent.get(`/api/events/${e.id}`)).status).toBe(404);
  });

  it('respond notifies the owner (no email) and is limited to attendees', async () => {
    const owner = await asStaff({ locale: 'en' });
    const att = await asStaff({ firstName: 'Aysel', lastName: 'M' });
    const other = await asStaff();
    const e = await mk(owner.agent, { attendeeIds: [att.user.id] });
    expect((await other.agent.post(`/api/events/${e.id}/respond`).send({ status: 'ACCEPTED' })).status).toBe(403);
    expect((await att.agent.post(`/api/events/${e.id}/respond`).send({ status: 'MAYBE' })).status).toBe(400);
    const r = await att.agent.post(`/api/events/${e.id}/respond`).send({ status: 'TENTATIVE' });
    expect(r.status).toBe(200);
    expect(r.body.event.attendees).toEqual([expect.objectContaining({ id: att.user.id, status: 'TENTATIVE' })]);
    const n = await firstNote(owner.user.id, 'CALENDAR_RESPONSE');
    await settle();
    expect(n.title).toBe('Aysel M: tentative');
    expect(await prisma.emailLog.count({ where: { to: owner.user.email } })).toBe(0);
  });
});

describe('events: visibility and ranges', () => {
  it('private events of colleagues are hidden unless asked for with users=, and then only as busy blocks', async () => {
    const a = await asStaff();
    const b = await asStaff();
    const c = await asStaff();
    const priv = await mk(a.agent, { title: 'Dentist', visibility: 'PRIVATE', startsAt: T('2030-04-01T08:00:00Z'), endsAt: T('2030-04-01T09:00:00Z') });
    const team = await mk(a.agent, { title: 'All hands', visibility: 'TEAM', startsAt: T('2030-04-01T10:00:00Z'), endsAt: T('2030-04-01T11:00:00Z') });
    const withC = await mk(a.agent, { title: 'Review with C', visibility: 'PRIVATE', attendeeIds: [c.user.id], startsAt: T('2030-04-01T12:00:00Z'), endsAt: T('2030-04-01T13:00:00Z') });

    const plain = await range(b.agent, '2030-04-01T00:00:00Z', '2030-04-02T00:00:00Z');
    expect(plain.events.map((e) => e.id)).toEqual([team.id]);
    expect(plain.events[0]).toMatchObject({ title: 'All hands', busy: false, canEdit: false, isOwner: false });

    const asked = await range(b.agent, '2030-04-01T00:00:00Z', '2030-04-02T00:00:00Z', `&users=${a.user.id}`);
    const ids = asked.events.map((e) => e.id).sort();
    expect(ids).toEqual([priv.id, team.id, withC.id].sort());
    const masked = asked.events.find((e) => e.id === priv.id)!;
    expect(masked).toMatchObject({ busy: true, title: null, ownerId: a.user.id });
    expect(masked).not.toHaveProperty('description');

    // An attendee sees the private event in full, and only their own stuff with mine=1.
    const forC = await range(c.agent, '2030-04-01T00:00:00Z', '2030-04-02T00:00:00Z', '&mine=1');
    expect(forC.events.map((e) => e.id)).toEqual([withC.id]);
    expect(forC.events[0]).toMatchObject({ title: 'Review with C', busy: false, isAttendee: true });
    expect((await b.agent.get(`/api/events/${priv.id}`)).status).toBe(404);
    expect((await c.agent.get(`/api/events/${withC.id}`)).status).toBe(200);
  });

  it('expands recurring events inside the requested window (weekly BYDAY, COUNT) and in the detail', async () => {
    const a = await asStaff();
    const e = await mk(a.agent, { title: 'Standup', startsAt: T('2030-03-04T06:00:00Z'), endsAt: T('2030-03-04T06:15:00Z'), rrule: 'freq=weekly;byday=MO,WE,FR;count=10' });
    expect(e.rrule).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10');
    // Week of 11–17 March 2030: Mon 11, Wed 13, Fri 15.
    const week = await range(a.agent, '2030-03-11T00:00:00Z', '2030-03-18T00:00:00Z');
    expect(week.events.map((x) => x.startsAt)).toEqual([T('2030-03-11T06:00:00Z'), T('2030-03-13T06:00:00Z'), T('2030-03-15T06:00:00Z')]);
    expect(week.events[0]).toMatchObject({ id: e.id, occurrence: T('2030-03-11T06:00:00Z'), endsAt: T('2030-03-11T06:15:00Z') });
    // COUNT=10 ends on Mon 25 March: nothing in April.
    expect((await range(a.agent, '2030-04-01T00:00:00Z', '2030-04-30T00:00:00Z')).events).toEqual([]);
    // Non-recurring events have no occurrence marker.
    const single = await mk(a.agent, { title: 'Once', startsAt: T('2030-03-12T09:00:00Z'), endsAt: T('2030-03-12T10:00:00Z') });
    const again = await range(a.agent, '2030-03-12T00:00:00Z', '2030-03-13T00:00:00Z');
    expect(again.events.find((x) => x.id === single.id)?.occurrence).toBeNull();
  });

  it('merges read-only system items (case appointments, bookings, interviews, task deadlines) with links', async () => {
    const staff = await asStaff();
    const { user: client } = await createClient({ firstName: 'Aysel', lastName: 'Mammadova' });
    const c = await prisma.case.create({ data: { number: 'TV-2026-0099', clientId: client.id, profession: 'Driver', assignedStaffId: staff.user.id, appointmentAt: new Date(Date.now() + 3 * 24 * 3600 * 1000), appointmentPlace: 'Embassy Baku' } });
    const task = await prisma.task.create({ data: { number: 1, title: 'Prepare file', createdById: staff.user.id, dueAt: new Date(Date.now() + 2 * 24 * 3600 * 1000), assignees: { create: [{ userId: staff.user.id }] } } });
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const res = await range(staff.agent, from, to);
    const bySource = Object.fromEntries(res.system.map((s) => [s.source, s]));
    expect(bySource.case).toMatchObject({ title: expect.stringContaining('TV-2026-0099'), link: `/admin/cases/${c.id}`, canEdit: false, location: 'Embassy Baku' });
    expect(bySource.task).toMatchObject({ title: expect.stringContaining('T-0001'), link: '/workspace/tasks/T-0001' });
    expect(res.system.find((s) => s.title.includes(task.title))).toBeTruthy();
    // Someone else does not get my system items unless they ask for my calendar.
    const other = await asStaff();
    expect((await range(other.agent, from, to)).system).toEqual([]);
    expect((await range(other.agent, from, to, `&users=${staff.user.id}`)).system.map((s) => s.source).sort()).toEqual(['case', 'task']);
    expect((await range(staff.agent, from, to, '&system=0')).system).toEqual([]);
  });

  it('free-busy combines events and system items per user, skipping declined invitations', async () => {
    const a = await asStaff();
    const b = await asStaff();
    const { user: client } = await createClient();
    await prisma.case.create({ data: { number: uniq('TV-'), clientId: client.id, profession: 'Driver', assignedStaffId: b.user.id, appointmentAt: new Date(Date.now() + 24 * 3600 * 1000) } });
    const e = await mk(a.agent, { title: 'Pairing', visibility: 'PRIVATE', attendeeIds: [b.user.id], startsAt: new Date(Date.now() + 26 * 3600 * 1000).toISOString(), endsAt: new Date(Date.now() + 27 * 3600 * 1000).toISOString() });
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
    const q = (ids: string[]) => a.agent.get(`/api/events/free-busy?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&users=${ids.join(',')}`);
    const r1 = await q([a.user.id, b.user.id]);
    expect(r1.status).toBe(200);
    const ua = r1.body.users.find((u: { userId: string }) => u.userId === a.user.id);
    const ub = r1.body.users.find((u: { userId: string }) => u.userId === b.user.id);
    expect(ua.busy.map((x: { source: string; title: string | null }) => [x.source, x.title])).toEqual([['event', null]]); // private: no title
    expect(ub.busy.map((x: { source: string }) => x.source).sort()).toEqual(['case', 'event']);
    await b.agent.post(`/api/events/${e.id}/respond`).send({ status: 'DECLINED' });
    const r2 = await q([b.user.id]);
    expect(r2.body.users[0].busy.map((x: { source: string }) => x.source)).toEqual(['case']);
  });

  it('summary counts today and names the next item', async () => {
    const a = await asStaff();
    const soon = new Date(Date.now() + 60 * 60 * 1000);
    await mk(a.agent, { title: 'Soon', startsAt: soon.toISOString(), endsAt: new Date(soon.getTime() + 30 * 60 * 1000).toISOString() });
    await mk(a.agent, { title: 'Far', startsAt: T('2031-01-01T09:00:00Z'), endsAt: T('2031-01-01T10:00:00Z') });
    const s = await a.agent.get('/api/events/summary');
    expect(s.status).toBe(200);
    expect(s.body.next).toMatchObject({ title: 'Soon', source: 'event' });
    expect(s.body.today).toBeGreaterThanOrEqual(0);
  });
});

describe('events: quick add, ICS and reminders', () => {
  it('quick add parses text in four languages (dry run and create)', async () => {
    const a = await asStaff();
    const dry = await a.agent.post('/api/events/quick').send({ text: 'Görüş sabah 15:00 1 saat', tzOffset: 240, dryRun: true });
    expect(dry.status).toBe(200);
    expect(dry.body.parsed).toMatchObject({ title: 'Görüş', matched: { date: true, time: true, duration: true } });
    const { user: bob } = await createStaff();
    const created = await a.agent.post('/api/events/quick').send({ text: 'Treffen morgen 15:00', tzOffset: 120, attendeeIds: [bob.id] });
    expect(created.status).toBe(201);
    expect(created.body.event).toMatchObject({ title: 'Treffen', attendees: [expect.objectContaining({ id: bob.id })] });
    const start = new Date(created.body.event.startsAt);
    expect(start.getUTCHours()).toBe(13); // 15:00 Berlin
    expect(new Date(created.body.event.endsAt).getTime() - start.getTime()).toBe(60 * 60 * 1000);
    expect((await a.agent.post('/api/events/quick').send({ text: 'Встреча завтра в 10:00 30 мин' })).body.event.title).toBe('Встреча');
    expect((await a.agent.post('/api/events/quick').send({ text: '' })).status).toBe(400);
  });

  it('serves a single event as ICS', async () => {
    const a = await asStaff({ firstName: 'Kamran', lastName: 'Aliyev' });
    const b = await asStaff();
    const e = await mk(a.agent, { title: 'Embassy; briefing', location: 'Room 1', description: 'Bring docs' });
    const res = await b.agent.get(`/api/events/${e.id}.ics`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/calendar');
    const text = res.text.replace(/\r\n /g, ''); // unfold 75-octet lines
    expect(text).toContain('BEGIN:VEVENT');
    expect(text).toContain(`UID:event-${e.id}@triad-vision.de`);
    expect(text).toContain('SUMMARY:Embassy\\; briefing');
    expect(text).toContain('DTSTART:20300310T090000Z');
    expect(text).toContain('LOCATION:Room 1');
    expect(text).toContain(`URL:http://localhost:5173/workspace/calendar?event=${e.id}`);
    expect(text).toContain('ORGANIZER;CN=Kamran Aliyev');
    const priv = await mk(a.agent, { visibility: 'PRIVATE' });
    expect((await b.agent.get(`/api/events/${priv.id}.ics`)).status).toBe(404);
  });

  it('reminds the owner and accepted attendees once per occurrence', async () => {
    const owner = await asStaff({ locale: 'en' });
    const yes = await asStaff({ locale: 'de' });
    const { user: pending } = await createStaff();
    const now = new Date('2030-05-05T08:00:00Z');
    const e = await mk(owner.agent, { title: 'Daily', startsAt: T('2030-05-05T08:10:00Z'), endsAt: T('2030-05-05T08:30:00Z'), rrule: 'FREQ=DAILY;COUNT=3', reminderMinutes: 15, attendeeIds: [yes.user.id, pending.id], location: 'Zoom' });
    await yes.agent.post(`/api/events/${e.id}/respond`).send({ status: 'ACCEPTED' });
    const far = await mk(owner.agent, { title: 'Later', startsAt: T('2030-05-05T12:00:00Z'), endsAt: T('2030-05-05T13:00:00Z'), reminderMinutes: 30 });
    void far;

    expect(await runEventReminders(now)).toBe(1);
    expect(await runEventReminders(now)).toBe(0); // deduped
    const [o] = await notes(owner.user.id, 'CALENDAR_REMINDER');
    expect(o.title).toBe('In 15 minutes: Daily');
    expect(o.body).toContain('Zoom');
    expect((await notes(yes.user.id, 'CALENDAR_REMINDER'))[0].title).toBe('In 15 Minuten: Daily');
    expect(await notes(pending.id, 'CALENDAR_REMINDER')).toHaveLength(0);

    // Next day's occurrence gets its own reminder; the day after COUNT ends gets none.
    expect(await runEventReminders(new Date('2030-05-06T08:00:00Z'))).toBe(1);
    expect(await runEventReminders(new Date('2030-05-07T08:00:00Z'))).toBe(1);
    expect(await runEventReminders(new Date('2030-05-08T08:00:00Z'))).toBe(0);
    expect(await notes(owner.user.id, 'CALENDAR_REMINDER')).toHaveLength(3);
    // The single event is reminded 30 minutes before.
    expect(await runEventReminders(new Date('2030-05-05T11:35:00Z'))).toBe(1);
  });
});
