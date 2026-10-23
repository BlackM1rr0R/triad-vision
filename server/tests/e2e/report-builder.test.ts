import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { asAdmin, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { binaryParser } from '../helpers/files';
import { createUser, uniq } from '../helpers/factories';
import { relativeRange } from '../../src/lib/reports/dates.js';
import { resetMaskCache } from '../../src/lib/reports/mask.js';
import { latestOccurrence, nextOccurrence, runReportSchedules } from '../../src/lib/reports/schedule.js';
import { registeredJobs } from '../../src/lib/scheduler.js';
import '../../src/jobs/reports.js';

/** Captures every e-mail (the real sendMail still writes the EmailLog row). */
const mails = vi.hoisted(() => [] as { to: string; subject: string; html: string; attachments?: { filename: string; content: Buffer | string }[] }[]);
vi.mock('../../src/lib/mailer.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/lib/mailer.js')>();
  return {
    ...mod,
    sendMail: async (to: string, subject: string, html: string, attachments?: { filename: string; content: Buffer | string }[]) => {
      mails.push({ to, subject, html, attachments });
      return mod.sendMail(to, subject, html, attachments);
    },
  };
});

beforeEach(async () => {
  mails.length = 0;
  await resetMaskCache();
});

const D = (s: string) => new Date(`${s}T12:00:00Z`);
let seq = 0;

const seed = async () => {
  const staff = await createUser({ role: 'STAFF', firstName: 'Leyla', lastName: 'Əliyeva' });
  const company = await prisma.company.create({ data: { name: 'Nord Logistik GmbH', status: 'ACTIVE', vatId: 'DE123456789' } });
  const lastMonth = relativeRange('lastMonth');
  const mk = async (o: { first: string; last: string; status: 'APPROVED' | 'REJECTED' | 'DOCUMENTS_PENDING'; visaType?: 'WORK' | 'AUSBILDUNG'; created: Date; passport?: string; staffId?: string | null }) => {
    const client = await createUser({ role: 'CLIENT', firstName: o.first, lastName: o.last });
    if (o.passport) await prisma.user.update({ where: { id: client.user.id }, data: { passportNumber: o.passport } });
    return prisma.case.create({
      data: {
        clientId: client.user.id,
        number: `TV-RB-${String(++seq).padStart(4, '0')}`,
        profession: 'Fahrer',
        status: o.status,
        visaType: o.visaType ?? 'WORK',
        createdAt: o.created,
        assignedStaffId: o.staffId === undefined ? staff.user.id : o.staffId,
        companyId: company.id,
      },
    });
  };
  const inLastMonth = new Date(lastMonth.start.getTime() + 3 * 86_400_000);
  const c1 = await mk({ first: 'Rauf', last: 'Məmmədov', status: 'APPROVED', created: inLastMonth, passport: 'C01X00T47' });
  const c2 = await mk({ first: 'Aysel', last: 'Quliyeva', status: 'APPROVED', visaType: 'AUSBILDUNG', created: inLastMonth });
  const c3 = await mk({ first: 'Kamran', last: 'Həsənov', status: 'REJECTED', created: D('2024-03-10'), staffId: null });
  const c4 = await mk({ first: 'Nigar', last: 'Abbasova', status: 'DOCUMENTS_PENDING', visaType: 'AUSBILDUNG', created: D('2024-05-02') });
  const inv = (number: string, net: number, status: 'PAID' | 'SENT', issue: string) =>
    prisma.invoice.create({
      data: { number, companyId: company.id, issueDate: D(issue), dueDate: D(issue), items: [{ description: 'Vermittlung', quantity: 1, unitPriceCents: net }], netCents: net, vatCents: Math.round(net * 0.19), grossCents: net + Math.round(net * 0.19), status, paidAt: status === 'PAID' ? D(issue) : null },
    });
  await inv('RB-1', 100000, 'PAID', '2024-02-01');
  await inv('RB-2', 50000, 'PAID', '2024-02-15');
  await inv('RB-3', 20000, 'SENT', '2024-03-01');
  return { staff, company, cases: [c1, c2, c3, c4], lastMonth };
};

