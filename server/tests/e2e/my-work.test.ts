import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient, createStaff, uniq } from '../helpers/factories';
import { compareItems, type WorkItem } from '../../src/lib/myWork.js';
import { snoozedDue } from '../../src/routes/admin/myWork.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms);
const ahead = (ms: number) => new Date(Date.now() + ms);

type Body = { items: WorkItem[]; counts: { total: number; urgent: number; overdue: number; byKind: Record<string, number>; byCategory: Record<string, number> }; more: { kind: string; count: number; link: string }[]; scope: string };
const fetchWork = async (agent: { get: (u: string) => import('supertest').Test }, query = '') => {
  const res = await agent.get(`/api/admin/my-work?fresh=1${query}`);
  expect(res.status).toBe(200);
  return res.body as Body;
};
const ofKind = (b: Body, kind: string) => b.items.filter((i) => i.kind === kind);

const makeCase = async (opts: { staffId?: string | null; status?: string; locale?: 'az' | 'de' | 'en' | 'ru' } = {}) => {
  const { user: client } = await createClient({ firstName: 'Aysel', lastName: 'Mammadova', locale: opts.locale ?? 'az' });
  return prisma.case.create({
    data: { number: uniq('TV-'), clientId: client.id, profession: 'Driver', assignedStaffId: opts.staffId ?? null, status: (opts.status ?? 'DOCUMENTS_REVIEW') as never },
  });
};
const backdateCase = (id: string, at: Date) => prisma.$executeRaw`UPDATE \`Case\` SET updatedAt = ${at} WHERE id = ${id}`;
const addDoc = (caseId: string, uploadedById: string, extra: Record<string, unknown> = {}) =>
  prisma.document.create({
    data: { caseId, stage: 'INITIAL', originalName: 'passport.pdf', storedName: uniq('f-') + '.pdf', mimeType: 'application/pdf', size: 10, uploadedById, ...extra },
  });

describe('my work: access', () => {
  it('requires a staff session; team scope is ADMIN+ only', async () => {
    expect((await anon().get('/api/admin/my-work')).status).toBe(401);
    const client = await asClient();
    expect((await client.agent.get('/api/admin/my-work')).status).toBe(403);
    const staff = await asStaff();
    expect((await staff.agent.get('/api/admin/my-work')).status).toBe(200);
    const team = await staff.agent.get('/api/admin/my-work?scope=all');
    expect(team.status).toBe(403);
    expect(team.body.error).toBe('TEAM_SCOPE_FORBIDDEN');
    const admin = await asAdmin();
    const ok = await admin.agent.get('/api/admin/my-work?scope=all');
    expect(ok.status).toBe(200);
    expect(ok.body.scope).toBe('all');
  });
});

