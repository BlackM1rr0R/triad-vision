import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { uniq } from '../helpers/factories';
import { binaryParser } from '../helpers/files';
import { clientCase, createCaseVia, expectStatus, uploadDoc } from '../helpers/workflow';
import { bakuWeek } from '../../src/routes/admin/cases';

/**
 * Admin → Müraciətlər redesign: the new list filters (owner, open / closed, visa type, date range, embassy this
 * week, overdue recognition, pending uploads), the header counts (GET /admin/cases/summary), the default saved
 * filter tabs (POST /admin/me/saved-views/defaults) and the Excel export of the bulk bar.
 */

const DAY = 24 * 60 * 60 * 1000;

const seed = async (n: number, profession: string) => {
  const out: { id: string; number: string; client: Awaited<ReturnType<typeof asClient>> }[] = [];
  for (let i = 0; i < n; i++) {
    const client = await asClient({ firstName: `Ad${i}`, lastName: 'Soyad' });
    const c = await createCaseVia(client.agent, profession);
    out.push({ ...c, client });
  }
  return out;
};

const listIds = async (agent: Awaited<ReturnType<typeof asStaff>>['agent'], query: Record<string, string>) => {
  const body = expectStatus(await agent.get('/api/admin/cases').query(query), 200).body as { items: { id: string }[]; total: number };
  return { ids: body.items.map((c) => c.id).sort(), total: body.total };
};

