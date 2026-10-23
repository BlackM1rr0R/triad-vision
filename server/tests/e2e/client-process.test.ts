import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { emailsTo, prisma, settle, waitFor } from '../helpers/db';
import { clientCase, createCaseVia, expectStatus, uploadDoc, uploadRequired } from '../helpers/workflow';
import { makePdf, PDF } from '../helpers/files';
import { computeBall, type BallFacts } from '../../src/lib/clientProcess/ballInCourt.js';
import { DEFAULT_ETA } from '../../src/lib/clientProcess/settings.js';
import { runClientTaskReminders, runOfficeVisitReminders } from '../../src/jobs/clientProcess.js';
import { runBookingReminders } from '../../src/jobs/booking.js';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const setOffices = () =>
  prisma.setting.upsert({
    where: { key: 'contact' },
    create: { key: 'contact', value: { phone: '+994', offices: [{ city: { az: 'Bakı', de: 'Baku', en: 'Baku', ru: 'Баку' }, address: 'Nizami küç. 96' }] } },
    update: { value: { phone: '+994', offices: [{ city: { az: 'Bakı', de: 'Baku', en: 'Baku', ru: 'Баку' }, address: 'Nizami küç. 96' }] } },
  });

const settings = { eta: DEFAULT_ETA, useCategoryProcessing: true };
const facts = (over: Partial<BallFacts> = {}): BallFacts => ({
  id: 'c1',
  status: 'DOCUMENTS_PENDING',
  createdAt: new Date(Date.now() - 10 * DAY),
  appointmentAt: null,
  processing: { min: null, max: null },
  contract: null,
  uploadReqs: [],
  pendingDocs: 0,
  tasks: [],
  pendingSignatures: 0,
  lastClientMsg: null,
  lastStaffMsg: null,
  statusEvents: [],
  ...over,
});

describe('ball in court: rules', () => {
  it('derives side, reason, counts, ETA and the timeline deterministically', () => {
    const now = new Date();
    const created = new Date(now.getTime() - 10 * DAY);
    // Client must upload 2 documents and fix 1; a task is due in 3 days.
    const due = new Date(now.getTime() + 3 * DAY);
    const a = computeBall(facts({ uploadReqs: [{ docs: [] }, { docs: [] }, { docs: ['REJECTED'] }, { docs: ['PENDING'] }], tasks: [{ dueAt: due }] }), settings, now);
    expect(a.side).toBe('CLIENT');
    expect(a.reason).toBe('FIX_DOCS');
    expect(a.items.map((i) => [i.reason, i.count])).toEqual([['FIX_DOCS', 1], ['UPLOAD_DOCS', 2], ['CLIENT_TASKS', 1]]);
    expect(a.dueAt).toBe(due.toISOString());
    expect(a.eta).toBeNull();

    // Everything uploaded → submit.
    expect(computeBall(facts({ uploadReqs: [{ docs: ['PENDING'] }] }), settings, now).reason).toBe('SUBMIT_DOCS');

    // Team reviews (ETA 24–48 h from when it got the ball), an unanswered client message is a second team item.
    const submitted = new Date(now.getTime() - 5 * HOUR);
    const t = computeBall(
      facts({ status: 'DOCUMENTS_REVIEW', pendingDocs: 3, lastClientMsg: new Date(now.getTime() - HOUR), statusEvents: [{ toStatus: 'DOCUMENTS_PENDING', at: created }, { toStatus: 'DOCUMENTS_REVIEW', at: submitted }] }),
      settings,
      now,
      true,
    );
    expect(t.side).toBe('TEAM');
    expect(t.reason).toBe('REVIEW_DOCS');
    expect(t.count).toBe(3);
    expect(t.items.map((i) => i.reason)).toEqual(['REVIEW_DOCS', 'REPLY_MESSAGE']);
    expect(t.eta).toMatchObject({ minHours: 24, maxHours: 48, late: false });
    expect(t.since).toBe(submitted.toISOString());
    expect(t.timeline!.map((s) => s.side)).toEqual(['CLIENT', 'TEAM']);
    expect(t.totals.CLIENT).toBeCloseTo(10 - 5 / 24, 0);

    // Embassy: the visa category's processing weeks win.
    const e = computeBall(facts({ status: 'DECISION_PENDING', processing: { min: 3, max: 6 }, statusEvents: [{ toStatus: 'DECISION_PENDING', at: created }] }), settings, now);
    expect(e).toMatchObject({ side: 'EMBASSY', reason: 'DECISION', eta: { minHours: 3 * 7 * 24, maxHours: 6 * 7 * 24 } });

    // Appointment ahead → the client attends; after it → the team lodges.
    const appt = new Date(now.getTime() + 2 * DAY);
    expect(computeBall(facts({ status: 'APPOINTMENT_SCHEDULED', appointmentAt: appt }), settings, now)).toMatchObject({ side: 'CLIENT', reason: 'ATTEND_APPOINTMENT', dueAt: appt.toISOString() });
    expect(computeBall(facts({ status: 'APPOINTMENT_SCHEDULED', appointmentAt: new Date(now.getTime() - DAY) }), settings, now)).toMatchObject({ side: 'TEAM', reason: 'LODGE_APPLICATION' });

    // Closed.
    expect(computeBall(facts({ status: 'APPROVED' }), settings, now)).toMatchObject({ side: 'NONE', reason: 'APPROVED', items: [] });
    // Overdue client task while the team holds the ball: still the team, the task shows as a client item.
    const o = computeBall(facts({ status: 'CONTRACT_SIGNED', tasks: [{ dueAt: new Date(now.getTime() - DAY) }] }), settings, now);
    expect(o.side).toBe('TEAM');
    expect(o.items.find((i) => i.reason === 'CLIENT_TASKS')).toMatchObject({ side: 'CLIENT', overdue: true });
  });
});

