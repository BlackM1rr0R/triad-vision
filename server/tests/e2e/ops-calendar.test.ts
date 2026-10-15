import { beforeEach, describe, expect, it } from 'vitest';
import { anon, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createCaseVia, expectStatus } from '../helpers/workflow';
import { asCompany } from './vacancies.fixtures';
import { cleanOps, inHours } from './ops.fixtures';

beforeEach(cleanOps);

describe('calendar feed', () => {
  it('staff create a token, the feed lists appointments, consultations, interviews and task deadlines, and rotation invalidates the old URL', async () => {
    const staff = await asStaff({ locale: 'de', firstName: 'Lena' });
    const other = await asStaff();
    const client = await asClient({ firstName: 'Ayan', lastName: 'Quliyeva' });
    const company = await asCompany();

    // Nothing yet.
    expect(expectStatus(await staff.agent.get('/api/calendar/token'), 200).body).toEqual({ enabled: false, url: null });
    const created = expectStatus(await staff.agent.post('/api/calendar/token'), 201);
    const url: string = created.body.url;
    expect(url).toMatch(/^http:\/\/localhost:5173\/api\/calendar\/[A-Za-z0-9_-]{20,}\.ics$/);
    const token = created.body.token as string;
    expect(expectStatus(await staff.agent.get('/api/calendar/token'), 200).body).toEqual({ enabled: true, url });

    // Data: an embassy appointment on an assigned case, a booked slot, an interview, a task deadline; plus noise for `other`.
    const c = await createCaseVia(client.agent, 'Schweißer');
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: staff.user.id, status: 'APPOINTMENT_SCHEDULED', appointmentAt: inHours(72), appointmentPlace: 'Botschaft Baku' } });
    const slot = await prisma.consultationSlot.create({ data: { staffId: staff.user.id, startsAt: inHours(30), endsAt: inHours(30.5) } });
    await prisma.booking.create({ data: { slotId: slot.id, name: 'Hans Becker', email: 'hans@test.local', topic: 'company', locale: 'de', meetingUrl: 'https://meet.jit.si/TriadVision-abc', manageToken: `t-${slot.id}` } });
    const interview = await prisma.interview.create({
      data: { candidateId: client.user.id, companyId: company.company.id, staffId: staff.user.id, startsAt: inHours(50), endsAt: inHours(51), status: 'CONFIRMED', meetingUrl: 'https://meet.jit.si/TriadVision-int', notes: 'Technik' },
    });
    const task = await prisma.task.create({ data: { number: 1, title: 'Vertrag prüfen', dueAt: inHours(10), createdById: other.user.id, assignees: { create: { userId: staff.user.id } } } });
    await prisma.task.create({ data: { number: 2, title: 'Nicht meins', dueAt: inHours(12), createdById: other.user.id, assignees: { create: { userId: other.user.id } } } });
    await prisma.task.create({ data: { number: 3, title: 'Erledigt', status: 'DONE', dueAt: inHours(14), createdById: staff.user.id, assignees: { create: { userId: staff.user.id } } } });
    const otherCase = await createCaseVia((await asClient()).agent);
    await prisma.case.update({ where: { id: otherCase.id }, data: { assignedStaffId: other.user.id, appointmentAt: inHours(80) } });

    // The feed needs no session (calendar apps send none) and is cacheable privately for 5 minutes.
    const feed = await anon().get(`/api/calendar/${token}.ics`);
    expect(feed.status).toBe(200);
    expect(feed.headers['content-type']).toContain('text/calendar');
    expect(feed.headers['cache-control']).toBe('private, max-age=300');
    const text = feed.text;
    expect(text).toContain('BEGIN:VCALENDAR');
    expect(text).toContain('X-WR-CALNAME:Triad Vision · Lena');
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(4);
    expect(text).toContain(`UID:case-appointment-${c.id}@triad-vision.de`);
    expect(text).toContain('SUMMARY:Botschaftstermin: Ayan Quliyeva');
    expect(text).toContain('LOCATION:Botschaft Baku');
    expect(text).toContain(`URL:http://localhost:5173/admin/cases/${c.id}`);
    expect(text).toContain('SUMMARY:Beratung: Hans Becker');
    expect(text).toContain(`UID:interview-${interview.id}@triad-vision.de`);
    expect(text).toContain('SUMMARY:Vorstellungsgespräch: Ayan Quliyeva · ');
    expect(text).toContain(`UID:task-due-${task.id}@triad-vision.de`);
    expect(text).toContain('SUMMARY:Frist: T-0001 Vertrag prüfen');
    expect(text).not.toContain('Nicht meins');
    expect(text).not.toContain('Erledigt');
    expect(text).not.toContain(otherCase.id);
    // UTC timestamps and CRLF line endings as RFC 5545 wants them.
    expect(text).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(text).toContain('\r\n');
    // The bare token (without .ics) works too.
    expect((await anon().get(`/api/calendar/${token}`)).status).toBe(200);

    // Rotation: old link dead, new link alive.
    const rotated = expectStatus(await staff.agent.post('/api/calendar/token'), 201);
    expect(rotated.body.token).not.toBe(token);
    expect((await anon().get(`/api/calendar/${token}.ics`)).status).toBe(404);
    expect((await anon().get(`/api/calendar/${rotated.body.token}.ics`)).status).toBe(200);

    // Switching off.
    expectStatus(await staff.agent.delete('/api/calendar/token'), 200);
    expect((await anon().get(`/api/calendar/${rotated.body.token}.ics`)).status).toBe(404);
    expect(expectStatus(await staff.agent.get('/api/calendar/token'), 200).body.enabled).toBe(false);
  });

  it('only staff may manage a feed; garbage and unknown tokens are refused; a deactivated account’s feed stops', async () => {
    const client = await asClient();
    expect((await client.agent.post('/api/calendar/token')).status).toBe(403);
    expect((await client.agent.get('/api/calendar/token')).status).toBe(403);
    expect((await anon().post('/api/calendar/token')).status).toBe(401);
    expect((await anon().get('/api/calendar/short.ics')).status).toBe(400);
    expect((await anon().get(`/api/calendar/${'a'.repeat(32)}.ics`)).status).toBe(404);

    const staff = await asStaff();
    const token = expectStatus(await staff.agent.post('/api/calendar/token'), 201).body.token as string;
    expect((await anon().get(`/api/calendar/${token}.ics`)).status).toBe(200);
    await prisma.user.update({ where: { id: staff.user.id }, data: { isActive: false } });
    expect((await anon().get(`/api/calendar/${token}.ics`)).status).toBe(404);
  });
});
