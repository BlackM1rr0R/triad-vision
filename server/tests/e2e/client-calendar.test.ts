import { beforeEach, describe, expect, it } from 'vitest';
import { anon, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createCaseVia, expectStatus } from '../helpers/workflow';
import { asCompany } from './vacancies.fixtures';
import { cleanOps, inHours } from './ops.fixtures';

beforeEach(cleanOps);

const signatureRequest = (caseId: string, title: string, expiresAt: Date, status: 'SENT' | 'COMPLETED' = 'SENT') =>
  prisma.signatureRequest.create({
    data: {
      title,
      caseId,
      status,
      originalName: 'contract.pdf',
      originalKey: `sig/${Math.random().toString(36).slice(2)}.pdf`,
      originalSha256: 'a'.repeat(64),
      originalSize: 1000,
      originalPages: 1,
      expiresAt,
      sentAt: new Date(),
    },
  });

describe('client calendar feed', () => {
  it('a client creates a token and the feed holds only their own appointment, interview, arrival, translation and signature dates', async () => {
    const client = await asClient({ locale: 'en', firstName: 'Ayan', lastName: 'Quliyeva' });
    const other = await asClient({ firstName: 'Other' });
    const staff = await asStaff();
    const company = await asCompany();

    expect(expectStatus(await client.agent.get('/api/calendar/token'), 200).body).toEqual({ enabled: false, url: null });
    const created = expectStatus(await client.agent.post('/api/calendar/token'), 201);
    const token = created.body.token as string;
    expect(created.body.url).toMatch(/\/api\/calendar\/[A-Za-z0-9_-]{20,}\.ics$/);

    // Own data.
    const c = await createCaseVia(client.agent, 'Schweißer');
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: staff.user.id, staffNote: 'INTERNAL-NOTE', appointmentAt: inHours(72), appointmentPlace: 'German Embassy Baku' } });
    const interview = await prisma.interview.create({
      data: { candidateId: client.user.id, companyId: company.company.id, staffId: staff.user.id, startsAt: inHours(50), endsAt: inHours(51), status: 'CONFIRMED', meetingUrl: 'https://meet.jit.si/x', notes: 'SECRET-STAFF-NOTE' },
    });
    await prisma.interview.create({ data: { candidateId: client.user.id, startsAt: inHours(52), endsAt: inHours(53), status: 'CANCELLED' } });
    const arrival = await prisma.arrivalPlan.create({
      data: { caseId: c.id, clientId: client.user.id, status: 'SUBMITTED', flightNumber: 'J2 123', arrivalAirport: 'FRA', arrivalTime: inHours(24 * 30), staffNote: 'STAFF-ARRIVAL-NOTE' },
    });
    const tr = await prisma.translationOrder.create({ data: { number: 7, clientId: client.user.id, service: 'TRANSLATION', sourceLang: 'az', targetLang: 'de', status: 'IN_PROGRESS', dueAt: inHours(96), staffNote: 'TR-INTERNAL' } });
    await prisma.translationOrder.create({ data: { number: 8, clientId: client.user.id, service: 'TRANSLATION', sourceLang: 'az', targetLang: 'de', status: 'DELIVERED', dueAt: inHours(98) } });
    const sig = await signatureRequest(c.id, 'Employment contract', inHours(120));
    const signer = await prisma.signatureSigner.create({ data: { requestId: sig.id, role: 'CANDIDATE', userId: client.user.id, name: 'Ayan', email: client.user.email, status: 'PENDING' } });
    const signed = await signatureRequest(c.id, 'Already signed', inHours(130));
    await prisma.signatureSigner.create({ data: { requestId: signed.id, role: 'CANDIDATE', userId: client.user.id, name: 'Ayan', email: client.user.email, status: 'SIGNED' } });

    // Someone else's data must never appear.
    const oc = await createCaseVia(other.agent);
    await prisma.case.update({ where: { id: oc.id }, data: { appointmentAt: inHours(80), appointmentPlace: 'OTHER-PLACE' } });
    const oi = await prisma.interview.create({ data: { candidateId: other.user.id, startsAt: inHours(60), endsAt: inHours(61), status: 'CONFIRMED' } });
    await prisma.translationOrder.create({ data: { number: 9, clientId: other.user.id, service: 'TRANSLATION', sourceLang: 'az', targetLang: 'de', dueAt: inHours(90) } });
    const osig = await signatureRequest(oc.id, 'OTHER-SIGNATURE', inHours(100));
    await prisma.signatureSigner.create({ data: { requestId: osig.id, role: 'CANDIDATE', userId: other.user.id, name: 'O', email: other.user.email } });

    const feed = await anon().get(`/api/calendar/${token}.ics`);
    expect(feed.status).toBe(200);
    expect(feed.headers['content-type']).toContain('text/calendar');
    expect(feed.headers['cache-control']).toBe('private, max-age=300');
    const text = feed.text.replace(/\r\n /g, '');
    expect(text).toContain('X-WR-CALNAME:Triad Vision · Ayan');
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(5);

    expect(text).toContain(`UID:client-appointment-${c.id}@triad-vision.de`);
    expect(text).toContain('SUMMARY:Embassy appointment');
    expect(text).toContain('LOCATION:German Embassy Baku');
    expect(text).toContain(`URL:http://localhost:5173/account/cases/${c.id}`);

    expect(text).toContain(`UID:client-interview-${interview.id}@triad-vision.de`);
    expect(text).toContain(`SUMMARY:Job interview: ${company.company.name}`);
    expect(text).toContain('URL:http://localhost:5173/account/interviews');

    expect(text).toContain(`UID:client-arrival-${arrival.id}@triad-vision.de`);
    expect(text).toContain('SUMMARY:Arrival in Germany · J2 123');

    expect(text).toContain(`UID:client-translation-${tr.id}@triad-vision.de`);
    expect(text).toContain('SUMMARY:Translation due: TR-0007');
    expect(text).toMatch(new RegExp(`UID:client-translation-${tr.id}[^]*?DTSTART;VALUE=DATE:\\d{8}`));

    expect(text).toContain(`UID:client-signature-${signer.id}@triad-vision.de`);
    expect(text).toContain('SUMMARY:Last day to sign: Employment contract');
    expect(text).toContain(`URL:http://localhost:5173/account/signatures/${signer.id}`);

    // No staff internals, no other people.
    for (const secret of ['INTERNAL-NOTE', 'SECRET-STAFF-NOTE', 'STAFF-ARRIVAL-NOTE', 'TR-INTERNAL', 'Already signed', 'OTHER-PLACE', 'OTHER-SIGNATURE', 'TR-0008', 'TR-0009', oc.id, oi.id, '/admin/']) {
      expect(text).not.toContain(secret);
    }

    // The other client's own feed has only their events.
    const otherToken = expectStatus(await other.agent.post('/api/calendar/token'), 201).body.token as string;
    const otherFeed = (await anon().get(`/api/calendar/${otherToken}.ics`)).text;
    expect(otherFeed.match(/BEGIN:VEVENT/g)).toHaveLength(4);
    expect(otherFeed).not.toContain(c.id);
    expect(otherFeed).toContain('SUMMARY:Səfirlik görüşü');
  });

  it('a client rotates and switches off the token; the old URL stops at once', async () => {
    const client = await asClient();
    const first = expectStatus(await client.agent.post('/api/calendar/token'), 201).body.token as string;
    expect((await anon().get(`/api/calendar/${first}.ics`)).status).toBe(200);
    const second = expectStatus(await client.agent.post('/api/calendar/token'), 201).body.token as string;
    expect(second).not.toBe(first);
    expect((await anon().get(`/api/calendar/${first}.ics`)).status).toBe(404);
    expect((await anon().get(`/api/calendar/${second}.ics`)).status).toBe(200);
    expect(expectStatus(await client.agent.get('/api/calendar/token'), 200).body.enabled).toBe(true);
    expectStatus(await client.agent.delete('/api/calendar/token'), 200);
    expect((await anon().get(`/api/calendar/${second}.ics`)).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { actorId: client.user.id, action: { startsWith: 'CALENDAR_TOKEN_' } } })).toBe(3);
  });

  it('employers have no feed; the staff feed keeps listing staff items, not client-feed items', async () => {
    const company = await asCompany();
    expect((await company.agent.post('/api/calendar/token')).status).toBe(403);
    expect((await company.agent.get('/api/calendar/token')).status).toBe(403);
    // Even a token planted directly on an employer account is refused.
    await prisma.user.update({ where: { id: company.user.id }, data: { calendarToken: 'c'.repeat(32) } });
    expect((await anon().get(`/api/calendar/${'c'.repeat(32)}.ics`)).status).toBe(404);

    const staff = await asStaff({ locale: 'de' });
    const client = await asClient({ firstName: 'Kamal', lastName: 'Aliyev' });
    const c = await createCaseVia(client.agent);
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: staff.user.id, appointmentAt: inHours(48) } });
    const token = expectStatus(await staff.agent.post('/api/calendar/token'), 201).body.token as string;
    const text = (await anon().get(`/api/calendar/${token}.ics`)).text;
    expect(text).toContain(`UID:case-appointment-${c.id}@triad-vision.de`);
    expect(text).toContain('SUMMARY:Botschaftstermin: Kamal Aliyev');
    expect(text).not.toContain('client-appointment-');
  });
});