const preview = (agent: Agent, dataset: string, config: unknown) => agent.post('/api/admin/reports/preview').send({ dataset, config });

const download = (req: ReturnType<Agent['post']>) => req.buffer(true).parse(binaryParser);

describe('report builder: datasets', () => {
  it('lists curated datasets with labels, operators and permissions (ADMIN+ only)', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.get('/api/admin/reports/datasets');
    expect(res.status).toBe(200);
    const keys = res.body.datasets.map((d: { key: string }) => d.key);
    expect(keys).toEqual(expect.arrayContaining(['cases', 'clients', 'documents', 'tasks', 'inquiries', 'bookings', 'applications', 'vacancies', 'invoices', 'settlements', 'partners', 'agentCommissions', 'signatures', 'profitability']));
    // Optional dataset: only when the campaigns model exists at runtime.
    const hasCampaigns = typeof (prisma as unknown as Record<string, { findMany?: unknown } | undefined>).campaignRecipient?.findMany === 'function';
    expect(keys.includes('campaignRecipients')).toBe(hasCampaigns);
    const cases = res.body.datasets.find((d: { key: string }) => d.key === 'cases');
    const status = cases.columns.find((c: { key: string }) => c.key === 'status');
    expect(status.label).toMatchObject({ az: 'Status', de: 'Status', en: 'Status', ru: 'Статус' });
    expect(status.ops).toEqual(['in', 'notIn', 'empty', 'notEmpty']);
    expect(status.enumValues).toContain('APPROVED');
    expect(cases.columns.find((c: { key: string }) => c.key === 'createdAt').ops).toContain('relative');
    expect(res.body.relativeRanges).toContain('lastMonth');

    const staff = await asStaff();
    expect((await staff.agent.get('/api/admin/reports/datasets')).status).toBe(403);
    expect((await preview(staff.agent, 'cases', {})).status).toBe(403);
  });

  it('rejects unknown datasets, columns, operators and invalid grouping', async () => {
    const admin = await asAdmin();
    expect((await preview(admin.agent, 'users_raw', {})).status).toBe(404);
    expect((await preview(admin.agent, 'cases', { columns: ['passwordHash'] })).body.error).toBe('REPORT_UNKNOWN_COLUMN');
    expect((await preview(admin.agent, 'cases', { filters: [{ column: 'status', op: 'contains', value: 'APP' }] })).body.error).toBe('REPORT_FILTER_OPERATOR');
    expect((await preview(admin.agent, 'cases', { filters: [{ column: 'status', op: 'in', value: ['NOPE'] }] })).body.error).toBe('REPORT_FILTER_VALUE');
    expect((await preview(admin.agent, 'invoices', { groupBy: [{ column: 'gross' }] })).body.error).toBe('REPORT_GROUP_NOT_ALLOWED');
    expect((await preview(admin.agent, 'cases', { aggregations: [{ column: 'status', fn: 'sum' }] })).body.error).toBe('REPORT_AGGREGATION_NOT_ALLOWED');
  });
});

