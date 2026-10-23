import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin, anon } from '../helpers/api';
import { prisma, settle, waitFor } from '../helpers/db';
import { createUser, uniq } from '../helpers/factories';
import { config } from '../../src/config.js';
import { runTimerIdleCheck } from '../../src/lib/timeTracking/service.js';
import { hashToken, runCheckIns } from '../../src/lib/checkIns/service.js';
import { buildMyWork } from '../../src/lib/myWork.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const today = () => new Date(Date.now() + 4 * HOUR).toISOString().slice(0, 10); // Baku day

const makeCase = async (opts: { staffId?: string; companyId?: string; status?: 'APPROVED' | 'DOCUMENTS_PENDING' } = {}) => {
  const client = await asClient({ firstName: 'Rauf', lastName: 'Məmmədov' });
  const c = await prisma.case.create({
    data: { clientId: client.user.id, number: uniq('TV-T-'), profession: 'Fahrer', status: opts.status ?? 'APPROVED', assignedStaffId: opts.staffId ?? null, companyId: opts.companyId ?? null },
  });
  return { client, c };
};

// ─── Time tracking ─────────────────────────────────────────────────────

describe('time tracking: timer', () => {
  it('runs one timer per staff member, switches on start, persists and stops', async () => {
    const staff = await asStaff();
    const { c } = await makeCase({ staffId: staff.user.id });
    const { c: c2 } = await makeCase();
    expect((await staff.agent.get('/api/admin/time/current')).body.running).toBeNull();

    const s1 = await staff.agent.post('/api/admin/time/start').send({ caseId: c.id, activity: 'DOCUMENTS' });
    expect(s1.status).toBe(201);
    expect(s1.body.entry).toMatchObject({ caseId: c.id, caseNumber: c.number, running: true, activity: 'DOCUMENTS' });
    expect(s1.body.stopped).toBeNull();

    const cur = await staff.agent.get('/api/admin/time/current');
    expect(cur.body.running).toMatchObject({ id: s1.body.entry.id, caseNumber: c.number, idleWarning: false });

    // Backdate so the switch records time.
    await prisma.timeEntry.update({ where: { id: s1.body.entry.id }, data: { startedAt: new Date(Date.now() - 25 * 60 * 1000) } });
    const s2 = await staff.agent.post('/api/admin/time/start').send({ caseId: c2.id, activity: 'EMBASSY' });
    expect(s2.body.stopped).toMatchObject({ id: s1.body.entry.id, running: false, minutes: 25 });
    expect(await prisma.timeEntry.count({ where: { userId: staff.user.id, endedAt: null } })).toBe(1);

    const stop = await staff.agent.post('/api/admin/time/stop').send({ note: 'Botschaftstermin' });
    expect(stop.status).toBe(200);
    expect(stop.body.entry).toMatchObject({ caseId: c2.id, running: false, note: 'Botschaftstermin' });
    expect((await staff.agent.post('/api/admin/time/stop').send({})).body.error).toBe('NO_RUNNING_TIMER');
    expect((await staff.agent.post('/api/admin/time/start').send({ caseId: 'nope' })).status).toBe(404);
  });

  it('a task link brings its case; another staff member has an own independent timer', async () => {
    const a = await asStaff();
    const b = await asStaff();
    const { c } = await makeCase();
    const task = await prisma.task.create({ data: { number: 9001, title: 'Call employer', caseId: c.id } });
    const r = await a.agent.post('/api/admin/time/start').send({ taskId: task.id, activity: 'EMPLOYER_COMMUNICATION' });
    expect(r.body.entry).toMatchObject({ caseId: c.id, taskId: task.id });
    await b.agent.post('/api/admin/time/start').send({});
    expect(await prisma.timeEntry.count({ where: { endedAt: null } })).toBe(2);
    expect((await a.agent.get('/api/admin/time/current')).body.running.task).toMatchObject({ key: 'T-9001' });
  });

  it('idle protection: "still working?" at 10 h (once), auto-stop at 12 h with a note', async () => {
    const staff = await asStaff({ locale: 'en' });
    const { c } = await makeCase();
    const now = new Date();
    const e = await prisma.timeEntry.create({ data: { userId: staff.user.id, caseId: c.id, startedAt: new Date(now.getTime() - 10.5 * HOUR), runningKey: staff.user.id } });
    expect(await runTimerIdleCheck(now)).toEqual({ warned: 1, stopped: 0 });
    expect(await runTimerIdleCheck(now)).toEqual({ warned: 0, stopped: 0 });
    const n = await prisma.notification.findFirst({ where: { userId: staff.user.id, type: 'TIMER_IDLE' } });
    expect(n?.title).toBe('Still working?');
    expect((await staff.agent.get('/api/admin/time/current')).body.running.idleWarning).toBe(true);

    expect(await runTimerIdleCheck(new Date(now.getTime() + 2 * HOUR))).toEqual({ warned: 0, stopped: 1 });
    const stopped = await prisma.timeEntry.findUniqueOrThrow({ where: { id: e.id } });
    expect(stopped).toMatchObject({ runningKey: null, autoStopped: true, minutes: 720 });
    expect(stopped.note).toContain('Stopped automatically');
    expect(await prisma.notification.count({ where: { userId: staff.user.id, type: 'TIMER_AUTO_STOPPED' } })).toBe(1);
  });

  it('reading the current timer applies the 12 h cap even without the job', async () => {
    const staff = await asStaff();
    await prisma.timeEntry.create({ data: { userId: staff.user.id, startedAt: new Date(Date.now() - 30 * HOUR), runningKey: staff.user.id } });
    const cur = await staff.agent.get('/api/admin/time/current');
    expect(cur.body.running).toBeNull();
    expect(cur.body.autoStopped).toMatchObject({ minutes: 720, autoStopped: true });
  });
});

