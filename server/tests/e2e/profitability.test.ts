import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { binaryParser } from '../helpers/files';
import { createUser } from '../helpers/factories';
import { casesNamedIn, splitCents } from '../../src/lib/profitability/compute.js';

const D = (s: string) => new Date(`${s}T12:00:00Z`);

/**
 * Company "Nord" with three cases (one cancelled), invoices with a line naming a case, a settlement row in AZN
 * (paid, partner share synced to a PartnerCommission, expenses), an agent commission without a case, a
 * translation order. Default rate: 2 AZN per EUR.
 */
const seed = async () => {
  await prisma.setting.create({ data: { key: 'profitability', value: { eurAzn: 2, translationAs: 'revenue' } } });
  const staff = await createUser({ role: 'STAFF', firstName: 'Leyla', lastName: 'Əliyeva' });
  const company = await prisma.company.create({ data: { name: 'Nord Logistik GmbH', status: 'ACTIVE' } });
  const partner = await prisma.referralPartner.create({ data: { name: 'İlqar' } });
  const agentUser = await createUser({ role: 'AGENT', firstName: 'Agent', lastName: 'Gəncə' });
  const agent = await prisma.agent.create({ data: { userId: agentUser.user.id, code: 'GANJA-1' } });
  const cl1 = await createUser({ role: 'CLIENT', firstName: 'Rauf', lastName: 'Məmmədov' });
  const cl2 = await createUser({ role: 'CLIENT', firstName: 'Aysel', lastName: 'Quliyeva' });
  await prisma.user.update({ where: { id: cl2.user.id }, data: { referredByAgentId: agent.id } });
  const cl3 = await createUser({ role: 'CLIENT', firstName: 'Kamran', lastName: 'Həsənov' });
  const c1 = await prisma.case.create({
    data: { clientId: cl1.user.id, number: 'TV-P-0001', profession: 'Fahrer', status: 'APPROVED', visaType: 'WORK', companyId: company.id, partnerId: partner.id, assignedStaffId: staff.user.id, createdAt: D('2026-01-10') },
  });
  const c2 = await prisma.case.create({
    data: { clientId: cl2.user.id, number: 'TV-P-0002', profession: 'Pflege', status: 'DOCUMENTS_PENDING', visaType: 'AUSBILDUNG', companyId: company.id, createdAt: D('2026-02-10') },
  });
  const c3 = await prisma.case.create({ data: { clientId: cl3.user.id, number: 'TV-P-0003', profession: 'Fahrer', status: 'CANCELLED', visaType: 'WORK', companyId: company.id, createdAt: D('2026-02-20') } });

  const invoice = (number: string, items: { description: string; quantity: number; unitPriceCents: number }[], status: 'PAID' | 'SENT') => {
    const net = items.reduce((a, l) => a + l.quantity * l.unitPriceCents, 0);
    return prisma.invoice.create({
      data: { number, companyId: company.id, issueDate: D('2026-03-01'), dueDate: D('2026-03-15'), items, netCents: net, vatCents: Math.round(net * 0.19), grossCents: net + Math.round(net * 0.19), status, paidAt: status === 'PAID' ? D('2026-03-10') : null },
    });
  };
  // 30 000 named for TV-P-0001; the other 60 000 split over the two non-cancelled cases.
  await invoice('PR-1', [{ description: 'Vermittlung TV-P-0001 (Fahrer)', quantity: 1, unitPriceCents: 30000 }, { description: 'Pauschale', quantity: 2, unitPriceCents: 30000 }], 'PAID');
  await invoice('PR-2', [{ description: 'Service', quantity: 1, unitPriceCents: 10001 }], 'PAID'); // 5001 / 5000
  await invoice('PR-3', [{ description: 'Offen TV-P-0002', quantity: 1, unitPriceCents: 99999 }], 'SENT'); // not paid: ignored

  const entry = await prisma.settlementEntry.create({
    data: { caseId: c1.id, partnerId: partner.id, clientName: 'Rauf Məmmədov', currency: 'AZN', amountCents: 300000, paidCents: 200000, partnerShareCents: 10000, partnerShareCurrency: 'EUR', expensesCents: 20000 },
  });
  await prisma.partnerCommission.create({ data: { partnerId: partner.id, caseId: c1.id, amountCents: 10000, currency: 'EUR', settlementEntryId: entry.id } });
  await prisma.agentCommission.create({ data: { agentId: agent.id, clientId: cl2.user.id, caseId: null, event: 'CASE_CREATED', amountCents: 5000, createdAt: D('2026-02-11') } });
  await prisma.agentCommission.create({ data: { agentId: agent.id, clientId: cl2.user.id, caseId: c2.id, event: 'MANUAL', sourceRef: 'x', amountCents: 9999, status: 'CANCELLED' } });
  await prisma.translationOrder.create({ data: { number: 901, clientId: cl2.user.id, caseId: c2.id, service: 'TRANSLATION', sourceLang: 'az', targetLang: 'de', status: 'DELIVERED', priceCents: 8000, completedAt: D('2026-02-15') } });
  await prisma.translationOrder.create({ data: { number: 902, clientId: cl2.user.id, caseId: c2.id, service: 'TRANSLATION', sourceLang: 'az', targetLang: 'de', status: 'QUOTED', priceCents: 7000 } });
  return { staff, company, partner, agent, c1, c2, c3 };
};

