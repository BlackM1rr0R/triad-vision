import { beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { act, createCaseVia, expectStatus } from '../helpers/workflow';
import { asCompany } from './vacancies.fixtures';
import { cleanOps, inHours } from './ops.fixtures';

/** Staff desk round: client 360°, team workload board, embassy calendar layer, canned replies. */

beforeEach(async () => {
  await cleanOps();
  await prisma.contact.deleteMany();
  await prisma.staffPreferences.deleteMany();
  await prisma.setting.deleteMany({ where: { key: 'autoAssign' } });
});

const DAY = 24 * 60 * 60 * 1000;

describe('canned replies', () => {
  it('personal for everyone, team replies by ADMIN+, language variant and variables picked for the conversation', async () => {
    const staff = await asStaff({ firstName: 'Nigar', lastName: 'Əliyeva' });
    const admin = await asAdmin();
    const client = await asClient({ firstName: 'Hans', lastName: 'Müller', locale: 'de' });
    const c = await createCaseVia(client.agent, 'Elektriker');
    const at = new Date('2026-12-03T08:30:00.000Z');
    await prisma.case.update({ where: { id: c.id }, data: { appointmentAt: at, appointmentPlace: 'Botschaft Baku' } });

    const mine = expectStatus(await staff.agent.post('/api/admin/canned-replies').send({ name: 'Danke', shortcut: '/Danke Schön', text: 'Danke, {{firstName}}! – {{staffFirstName}}' }), 201).body.reply;
    expect(mine).toMatchObject({ shortcut: 'danke-schön', lang: null, shared: false, mine: true, canEdit: true });
    expectStatus(await staff.agent.post('/api/admin/canned-replies').send({ name: 'Team', text: 'x', shared: true }), 403);

    const az = expectStatus(await admin.agent.post('/api/admin/canned-replies').send({ name: 'Görüş', shortcut: 'termin', lang: 'az', shared: true, text: 'Hörmətli {{firstName}}, {{caseNumber}} üzrə görüş {{appointmentDate}} {{appointmentTime}}, {{appointmentPlace}}.' }), 201).body.reply;
    const de = expectStatus(await admin.agent.post('/api/admin/canned-replies').send({ name: 'Termin', shortcut: 'termin', lang: 'de', shared: true, text: 'Hallo {{ firstName }}, Ihr Termin zu {{caseNumber}}: {{appointmentDate}} um {{appointmentTime}} ({{appointmentPlace}}). {{unknown}}' }), 201).body.reply;
    expect(expectStatus(await admin.agent.post('/api/admin/canned-replies').send({ name: 'Doppelt', shortcut: 'termin', lang: 'de', shared: true, text: 'y' }), 400).body.error).toBe('SHORTCUT_TAKEN');

    // Team replies: the author's role decides nothing, only ADMIN+ edits them.
    expectStatus(await staff.agent.patch(`/api/admin/canned-replies/${de.id}`).send({ text: 'hack' }), 403);
    expectStatus(await staff.agent.delete(`/api/admin/canned-replies/${az.id}`), 403);
    expectStatus(await staff.agent.patch(`/api/admin/canned-replies/${mine.id}`).send({ shared: true }), 403);
    expectStatus(await admin.agent.patch(`/api/admin/canned-replies/${mine.id}`).send({ text: 'x' }), 404); // personal: invisible to others

    const list = expectStatus(await staff.agent.get('/api/admin/canned-replies'), 200).body;
    expect(list.canManageTeam).toBe(false);
    expect(list.replies.map((r: { name: string }) => r.name).sort()).toEqual(['Danke', 'Görüş', 'Termin']);
    expect(list.variables).toContain('appointmentDate');

    // German client → the German variant, variables filled; unknown variables stay.
    const picker = expectStatus(await staff.agent.get('/api/admin/canned-replies/picker').query({ caseId: c.id }), 200).body;
    expect(picker.lang).toBe('de');
    const termin = picker.replies.find((r: { shortcut: string }) => r.shortcut === 'termin');
    expect(termin.id).toBe(de.id);
    expect(termin.filled).toBe(`Hallo Hans, Ihr Termin zu ${c.number}: 3. Dezember 2026 um 12:30 (Botschaft Baku). {{unknown}}`);
    expect(picker.replies.find((r: { shortcut: string }) => r.shortcut === 'danke-schön').filled).toBe('Danke, Hans! – Nigar');
    expect(picker.replies[0].mine).toBe(true); // mine first

    // Russian client: no Russian variant → the Azerbaijani one.
    const ru = await asClient({ firstName: 'Ivan', locale: 'ru' });
    const pickRu = expectStatus(await staff.agent.get('/api/admin/canned-replies/picker').query({ userId: ru.user.id }), 200).body;
    expect(pickRu.replies.find((r: { shortcut: string }) => r.shortcut === 'termin').id).toBe(az.id);

    // The mail composer's template list shares the rows (HTML from the text).
    const mail = expectStatus(await staff.agent.get('/api/mail/templates'), 200).body.templates;
    expect(mail.find((t: { id: string }) => t.id === de.id).html).toContain('<p>Hallo {{ firstName }}');

    expectStatus(await admin.agent.delete(`/api/admin/canned-replies/${az.id}`), 200);
    expect(await prisma.auditLog.count({ where: { action: { startsWith: 'CANNED_REPLY_' } } })).toBe(3);
  });
});

describe('workload board', () => {
  it('ADMIN+ sees every staff member with cases, overdue items, open tasks, unanswered messages and appointments; STAFF only their own row', async () => {
    const admin = await asAdmin({ firstName: 'Aa' });
    const busy = await asStaff({ firstName: 'Busy' });
    const free = await asStaff({ firstName: 'Free' });
    const client = await asClient();
    const c1 = await createCaseVia(client.agent);
    const c2 = await createCaseVia((await asClient()).agent);
    await prisma.case.updateMany({ where: { id: { in: [c1.id, c2.id] } }, data: { assignedStaffId: busy.user.id } });
    await prisma.case.update({ where: { id: c1.id }, data: { status: 'APPOINTMENT_SCHEDULED', appointmentAt: new Date(Date.now() + 60 * 60 * 1000), appointmentPlace: 'Botschaft' } });
    await prisma.caseMessage.create({ data: { caseId: c1.id, authorId: busy.user.id, body: 'Salam', createdAt: new Date(Date.now() - 2 * DAY) } });
    await prisma.caseMessage.create({ data: { caseId: c1.id, authorId: client.user.id, body: 'Sualım var' } });
    await prisma.task.create({ data: { number: 1, title: 'Gecikən', dueAt: new Date(Date.now() - DAY), createdById: admin.user.id, assignees: { create: { userId: busy.user.id } } } });
    await prisma.task.create({ data: { number: 2, title: 'Açıq', createdById: admin.user.id, assignees: { create: { userId: busy.user.id } } } });
    await prisma.clientTask.create({ data: { caseId: c2.id, title: 'Arayış', dueAt: new Date(Date.now() - DAY) } });
    await prisma.staffPreferences.create({ data: { userId: busy.user.id, maxOpenCases: 2 } });

    const board = expectStatus(await admin.agent.get('/api/admin/workload'), 200).body;
    expect(board.scope).toBe('team');
    const row = board.rows.find((r: { id: string }) => r.id === busy.user.id);
    expect(row).toMatchObject({ activeCases: 2, overdue: 2, overdueTasks: 1, overdueClientTasks: 1, openTasks: 2, unanswered: 1, capacity: 2, capacityCustom: true, capacityPct: 100, level: 'over' });
    expect(row.appointmentsByType.embassy).toBe(1);
    expect(board.rows.find((r: { id: string }) => r.id === free.user.id)).toMatchObject({ activeCases: 0, overdue: 0, capacity: 25, level: 'low' });
    expect(board.totals).toMatchObject({ activeCases: 2, unanswered: 1, overCapacity: 1 });

    const admins = expectStatus(await admin.agent.get('/api/admin/workload').query({ role: 'ADMIN' }), 200).body;
    expect(admins.rows.map((r: { id: string }) => r.id)).toEqual([admin.user.id]);

    const self = expectStatus(await busy.agent.get('/api/admin/workload'), 200).body;
    expect(self.scope).toBe('self');
    expect(self.rows).toHaveLength(1);
    expect(self.rows[0].id).toBe(busy.user.id);
    expect(self.totals).toBeUndefined();

    // Assignment hint: the least-loaded eligible colleague; numbers only for ADMIN+.
    const c3 = await createCaseVia((await asClient()).agent);
    const sug = expectStatus(await admin.agent.get('/api/admin/workload/suggest').query({ caseId: c3.id }), 200).body;
    expect(sug.suggested.id).not.toBe(busy.user.id); // at its max open cases
    expect(sug.staff.find((s: { id: string }) => s.id === busy.user.id)).toMatchObject({ eligible: false, reasons: ['MAX_OPEN'], open: 2 });
    const sugStaff = expectStatus(await free.agent.get('/api/admin/workload/suggest').query({ caseId: c3.id }), 200).body;
    expect(sugStaff.suggested.id).toBe(sug.suggested.id);
    expect(sugStaff.suggested.open).toBeUndefined();
    expectStatus(await free.agent.get('/api/admin/workload/suggest').query({ caseId: 'nope' }), 404);
  });
});

describe('embassy calendar layer', () => {
  it('lists embassy appointments, interviews, arrivals and consultations with filters; moving uses the existing flows', async () => {
    const staff = await asStaff();
    const other = await asStaff();
    const client = await asClient({ firstName: 'Aynur', lastName: 'Həsənova' });
    const company = await asCompany();
    const c = await createCaseVia(client.agent, 'Aşpaz');
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: staff.user.id, status: 'APPOINTMENT_SCHEDULED', appointmentAt: inHours(48), appointmentPlace: 'Botschaft Baku' } });
    const interview = await prisma.interview.create({ data: { candidateId: client.user.id, companyId: company.company.id, staffId: other.user.id, startsAt: inHours(30), endsAt: inHours(31), status: 'CONFIRMED', meetingUrl: 'https://meet.jit.si/x' } });
    await prisma.arrivalPlan.create({ data: { caseId: c.id, clientId: client.user.id, status: 'SUBMITTED', arrivalTime: inHours(72), flightNumber: 'LH 2547', arrivalAirport: 'FRA' } });
    const slot = await prisma.consultationSlot.create({ data: { staffId: other.user.id, startsAt: inHours(20), endsAt: inHours(20.5) } });
    await prisma.booking.create({ data: { slotId: slot.id, name: 'Kamal Q.', email: 'k@test.local', topic: 'candidate', locale: 'az', meetingUrl: 'https://meet.jit.si/y', manageToken: `t-${slot.id}` } });

    const range = { from: new Date(Date.now() - DAY).toISOString(), to: new Date(Date.now() + 7 * DAY).toISOString() };
    const all = expectStatus(await staff.agent.get('/api/admin/ops-calendar').query(range), 200).body;
    expect(all.counts).toEqual({ embassy: 1, interview: 1, arrival: 1, consultation: 1 });
    expect(all.items.map((i: { type: string }) => i.type)).toEqual(['consultation', 'interview', 'embassy', 'arrival']);
    const embassy = all.items.find((i: { type: string }) => i.type === 'embassy');
    expect(embassy).toMatchObject({ id: c.id, movable: true, caseNumber: c.number, place: 'Botschaft Baku', staff: { id: staff.user.id } });
    expect(all.items.find((i: { type: string }) => i.type === 'interview')).toMatchObject({ id: interview.id, movable: true, staff: { id: other.user.id } });
    expect(all.items.find((i: { type: string }) => i.type === 'arrival')).toMatchObject({ movable: false, title: 'Aynur Həsənova · LH 2547', staff: { id: staff.user.id } });

    const mine = expectStatus(await staff.agent.get('/api/admin/ops-calendar').query({ ...range, staffId: 'me' }), 200).body;
    expect(mine.items.map((i: { type: string }) => i.type).sort()).toEqual(['arrival', 'embassy']);
    const typed = expectStatus(await staff.agent.get('/api/admin/ops-calendar').query({ ...range, types: 'interview,consultation', staffId: other.user.id }), 200).body;
    expect(typed.items.map((i: { type: string }) => i.type)).toEqual(['consultation', 'interview']);
    expectStatus(await staff.agent.get('/api/admin/ops-calendar').query({ from: range.to, to: range.from }), 400);

    // Drag and drop → the case workflow's reschedule (client notified, case event) …
    const to = inHours(96);
    expectStatus(await act(staff.agent, c.id, { action: 'SCHEDULE_APPOINTMENT', at: to.toISOString(), place: embassy.place }), 200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).appointmentAt?.toISOString()).toBe(to.toISOString());
    expect(await prisma.caseEvent.count({ where: { caseId: c.id, type: 'APPOINTMENT_RESCHEDULED' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: client.user.id } })).toBeGreaterThan(0);
    // … and the interview PATCH (audited, back to "proposed").
    const start = inHours(40);
    expectStatus(await staff.agent.patch(`/api/interviews/${interview.id}`).send({ startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 60 * 60 * 1000).toISOString() }), 200);
    const moved = expectStatus(await staff.agent.get('/api/admin/ops-calendar').query({ ...range, types: 'interview' }), 200).body.items[0];
    expect(moved).toMatchObject({ status: 'PROPOSED', startsAt: start.toISOString() });
    expect(await prisma.auditLog.count({ where: { action: 'INTERVIEW_UPDATED', target: `interview:${interview.id}` } })).toBe(1);
  });
});