describe('my work: documents and cases', () => {
  it('lists pending documents of my cases only, with accept / reject actions; admins also see unassigned cases; team scope sees all', async () => {
    const me = await asStaff({ firstName: 'Kamran', lastName: 'Aliyev' });
    const other = await asStaff();
    const admin = await asAdmin();
    const mine = await makeCase({ staffId: me.user.id, locale: 'de' });
    const theirs = await makeCase({ staffId: other.user.id });
    const nobody = await makeCase({ staffId: null });
    const d1 = await addDoc(mine.id, mine.clientId, { createdAt: ago(3 * DAY) });
    const d2 = await addDoc(theirs.id, theirs.clientId);
    const d3 = await addDoc(nobody.id, nobody.clientId);
    await addDoc(mine.id, mine.clientId, { status: 'ACCEPTED' });
    await addDoc(mine.id, mine.clientId, { stage: 'VISA' });

    const b = await fetchWork(me.agent);
    const docs = ofKind(b, 'doc_review');
    expect(docs.map((d) => d.refs.documentId)).toEqual([d1.id]);
    const item = docs[0];
    expect(item).toMatchObject({
      id: `doc_review:${d1.id}`,
      category: 'documents',
      overdue: true, // review SLA of 2 days passed
      priority: 'HIGH',
      bucket: 'overdue',
      link: `/admin/cases/${mine.id}`,
      refs: { caseId: mine.id, clientLocale: 'de' },
      assignee: { id: me.user.id, name: 'Kamran Aliyev' },
    });
    expect(item.ageHours).toBeGreaterThanOrEqual(71);
    const accept = item.actions.find((a) => a.key === 'accept')!;
    expect(accept).toMatchObject({ type: 'api', method: 'POST', endpoint: `/admin/cases/${mine.id}/documents/${d1.id}/review`, body: { status: 'ACCEPTED' } });
    expect(item.actions.find((a) => a.key === 'reject')).toMatchObject({ type: 'reject', body: { status: 'REJECTED' } });

    // The action works through the existing review endpoint, and the item is gone afterwards.
    expect((await me.agent.post(`/api${accept.endpoint}`).send(accept.body)).status).toBe(200);
    expect(ofKind(await fetchWork(me.agent), 'doc_review')).toHaveLength(0);

    const adminMine = ofKind(await fetchWork(admin.agent), 'doc_review').map((d) => d.refs.documentId);
    expect(adminMine).toEqual([d3.id]); // unassigned only
    const adminTeam = ofKind(await fetchWork(admin.agent, '&scope=all'), 'doc_review').map((d) => d.refs.documentId);
    expect(adminTeam.sort()).toEqual([d2.id, d3.id].sort());
  });

  it('lists waiting cases older than a day, stuck cases and appointments in the next 7 days', async () => {
    const me = await asStaff();
    const waitingOld = await makeCase({ staffId: me.user.id, status: 'CONTRACT_SIGNED' });
    await backdateCase(waitingOld.id, ago(4 * DAY));
    const waitingFresh = await makeCase({ staffId: me.user.id, status: 'EMBASSY_REVIEW' });
    const stuck = await makeCase({ staffId: me.user.id, status: 'DOCUMENTS_PENDING' });
    await backdateCase(stuck.id, ago(20 * DAY));
    const appt = await prisma.case.update({
      where: { id: (await makeCase({ staffId: me.user.id, status: 'APPOINTMENT_SCHEDULED' })).id },
      data: { appointmentAt: ahead(10 * HOUR), appointmentPlace: 'Botschaft Baku' },
    });
    const farAppt = await makeCase({ staffId: me.user.id, status: 'APPOINTMENT_SCHEDULED' });
    await prisma.case.update({ where: { id: farAppt.id }, data: { appointmentAt: ahead(10 * DAY) } });

    const b = await fetchWork(me.agent);
    expect(ofKind(b, 'case_waiting').map((i) => i.refs.caseId)).toEqual([waitingOld.id]);
    expect(ofKind(b, 'case_waiting')[0]).toMatchObject({ overdue: true, note: { key: 'status.CONTRACT_SIGNED' } });
    expect(ofKind(b, 'case_waiting').some((i) => i.refs.caseId === waitingFresh.id)).toBe(false);
    expect(ofKind(b, 'case_stuck').map((i) => i.refs.caseId)).toEqual([stuck.id]);
    const a = ofKind(b, 'appointment');
    expect(a.map((i) => i.refs.caseId)).toEqual([appt.id]);
    expect(a[0]).toMatchObject({ priority: 'URGENT', subtitle: 'Botschaft Baku', overdue: false });
  });
});