describe('profitability: allocation rules', () => {
  it('helpers split cents exactly and find case numbers as whole tokens', () => {
    expect(splitCents(10001, 2)).toEqual([5001, 5000]);
    expect(splitCents(-5, 2)).toEqual([-3, -2]);
    expect(splitCents(100, 3).reduce((a, b) => a + b, 0)).toBe(100);
    expect(casesNamedIn('Vermittlung TV-P-0001, tv-p-0002', ['TV-P-0001', 'TV-P-0002', 'TV-P-0003'])).toEqual(['TV-P-0001', 'TV-P-0002']);
    expect(casesNamedIn('TV-P-00012', ['TV-P-0001'])).toEqual([]);
  });

  it('aggregates revenue and costs per case (line-named invoice share, equal split, settlement, client fallback, no double partner share)', async () => {
    const admin = await asAdmin();
    const { c1, c2, c3 } = await seed();
    const cost1 = await admin.agent.post(`/api/admin/profitability/cases/${c1.id}/costs`).send({ category: 'COURIER', amount: 50, currency: 'AZN', fxRate: 1.7, incurredAt: '2026-03-02', note: 'DHL' });
    expect(cost1.status).toBe(201);
    expect(cost1.body.cost).toMatchObject({ amountCents: 5000, currency: 'AZN', fxRate: 1.7 });
    expect((await admin.agent.post(`/api/admin/profitability/cases/${c2.id}/costs`).send({ category: 'EMBASSY_FEE', amount: 75, incurredAt: '2026-03-02' })).body.cost).toMatchObject({ currency: 'EUR', fxRate: 2 });

    const p1 = (await admin.agent.get(`/api/admin/profitability/cases/${c1.id}`)).body;
    expect(p1.profit.revenue).toEqual({ INVOICE: 65001, SETTLEMENT: 100000, TRANSLATION: 0, total: 165001 });
    expect(p1.profit.costs).toMatchObject({ PARTNER_COMMISSION: 10000, LEDGER_EXPENSES: 10000, COURIER: 2941, AGENT_COMMISSION: 0, total: 22941 });
    expect(p1.profit.marginCents).toBe(142060);
    expect(p1.profit.marginPct).toBe(86.1);
    const inv = p1.profit.lines.filter((l: { source: string }) => l.source === 'INVOICE');
    expect(inv.map((l: { ref: string; allocation: string; amountCents: number; splitOver: number }) => [l.ref, l.allocation, l.amountCents, l.splitOver]).sort()).toEqual(
      [
        ['PR-1', 'line', 30000, 1],
        ['PR-1', 'split', 30000, 2],
        ['PR-2', 'split', 5001, 2],
      ].sort(),
    );
    expect(p1.costs).toHaveLength(1);
    expect(p1.settings).toMatchObject({ eurAzn: 2, translationAs: 'revenue' });

    const p2 = (await admin.agent.get(`/api/admin/profitability/cases/${c2.id}`)).body.profit;
    expect(p2.revenue).toEqual({ INVOICE: 35000, SETTLEMENT: 0, TRANSLATION: 8000, total: 43000 });
    expect(p2.costs).toMatchObject({ AGENT_COMMISSION: 5000, EMBASSY_FEE: 7500, total: 12500 }); // cancelled commission ignored
    expect(p2.marginCents).toBe(30500);
    expect(p2.agentName).toBe('Agent Gəncə');

    const p3 = (await admin.agent.get(`/api/admin/profitability/cases/${c3.id}`)).body.profit;
    expect(p3.revenue.total).toBe(0); // cancelled cases take no share of employer invoices
    expect(p3.marginPct).toBeNull();
  });

  it('converts currencies with the default rate, keeps the stored rate of manual costs, and can count translations as a cost', async () => {
    const admin = await asAdmin();
    const { c1, c2 } = await seed();
    await admin.agent.post(`/api/admin/profitability/cases/${c1.id}/costs`).send({ category: 'COURIER', amount: 50, currency: 'AZN', fxRate: 1.7, incurredAt: '2026-03-02' });
    const put = await admin.agent.put('/api/admin/profitability/settings').send({ eurAzn: 2.5, translationAs: 'cost' });
    expect(put.status).toBe(200);
    const p1 = (await admin.agent.get(`/api/admin/profitability/cases/${c1.id}`)).body.profit;
    expect(p1.revenue.SETTLEMENT).toBe(80000); // 2 000 AZN / 2.5
    expect(p1.costs.LEDGER_EXPENSES).toBe(8000);
    expect(p1.costs.COURIER).toBe(2941); // own rate 1.7
    const p2 = (await admin.agent.get(`/api/admin/profitability/cases/${c2.id}`)).body.profit;
    expect(p2.revenue.TRANSLATION).toBe(0);
    expect(p2.costs.TRANSLATION).toBe(8000);
    expect((await admin.agent.put('/api/admin/profitability/settings').send({ eurAzn: 0, translationAs: 'cost' })).status).toBe(400);
    expect(await prisma.auditLog.count({ where: { action: 'PROFITABILITY_SETTINGS' } })).toBe(1);
  });

  it('falls back to the settlement rate when no profitability rate is stored', async () => {
    const admin = await asAdmin();
    await prisma.setting.create({ data: { key: 'settlement', value: { eurAzn: 1.7 } } });
    expect((await admin.agent.get('/api/admin/profitability/settings')).body.settings).toMatchObject({ eurAzn: 1.7, translationAs: 'revenue', rateSource: 'settlement' });
  });
});