describe('client 360', () => {
  it('header, sections, tags and a filtered, paged timeline', async () => {
    const staff = await asStaff({ firstName: 'Rəşad' });
    const client = await asClient({ firstName: 'Leyla', lastName: 'Kərimova', phone: '+994501112233' });
    const c = await createCaseVia(client.agent, 'Tibb bacısı');
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: staff.user.id } });
    expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/messages`).send({ body: 'Sənədlərinizi yükləyin' }), 201);
    await prisma.caseMessage.create({ data: { caseId: c.id, authorId: client.user.id, body: 'Yüklədim', createdAt: new Date(Date.now() + 1000) } });
    expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/notes`).send({ note: 'Zəng etmək lazımdır' }), 201);
    await prisma.clientInvoice.create({ data: { number: 'TV-KR-2026-9001', clientId: client.user.id, caseId: c.id, issueDate: new Date(Date.now() - 20 * DAY), dueDate: new Date(Date.now() - 6 * DAY), items: [], netCents: 10000, vatCents: 1900, grossCents: 11900, status: 'SENT' } });
    await prisma.call.create({ data: { provider: 'manual', direction: 'OUTBOUND', fromNumber: '+4930', toNumber: '+994501112233', staffId: staff.user.id, clientId: client.user.id, status: 'COMPLETED', durationSec: 120, summary: 'Danışdıq' } });
    await prisma.task.create({ data: { number: 7, title: 'Pasportu yoxla', caseId: c.id, createdById: staff.user.id, assignees: { create: { userId: staff.user.id } } } });

    const data = expectStatus(await staff.agent.get(`/api/admin/clients/${client.user.id}`), 200).body;
    expect(data.client).toMatchObject({ id: client.user.id, firstName: 'Leyla' });
    expect(data.owner.id).toBe(staff.user.id);
    expect(data.counts).toMatchObject({ cases: 1, openCases: 1, invoices: 1, overdueInvoices: 1, messages: 2, calls: 1, tasks: 1 });
    expect(data.flags).toEqual(expect.arrayContaining(['OVERDUE_INVOICE', 'AWAITING_REPLY', 'NEW']));
    expect(data.money.open).toEqual({ EUR: 11900 });
    expect(data.calls[0]).toMatchObject({ staffName: 'Rəşad User', summary: 'Danışdıq' });

    // Tags: stored on the client's shared contact (created on first save), visible in the workspace contacts.
    const tagged = expectStatus(await staff.agent.put(`/api/admin/clients/${client.user.id}/tags`).send({ tags: ['VIP', ' vip ', 'Ailə'] }), 200).body;
    expect(tagged.tags).toEqual(['VIP', 'Ailə']);
    expect(await prisma.contact.findUniqueOrThrow({ where: { id: tagged.contactId } })).toMatchObject({ userId: client.user.id, shared: true, tags: ['VIP', 'Ailə'] });
    expect(expectStatus(await staff.agent.get(`/api/admin/clients/${client.user.id}`), 200).body.tags).toEqual(['VIP', 'Ailə']);

    // Timeline: everything merged, newest first; filters and paging.
    const tl = expectStatus(await staff.agent.get(`/api/admin/clients/${client.user.id}/timeline`), 200).body;
    const types = new Set(tl.entries.map((e: { type: string }) => e.type));
    for (const t of ['case', 'note', 'message', 'call', 'payment', 'task', 'audit']) expect(types.has(t)).toBe(true);
    const at = tl.entries.map((e: { at: string }) => new Date(e.at).getTime());
    expect([...at].sort((a, b) => b - a)).toEqual(at);
    const msgs = expectStatus(await staff.agent.get(`/api/admin/clients/${client.user.id}/timeline`).query({ types: 'message' }), 200).body;
    expect(msgs.entries.map((e: { kind: string }) => e.kind)).toEqual(['FROM_CLIENT', 'FROM_STAFF']);
    const page1 = expectStatus(await staff.agent.get(`/api/admin/clients/${client.user.id}/timeline`).query({ types: 'message', limit: 1 }), 200).body;
    expect(page1.entries).toHaveLength(1);
    const page2 = expectStatus(await staff.agent.get(`/api/admin/clients/${client.user.id}/timeline`).query({ types: 'message', limit: 1, before: page1.nextBefore }), 200).body;
    expect(page2.entries[0].kind).toBe('FROM_STAFF');

    // Only client accounts have a 360° page.
    expectStatus(await staff.agent.get(`/api/admin/clients/${staff.user.id}`), 404);
    expectStatus(await client.agent.get(`/api/admin/clients/${client.user.id}`), 403);
  });
});