describe('time tracking: manual entries, privacy, reports', () => {
  it('creates manual entries, refuses invalid ones, and STAFF see / change only their own', async () => {
    const a = await asStaff({ firstName: 'Tofiq', lastName: 'Abbasov' });
    const b = await asStaff({ firstName: 'Nigar', lastName: 'Bayramova' });
    const admin = await asAdmin();
    const { c } = await makeCase();
    const ok = await a.agent.post('/api/admin/time/entries').send({ caseId: c.id, date: today(), minutes: 45, activity: 'TRANSLATION', note: 'Diplom' });
    expect(ok.status).toBe(201);
    expect(ok.body.entry).toMatchObject({ minutes: 45, source: 'MANUAL', running: false, day: today() });
    await b.agent.post('/api/admin/time/entries').send({ caseId: c.id, date: today(), minutes: 30, activity: 'CLIENT_COMMUNICATION' });
    expect((await a.agent.post('/api/admin/time/entries').send({ caseId: c.id, date: '2999-01-01', minutes: 10, activity: 'OTHER' })).body.error).toBe('DATE_IN_FUTURE');
    expect((await a.agent.post('/api/admin/time/entries').send({ caseId: c.id, date: today(), minutes: 0, activity: 'OTHER' })).status).toBe(400);
    expect((await a.agent.post('/api/admin/time/entries').send({ caseId: c.id, date: today(), minutes: 10, activity: 'NAPPING' })).status).toBe(400);

    const mine = await a.agent.get('/api/admin/time/entries');
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.totalMinutes).toBe(45);
    expect((await a.agent.get(`/api/admin/time/entries?userId=${b.user.id}`)).status).toBe(403);
    const bEntry = (await b.agent.get('/api/admin/time/entries')).body.items[0];
    expect((await a.agent.patch(`/api/admin/time/entries/${bEntry.id}`).send({ minutes: 5 })).status).toBe(404);
    expect((await a.agent.delete(`/api/admin/time/entries/${bEntry.id}`)).status).toBe(404);
    expect((await a.agent.get(`/api/admin/time/cases/${c.id}`)).body).toMatchObject({ scope: 'mine', totalMinutes: 45 });

    const all = await admin.agent.get('/api/admin/time/entries');
    expect(all.body.items).toHaveLength(2);
    expect((await admin.agent.get(`/api/admin/time/cases/${c.id}`)).body).toMatchObject({ scope: 'all', totalMinutes: 75 });
    const patched = await admin.agent.patch(`/api/admin/time/entries/${bEntry.id}`).send({ minutes: 40, activity: 'EMBASSY' });
    expect(patched.body.entry).toMatchObject({ minutes: 40, activity: 'EMBASSY' });
    expect(await prisma.auditLog.count({ where: { action: 'TIME_ENTRY_UPDATED' } })).toBe(1);

    const sum = (await admin.agent.get('/api/admin/time/summary')).body;
    expect(sum.totalMinutes).toBe(85);
    expect(sum.byStaff.map((s: { name: string; minutes: number }) => [s.name, s.minutes])).toEqual([
      ['Tofiq Abbasov', 45],
      ['Nigar Bayramova', 40],
    ]);
    expect(Object.values(sum.byStaff[0].weeks)).toEqual([45]);
    expect(sum.byCase[0]).toMatchObject({ number: c.number, minutes: 85 });
    expect(sum.byActivity.find((x: { activity: string }) => x.activity === 'EMBASSY').minutes).toBe(40);
    expect((await a.agent.get('/api/admin/time/summary')).body.totalMinutes).toBe(45);

    expect((await a.agent.delete(`/api/admin/time/entries/${ok.body.entry.id}`)).status).toBe(200);
    expect(await prisma.timeEntry.count()).toBe(1);
  });

  it('exports through the report builder dataset "timeEntries" (ADMIN+)', async () => {
    const admin = await asAdmin();
    const staff = await asStaff({ firstName: 'Leyla', lastName: 'Əliyeva' });
    const { c } = await makeCase();
    await staff.agent.post('/api/admin/time/entries').send({ caseId: c.id, date: today(), minutes: 90, activity: 'DOCUMENTS' });
    await prisma.timeEntry.create({ data: { userId: staff.user.id, caseId: c.id, startedAt: new Date(), runningKey: staff.user.id } }); // running: not exported
    const ds = (await admin.agent.get('/api/admin/reports/datasets')).body.datasets.find((d: { key: string }) => d.key === 'timeEntries');
    expect(ds).toBeTruthy();
    const res = await admin.agent.post('/api/admin/reports/preview').send({ dataset: 'timeEntries', config: { columns: ['staff', 'caseNumber', 'activity', 'minutes', 'hours'] } });
    expect(res.status).toBe(200);
    expect(res.body.rows).toEqual([{ staff: 'Leyla Əliyeva', caseNumber: c.number, activity: 'DOCUMENTS', minutes: 90, hours: 1.5 }]);
  });
});