describe('cases list filters', () => {
  it('owner (me / none / id), open or closed, visa type and the created / appointment date range', async () => {
    const staff = await asStaff();
    const other = await asStaff();
    const p = uniq('Filtr');
    const [a, b, c, d] = await seed(4, p);
    await prisma.case.update({ where: { id: a.id }, data: { assignedStaffId: staff.user.id } });
    await prisma.case.update({ where: { id: b.id }, data: { assignedStaffId: other.user.id, visaType: 'AUSBILDUNG' } });
    await prisma.case.update({ where: { id: c.id }, data: { status: 'CANCELLED', closedAt: new Date() } });
    const sorted = (...x: { id: string }[]) => x.map((y) => y.id).sort();

    expect((await listIds(staff.agent, { search: p, assignee: 'me' })).ids).toEqual(sorted(a));
    expect((await listIds(staff.agent, { search: p, assignee: other.user.id })).ids).toEqual(sorted(b));
    expect((await listIds(staff.agent, { search: p, assignee: 'none' })).ids).toEqual(sorted(c, d));
    // the legacy ?mine=1 still works and combines with the rest
    expect((await listIds(staff.agent, { search: p, mine: '1', scope: 'open' })).ids).toEqual(sorted(a));
    expect((await listIds(staff.agent, { search: p, scope: 'open' })).ids).toEqual(sorted(a, b, d));
    expect((await listIds(staff.agent, { search: p, scope: 'closed' })).ids).toEqual(sorted(c));
    expect((await listIds(staff.agent, { search: p, visaType: 'AUSBILDUNG' })).ids).toEqual(sorted(b));

    // created 40 days ago → outside "the last 30 days"; Baku calendar days, both ends inclusive
    await prisma.$executeRaw`UPDATE \`Case\` SET createdAt = ${new Date(Date.now() - 40 * DAY)} WHERE id = ${d.id}`;
    const ymd = (t: number) => new Date(t + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect((await listIds(staff.agent, { search: p, from: ymd(Date.now() - 29 * DAY), to: ymd(Date.now()) })).ids).toEqual(sorted(a, b, c));
    expect((await listIds(staff.agent, { search: p, to: ymd(Date.now() - 35 * DAY) })).ids).toEqual(sorted(d));

    await prisma.case.update({ where: { id: a.id }, data: { appointmentAt: new Date(Date.now() + 10 * DAY) } });
    const day = ymd(Date.now() + 10 * DAY);
    expect((await listIds(staff.agent, { search: p, dateBy: 'appointment', from: day, to: day })).ids).toEqual(sorted(a));
    expect((await listIds(staff.agent, { search: p, appointment: 'upcoming' })).ids).toEqual(sorted(a));

    expect((await staff.agent.get('/api/admin/cases').query({ from: '14.11.2026' })).status).toBe(400);
    expect((await staff.agent.get('/api/admin/cases').query({ visaType: 'PILOT' })).status).toBe(400);
  });

  it('embassy this week, overdue recognition and pending uploads; "all matching" bulk agrees', async () => {
    const staff = await asStaff();
    const p = uniq('Səfirlik');
    const [week, later, recog, docs] = await seed(4, p);
    const w = bakuWeek();
    await prisma.case.update({ where: { id: week.id }, data: { status: 'APPOINTMENT_SCHEDULED', appointmentAt: new Date(w.gte.getTime() + 60 * 60 * 1000) } });
    await prisma.case.update({ where: { id: later.id }, data: { status: 'APPOINTMENT_SCHEDULED', appointmentAt: new Date(w.lt.getTime() + DAY) } });
    expect((await listIds(staff.agent, { search: p, appointment: 'week' })).ids).toEqual([week.id]);

    const proc = { clientId: recog.client.user.id, profession: 'Krankenpfleger', procedureType: 'FULL_RECOGNITION' };
    await prisma.recognitionProcess.create({ data: { ...proc, caseId: recog.id, status: 'SUBMITTED', nextDeadline: new Date(Date.now() - DAY) } });
    // a finished procedure with an old deadline, and an open one with a future deadline, do not count as overdue
    await prisma.recognitionProcess.create({ data: { ...proc, caseId: later.id, status: 'RECOGNISED', nextDeadline: new Date(Date.now() - DAY) } });
    await prisma.recognitionProcess.create({ data: { ...proc, caseId: docs.id, status: 'IN_REVIEW', nextDeadline: new Date(Date.now() + 5 * DAY) } });
    expect((await listIds(staff.agent, { search: p, recognition: 'overdue' })).ids).toEqual([recog.id]);
    expect((await listIds(staff.agent, { search: p, recognition: 'open' })).ids).toEqual([recog.id, docs.id].sort());

    const req = (await clientCase(docs.client.agent, docs.id)).requirements[0];
    expectStatus(await uploadDoc(docs.client.agent, docs.id, req.id), 201);
    expect((await listIds(staff.agent, { search: p, pendingDocs: '1' })).ids).toEqual([docs.id]);

    const r = expectStatus(await staff.agent.post('/api/admin/bulk/cases/resolve').send({ all: { search: p, recognition: 'overdue' } }), 200).body;
    expect(r.ids).toEqual([recog.id]);
  });
});

describe('cases list header counts', () => {
  it('counts each tile with exactly the filter it links to; staff only', async () => {
    const staff = await asStaff();
    const [mine, , closed] = await seed(3, uniq('Say'));
    await prisma.case.update({ where: { id: mine.id }, data: { assignedStaffId: staff.user.id } });
    await prisma.case.update({ where: { id: closed.id }, data: { status: 'APPROVED', closedAt: new Date() } });

    const { tiles } = expectStatus(await staff.agent.get('/api/admin/cases/summary'), 200).body;
    expect(Object.keys(tiles).sort()).toEqual(['embassyWeek', 'mine', 'open', 'recognitionOverdue', 'stuck', 'unassigned']);
    expect(tiles.mine).toEqual({ count: 1, params: { scope: 'open', assignee: 'me' } });
    for (const key of Object.keys(tiles)) {
      const { total } = await listIds(staff.agent, tiles[key].params);
      expect([key, total]).toEqual([key, tiles[key].count]);
    }
    expect(tiles.open.count).toBe(await prisma.case.count({ where: { status: { notIn: ['APPROVED', 'REJECTED', 'CANCELLED'] } } }));

    const client = await asClient();
    expect((await client.agent.get('/api/admin/cases/summary')).status).toBe(403);
  });
});

describe('default saved filter tabs', () => {
  it('are added once per user and page in the user\'s language; a deleted one stays deleted until restored', async () => {
    const staff = await asStaff({ locale: 'de' });
    const before = expectStatus(await staff.agent.get('/api/admin/me/saved-views?page=cases'), 200).body;
    expect(before).toEqual({ views: [], seeded: [] });

    const first = expectStatus(await staff.agent.post('/api/admin/me/saved-views/defaults').send({ page: 'cases' }), 200).body;
    expect(first.added).toBe(5);
    const names = first.views.map((v: { name: string }) => v.name);
    expect(names).toEqual(expect.arrayContaining(['Überfällige Anerkennungen', 'Botschaft diese Woche']));
    expect(first.views.find((v: { name: string }) => v.name === 'Botschaft diese Woche')).toMatchObject({ params: { appointment: 'week' }, shared: false, mine: true, pinned: false });
    expect(expectStatus(await staff.agent.get('/api/admin/me/saved-views'), 200).body.seeded).toEqual(['cases']);

    // idempotent; deleting a default does not bring it back
    expect(expectStatus(await staff.agent.post('/api/admin/me/saved-views/defaults').send({ page: 'cases' }), 200).body.added).toBe(0);
    const week = first.views.find((v: { params: Record<string, string> }) => v.params.appointment === 'week');
    expectStatus(await staff.agent.delete(`/api/admin/me/saved-views/${week.id}`), 200);
    expect(expectStatus(await staff.agent.post('/api/admin/me/saved-views/defaults').send({ page: 'cases' }), 200).body.added).toBe(0);
    // "Standart tabları bərpa et": only the missing one comes back; renamed defaults with the same filters stay as they are
    const recog = first.views.find((v: { params: Record<string, string> }) => v.params.recognition === 'overdue');
    expectStatus(await staff.agent.patch(`/api/admin/me/saved-views/${recog.id}`).send({ name: 'Anerkennung!' }), 200);
    const restored = expectStatus(await staff.agent.post('/api/admin/me/saved-views/defaults').send({ page: 'cases', restore: true }), 200).body;
    expect(restored.added).toBe(1);
    expect(restored.views).toHaveLength(5);
    expect(restored.views.map((v: { name: string }) => v.name)).toContain('Anerkennung!');

    // other pages and other users are separate
    const inq = expectStatus(await staff.agent.post('/api/admin/me/saved-views/defaults').send({ page: 'inquiries' }), 200).body;
    expect(inq.views.map((v: { params: Record<string, string> }) => v.params)).toEqual(expect.arrayContaining([{ status: 'NEW' }, { assignee: 'none' }]));
    const az = await asStaff();
    const azViews = expectStatus(await az.agent.post('/api/admin/me/saved-views/defaults').send({ page: 'cases' }), 200).body.views;
    expect(azViews.map((v: { name: string }) => v.name)).toEqual(expect.arrayContaining(['Gecikən tanınmalar', 'Bu həftə səfirlik']));
    expect(expectStatus(await staff.agent.get('/api/admin/me/saved-views?page=cases'), 200).body.views).toHaveLength(5);
  });

  it('validates the page, needs staff, and every default filter is a valid list filter', async () => {
    const staff = await asStaff();
    expect((await staff.agent.post('/api/admin/me/saved-views/defaults').send({ page: 'users' })).status).toBe(400);
    const client = await asClient();
    expect((await client.agent.post('/api/admin/me/saved-views/defaults').send({ page: 'cases' })).status).toBe(403);
    const views = expectStatus(await staff.agent.post('/api/admin/me/saved-views/defaults').send({ page: 'cases' }), 200).body.views as { params: Record<string, string> }[];
    for (const v of views) expectStatus(await staff.agent.get('/api/admin/cases').query(v.params), 200);
    const inq = expectStatus(await staff.agent.post('/api/admin/me/saved-views/defaults').send({ page: 'inquiries' }), 200).body.views as { params: Record<string, string> }[];
    for (const v of inq) expectStatus(await staff.agent.get('/api/admin/inquiries').query(v.params), 200);
  });
});

describe('bulk Excel export', () => {
  const readSheet = async (buf: Buffer) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    const rows: unknown[][] = [];
    ws.eachRow((r) => rows.push((r.values as unknown[]).slice(1)));
    return rows;
  };

  it('cases: .xlsx with a header row and one row per case; formulas stay text; audited with the format', async () => {
    const admin = await asAdmin();
    const [a, b] = await seed(2, uniq('Excel'));
    await prisma.user.update({ where: { id: a.client.user.id }, data: { lastName: '=HYPERLINK("x")' } });
    const res = expectStatus(
      await admin.agent.post('/api/admin/bulk/cases/export').send({ selection: { ids: [a.id, b.id] }, format: 'xlsx' }).buffer(true).parse(binaryParser),
      200,
    );
    expect(res.headers['content-type']).toMatch(/spreadsheetml/);
    expect(res.headers['content-disposition']).toMatch(/cases-\d{4}-\d{2}-\d{2}\.xlsx/);
    const rows = await readSheet(res.body as Buffer);
    expect(rows[0].slice(0, 3)).toEqual(['number', 'client', 'email']);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r[0])).toEqual(expect.arrayContaining([a.number, b.number]));
    const nameCell = rows.find((r) => r[0] === a.number)![1];
    expect(typeof nameCell).toBe('string');
    expect(String(nameCell)).toContain('=HYPERLINK');
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'BULK_CASES_EXPORTED' }, orderBy: { createdAt: 'desc' } });
    expect(log.details).toMatchObject({ count: 2, format: 'xlsx' });

    // CSV stays the default; unknown formats are refused
    const csv = expectStatus(await admin.agent.post('/api/admin/bulk/cases/export').send({ selection: { ids: [a.id] } }).buffer(true), 200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect((await admin.agent.post('/api/admin/bulk/cases/export').send({ selection: { ids: [a.id] }, format: 'pdf' })).status).toBe(400);
    const client = await asClient();
    expect((await client.agent.post('/api/admin/bulk/cases/export').send({ selection: { ids: [a.id] }, format: 'xlsx' })).status).toBe(403);
  });

  it('inquiries: .xlsx export', async () => {
    const staff = await asStaff();
    const i = await prisma.inquiry.create({ data: { kind: 'company', companyName: 'Firma X', contactName: 'Kontakt X', email: `x-${uniq()}@test.local`, message: 'Fahrer gesucht', locale: 'de' } });
    const res = expectStatus(await staff.agent.post('/api/admin/bulk/inquiries/export').send({ ids: [i.id], format: 'xlsx' }).buffer(true).parse(binaryParser), 200);
    const rows = await readSheet(res.body as Buffer);
    expect(rows[0][0]).toBe('created');
    expect(rows[1]).toEqual(expect.arrayContaining(['Firma X', 'Kontakt X']));
  });
});