describe('report builder: columns, filters, grouping, aggregations', () => {
  it('selects columns in order and filters by enum, relative date, user and text', async () => {
    const admin = await asAdmin();
    const { staff, cases } = await seed();
    const all = await preview(admin.agent, 'cases', { columns: ['number', 'status', 'clientName', 'staff', 'company'], sort: { column: 'number', dir: 'asc' } });
    expect(all.status).toBe(200);
    expect(all.body.columns.map((c: { key: string }) => c.key)).toEqual(['number', 'status', 'clientName', 'staff', 'company']);
    expect(all.body.rows).toHaveLength(4);
    expect(all.body.rows[0]).toEqual({ number: cases[0].number, status: 'APPROVED', clientName: 'Rauf Məmmədov', staff: 'Leyla Əliyeva', company: 'Nord Logistik GmbH' });

    const approvedLastMonth = await preview(admin.agent, 'cases', {
      columns: ['number'],
      filters: [
        { column: 'status', op: 'in', value: ['APPROVED'] },
        { column: 'createdAt', op: 'relative', value: 'lastMonth' },
      ],
      sort: { column: 'number', dir: 'asc' },
    });
    expect(approvedLastMonth.body.rows.map((r: { number: string }) => r.number)).toEqual([cases[0].number, cases[1].number]);

    const byStaff = await preview(admin.agent, 'cases', { columns: ['number'], filters: [{ column: 'staff', op: 'empty' }] });
    expect(byStaff.body.rows.map((r: { number: string }) => r.number)).toEqual([cases[2].number]);
    const mine = await preview(admin.agent, 'cases', { columns: ['number'], filters: [{ column: 'staff', op: 'in', value: [staff.user.id] }] });
    expect(mine.body.total).toBe(3);

    const named = await preview(admin.agent, 'cases', { columns: ['number', 'clientName'], filters: [{ column: 'clientName', op: 'contains', value: 'quliyeva' }] });
    expect(named.body.rows).toEqual([{ number: cases[1].number, clientName: 'Aysel Quliyeva' }]);

    const between = await preview(admin.agent, 'cases', { columns: ['number'], filters: [{ column: 'createdAt', op: 'between', value: { from: '2024-01-01', to: '2024-12-31' } }], sort: { column: 'createdAt', dir: 'asc' } });
    expect(between.body.rows.map((r: { number: string }) => r.number)).toEqual([cases[2].number, cases[3].number]);
  });

  it('groups with count / sum / avg and a totals row; date groups by month', async () => {
    const admin = await asAdmin();
    await seed();
    const byStatus = await preview(admin.agent, 'invoices', {
      groupBy: [{ column: 'status' }],
      aggregations: [
        { column: '*', fn: 'count' },
        { column: 'gross', fn: 'sum' },
        { column: 'net', fn: 'avg' },
      ],
      sort: { column: 'sum_gross', dir: 'desc' },
    });
    expect(byStatus.status).toBe(200);
    expect(byStatus.body.grouped).toBe(true);
    expect(byStatus.body.columns.map((c: { key: string }) => c.key)).toEqual(['status', 'count', 'sum_gross', 'avg_net']);
    expect(byStatus.body.rows).toEqual([
      { status: 'PAID', count: 2, sum_gross: 178500, avg_net: 75000 },
      { status: 'SENT', count: 1, sum_gross: 23800, avg_net: 20000 },
    ]);
    expect(byStatus.body.totals).toEqual({ count: 3, sum_gross: 202300, avg_net: 56666.67 });

    const byMonth = await preview(admin.agent, 'invoices', { groupBy: [{ column: 'issueDate', granularity: 'month' }], aggregations: [{ column: 'net', fn: 'sum' }] });
    expect(byMonth.body.rows).toEqual([
      { issueDate: '2024-02', count: 2, sum_net: 150000 },
      { issueDate: '2024-03', count: 1, sum_net: 20000 },
    ]);

    const twoLevels = await preview(admin.agent, 'cases', { groupBy: [{ column: 'visaType' }, { column: 'status' }] });
    expect(twoLevels.body.rows).toHaveLength(4);
    expect(twoLevels.body.totals.count).toBe(4);

    const ungrouped = await preview(admin.agent, 'invoices', { columns: ['number', 'gross', 'net'] });
    expect(ungrouped.body.totals).toEqual({ gross: 202300, net: 170000 });
  });
});