describe('time tracking: hourly rates and labour cost', () => {
  it('rates are SUPER_ADMIN only; labour cost = minutes × rate in force (default otherwise) in the profitability card', async () => {
    const sup = await asSuperAdmin();
    const admin = await asAdmin();
    const staff = await asStaff();
    const other = await asStaff();
    const { c } = await makeCase();
    expect((await staff.agent.get('/api/admin/time/rates')).status).toBe(403);
    expect((await admin.agent.get('/api/admin/time/rates')).status).toBe(403);
    expect((await admin.agent.post('/api/admin/time/rates').send({ userId: staff.user.id, hourly: 40, effectiveFrom: '2026-01-01' })).status).toBe(403);

    expect((await sup.agent.put('/api/admin/time/rates/default').send({ hourly: 20 })).body.defaultCentsPerHour).toBe(2000);
    const set = await sup.agent.post('/api/admin/time/rates').send({ userId: staff.user.id, hourly: 40, effectiveFrom: '2026-01-01' });
    expect(set.status).toBe(201);
    expect(set.body.staff.find((s: { id: string }) => s.id === staff.user.id)).toMatchObject({ current: 4000 });
    expect(await prisma.auditLog.count({ where: { action: { in: ['STAFF_COST_RATE_SET', 'STAFF_COST_RATE_DEFAULT'] } } })).toBe(2);

    const start = (d: string) => new Date(`${d}T05:00:00Z`);
    await prisma.timeEntry.createMany({
      data: [
        { userId: staff.user.id, caseId: c.id, startedAt: start('2026-02-01'), endedAt: start('2026-02-01'), minutes: 90, source: 'MANUAL' }, // 40 €/h → 60 €
        { userId: staff.user.id, caseId: c.id, startedAt: start('2025-12-01'), endedAt: start('2025-12-01'), minutes: 60, source: 'MANUAL' }, // before the rate → default 20 €
        { userId: other.user.id, caseId: c.id, startedAt: start('2026-02-02'), endedAt: start('2026-02-02'), minutes: 30, source: 'MANUAL' }, // default → 10 €
      ],
    });
    await prisma.timeEntry.create({ data: { userId: other.user.id, caseId: c.id, startedAt: new Date(), runningKey: other.user.id } }); // running: no cost

    const p = (await admin.agent.get(`/api/admin/profitability/cases/${c.id}`)).body.profit;
    expect(p.costs.LABOUR).toBe(9000);
    expect(p.costs.total).toBe(9000);
    expect(p.marginCents).toBe(-9000);
    const line = p.lines.find((l: { source: string }) => l.source === 'LABOUR');
    expect(line).toMatchObject({ category: 'LABOUR', ref: '3 h', eurCents: 9000 });
    const overview = (await admin.agent.get('/api/admin/profitability')).body;
    expect(overview.costsByCategory.LABOUR).toBe(9000);
  });
});