describe('ball in court: payloads', () => {
  it('is part of the client and admin case detail and of the admin cases list', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await createCaseVia(client.agent);
    const detail = await clientCase(client.agent, c.id);
    const ball = detail.ballInCourt as { side: string; reason: string; count: number; timeline: unknown[] };
    expect(ball.side).toBe('CLIENT');
    expect(['UPLOAD_DOCS', 'SUBMIT_DOCS']).toContain(ball.reason);
    expect(Array.isArray(ball.timeline)).toBe(true);

    await uploadRequired(client.agent, c.id, 'INITIAL');
    expectStatus(await client.agent.post(`/api/cases/${c.id}/submit`), 200);
    const adminDetail = expectStatus(await admin.agent.get(`/api/admin/cases/${c.id}`), 200).body.case;
    expect(adminDetail.ballInCourt).toMatchObject({ side: 'TEAM', reason: 'REVIEW_DOCS', eta: { minHours: 24 } });

    const list = expectStatus(await admin.agent.get('/api/admin/cases'), 200).body.items as { id: string; ballInCourt: { side: string } }[];
    expect(list.find((r) => r.id === c.id)?.ballInCourt.side).toBe('TEAM');

    // Separate endpoint, own cases only.
    expect((await client.agent.get(`/api/client-process/cases/${c.id}/ball`)).body.ball.side).toBe('TEAM');
    const other = await asClient();
    expect((await other.agent.get(`/api/client-process/cases/${c.id}/ball`)).status).toBe(404);
  });

  it('ETA settings are admin-editable and validated', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    expect((await staff.agent.put('/api/admin/client-process/settings').send({ eta: {} })).status).toBe(403);
    expect((await admin.agent.put('/api/admin/client-process/settings').send({ eta: { DOCUMENTS_REVIEW: { minHours: 10, maxHours: 5 } } })).status).toBe(400);
    const res = expectStatus(await admin.agent.put('/api/admin/client-process/settings').send({ eta: { DOCUMENTS_REVIEW: { minHours: 12, maxHours: 24 } } }), 200);
    expect(res.body.settings.eta.DOCUMENTS_REVIEW).toEqual({ minHours: 12, maxHours: 24 });
    expect(res.body.settings.eta.EMBASSY_REVIEW).toEqual(DEFAULT_ETA.EMBASSY_REVIEW);
    expect(await prisma.auditLog.count({ where: { action: 'CLIENT_PROCESS_SETTINGS' } })).toBe(1);
  });
});