describe('report builder: permissions and masking', () => {
  it('masks sensitive columns for roles the masking settings cover and forbids filtering on them', async () => {
    const { cases } = await seed();
    await prisma.setting.create({ data: { key: 'privacy.masking', value: { STAFF: ['PASSPORT'], ADMIN: ['PASSPORT'] } } });
    await resetMaskCache();
    const admin = await asAdmin();
    const sup = await asSuperAdmin();
    const cfg = { columns: ['number', 'passportNumber'], filters: [{ column: 'number', op: 'eq', value: cases[0].number }] };
    const masked = await preview(admin.agent, 'cases', cfg);
    expect(masked.status).toBe(200);
    expect(masked.body.rows[0].passportNumber).toMatch(/^•+ /);
    expect(masked.body.rows[0].passportNumber).not.toContain('C01X00T47');
    const plain = await preview(sup.agent, 'cases', cfg);
    expect(plain.body.rows[0].passportNumber).toBe('C01X00T47');

    const ds = await admin.agent.get('/api/admin/reports/datasets');
    const pass = ds.body.datasets.find((d: { key: string }) => d.key === 'cases').columns.find((c: { key: string }) => c.key === 'passportNumber');
    expect(pass).toMatchObject({ sensitive: true, masked: true, ops: [], groupable: false });
    expect((await preview(admin.agent, 'cases', { filters: [{ column: 'passportNumber', op: 'contains', value: 'C01' }] })).body.error).toBe('REPORT_FILTER_NOT_ALLOWED');
    expect((await preview(sup.agent, 'cases', { columns: ['number'], filters: [{ column: 'passportNumber', op: 'contains', value: 'C01' }] })).body.total).toBe(1);

    // The export is masked the same way.
    const x = await download(admin.agent.post('/api/admin/reports/export').send({ dataset: 'cases', config: cfg, format: 'csv' }));
    expect(x.status).toBe(200);
    expect(x.body.toString('utf8')).not.toContain('C01X00T47');
  });
});