// ─── Post-arrival check-ins ────────────────────────────────────────────

const arrivedCase = async (daysAgo: number, opts: { staffId?: string; companyId?: string } = {}) => {
  const { client, c } = await makeCase({ staffId: opts.staffId, companyId: opts.companyId });
  await prisma.arrivalPlan.create({ data: { caseId: c.id, clientId: client.user.id, status: 'COMPLETED', arrivalTime: new Date(Date.now() - daysAgo * DAY) } });
  return { client, c };
};

describe('post-arrival check-ins', () => {
  it('sends +7 / +30 days to the worker (in-app + e-mail) and +30 to the employer, exactly once', async () => {
    const staff = await asStaff();
    const company = await prisma.company.create({ data: { name: 'Nord Logistik GmbH', status: 'ACTIVE' } });
    const employer = await createUser({ role: 'COMPANY', locale: 'de' });
    await prisma.user.update({ where: { id: employer.user.id }, data: { companyId: company.id } });
    const { client, c } = await arrivedCase(8, { staffId: staff.user.id, companyId: company.id });
    const old = await arrivedCase(200); // far beyond every offset + grace: never sent

    const now = new Date();
    expect(await runCheckIns(now)).toEqual({ followUps: 2, worker: 1, employer: 0 });
    expect(await runCheckIns(now)).toEqual({ followUps: 0, worker: 0, employer: 0 });
    const n = await prisma.notification.findFirst({ where: { userId: client.user.id, type: 'CHECKIN' } });
    expect(n?.title).toBe('Almaniyada necəsiniz?');
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: client.user.email, subject: 'Triad Vision · Almaniyada necəsiniz?' } }));
    expect(await prisma.arrivalCheckIn.count({ where: { followUp: { caseId: old.c.id } } })).toBe(0);

    const later = new Date(now.getTime() + 23 * DAY);
    expect(await runCheckIns(later)).toEqual({ followUps: 0, worker: 1, employer: 1 });
    expect(await runCheckIns(later)).toEqual({ followUps: 0, worker: 0, employer: 0 });
    const rows = await prisma.arrivalCheckIn.findMany({ where: { caseId: c.id }, orderBy: [{ audience: 'asc' }, { offsetDays: 'asc' }] });
    expect(rows.map((r) => [r.audience, r.offsetDays])).toEqual([
      ['WORKER', 7],
      ['WORKER', 30],
      ['EMPLOYER', 30],
    ]);
    expect(await prisma.notification.count({ where: { userId: employer.user.id, type: 'CHECKIN_EMPLOYER' } })).toBe(1);

    // Configurable offsets (ADMIN+).
    expect((await staff.agent.put('/api/admin/check-ins/settings').send({ enabled: true, workerOffsets: [14], employerEnabled: false, employerOffset: 30 })).status).toBe(403);
  });

  it('one-tap answer via the e-mailed token; "Problem var" alerts staff + admins, creates a task and a my-work item', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const { client, c } = await arrivedCase(8, { staffId: staff.user.id });
    await runCheckIns();
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: client.user.email } }));
    // Only the hash of the e-mailed token is stored: give the row a token known to the test.
    const token = 'T'.repeat(43);
    await prisma.arrivalCheckIn.updateMany({ where: { caseId: c.id }, data: { tokenHash: hashToken(token) } });

    const view = await anon().get(`/api/check-ins/${token}`);
    expect(view.status).toBe(200);
    expect(view.body.checkIn).toMatchObject({ audience: 'WORKER', offsetDays: 7, firstName: 'Rauf', answered: false });
    expect((await anon().get('/api/check-ins/notatokennotatokennotatokennotatokennotat')).status).toBe(404);

    // The worker's open check-ins (web / mobile home card).
    expect((await client.agent.get('/api/check-ins/mine')).body.items).toHaveLength(1);

    const ans = await anon().post(`/api/check-ins/${token}`).send({ answer: 'ISSUE', topics: ['HOUSING', 'SALARY'], comment: 'Kirayə çox bahadır' });
    expect(ans.status).toBe(200);
    expect(ans.body.checkIn).toMatchObject({ answered: true, answer: 'ISSUE' });
    expect((await anon().post(`/api/check-ins/${token}`).send({ answer: 'OK' })).body.error).toBe('ALREADY_ANSWERED');
    expect((await client.agent.get('/api/check-ins/mine')).body.items).toHaveLength(0);

    const saved = await prisma.arrivalCheckIn.findFirstOrThrow({ where: { caseId: c.id } });
    expect(saved.topics).toEqual(['HOUSING', 'SALARY']);
    const task = await prisma.task.findUniqueOrThrow({ where: { id: saved.taskId! }, include: { assignees: true } });
    expect(task).toMatchObject({ caseId: c.id, priority: 'HIGH' });
    expect(task.title).toContain('Mənzil, Maaş');
    expect(task.assignees.map((a) => a.userId)).toEqual([staff.user.id]);
    expect(await prisma.notification.count({ where: { userId: staff.user.id, type: 'CHECKIN_ISSUE' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: admin.user.id, type: 'CHECKIN_ISSUE' } })).toBe(1);

    const viewer = { id: staff.user.id, role: 'STAFF' as const, locale: 'az' as const, firstName: 'S', lastName: 'T' };
    const work = await buildMyWork(viewer, { team: false });
    const item = work.items.find((i) => i.kind === 'arrival_issue');
    expect(item).toMatchObject({ priority: 'URGENT', refs: { caseId: c.id, checkInId: saved.id } });
    const resolve = item!.actions.find((a) => a.key === 'resolve')!;
    expect((await staff.agent.post(`/api${resolve.endpoint}`).send({})).status).toBe(200);
    expect((await buildMyWork(viewer, { team: false })).items.some((i) => i.kind === 'arrival_issue')).toBe(false);

    const ov = (await staff.agent.get('/api/admin/check-ins/overview')).body;
    expect(ov.totals).toMatchObject({ followUps: 1, sent: 1, answered: 1, issue: 1, openIssues: 0 });
    expect(ov.topics).toMatchObject({ HOUSING: 1, SALARY: 1, HEALTH: 0 });
  });

  it('the logged-in worker answers by id (others cannot); retention counts "left the job"', async () => {
    const staff = await asStaff();
    const { client, c } = await arrivedCase(8);
    const stranger = await asClient();
    await runCheckIns();
    const ci = await prisma.arrivalCheckIn.findFirstOrThrow({ where: { caseId: c.id } });
    expect((await stranger.agent.get(`/api/check-ins/${ci.id}`)).status).toBe(404);
    expect((await client.agent.post(`/api/check-ins/${ci.id}`).send({ answer: 'OK' })).body.checkIn.answer).toBe('OK');
    expect(await prisma.task.count()).toBe(0);

    // A worker who arrived 200 days ago and left after ~4 months.
    const { c: c2 } = await arrivedCase(200);
    await runCheckIns();
    const f2 = await prisma.arrivalFollowUp.findUniqueOrThrow({ where: { caseId: c2.id } });
    expect((await staff.agent.patch(`/api/admin/check-ins/follow-ups/${f2.id}/left`).send({ left: true })).body.error).toBe('REASON_REQUIRED');
    const leftAt = new Date(Date.now() - 80 * DAY).toISOString().slice(0, 10);
    expect((await staff.agent.patch(`/api/admin/check-ins/follow-ups/${f2.id}/left`).send({ left: true, leftAt, reason: 'CHANGED_EMPLOYER' })).status).toBe(200);
    const ov = (await staff.agent.get('/api/admin/check-ins/overview')).body;
    expect(ov.retention.find((r: { months: number }) => r.months === 3)).toMatchObject({ eligible: 1, employed: 1, pct: 100 });
    expect(ov.retention.find((r: { months: number }) => r.months === 6)).toMatchObject({ eligible: 1, employed: 0, pct: 0 });
    expect(ov.leftReasons.CHANGED_EMPLOYER).toBe(1);
    expect((await staff.agent.get('/api/admin/check-ins/overview?status=left')).body.workers.map((w: { caseId: string }) => w.caseId)).toEqual([c2.id]);
  });
});