describe('my work: tasks and snooze', () => {
  it('lists my open tasks due up to a week (overdue / today / week), not other people\'s, and orders overdue first', async () => {
    const me = await asStaff();
    const { user: bob } = await createStaff();
    const mk = async (title: string, dueAt: Date | null, assignee: string, extra: Record<string, unknown> = {}) => {
      const number = (await prisma.task.count()) + 1;
      return prisma.task.create({ data: { number, title, dueAt, ...extra, assignees: { create: { userId: assignee } } } });
    };
    const overdue = await mk('Overdue', ago(2 * HOUR), me.user.id);
    const today = await mk('Today urgent', ahead(30 * 60_000), me.user.id, { priority: 'URGENT' });
    const week = await mk('Week', ahead(3 * DAY), me.user.id);
    await mk('Far', ahead(20 * DAY), me.user.id);
    await mk('No date', null, me.user.id);
    await mk('Done', ago(DAY), me.user.id, { status: 'DONE' });
    await mk('Bob', ago(DAY), bob.id);

    const b = await fetchWork(me.agent);
    const t = ofKind(b, 'task');
    expect(t.map((i) => i.refs.taskId).sort()).toEqual([overdue.id, today.id, week.id].sort());
    const byId = Object.fromEntries(t.map((i) => [i.refs.taskId, i])) as Record<string, WorkItem>;
    expect(byId[overdue.id]).toMatchObject({ overdue: true, bucket: 'overdue', priority: 'HIGH' });
    expect(byId[today.id]).toMatchObject({ overdue: false, priority: 'URGENT' });
    expect(['today', 'week']).toContain(byId[today.id].bucket);
    expect(['week', 'today']).toContain(byId[week.id].bucket);
    expect(byId[overdue.id].actions.map((a) => a.key)).toEqual(['done', 'snooze']);
    expect(b.counts.byKind.task).toBe(3);
    expect(b.counts.byCategory.tasks).toBe(3);

    // Overdue first, then by priority.
    const order = b.items.map((i) => i.id);
    expect(order.indexOf(`task:${overdue.id}`)).toBeLessThan(order.indexOf(`task:${today.id}`));
    expect(order.indexOf(`task:${today.id}`)).toBeLessThan(order.indexOf(`task:${week.id}`));

    // Done through the existing tasks API.
    const done = byId[week.id].actions.find((a) => a.key === 'done')!;
    expect((await me.agent.patch(`/api${done.endpoint}`).send(done.body)).status).toBe(200);
    expect(ofKind(await fetchWork(me.agent), 'task').some((i) => i.refs.taskId === week.id)).toBe(false);

    // Admin team view includes Bob's task with Bob as assignee.
    const admin = await asAdmin();
    const team = ofKind(await fetchWork(admin.agent, '&scope=all'), 'task');
    expect(team.find((i) => i.title === 'Bob')?.assignee?.id).toBe(bob.id);
    expect(ofKind(await fetchWork(admin.agent), 'task')).toHaveLength(0);
  });

  it('snoozes a task by a day (assignees only), keeping the time of day of an overdue deadline', async () => {
    const me = await asStaff();
    const stranger = await asStaff();
    const due = ago(2 * HOUR);
    const task = await prisma.task.create({ data: { number: 1, title: 'Call embassy', dueAt: due, assignees: { create: { userId: me.user.id } } } });

    expect((await stranger.agent.post(`/api/admin/my-work/tasks/${task.id}/snooze`).send({})).status).toBe(403);
    expect((await me.agent.post('/api/admin/my-work/tasks/T-0099/snooze').send({})).status).toBe(404);
    const res = await me.agent.post(`/api/admin/my-work/tasks/T-0001/snooze`).send({ days: 1 });
    expect(res.status).toBe(200);
    const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(after.dueAt!.getTime()).toBe(due.getTime() + DAY);
    // Activity row on the task timeline
    expect(await prisma.taskComment.count({ where: { taskId: task.id } })).toBe(1);
    const item = ofKind(await fetchWork(me.agent), 'task')[0];
    expect(item.overdue).toBe(false);

    await prisma.task.update({ where: { id: task.id }, data: { status: 'DONE' } });
    expect((await me.agent.post(`/api/admin/my-work/tasks/${task.id}/snooze`).send({})).status).toBe(409);
    expect((await me.agent.post(`/api/admin/my-work/tasks/${task.id}/snooze`).send({ days: 99 })).status).toBe(400);
  });

  it('computes the snoozed deadline', () => {
    const now = new Date('2026-10-20T10:00:00Z');
    expect(snoozedDue(new Date('2026-10-17T09:00:00Z'), 1, now).toISOString()).toBe('2026-10-21T09:00:00.000Z');
    expect(snoozedDue(new Date('2026-10-22T09:00:00Z'), 1, now).toISOString()).toBe('2026-10-23T09:00:00.000Z');
    expect(snoozedDue(null, 1, now).toISOString()).toBe('2026-10-21T10:00:00.000Z');
  });
});

