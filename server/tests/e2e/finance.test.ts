import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { binaryParser } from '../helpers/files';
import { createUser, uniq } from '../helpers/factories';
import { buildXlsx, buildXlsxBook } from '../../src/lib/xlsx';

/** Reads one entry of a zip buffer (deflated or stored). */
const zipEntry = (zip: Buffer, name: string) => {
  let i = 0;
  while (i < zip.length - 30 && zip.readUInt32LE(i) === 0x04034b50) {
    const method = zip.readUInt16LE(i + 8);
    const size = zip.readUInt32LE(i + 18);
    const nameLen = zip.readUInt16LE(i + 26);
    const extra = zip.readUInt16LE(i + 28);
    const entry = zip.subarray(i + 30, i + 30 + nameLen).toString('utf8');
    const start = i + 30 + nameLen + extra;
    const data = zip.subarray(start, start + size);
    if (entry === name) return (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    i = start + size;
  }
  return null;
};

const D = (s: string) => new Date(`${s}T12:00:00Z`);
const Q = '?from=2025-01-01&to=2025-12-31';
let caseSeq = 0;

/**
 * One year of data (2025). The test runs later than that, so receivables are measured at the end of
 * the period (2026-01-01 00:00 UTC).
 */
const seed = async () => {
  const [a, b] = await Promise.all([
    prisma.company.create({ data: { name: 'Nord Logistik GmbH', status: 'ACTIVE' } }),
    prisma.company.create({ data: { name: 'Süd Bau AG', status: 'ACTIVE' } }),
  ]);
  const invoice = (companyId: string, number: string, o: { issue: string; due: string; net: number; status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED'; paid?: string }) =>
    prisma.invoice.create({
      data: {
        number,
        companyId,
        issueDate: D(o.issue),
        dueDate: D(o.due),
        items: [{ description: 'Vermittlung', quantity: 1, unitPriceCents: o.net }],
        netCents: o.net,
        vatCents: Math.round(o.net * 0.19),
        grossCents: o.net + Math.round(o.net * 0.19),
        status: o.status,
        paidAt: o.paid ? D(o.paid) : null,
      },
    });
  await invoice(a.id, 'FIN-1', { issue: '2025-01-10', due: '2025-01-24', net: 100000, status: 'PAID', paid: '2025-02-05' }); // gross 119000
  await invoice(b.id, 'FIN-2', { issue: '2025-03-01', due: '2025-03-15', net: 50000, status: 'PAID', paid: '2025-03-20' }); // gross 59500
  await invoice(a.id, 'FIN-3', { issue: '2025-11-20', due: '2025-12-20', net: 10000, status: 'SENT' }); // 11900, 11 days overdue at the end of 31 Dec
  await invoice(b.id, 'FIN-4', { issue: '2025-08-01', due: '2025-08-15', net: 20000, status: 'OVERDUE' }); // 23800, 138 days
  await invoice(a.id, 'FIN-5', { issue: '2025-10-01', due: '2025-10-20', net: 5000, status: 'SENT' }); // 5950, 72 days
  await invoice(a.id, 'FIN-6', { issue: '2025-05-01', due: '2025-05-15', net: 84033, status: 'DRAFT' });
  await invoice(b.id, 'FIN-7', { issue: '2024-12-01', due: '2024-12-15', net: 1000, status: 'PAID', paid: '2024-12-20' });

  const s1 = await createUser({ role: 'STAFF', firstName: 'Leyla', lastName: 'Əliyeva' });
  const s2 = await createUser({ role: 'STAFF', firstName: 'Orxan', lastName: 'Nəbiyev' });
  const client = await createUser({ role: 'CLIENT' });
  const mkCase = (o: { created: string; status?: 'APPROVED' | 'REJECTED' | 'DOCUMENTS_PENDING'; decision?: string; staff?: string; companyId?: string; visaType?: 'WORK' | 'AUSBILDUNG' }) =>
    prisma.case.create({
      data: {
        clientId: client.user.id,
        number: `TV-FIN-${String(++caseSeq).padStart(4, '0')}`,
        profession: 'Fahrer',
        status: o.status ?? 'DOCUMENTS_PENDING',
        createdAt: D(o.created),
        decisionAt: o.decision ? D(o.decision) : null,
        assignedStaffId: o.staff ?? null,
        companyId: o.companyId ?? null,
        visaType: o.visaType ?? 'WORK',
      },
    });
  const c1 = await mkCase({ created: '2025-01-05', status: 'APPROVED', decision: '2025-03-06', staff: s1.user.id, companyId: a.id }); // 60 days
  await mkCase({ created: '2025-02-01', status: 'REJECTED', decision: '2025-03-03', staff: s1.user.id, companyId: b.id, visaType: 'AUSBILDUNG' }); // 30 days
  await mkCase({ created: '2025-06-01', staff: s1.user.id });

  await prisma.caseEvent.createMany({
    data: [
      { caseId: c1.id, type: 'DOCUMENT_ACCEPTED', actorId: s1.user.id, createdAt: D('2025-01-10') },
      { caseId: c1.id, type: 'DOCUMENT_REJECTED', actorId: s1.user.id, createdAt: D('2025-01-11') },
      { caseId: c1.id, type: 'DOCUMENT_ACCEPTED', actorId: s1.user.id, createdAt: D('2024-12-30') },
    ],
  });
  await prisma.satisfactionSurvey.create({
    data: { caseId: c1.id, clientId: client.user.id, staffId: s1.user.id, trigger: 'VISA_APPROVED', tokenHash: crypto.randomBytes(32).toString('hex'), score: 9, answeredAt: D('2025-04-01') },
  });

  const agentUser = await createUser({ role: 'AGENT', firstName: 'Rauf', lastName: 'Agent' });
  const agent = await prisma.agent.create({ data: { userId: agentUser.user.id, code: uniq('FIN').toUpperCase().slice(0, 30), region: 'Gəncə' } });
  await prisma.user.update({ where: { id: client.user.id }, data: { referredByAgentId: agent.id } });
  const commission = (status: 'PENDING' | 'APPROVED' | 'PAID', amountCents: number, created: string, paid?: string) =>
    prisma.agentCommission.create({ data: { agentId: agent.id, event: 'MANUAL', sourceRef: uniq('s'), amountCents, status, createdAt: D(created), paidAt: paid ? D(paid) : null } });
  await commission('PENDING', 1000, '2025-04-01');
  await commission('APPROVED', 2000, '2025-05-01');
  await commission('PAID', 3000, '2025-01-15', '2025-06-10');
  await commission('PAID', 7000, '2024-11-15', '2024-12-10');

  await prisma.translationOrder.create({
    data: { number: 90001, clientId: client.user.id, caseId: c1.id, service: 'TRANSLATION', sourceLang: 'az', targetLang: 'de', status: 'DELIVERED', priceCents: 4500, completedAt: D('2025-07-01') },
  });
  await prisma.translationOrder.create({
    data: { number: 90002, clientId: client.user.id, service: 'TRANSLATION', sourceLang: 'az', targetLang: 'de', status: 'READY', priceCents: 9900 },
  });
  return { a, b, s1, s2, agent, c1 };
};

describe('financial reports: permissions', () => {
  it('is for admins only', async () => {
    const staff = await asStaff();
    const client = await asClient();
    expect((await staff.agent.get('/api/admin/finance/summary')).status).toBe(403);
    expect((await staff.agent.get('/api/admin/finance/export.xlsx')).status).toBe(403);
    expect((await client.agent.get('/api/admin/finance/staff')).status).toBe(403);
    const admin = await asAdmin();
    expect((await admin.agent.get('/api/admin/finance/summary')).status).toBe(200);
    const su = await asSuperAdmin();
    expect((await su.agent.get('/api/admin/finance/staff')).status).toBe(200);
  });

  it('validates the period and defaults to the current year', async () => {
    const admin = await asAdmin();
    const year = new Date().getUTCFullYear();
    const res = await admin.agent.get('/api/admin/finance/monthly');
    expect(res.body.range).toMatchObject({ from: `${year}-01-01`, to: `${year}-12-31`, groupBy: 'month' });
    expect(res.body.months).toHaveLength(12);
    expect((await admin.agent.get('/api/admin/finance/summary?from=2025-05-01&to=2025-04-01')).body.code ?? 'INVALID_RANGE').toBe('INVALID_RANGE');
    expect((await admin.agent.get('/api/admin/finance/summary?from=2025-05-01&to=2025-04-01')).status).toBe(400);
    expect((await admin.agent.get('/api/admin/finance/summary?from=2025-02-30')).status).toBe(400);
    expect((await admin.agent.get('/api/admin/finance/summary?from=2015-01-01&to=2025-01-01')).status).toBe(400);
  });
});

describe('financial reports: figures', () => {
  it('computes the summary', async () => {
    await seed();
    const admin = await asAdmin();
    const res = await admin.agent.get(`/api/admin/finance/summary${Q}`);
    expect(res.status).toBe(200);
    const s = res.body.summary;
    expect(s.revenue).toEqual({ grossCents: 178500, netCents: 150000, count: 2 });
    expect(s.receivables).toEqual({ grossCents: 41650, count: 3, overdueGrossCents: 41650, overdueCount: 3 });
    expect(s.translation).toEqual({ cents: 4500, count: 1 });
    expect(s.commissions).toMatchObject({ pendingCents: 1000, approvedCents: 2000, paidCents: 3000, paidCount: 1 });
    expect(s.netResultCents).toBe(150000 + 4500 - 3000);
    expect(s.cases).toEqual({ new: 3, approved: 1, rejected: 1, decided: 2, conversionPct: 50, avgDaysToDecision: 45 });
  });

  it('buckets per UTC month', async () => {
    await seed();
    const admin = await asAdmin();
    const { months } = (await admin.agent.get(`/api/admin/finance/monthly${Q}`)).body;
    expect(months).toHaveLength(12);
    const m = Object.fromEntries(months.map((x: { month: string }) => [x.month, x]));
    expect(m['2025-01']).toMatchObject({ invoicedCents: 119000, paidCents: 0, outstandingCents: 119000, newCases: 1, approved: 0 });
    expect(m['2025-02']).toMatchObject({ paidCents: 119000, outstandingCents: 0, newCases: 1 });
    expect(m['2025-03']).toMatchObject({ invoicedCents: 59500, paidCents: 59500, approved: 1 });
    expect(m['2025-06']).toMatchObject({ commissionsPaidCents: 3000, newCases: 1 });
    expect(m['2025-07']).toMatchObject({ translationCents: 4500 });
    expect(m['2025-08'].outstandingCents).toBe(23800);
    expect(m['2025-10'].outstandingCents).toBe(23800 + 5950);
    expect(m['2025-12'].outstandingCents).toBe(41650);
  });

  it('lists receivables with aging buckets', async () => {
    await seed();
    const admin = await asAdmin();
    const r = (await admin.agent.get(`/api/admin/finance/receivables${Q}`)).body;
    expect(r.asOf).toBe('2026-01-01T00:00:00.000Z');
    expect(r.rows.map((x: { number: string }) => x.number)).toEqual(['FIN-4', 'FIN-5', 'FIN-3']);
    expect(r.rows.map((x: { daysOverdue: number }) => x.daysOverdue)).toEqual([138, 72, 11]);
    expect(r.rows[0]).toMatchObject({ companyName: 'Süd Bau AG', grossCents: 23800, bucket: '90+' });
    expect(r.aging).toEqual([
      { bucket: '0-30', count: 1, grossCents: 11900 },
      { bucket: '31-60', count: 0, grossCents: 0 },
      { bucket: '61-90', count: 1, grossCents: 5950 },
      { bucket: '90+', count: 1, grossCents: 23800 },
    ]);
  });

  it('reports commissions per agent', async () => {
    const { agent } = await seed();
    const admin = await asAdmin();
    const r = (await admin.agent.get(`/api/admin/finance/commissions${Q}`)).body;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ id: agent.id, name: 'Rauf Agent', referralsTotal: 1, pendingCents: 1000, approvedCents: 2000, paidCents: 3000, totalCents: 6000 });
    expect(r.totals.totalCents).toBe(6000);
  });

  it('builds the staff league with reviews and satisfaction', async () => {
    const { s1, s2 } = await seed();
    const admin = await asAdmin();
    const { staff } = (await admin.agent.get(`/api/admin/finance/staff${Q}`)).body;
    const one = staff.find((x: { id: string }) => x.id === s1.user.id);
    expect(one).toMatchObject({ name: 'Leyla Əliyeva', activeCases: 1, newCases: 3, approved: 1, rejected: 1, approvalPct: 50, avgDaysToDecision: 45, documentsReviewed: 2, satisfactionAvg: 9, satisfactionCount: 1 });
    expect(staff[0].id).toBe(s1.user.id);
    expect(staff.find((x: { id: string }) => x.id === s2.user.id)).toMatchObject({ activeCases: 0, documentsReviewed: 0, satisfactionAvg: null });
  });

  it('breaks cases and revenue down by visa type', async () => {
    await seed();
    const admin = await asAdmin();
    const r = (await admin.agent.get(`/api/admin/finance/by-type${Q}`)).body;
    const t = Object.fromEntries(r.byVisaType.map((x: { key: string | null }) => [String(x.key), x]));
    // FIN-1 belongs to the company of the WORK case, FIN-2 to the AUSBILDUNG one.
    expect(t.WORK).toMatchObject({ newCases: 2, approved: 1, active: 1, invoiceRevenueCents: 119000, translationCents: 4500, revenueCents: 123500 });
    expect(t.AUSBILDUNG).toMatchObject({ newCases: 1, rejected: 1, invoiceRevenueCents: 59500 });
    expect(r.byCategory[0]).toMatchObject({ key: null, title: null, revenueCents: 178500 + 4500 });
  });
});

describe('financial reports: Excel', () => {
  it('builds a workbook with several sheets and keeps the one-sheet writer working', () => {
    const one = buildXlsx('Müştərilər', ['Ad'], [['Əli']]);
    expect(zipEntry(one, 'xl/workbook.xml')).toContain('<sheet name="Müştərilər" sheetId="1" r:id="rId1"/>');
    const book = buildXlsxBook([
      { name: 'A', headers: ['x'], rows: [[1]] },
      { name: 'A', headers: ['y'], rows: [['b']] },
    ]);
    const wb = zipEntry(book, 'xl/workbook.xml')!;
    expect(wb).toContain('<sheet name="A" sheetId="1"');
    expect(wb).toContain('<sheet name="A 2" sheetId="2"');
    expect(zipEntry(book, 'xl/worksheets/sheet2.xml')).toContain('>b<');
    expect(zipEntry(book, '[Content_Types].xml')).toContain('/xl/worksheets/sheet2.xml');
  });

  it('exports all sections with numbers as numbers and audits the download', async () => {
    await seed();
    const admin = await asAdmin();
    const res = await admin.agent.get(`/api/admin/finance/export.xlsx${Q}`).buffer(true).parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('Finanzbericht-2025-01-01-2025-12-31.xlsx');
    const buf = res.body as Buffer;
    const wb = zipEntry(buf, 'xl/workbook.xml')!;
    for (const name of ['Xülasə', 'Aylar', 'Debitor borcları', 'Komissiyalar', 'Əməkdaşlar', 'Növlər üzrə']) expect(wb).toContain(`name="${name}"`);
    const summary = zipEntry(buf, 'xl/worksheets/sheet1.xml')!;
    expect(summary).toContain('<v>1785</v>'); // revenue gross EUR
    expect(summary).toContain('<v>1500</v>'); // revenue net
    expect(summary).toContain('<v>416.5</v>'); // receivables
    expect(summary).toContain('<v>1515</v>'); // net result 1500 + 45 − 30
    const months = zipEntry(buf, 'xl/worksheets/sheet2.xml')!;
    expect(months).toContain('2025-02');
    expect(months).toContain('<v>1190</v>');
    const rec = zipEntry(buf, 'xl/worksheets/sheet3.xml')!;
    expect(rec).toContain('FIN-4');
    expect(rec).toContain('<v>138</v>');
    expect(rec).not.toContain('FIN-6');
    expect(zipEntry(buf, 'xl/worksheets/sheet4.xml')).toContain('Rauf Agent');
    expect(zipEntry(buf, 'xl/worksheets/sheet5.xml')).toContain('Leyla Əliyeva');
    expect(zipEntry(buf, 'xl/worksheets/sheet6.xml')).toContain('Ausbildung');
    const log = await prisma.auditLog.findFirst({ where: { action: 'FINANCE_EXPORT', actorId: admin.user.id } });
    expect(log?.details).toMatchObject({ from: '2025-01-01', to: '2025-12-31', receivables: 3 });
  });
});