describe('profitability: overview', () => {
  it('summarises totals, breakdowns, top / bottom cases and filters by opening date and status', async () => {
    const admin = await asAdmin();
    const { c1, staff, partner } = await seed();
    const res = await admin.agent.get('/api/admin/profitability');
    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({ cases: 3, revenueCents: 208001, costCents: 25000, marginCents: 183001, unprofitable: 0 });
    expect(res.body.totals.marginPct).toBe(88);
    // Mean of the per-case margins in % (87.9 and 88.4); the case without revenue is left out.
    expect(Math.abs(res.body.totals.avgMarginPct - 88.15)).toBeLessThan(0.06);
    expect(res.body.revenueBySource).toEqual({ INVOICE: 100001, SETTLEMENT: 100000, TRANSLATION: 8000 });
    expect(res.body.costsByCategory).toMatchObject({ PARTNER_COMMISSION: 10000, LEDGER_EXPENSES: 10000, AGENT_COMMISSION: 5000 });
    expect(res.body.top[0].number).toBe('TV-P-0001');
    expect(res.body.bottom[0].number).toBe('TV-P-0003');
    expect(res.body.top[0].lines).toBeUndefined();
    const work = res.body.byVisaType.find((b: { key: string }) => b.key === 'WORK');
    expect(work).toMatchObject({ cases: 2, revenueCents: 165001, marginCents: 145001 });
    expect(res.body.byPartner.find((b: { key: string }) => b.key === partner.id)).toMatchObject({ label: 'İlqar', cases: 1 });
    expect(res.body.byStaff.find((b: { key: string }) => b.key === staff.user.id)).toMatchObject({ label: 'Leyla Əliyeva' });
    expect(res.body.byEmployer[0]).toMatchObject({ label: 'Nord Logistik GmbH', cases: 3 });
    expect(res.body.byAgent.find((b: { key: string | null }) => b.key === null)?.cases).toBe(2);
    expect(res.body.byMonth.map((b: { key: string }) => b.key)).toEqual(['2026-01', '2026-02']);

    const feb = await admin.agent.get('/api/admin/profitability?from=2026-02-01&to=2026-02-28&status=DOCUMENTS_PENDING,APPROVED');
    expect(feb.body.totals.cases).toBe(1);
    expect(feb.body.rows.map((r: { caseId: string }) => r.caseId)).not.toContain(c1.id);
    expect((await admin.agent.get('/api/admin/profitability?status=NOPE')).status).toBe(400);
  });

  it('is exportable through the report builder dataset "profitability"', async () => {
    const admin = await asAdmin();
    await seed();
    const grouped = await admin.agent.post('/api/admin/reports/preview').send({ dataset: 'profitability', config: { groupBy: [{ column: 'visaType' }], aggregations: [{ column: 'margin', fn: 'sum' }, { column: 'revenue', fn: 'sum' }], sort: { column: 'sum_margin', dir: 'desc' } } });
    expect(grouped.status).toBe(200);
    expect(grouped.body.rows[0]).toMatchObject({ visaType: 'WORK', count: 2, sum_margin: 145001, sum_revenue: 165001 });
    const filtered = await admin.agent.post('/api/admin/reports/preview').send({ dataset: 'profitability', config: { columns: ['number', 'margin'], filters: [{ column: 'margin', op: 'lt', value: 0 }] } });
    expect(filtered.body.rows).toEqual([]);
    const x = await admin.agent
      .post('/api/admin/reports/export')
      .send({ dataset: 'profitability', config: { columns: ['number', 'revenue', 'costs', 'margin', 'marginPct'], sort: { column: 'number', dir: 'asc' } }, format: 'xlsx' })
      .buffer(true)
      .parse(binaryParser);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(x.body as unknown as ExcelJS.Buffer);
    expect(wb.worksheets[0].getRow(2).values).toEqual([undefined, 'TV-P-0001', 1650.01, 200, 1450.01, 87.9]);
  });
});