describe('my work: signatures', () => {
  const makeRequest = async (createdById: string, signers: { userId?: string; name: string; order: number; status?: 'PENDING' | 'SIGNED' }[], sentAt: Date) =>
    prisma.signatureRequest.create({
      data: {
        title: 'Arbeitsvertrag',
        createdById,
        status: 'SENT',
        sentAt,
        expiresAt: ahead(10 * DAY),
        originalName: 'c.pdf',
        originalKey: uniq('sig-'),
        originalSha256: crypto.randomBytes(32).toString('hex'),
        originalSize: 100,
        originalPages: 1,
        signers: { create: signers.map((s) => ({ role: s.userId ? 'STAFF' : 'CANDIDATE', name: s.name, email: `${uniq('s')}@test.local`, userId: s.userId ?? null, order: s.order, status: s.status ?? 'PENDING' })) },
      },
      include: { signers: true },
    });

  it('shows requests where it is my turn to sign, and requests waiting on others > 3 days with a remind button', async () => {
    const me = await asStaff({ firstName: 'Leyla' });
    const other = await asStaff();
    // Candidate signed, my turn (order 2)
    const toSign = await makeRequest(other.user.id, [{ name: 'Candidate', order: 1, status: 'SIGNED' }, { userId: me.user.id, name: 'Leyla', order: 2 }], ago(DAY));
    // Not my turn yet (candidate first)
    await makeRequest(other.user.id, [{ name: 'Candidate', order: 1 }, { userId: me.user.id, name: 'Leyla', order: 2 }], ago(DAY));
    // Mine, waiting on the candidate for 5 days
    const waiting = await makeRequest(me.user.id, [{ name: 'Nigar Candidate', order: 1 }], ago(5 * DAY));
    // Mine, sent yesterday: not yet
    await makeRequest(me.user.id, [{ name: 'Fresh', order: 1 }], ago(DAY));
    // Someone else's waiting request
    const theirs = await makeRequest(other.user.id, [{ name: 'X', order: 1 }], ago(5 * DAY));

    const b = await fetchWork(me.agent);
    const sign = ofKind(b, 'sign_mine');
    const mySigner = toSign.signers.find((s) => s.userId === me.user.id)!;
    expect(sign.map((i) => i.refs.signerId)).toEqual([mySigner.id]);
    expect(sign[0].actions[0]).toMatchObject({ key: 'sign', type: 'link', href: `/admin/signatures/sign/${mySigner.id}` });
    const w = ofKind(b, 'sign_waiting');
    expect(w.map((i) => i.refs.requestId)).toEqual([waiting.id]);
    expect(w[0].note).toEqual({ key: 'waitingOn', params: { names: 'Nigar Candidate' } });
    expect(w[0].actions[0]).toMatchObject({ key: 'remind', method: 'POST', endpoint: `/admin/signatures/${waiting.id}/remind` });
    expect(b.counts.byCategory.signatures).toBe(2);

    const admin = await asAdmin();
    const team = ofKind(await fetchWork(admin.agent, '&scope=all'), 'sign_waiting').map((i) => i.refs.requestId);
    expect(team).toContain(theirs.id);
    expect(team).toContain(waiting.id);
  });
});