describe('client tasks', () => {
  it('staff give a task; the client sees it in their language, marks it done; the team is told', async () => {
    const client = await asClient({ locale: 'de' });
    const staff = await asStaff();
    const admin = await asAdmin();
    const c = await createCaseVia(client.agent);
    const tpls = expectStatus(await staff.agent.get('/api/admin/client-process/templates'), 200).body.templates as { key: string; title: Record<string, string> }[];
    const police = tpls.find((t) => t.key === 'POLICE_CERT')!;
    const created = expectStatus(
      await staff.agent.post(`/api/admin/client-process/cases/${c.id}/tasks`).send({ template: 'POLICE_CERT', title: police.title.az, dueAt: '2099-10-25' }),
      201,
    ).body.task;
    expect(created.dueAt).toBe(new Date('2099-10-25T23:59:00+04:00').toISOString());
    expect(await prisma.auditLog.count({ where: { action: 'CLIENT_TASK_CREATE', target: created.id } })).toBe(1);
    const n = await waitFor(() => prisma.notification.findFirst({ where: { userId: client.user.id, type: 'CLIENT_TASK_NEW' } }));
    expect(n.title).toBe(`Neue Aufgabe: ${police.title.de}`);
    await emailsTo(client.user.email);

    const mine = expectStatus(await client.agent.get('/api/client-process/tasks'), 200).body;
    expect(mine.counts).toEqual({ open: 1, overdue: 0 });
    expect(mine.tasks[0]).toMatchObject({ id: created.id, title: police.title.de, caseNumber: c.number, state: 'open' });

    // Another client can neither see nor complete it.
    const other = await asClient();
    expect((await other.agent.get('/api/client-process/tasks')).body.tasks).toHaveLength(0);
    expect((await other.agent.post(`/api/client-process/tasks/${created.id}/done`).send({})).status).toBe(404);
    expect((await other.agent.get(`/api/client-process/tasks?caseId=${c.id}`)).status).toBe(404);

    // Done with a note and a file.
    const done = await client.agent
      .post(`/api/client-process/tasks/${created.id}/done`)
      .field('note', 'Beantragt')
      .attach('file', await makePdf('cert'), { filename: 'cert.pdf', ...PDF });
    expectStatus(done, 200);
    expect(done.body.task).toMatchObject({ status: 'DONE', completedVia: 'CLIENT', clientNote: 'Beantragt' });
    expect(done.body.task.clientDocumentId).toBeTruthy();
    expect((await client.agent.post(`/api/client-process/tasks/${created.id}/done`).send({})).status).toBe(409);
    await waitFor(() => prisma.notification.findFirst({ where: { userId: admin.user.id, title: { contains: 'tapşırıq tamamlandı' } } }));

    // Undo by the client, then staff cancel / delete.
    expectStatus(await client.agent.post(`/api/client-process/tasks/${created.id}/reopen`), 200);
    const patched = expectStatus(await staff.agent.patch(`/api/admin/client-process/tasks/${created.id}`).send({ status: 'CANCELLED' }), 200).body.task;
    expect(patched.status).toBe('CANCELLED');
    expect((await client.agent.get('/api/client-process/tasks')).body.tasks).toHaveLength(0);
    expectStatus(await staff.agent.delete(`/api/admin/client-process/tasks/${created.id}`), 200);
    expect(await prisma.clientTask.count({ where: { id: created.id } })).toBe(0);
  });

  it('a task linked to a requirement completes itself when the client uploads it', async () => {
    const client = await asClient();
    const staff = await asStaff();
    const c = await createCaseVia(client.agent);
    const req = (await clientCase(client.agent, c.id)).requirements.find((r) => r.stage === 'INITIAL')!;
    const t = expectStatus(await staff.agent.post(`/api/admin/client-process/cases/${c.id}/tasks`).send({ title: 'Diplom yükləyin', requirementId: req.id }), 201).body.task;
    expect((await staff.agent.post(`/api/admin/client-process/cases/${c.id}/tasks`).send({ title: 'X y', requirementId: 'nope' })).status).toBe(400);
    expectStatus(await uploadDoc(client.agent, c.id, req.id), 201);
    const row = await waitFor(() => prisma.clientTask.findFirst({ where: { id: t.id, status: 'DONE' } }));
    expect(row.completedVia).toBe('UPLOAD');
  });

  it('cross-case list, my-work kind and reminders (2 days, due day, overdue ×3)', async () => {
    const client = await asClient({ locale: 'en' });
    const staff = await asStaff();
    const c = await createCaseVia(client.agent);
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: staff.user.id } });
    const now = new Date();
    const old = new Date(now.getTime() - 20 * DAY);
    const overdue = await prisma.clientTask.create({ data: { caseId: c.id, title: 'Overdue one', dueAt: new Date(now.getTime() - 2 * DAY), createdAt: old } });
    const soon = await prisma.clientTask.create({ data: { caseId: c.id, title: 'Soon one', dueAt: new Date(now.getTime() + 36 * HOUR), createdAt: old } });

    const list = expectStatus(await staff.agent.get('/api/admin/client-process/tasks?filter=overdue&mine=1'), 200).body;
    expect(list.tasks.map((x: { id: string }) => x.id)).toEqual([overdue.id]);
    expect(list.counts).toMatchObject({ overdue: 1, dueSoon: 1, open: 2 });
    expect((await staff.agent.get('/api/admin/client-process/tasks?filter=due_soon')).body.tasks.map((x: { id: string }) => x.id)).toEqual([soon.id]);

    const work = expectStatus(await staff.agent.get('/api/admin/my-work?fresh=1'), 200).body;
    const item = work.items.find((i: { kind: string }) => i.kind === 'client_task_overdue');
    expect(item).toMatchObject({ category: 'tasks', overdue: true, refs: { clientTaskId: overdue.id } });

    // Reminders driven by a fixed clock: 10:00 Baku today.
    const at = (d: Date, h: number) => new Date(`${new Date(d.getTime() + 4 * HOUR).toISOString().slice(0, 10)}T${String(h).padStart(2, '0')}:00:00+04:00`);
    await prisma.clientTask.update({ where: { id: overdue.id }, data: { dueAt: at(now, 23) } }); // due today 23:00
    await prisma.clientTask.update({ where: { id: soon.id }, data: { dueAt: new Date(at(now, 10).getTime() + 40 * HOUR) } });
    const t10 = at(now, 10);
    expect(await runClientTaskReminders(t10)).toBe(2);
    expect(await runClientTaskReminders(t10)).toBe(0);
    const types = (await prisma.notification.findMany({ where: { userId: client.user.id, type: { startsWith: 'CLIENT_TASK_' } } })).map((x) => x.type).sort();
    expect(types).toEqual(['CLIENT_TASK_DUE_SOON', 'CLIENT_TASK_DUE_TODAY']);
    // Overdue: next day once, again after 3 days, at most 3 times.
    await prisma.clientTask.update({ where: { id: soon.id }, data: { status: 'DONE' } });
    const due = at(now, 23);
    let sent = 0;
    for (let d = 1; d <= 14; d++) sent += await runClientTaskReminders(new Date(at(due, 10).getTime() + d * DAY));
    const overdueCount = await prisma.notification.count({ where: { userId: client.user.id, type: 'CLIENT_TASK_OVERDUE' } });
    expect(overdueCount).toBe(3);
    expect(sent).toBe(3);
  });
});