describe('report builder: exports', () => {
  it('exports Excel with styled frozen header, number / date formats and a totals row; CSV and PDF; audited', async () => {
    const admin = await asAdmin();
    await seed();
    const cfg = { columns: ['number', 'company', 'issueDate', 'status', 'gross'], sort: { column: 'number', dir: 'asc' } };
    const res = await download(admin.agent.post('/api/admin/reports/export').set('X-Locale', 'de').send({ dataset: 'invoices', config: cfg, format: 'xlsx', name: 'Rechnungen Q1' }));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toMatch(/filename="Rechnungen-Q1-\d{4}-\d{2}-\d{2}\.xlsx"/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    expect(ws.getRow(1).values).toEqual([undefined, 'Rechnungs-Nr.', 'Unternehmen', 'Rechnungsdatum', 'Status', 'Brutto']);
    expect(ws.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.getRow(2).getCell(1).value).toBe('RB-1');
    expect(ws.getRow(2).getCell(4).value).toBe('Bezahlt');
    expect(ws.getRow(2).getCell(5).value).toBe(1190);
    expect(ws.getColumn(5).numFmt).toBe('#,##0.00');
    expect(ws.getRow(2).getCell(3).value).toBeInstanceOf(Date);
    expect(ws.getColumn(3).numFmt).toBe('dd.mm.yyyy');
    expect(ws.getRow(5).getCell(1).value).toMatch(/^Summe/);
    expect(ws.getRow(5).getCell(5).value).toBe(2023);
    expect(ws.getColumn(2).width).toBeGreaterThanOrEqual('Nord Logistik GmbH'.length);

    const csv = await download(admin.agent.post('/api/admin/reports/export').send({ dataset: 'invoices', config: cfg, format: 'csv' }));
    const text = csv.body.toString('utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain('Hesab №;Şirkət;Tarix;Status;Brutto');
    expect(text).toContain('RB-1;Nord Logistik GmbH;2024-02-01;Ödənilib;1190.00');

    const pdf = await download(admin.agent.post('/api/admin/reports/export').send({ dataset: 'invoices', config: cfg, format: 'pdf' }));
    expect(pdf.status).toBe(200);
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');

    const logs = await prisma.auditLog.findMany({ where: { action: 'REPORT_EXPORTED', actorId: admin.user.id } });
    expect(logs.map((l) => (l.details as { format: string }).format).sort()).toEqual(['csv', 'pdf', 'xlsx']);
    expect((logs[0].details as { rows: number }).rows).toBe(3);
  });
});

describe('report builder: saved reports', () => {
  it('keeps private reports private, shares with admins, and only lets the owner (or SUPER_ADMIN) edit', async () => {
    const a = await asAdmin();
    const b = await asAdmin();
    const sup = await asSuperAdmin();
    const priv = await a.agent.post('/api/admin/reports/saved').send({ name: 'Mine', dataset: 'cases', config: { columns: ['number'] } });
    expect(priv.status).toBe(201);
    const shared = await a.agent.post('/api/admin/reports/saved').send({ name: 'Team', dataset: 'invoices', config: { columns: ['number', 'gross'] }, shared: true });
    expect(shared.status).toBe(201);
    expect((await a.agent.post('/api/admin/reports/saved').send({ name: 'Bad', dataset: 'cases', config: { columns: ['nope'] } })).status).toBe(400);

    const listB = await b.agent.get('/api/admin/reports/saved');
    expect(listB.body.reports.map((r: { name: string }) => r.name)).toEqual(['Team']);
    expect(listB.body.reports[0].canEdit).toBe(false);
    expect((await b.agent.get(`/api/admin/reports/saved/${priv.body.report.id}`)).status).toBe(404);
    expect((await b.agent.patch(`/api/admin/reports/saved/${shared.body.report.id}`).send({ name: 'Hijack' })).status).toBe(403);
    expect((await b.agent.delete(`/api/admin/reports/saved/${shared.body.report.id}`)).status).toBe(403);
    expect((await sup.agent.patch(`/api/admin/reports/saved/${shared.body.report.id}`).send({ name: 'Team v2' })).body.report.name).toBe('Team v2');
    const upd = await a.agent.patch(`/api/admin/reports/saved/${priv.body.report.id}`).send({ config: { columns: ['number', 'status'] } });
    expect(upd.body.report.config.columns).toEqual(['number', 'status']);
    expect((await b.agent.get(`/api/admin/reports/saved/${shared.body.report.id}/export?format=csv`)).status).toBe(200);
    expect((await a.agent.delete(`/api/admin/reports/saved/${priv.body.report.id}`)).status).toBe(200);
  });
});

describe('report builder: schedules', () => {
  it('registers the job', () => {
    expect(registeredJobs()).toContain('report-schedules');
  });

  it('computes Baku occurrences for daily / weekly / monthly schedules', () => {
    const now = new Date('2026-03-31T10:00:00Z'); // Tuesday 14:00 Baku
    expect(latestOccurrence({ frequency: 'DAILY', weekday: null, monthDay: null, time: '08:00' }, now).toISOString()).toBe('2026-03-31T04:00:00.000Z');
    expect(latestOccurrence({ frequency: 'DAILY', weekday: null, monthDay: null, time: '15:00' }, now).toISOString()).toBe('2026-03-30T11:00:00.000Z');
    expect(latestOccurrence({ frequency: 'WEEKLY', weekday: 1, monthDay: null, time: '09:30' }, now).toISOString()).toBe('2026-03-30T05:30:00.000Z');
    expect(nextOccurrence({ frequency: 'WEEKLY', weekday: 1, monthDay: null, time: '09:30' }, now).toISOString()).toBe('2026-04-06T05:30:00.000Z');
    // Day 31 in a 30-day month is its last day.
    expect(nextOccurrence({ frequency: 'MONTHLY', weekday: null, monthDay: 31, time: '08:00' }, now).toISOString()).toBe('2026-04-30T04:00:00.000Z');
    expect(latestOccurrence({ frequency: 'MONTHLY', weekday: null, monthDay: 31, time: '08:00' }, now).toISOString()).toBe('2026-03-31T04:00:00.000Z');
  });

  it('enforces the external allow-list and recipient roles', async () => {
    const admin = await asAdmin();
    const sup = await asSuperAdmin();
    const staff = await createUser({ role: 'STAFF' });
    const r = await admin.agent.post('/api/admin/reports/saved').send({ name: 'Inv', dataset: 'invoices', config: {} });
    const id = r.body.report.id;
    const base = { frequency: 'DAILY', time: '08:00' };
    expect((await admin.agent.post(`/api/admin/reports/saved/${id}/schedules`).send({ ...base, externalEmails: ['muhasib@firma.az'] })).body.error).toBe('REPORT_EXTERNAL_NOT_ALLOWED');
    expect((await admin.agent.put('/api/admin/reports/settings').send({ externalAllowList: ['muhasib@firma.az'] })).status).toBe(403);
    expect((await sup.agent.put('/api/admin/reports/settings').send({ externalAllowList: ['muhasib@firma.az', '@audit.de'] })).status).toBe(200);
    expect((await admin.agent.post(`/api/admin/reports/saved/${id}/schedules`).send({ ...base, externalEmails: ['muhasib@firma.az', 'x@audit.de'] })).status).toBe(201);
    expect((await admin.agent.post(`/api/admin/reports/saved/${id}/schedules`).send({ ...base, recipientUserIds: [staff.user.id] })).body.error).toBe('REPORT_RECIPIENT_NOT_ALLOWED');
    expect((await admin.agent.post(`/api/admin/reports/saved/${id}/schedules`).send({ frequency: 'WEEKLY', time: '08:00', recipientUserIds: [admin.user.id] })).status).toBe(400);
    expect((await admin.agent.post(`/api/admin/reports/saved/${id}/schedules`).send({ frequency: 'DAILY', time: '25:00', recipientUserIds: [admin.user.id] })).status).toBe(400);
    expect(await prisma.auditLog.count({ where: { action: 'REPORT_SCHEDULED' } })).toBe(1);
  });

  it('sends the report with an Excel attachment once per period, masked for external recipients; pause stops it', async () => {
    const { cases } = await seed();
    // The schedule runs with its creator's rights: a SUPER_ADMIN sees passports in plain text.
    const admin = await asSuperAdmin({ locale: 'de' });
    const colleague = await createUser({ role: 'ADMIN', locale: 'en', email: `${uniq('colleague')}@test.local` });
    await admin.agent.put('/api/admin/reports/settings').send({ externalAllowList: ['@steuerbuero.de'] });
    const rep = await admin.agent.post('/api/admin/reports/saved').send({
      name: 'Fälle Pässe',
      dataset: 'cases',
      config: { columns: ['number', 'clientName', 'passportNumber'], sort: { column: 'number', dir: 'asc' } },
    });
    const created = await admin.agent
      .post(`/api/admin/reports/saved/${rep.body.report.id}/schedules`)
      .send({ frequency: 'DAILY', time: '07:30', recipientUserIds: [admin.user.id, colleague.user.id], externalEmails: ['buch@steuerbuero.de'] });
    expect(created.status).toBe(201);
    const sched = await prisma.reportSchedule.findUniqueOrThrow({ where: { id: created.body.schedule.id } });
    const due = nextOccurrence(sched, new Date());
    expect(created.body.schedule.nextRunAt).toBe(due.toISOString());

    // Before the first occurrence nothing is sent.
    expect((await runReportSchedules(new Date(due.getTime() - 60_000))).sent).toBe(0);
    expect(mails).toHaveLength(0);

    const r1 = await runReportSchedules(new Date(due.getTime() + 60_000));
    expect(r1).toMatchObject({ sent: 1, failed: 0 });
    expect(mails.map((m) => m.to).sort()).toEqual([admin.user.email, colleague.user.email, 'buch@steuerbuero.de'].sort());
    const toAdmin = mails.find((m) => m.to === admin.user.email)!;
    expect(toAdmin.subject).toBe('Triad Vision · Bericht: Fälle Pässe');
    expect(toAdmin.attachments).toHaveLength(1);
    expect(toAdmin.attachments![0].filename).toMatch(/\.xlsx$/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(toAdmin.attachments![0].content as unknown as ExcelJS.Buffer);
    expect(wb.worksheets[0].getRow(1).values).toEqual([undefined, 'Fall-Nr.', 'Kunde', 'Pass-Nr.']);
    expect(wb.worksheets[0].getRow(2).getCell(1).value).toBe(cases[0].number);
    expect(wb.worksheets[0].getRow(2).getCell(3).value).toBe('C01X00T47');
    const toColleague = mails.find((m) => m.to === colleague.user.email)!;
    expect(toColleague.subject).toBe('Triad Vision · Report: Fälle Pässe');
    const external = mails.find((m) => m.to === 'buch@steuerbuero.de')!;
    expect(external.html).not.toContain('/admin/reports');
    const wbx = new ExcelJS.Workbook();
    await wbx.xlsx.load(external.attachments![0].content as unknown as ExcelJS.Buffer);
    expect(String(wbx.worksheets[0].getRow(2).getCell(3).value)).toMatch(/^•+/);

    // Same period again: nothing new (also from a second job run in parallel).
    const again = await Promise.all([runReportSchedules(new Date(due.getTime() + 120_000)), runReportSchedules(new Date(due.getTime() + 180_000))]);
    expect(again.reduce((a, r) => a + r.sent, 0)).toBe(0);
    expect(mails).toHaveLength(3);

    // Next day: sent again.
    expect((await runReportSchedules(new Date(due.getTime() + 86_400_000 + 60_000))).sent).toBe(1);
    expect(mails).toHaveLength(6);

    const log = await admin.agent.get(`/api/admin/reports/schedules/${sched.id}/deliveries`);
    expect(log.body.deliveries).toHaveLength(2);
    expect(log.body.deliveries[0]).toMatchObject({ status: 'SENT', rows: 4 });
    expect(log.body.deliveries[0].recipients).toHaveLength(3);

    // Pause: no more mails; the external address removed from the allow-list is no longer mailed.
    expect((await admin.agent.patch(`/api/admin/reports/schedules/${sched.id}`).send({ active: false })).body.schedule.active).toBe(false);
    expect((await runReportSchedules(new Date(due.getTime() + 2 * 86_400_000 + 60_000))).sent).toBe(0);
    await admin.agent.patch(`/api/admin/reports/schedules/${sched.id}`).send({ active: true, externalEmails: [] });
    expect((await runReportSchedules(new Date(due.getTime() + 3 * 86_400_000 + 60_000))).sent).toBe(1);
    expect(mails).toHaveLength(8);

    // Another admin may not change or delete it; the creator may.
    const other = await asAdmin();
    expect((await other.agent.patch(`/api/admin/reports/schedules/${sched.id}`).send({ active: false })).status).toBe(404); // private report: invisible
    expect((await admin.agent.delete(`/api/admin/reports/schedules/${sched.id}`)).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'REPORT_SCHEDULED', actorId: admin.user.id } })).toBe(4);
  });

  it('fails a delivery (logged, not retried) when the owner lost the admin role', async () => {
    const admin = await asAdmin();
    const rep = await admin.agent.post('/api/admin/reports/saved').send({ name: 'X', dataset: 'cases', config: {} });
    const s = await admin.agent.post(`/api/admin/reports/saved/${rep.body.report.id}/schedules`).send({ frequency: 'MONTHLY', monthDay: 1, time: '08:00', recipientUserIds: [admin.user.id] });
    await prisma.user.update({ where: { id: admin.user.id }, data: { role: 'STAFF' } });
    const sched = await prisma.reportSchedule.findUniqueOrThrow({ where: { id: s.body.schedule.id } });
    const due = nextOccurrence(sched, new Date());
    expect(await runReportSchedules(new Date(due.getTime() + 1000))).toMatchObject({ sent: 0, failed: 1 });
    expect(await runReportSchedules(new Date(due.getTime() + 5000))).toMatchObject({ sent: 0, failed: 0 });
    const d = await prisma.reportDelivery.findFirstOrThrow({ where: { scheduleId: sched.id } });
    expect(d).toMatchObject({ status: 'FAILED', error: 'OWNER_NOT_ALLOWED' });
    expect(mails).toHaveLength(0);
  });
});