describe('my work: mail, leads, bookings, applications', () => {
  it('lists my unread inbox mail and NEW triage cards (never other people\'s mailboxes)', async () => {
    const me = await asStaff();
    const other = await asStaff();
    const mkAccount = async (userId: string) => {
      const account = await prisma.mailAccount.create({ data: { userId, email: `${uniq('m')}@triad.test`, imapHost: 'x', smtpHost: 'x', username: 'x', passwordEnc: 'x' } });
      const folder = await prisma.mailFolder.create({ data: { accountId: account.id, path: 'INBOX', name: 'Inbox', role: 'INBOX' } });
      return { account, folder };
    };
    const mine = await mkAccount(me.user.id);
    const theirs = await mkAccount(other.user.id);
    const msg = (a: { account: { id: string }; folder: { id: string } }, extra: Record<string, unknown> = {}) =>
      prisma.mailMessage.create({ data: { accountId: a.account.id, folderId: a.folder.id, subject: 'Hello', fromAddr: 'x@y.z', toList: [], date: ago(2 * HOUR), ...extra } });
    const unread = await msg(mine, { subject: 'Question about visa' });
    await msg(mine, { seen: true });
    await msg(mine, { date: ago(20 * DAY) });
    await msg(theirs);
    const triaged = await msg(mine, { subject: 'Need 10 drivers' });
    await prisma.mailTriage.create({ data: { messageId: triaged.id, accountId: mine.account.id, status: 'NEW', category: 'EMPLOYER', urgency: 'URGENT', suggestedAssigneeId: other.user.id } });

    const b = await fetchWork(me.agent);
    expect(ofKind(b, 'mail_unread').map((i) => i.refs.messageId)).toEqual([unread.id]);
    const t = ofKind(b, 'mail_triage');
    expect(t.map((i) => i.refs.messageId)).toEqual([triaged.id]);
    expect(t[0]).toMatchObject({ priority: 'URGENT', note: { key: 'mailCategory.EMPLOYER' } });
    expect(t[0].actions.map((a) => a.key)).toEqual(['open', 'lead', 'assign', 'dismiss']);
    expect(t[0].actions.find((a) => a.key === 'assign')).toMatchObject({ body: { userId: other.user.id, mode: 'task' } });

    // Mark read through the existing mail endpoint.
    const read = ofKind(b, 'mail_unread')[0].actions.find((a) => a.key === 'read')!;
    expect((await me.agent.post(`/api${read.endpoint}`).send({})).status).toBe(200);
    expect(ofKind(await fetchWork(me.agent), 'mail_unread')).toHaveLength(0);

    // Team view never shows another person's mailbox.
    const admin = await asAdmin();
    expect(ofKind(await fetchWork(admin.agent, '&scope=all'), 'mail_unread')).toHaveLength(0);
  });

  it('lists new inquiries, today\'s consultations, applications waiting for a decision and open employer requests', async () => {
    const me = await asStaff();
    const other = await asStaff();
    const inq = await prisma.inquiry.create({ data: { kind: 'company', companyName: 'Spedition GmbH', contactName: 'Herr Weber', email: 'w@x.de', message: 'Wir suchen Fahrer', locale: 'de', workersNeeded: 5 } });
    await prisma.inquiry.create({ data: { kind: 'contact', contactName: 'Done', email: 'd@x.de', message: '-', locale: 'de', status: 'DONE' } });

    const slot = await prisma.consultationSlot.create({ data: { staffId: me.user.id, startsAt: ahead(30 * 60_000), endsAt: ahead(60 * 60_000) } });
    const booking = await prisma.booking.create({ data: { slotId: slot.id, name: 'Rauf', email: 'r@x.az', meetingUrl: 'https://meet.example/abc', manageToken: uniq('tok') } });
    const otherSlot = await prisma.consultationSlot.create({ data: { staffId: other.user.id, startsAt: ahead(30 * 60_000), endsAt: ahead(60 * 60_000) } });
    await prisma.booking.create({ data: { slotId: otherSlot.id, name: 'Other', email: 'o@x.az', meetingUrl: 'https://meet.example/x', manageToken: uniq('tok') } });

    const company = await prisma.company.create({ data: { name: 'Logistik AG', status: 'ACTIVE' } });
    const vacancy = await prisma.vacancy.create({ data: { slug: uniq('v-'), companyId: company.id, title: { az: 'Sürücü', de: 'Fahrer', en: 'Driver', ru: 'Водитель' }, description: {}, status: 'OPEN' } });
    const { user: cand } = await createClient({ firstName: 'Elvin', lastName: 'Huseynov' });
    const { user: cand2 } = await createClient();
    const { user: cand3 } = await createClient();
    const oldApp = await prisma.vacancyApplication.create({ data: { vacancyId: vacancy.id, userId: cand.id, status: 'NEW' } });
    await prisma.$executeRaw`UPDATE VacancyApplication SET updatedAt = ${ago(3 * DAY)} WHERE id = ${oldApp.id}`;
    await prisma.vacancyApplication.create({ data: { vacancyId: vacancy.id, userId: cand2.id, status: 'NEW' } }); // fresh
    const proposed = await prisma.vacancyApplication.create({ data: { vacancyId: vacancy.id, userId: cand3.id, status: 'PROPOSED' } });
    await prisma.$executeRaw`UPDATE VacancyApplication SET updatedAt = ${ago(5 * DAY)} WHERE id = ${proposed.id}`;
    const request = await prisma.candidateRequest.create({ data: { companyId: company.id, title: 'Fahrer CE', profession: 'Driver', quantity: 10 } });

    const b = await fetchWork(me.agent);
    const i = ofKind(b, 'inquiry');
    expect(i.map((x) => x.refs.inquiryId)).toEqual([inq.id]);
    expect(i[0].actions.map((a) => a.key)).toEqual(['take', 'done', 'archive']);
    const bk = ofKind(b, 'booking');
    expect(bk.map((x) => x.refs.bookingId)).toEqual([booking.id]);
    expect(bk[0]).toMatchObject({ priority: 'URGENT', category: 'bookings' });
    expect(bk[0].actions.map((a) => a.key)).toEqual(['join', 'done', 'noshow']);
    expect(bk[0].actions[0]).toMatchObject({ type: 'url', href: 'https://meet.example/abc' });
    expect(bk[0].actions[1].notBefore).toBe(slot.startsAt.toISOString());
    const apps = ofKind(b, 'application');
    expect(apps.map((x) => x.refs.applicationId)).toEqual([oldApp.id]);
    expect(apps[0]).toMatchObject({ title: 'Elvin Huseynov', subtitle: expect.stringContaining('Logistik AG') });
    expect(apps[0].actions[0]).toMatchObject({ key: 'shortlist', method: 'PATCH', endpoint: `/admin/candidates/applications/${oldApp.id}`, body: { status: 'SHORTLISTED' } });
    expect(ofKind(b, 'employer_decision').map((x) => x.refs.applicationId)).toEqual([proposed.id]);
    expect(ofKind(b, 'candidate_request').map((x) => x.refs.requestId)).toEqual([request.id]);
    expect(b.counts.byCategory.leads).toBe(4);
    expect(b.counts.byCategory.bookings).toBe(1);

    // Take the inquiry through the existing endpoint.
    const take = i[0].actions[0];
    expect((await me.agent.patch(`/api${take.endpoint}`).send(take.body)).status).toBe(200);
    expect(ofKind(await fetchWork(me.agent), 'inquiry')).toHaveLength(0);
    // Booking "done" before the start is refused by the existing endpoint (the client disables it until notBefore).
    expect((await me.agent.patch(`/api${bk[0].actions[1].endpoint}`).send(bk[0].actions[1].body)).status).toBe(400);
  });
});