// ─── Access log ────────────────────────────────────────────────────────

const docFor = async (caseId: string, uploadedById: string, name = 'pasport.pdf') => {
  const storedName = `${uniq('acc')}.pdf`;
  fs.mkdirSync(config.uploads.privateDir, { recursive: true });
  fs.writeFileSync(path.join(config.uploads.privateDir, storedName), '%PDF-1.4 test');
  return prisma.document.create({ data: { caseId, stage: 'INITIAL', originalName: name, storedName, mimeType: 'application/pdf', size: 13, uploadedById } });
};

describe('access log: "who viewed my documents"', () => {
  it('lists staff previews (aggregated), downloads and reveals with reasons; excludes the client and system jobs', async () => {
    const staff = await asStaff({ firstName: 'Tofiq', lastName: 'Abbasov' });
    const admin = await asAdmin({ firstName: 'Aynur', lastName: 'Həsənova' });
    const { client, c } = await makeCase({ status: 'DOCUMENTS_PENDING' });
    const doc = await docFor(c.id, client.user.id);

    expect((await staff.agent.get(`/api/files/${doc.id}`)).status).toBe(200);
    await settle();
    expect((await staff.agent.get(`/api/files/${doc.id}`)).status).toBe(200);
    await settle();
    expect((await staff.agent.get(`/api/files/${doc.id}?download=1`)).status).toBe(200);
    expect((await client.agent.get(`/api/files/${doc.id}`)).status).toBe(200); // own view: not listed
    await settle();
    const views = await prisma.documentAccessLog.findMany({ orderBy: { action: 'asc' } });
    expect(views.map((v) => [v.action, v.count])).toEqual([
      ['DOWNLOAD', 1],
      ['VIEW', 2],
    ]);

    const reveal = await admin.agent.post('/api/admin/reveal').send({ entity: 'user', id: client.user.id, field: 'passportNumber', reason: 'Səfirlik anketi üçün' });
    expect(reveal.status).toBe(200);
    await prisma.auditLog.create({ data: { actorId: null, action: 'EMBASSY_PACKAGE_BUILT', target: c.id } }); // system job: excluded
    await prisma.auditLog.create({ data: { actorId: staff.user.id, action: 'EMBASSY_PACKAGE_BUILT', target: c.id } });

    const log = await client.agent.get('/api/privacy/access-log');
    expect(log.status).toBe(200);
    const items = log.body.days.flatMap((d: { items: unknown[] }) => d.items);
    expect(log.body.days).toHaveLength(1);
    expect(log.body.counts).toMatchObject({ VIEW: 1, DOWNLOAD: 1, REVEAL: 1, EMBASSY_PACKAGE: 1 });
    expect(items.find((i: { kind: string }) => i.kind === 'VIEW')).toMatchObject({ actor: { name: 'Tofiq A.', role: 'STAFF' }, what: 'pasport.pdf', count: 2 });
    expect(items.find((i: { kind: string }) => i.kind === 'REVEAL')).toMatchObject({ actor: { name: 'Aynur H.', role: 'ADMIN' }, detail: 'passportNumber', reason: 'Səfirlik anketi üçün' });
    expect(items.find((i: { kind: string }) => i.kind === 'EMBASSY_PACKAGE')).toMatchObject({ actor: { name: 'Tofiq A.' }, what: c.number });
    expect(JSON.stringify(items)).not.toContain('Abbasov');
    expect((await client.agent.get('/api/privacy/access-log?kind=REVEAL')).body.total).toBe(1);

    // Another client sees nothing of it.
    const other = await asClient();
    expect((await other.agent.get('/api/privacy/access-log')).body.total).toBe(0);

    // Admin view per client (full names); STAFF may not.
    const adminView = await admin.agent.get(`/api/admin/access-log/${client.user.id}`);
    expect(adminView.status).toBe(200);
    expect(adminView.body.days[0].items.some((i: { actor: { name: string } }) => i.actor.name === 'Tofiq Abbasov')).toBe(true);
    expect((await staff.agent.get(`/api/admin/access-log/${client.user.id}`)).status).toBe(403);

    // DSGVO export.
    const exp = await client.agent.get('/api/privacy/export');
    expect(exp.status).toBe(200);
    const data = typeof exp.body === 'object' && exp.body.accessLog ? exp.body : JSON.parse(exp.text);
    expect(data.accessLog).toHaveLength(4);
    expect(data.accessLog[0]).not.toHaveProperty('id');
  });

  it('a new view after 10 minutes is a new row; drive copies of case documents are logged too', async () => {
    const staff = await asStaff();
    const { client, c } = await makeCase();
    const doc = await docFor(c.id, client.user.id);
    await staff.agent.get(`/api/files/${doc.id}`);
    await settle();
    await prisma.documentAccessLog.updateMany({ data: { firstAt: new Date(Date.now() - 11 * 60 * 1000), lastAt: new Date(Date.now() - 11 * 60 * 1000) } });
    await staff.agent.get(`/api/files/${doc.id}`);
    await settle();
    expect(await prisma.documentAccessLog.count({ where: { action: 'VIEW' } })).toBe(2);
    const { logDriveDocumentAccess } = await import('../../src/lib/privacy/accessLog.js');
    await logDriveDocumentAccess({ id: staff.user.id, role: 'STAFF' }, doc.id, 'pasport.pdf', 'DOWNLOAD');
    expect(await prisma.documentAccessLog.count({ where: { source: 'DRIVE', clientId: client.user.id } })).toBe(1);
  });
});