describe('office visits', () => {
  it('staff create office slots with capacity; clients book, get .ics and reminders; public booking ignores them', async () => {
    await setOffices();
    const staff = await asStaff({ locale: 'de' });
    const startsAt = new Date(Math.floor((Date.now() + 30 * HOUR) / 60000) * 60000);
    expectStatus(await staff.agent.post('/api/admin/client-process/office/slots').send({ startsAt, minutes: 30, capacity: 2, officeIndex: 0 }), 201);
    expect((await staff.agent.post('/api/admin/client-process/office/slots').send({ startsAt, minutes: 30, capacity: 1, officeIndex: 5 })).status).toBe(409);
    expect(await prisma.consultationSlot.count({ where: { kind: 'OFFICE' } })).toBe(2);
    expect((await anon().get('/api/booking/slots')).body.slots).toHaveLength(0);
    const officeSeat = await prisma.consultationSlot.findFirstOrThrow({ where: { kind: 'OFFICE' } });
    expect((await anon().post('/api/booking').send({ slotId: officeSeat.id, topic: 'candidate', name: 'Ali A', email: 'a@test.local', locale: 'en', consent: true })).status).toBe(404);
    expect((await staff.agent.get('/api/admin/booking/slots')).body.slots).toHaveLength(0);

    const a = await asClient({ locale: 'en' });
    const b = await asClient();
    const c3 = await asClient();
    const ca = await createCaseVia(a.agent);
    const cb = await createCaseVia(b.agent);
    const cc = await createCaseVia(c3.agent);
    const slots = expectStatus(await a.agent.get('/api/client-process/office/slots'), 200).body;
    expect(slots.slots).toHaveLength(1);
    expect(slots.slots[0]).toMatchObject({ free: 2, location: 'Bakı · Nizami küç. 96' });
    const slotId = slots.slots[0].id;

    expect((await a.agent.post('/api/client-process/office/visits').send({ caseId: cb.id, slotId, reason: 'originals' })).status).toBe(404);
    expect((await a.agent.post('/api/client-process/office/visits').send({ caseId: ca.id, slotId, reason: 'other' })).status).toBe(400);
    const va = expectStatus(await a.agent.post('/api/client-process/office/visits').send({ caseId: ca.id, slotId, reason: 'originals' }), 201).body.visit;
    expect(va).toMatchObject({ reason: 'originals', status: 'BOOKED', caseId: ca.id, canCancel: true });
    expectStatus(await b.agent.post('/api/client-process/office/visits').send({ caseId: cb.id, slotId, reason: 'passport' }), 201);
    expect((await c3.agent.post('/api/client-process/office/visits').send({ caseId: cc.id, slotId, reason: 'sign' })).status).toBe(409);
    expect((await c3.agent.get('/api/client-process/office/slots')).body.slots).toHaveLength(0);

    const mail = (await emailsTo(a.user.email)).find((m) => m.subject.includes('office visit is confirmed'));
    expect(mail).toBeTruthy();
    await waitFor(() => prisma.notification.findFirst({ where: { userId: staff.user.id, type: 'OFFICE_VISIT_NEW' } }));
    const ics = expectStatus(await a.agent.get(`/api/client-process/office/visits/${va.id}/ics`), 200);
    expect(ics.text).toContain('LOCATION:Bakı · Nizami küç. 96');
    expect((await b.agent.get(`/api/client-process/office/visits/${va.id}/ics`)).status).toBe(404);

    // Staff: day list + slot groups; my-work booking item with the office note.
    const day = new Date(startsAt.getTime() + 4 * HOUR).toISOString().slice(0, 10);
    const visits = expectStatus(await staff.agent.get(`/api/admin/client-process/office/visits?day=${day}`), 200).body.visits;
    expect(visits).toHaveLength(2);
    const groups = expectStatus(await staff.agent.get('/api/admin/client-process/office/slots'), 200).body.slots;
    expect(groups[0]).toMatchObject({ capacity: 2 });
    expect(groups[0].visits).toHaveLength(2);

    // Reminders: 24 h (to the client), 2 h; the consultation job ignores office visits.
    await prisma.booking.updateMany({ where: { caseId: { in: [ca.id, cb.id] } }, data: { createdAt: new Date(Date.now() - 3 * DAY) } });
    expect(await runBookingReminders(new Date(startsAt.getTime() - 23 * HOUR))).toBe(0);
    expect(await runOfficeVisitReminders(new Date(startsAt.getTime() - 23 * HOUR))).toBe(2);
    expect(await runOfficeVisitReminders(new Date(startsAt.getTime() - 23 * HOUR))).toBe(0);
    expect(await runOfficeVisitReminders(new Date(startsAt.getTime() - 90 * 60 * 1000))).toBe(2);
    expect(await prisma.notification.count({ where: { userId: a.user.id, type: 'OFFICE_VISIT_REMINDER24H' } })).toBe(1);

    // Cancel frees the seat; another client can then book; staff cancel notifies the client.
    expect((await b.agent.post(`/api/client-process/office/visits/${va.id}/cancel`)).status).toBe(404);
    expectStatus(await a.agent.post(`/api/client-process/office/visits/${va.id}/cancel`), 200);
    const v3 = expectStatus(await c3.agent.post('/api/client-process/office/visits').send({ caseId: cc.id, slotId, reason: 'sign' }), 201).body.visit;
    expectStatus(await staff.agent.post(`/api/admin/client-process/office/visits/${v3.id}/cancel`).send({ message: 'Ofis bağlıdır' }), 200);
    await settle();
    expect(await prisma.notification.count({ where: { userId: c3.user.id, type: 'OFFICE_VISIT_CANCELLEDBYSTAFF' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'OFFICE_VISIT_CANCEL' } })).toBe(1);
  });

  it('reschedules to another office slot', async () => {
    await setOffices();
    const staff = await asStaff();
    const t1 = new Date(Math.floor((Date.now() + 30 * HOUR) / 60000) * 60000);
    const t2 = new Date(t1.getTime() + 2 * HOUR);
    for (const s of [t1, t2]) expectStatus(await staff.agent.post('/api/admin/client-process/office/slots').send({ startsAt: s, minutes: 30 }), 201);
    const a = await asClient();
    const ca = await createCaseVia(a.agent);
    const slots = (await a.agent.get('/api/client-process/office/slots')).body.slots as { id: string; startsAt: string }[];
    const v = expectStatus(await a.agent.post('/api/client-process/office/visits').send({ caseId: ca.id, slotId: slots[0].id, reason: 'passport' }), 201).body.visit;
    const moved = expectStatus(await a.agent.post(`/api/client-process/office/visits/${v.id}/reschedule`).send({ slotId: slots[1].id }), 200).body.visit;
    expect(new Date(moved.startsAt).toISOString()).toBe(t2.toISOString());
    const all = (await a.agent.get(`/api/client-process/office/visits?caseId=${ca.id}`)).body.visits as { status: string }[];
    expect(all.map((x) => x.status).sort()).toEqual(['BOOKED', 'CANCELLED']);
    // Free seats of a slot can be deleted; booked ones are kept.
    const seatT2 = await prisma.consultationSlot.findFirstOrThrow({ where: { startsAt: t2 } });
    expect((await staff.agent.delete(`/api/admin/client-process/office/slots/${seatT2.id}`)).status).toBe(409);
  });
});