describe('profitability: manual costs and authorization', () => {
  it('creates, edits and deletes manual costs (validated, audited)', async () => {
    const admin = await asAdmin();
    const { c1, c2 } = await seed();
    const doc = await prisma.document.create({ data: { caseId: c2.id, stage: 'OTHER', originalName: 'qəbz.pdf', storedName: `qebz-${Date.now()}.pdf`, mimeType: 'application/pdf', size: 10, uploadedById: admin.user.id } });
    expect((await admin.agent.post(`/api/admin/profitability/cases/${c1.id}/costs`).send({ category: 'VISA_FEE', amount: 75, incurredAt: '2026-03-01', documentId: doc.id })).body.error).toBe('COST_DOCUMENT_NOT_IN_CASE');
    expect((await admin.agent.post(`/api/admin/profitability/cases/${c1.id}/costs`).send({ category: 'VISA_FEE', amount: 75, currency: 'USD', incurredAt: '2026-03-01' })).status).toBe(400);
    expect((await admin.agent.post(`/api/admin/profitability/cases/${c1.id}/costs`).send({ category: 'VISA_FEE', amount: -1, incurredAt: '2026-03-01' })).status).toBe(400);
    expect((await admin.agent.post(`/api/admin/profitability/cases/${c1.id}/costs`).send({ category: 'VISA_FEE', amount: 1.234, incurredAt: '2026-03-01' })).status).toBe(400);
    expect((await admin.agent.post(`/api/admin/profitability/cases/nope/costs`).send({ category: 'VISA_FEE', amount: 1, incurredAt: '2026-03-01' })).status).toBe(404);

    const created = await admin.agent.post(`/api/admin/profitability/cases/${c2.id}/costs`).send({ category: 'VISA_FEE', amount: 75.5, incurredAt: '2026-03-01', documentId: doc.id, note: 'Visa' });
    expect(created.status).toBe(201);
    const id = created.body.cost.id;
    const card = await admin.agent.get(`/api/admin/profitability/cases/${c2.id}`);
    expect(card.body.costs[0]).toMatchObject({ id, amountCents: 7550, documentName: 'qəbz.pdf' });
    expect(card.body.profit.costs.VISA_FEE).toBe(7550);
    expect(card.body.documents.map((d: { id: string }) => d.id)).toContain(doc.id);

    const upd = await admin.agent.patch(`/api/admin/profitability/costs/${id}`).send({ amount: 100, currency: 'AZN', fxRate: 2, category: 'OTHER' });
    expect(upd.body.cost).toMatchObject({ amountCents: 10000, currency: 'AZN', category: 'OTHER' });
    expect((await admin.agent.get(`/api/admin/profitability/cases/${c2.id}`)).body.profit.costs).toMatchObject({ VISA_FEE: 0, OTHER: 5000 });
    expect((await admin.agent.delete(`/api/admin/profitability/costs/${id}`)).status).toBe(200);
    expect((await admin.agent.delete(`/api/admin/profitability/costs/${id}`)).status).toBe(404);
    expect((await prisma.auditLog.findMany({ where: { action: { startsWith: 'CASE_COST_' } }, orderBy: { createdAt: 'asc' } })).map((l) => l.action)).toEqual(['CASE_COST_CREATED', 'CASE_COST_UPDATED', 'CASE_COST_DELETED']);
    // Costs disappear with their case.
    await admin.agent.post(`/api/admin/profitability/cases/${c1.id}/costs`).send({ category: 'OTHER', amount: 1, incurredAt: '2026-03-01' });
    await prisma.case.delete({ where: { id: c1.id } });
    expect(await prisma.caseCost.count({ where: { caseId: c1.id } })).toBe(0);
  });

  it('is ADMIN+ only', async () => {
    const { c1 } = await seed();
    const staff = await asStaff();
    const client = await asClient();
    const sup = await asSuperAdmin();
    for (const agent of [staff.agent, client.agent]) {
      expect((await agent.get('/api/admin/profitability')).status).toBe(403);
      expect((await agent.get(`/api/admin/profitability/cases/${c1.id}`)).status).toBe(403);
      expect((await agent.post(`/api/admin/profitability/cases/${c1.id}/costs`).send({ category: 'OTHER', amount: 1, incurredAt: '2026-03-01' })).status).toBe(403);
      expect((await agent.put('/api/admin/profitability/settings').send({ eurAzn: 2, translationAs: 'revenue' })).status).toBe(403);
      expect((await agent.post('/api/admin/reports/preview').send({ dataset: 'profitability', config: {} })).status).toBe(403);
    }
    expect((await sup.agent.get('/api/admin/profitability')).status).toBe(200);
    expect(await prisma.caseCost.count()).toBe(0);
  });
});