describe('my work: expiry, privacy, security', () => {
  it('lists expiring documents not reminded lately; the remind endpoint notifies the client and hides the row', async () => {
    const me = await asStaff();
    const c = await makeCase({ staffId: me.user.id, status: 'EMBASSY_DOCUMENTS', locale: 'de' });
    const doc = await addDoc(c.id, c.clientId, { status: 'ACCEPTED', expiresAt: ahead(5 * DAY) });
    await addDoc(c.id, c.clientId, { status: 'ACCEPTED', expiresAt: ahead(5 * DAY), expiryRemindedAt: ago(DAY) }); // recently reminded
    await addDoc(c.id, c.clientId, { status: 'ACCEPTED', expiresAt: ahead(90 * DAY) }); // far

    const items = ofKind(await fetchWork(me.agent), 'expiring');
    expect(items.map((i) => i.refs.documentId)).toEqual([doc.id]);
    expect(items[0]).toMatchObject({ category: 'documents', note: { key: 'expiresIn', params: { days: 5 } } });
    const remind = items[0].actions[0];
    expect(remind.endpoint).toBe(`/admin/my-work/expiry/${doc.id}/remind`);
    const res = await me.agent.post(`/api${remind.endpoint}`).send({});
    expect(res.status).toBe(200);
    const n = await prisma.notification.findFirst({ where: { userId: c.clientId, type: 'DOCUMENT_EXPIRY' } });
    expect(n).not.toBeNull();
    expect(ofKind(await fetchWork(me.agent), 'expiring')).toHaveLength(0);
    expect((await me.agent.post('/api/admin/my-work/expiry/nope/remind').send({})).status).toBe(404);
  });

  it('shows privacy requests to ADMIN+ and security alerts to the super admin only', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const sup = await asSuperAdmin();
    const pr = await prisma.privacyRequest.create({ data: { email: 'p@x.az', type: 'EXPORT', dueAt: ahead(2 * DAY) } });
    const alert = await prisma.securityAlert.create({ data: { rule: 'failedLoginsAccount', severity: 'HIGH', fingerprint: uniq('fp'), facts: { count: 12 }, eventIds: [] } });

    const s = await fetchWork(staff.agent);
    expect(ofKind(s, 'privacy')).toHaveLength(0);
    expect(ofKind(s, 'security_alert')).toHaveLength(0);

    const a = await fetchWork(admin.agent);
    expect(ofKind(a, 'privacy').map((i) => i.refs.privacyRequestId)).toEqual([pr.id]);
    expect(ofKind(a, 'privacy')[0]).toMatchObject({ priority: 'URGENT', note: { key: 'privacyType.EXPORT' } });
    expect(ofKind(a, 'security_alert')).toHaveLength(0);

    const su = await fetchWork(sup.agent);
    const al = ofKind(su, 'security_alert');
    expect(al.map((i) => i.refs.alertId)).toEqual([alert.id]);
    expect(al[0].priority).toBe('URGENT');
    expect(al[0].title.length).toBeGreaterThan(0);
    const ack = al[0].actions[0];
    expect((await sup.agent.post(`/api${ack.endpoint}`).send({})).status).toBe(200);
    expect(ofKind(await fetchWork(sup.agent), 'security_alert')).toHaveLength(0);
    expect(su.counts.urgent).toBeGreaterThanOrEqual(2);
  });
});

describe('my work: counts, limits, cache', () => {
  it('limits each kind with a "+N more" link and counts the total', async () => {
    const me = await asStaff();
    await prisma.inquiry.createMany({ data: Array.from({ length: 28 }, (_, i) => ({ kind: 'contact', contactName: `Lead ${i}`, email: `l${i}@x.az`, message: '-', locale: 'az' })) });
    const b = await fetchWork(me.agent);
    expect(ofKind(b, 'inquiry')).toHaveLength(25);
    expect(b.counts.byKind.inquiry).toBe(28);
    expect(b.counts.total).toBe(28);
    expect(b.more).toEqual([{ kind: 'inquiry', count: 3, link: '/admin/inquiries' }]);
  });

  it('caches the queue per user for 30 s unless fresh=1', async () => {
    const me = await asStaff();
    const first = await me.agent.get('/api/admin/my-work');
    expect(first.body.items).toHaveLength(0);
    await prisma.inquiry.create({ data: { kind: 'contact', contactName: 'New', email: 'n@x.az', message: '-', locale: 'az' } });
    const cached = await me.agent.get('/api/admin/my-work');
    expect(cached.body.generatedAt).toBe(first.body.generatedAt);
    expect(cached.body.items).toHaveLength(0);
    expect((await fetchWork(me.agent)).items).toHaveLength(1);
    // Another user is not served from my cache.
    const other = await asStaff();
    expect((await other.agent.get('/api/admin/my-work')).body.items).toHaveLength(1);
  });

  it('orders overdue first, then by priority, then by deadline', () => {
    const base = { category: 'other', title: '', subtitle: null, since: '', ageHours: 0, bucket: 'today', link: '', refs: {}, assignee: null, actions: [] } as unknown as WorkItem;
    const mk = (id: string, priority: WorkItem['priority'], overdue: boolean, dueAt: string | null) => ({ ...base, id, kind: 'task', priority, overdue, dueAt }) as WorkItem;
    const list = [
      mk('normal-late', 'NORMAL', false, '2030-01-03T00:00:00Z'),
      mk('urgent', 'URGENT', false, '2030-01-05T00:00:00Z'),
      mk('overdue-normal', 'HIGH', true, '2020-01-01T00:00:00Z'),
      mk('normal-soon', 'NORMAL', false, '2030-01-02T00:00:00Z'),
      mk('overdue-urgent', 'URGENT', true, '2020-01-02T00:00:00Z'),
      mk('no-date', 'NORMAL', false, null),
    ].sort(compareItems);
    expect(list.map((i) => i.id)).toEqual(['overdue-urgent', 'overdue-normal', 'urgent', 'normal-soon', 'normal-late', 'no-date']);
  });
});
