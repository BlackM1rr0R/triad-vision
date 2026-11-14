import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient, l10n, uniq } from '../helpers/factories';
import { expectStatus } from '../helpers/workflow';

/**
 * Revenue & sales dashboard (Admin → Biznes analitikası → Gəlir və satış, /api/admin/analytics/sales): paid
 * revenue vs. the previous period, expected / overdue payments, revenue by package / service, leads by source,
 * the lead → visa funnel, partners by revenue and the CSV exports. Pure maths: tests/unit/salesAnalytics.test.ts.
 */

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const ahead = (days: number) => new Date(Date.now() + days * DAY);
const bakuDay = (d: Date) => new Date(d.getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
const URL = '/api/admin/analytics/sales';
// 60 Baku days ending today; the previous period is the 60 days before.
const query = () => ({ from: bakuDay(ago(59)), to: bakuDay(new Date()) });

describe('GET /api/admin/analytics/sales', () => {
  it('is for admins only and validates the period', async () => {
    expect((await anon().get(URL)).status).toBe(401);
    expect((await (await asClient()).agent.get(URL)).status).toBe(403);
    const staff = await asStaff();
    expect((await staff.agent.get(URL)).status).toBe(403);
    expect((await staff.agent.get(`${URL}.csv`)).status).toBe(403);
    const admin = await asAdmin();
    expect((await admin.agent.get(URL).query({ from: '2026-10-10', to: '2026-10-01' })).status).toBe(400);
    expect((await admin.agent.get(URL).query({ from: '2020-01-01', to: '2026-10-01' })).status).toBe(400);
    expect((await admin.agent.get(`${URL}.csv`).query({ section: 'nope' })).status).toBe(400);
    const empty = expectStatus(await admin.agent.get(URL), 200).body;
    expect(empty.range.months).toHaveLength(12);
    expect(empty.summary).toMatchObject({ revenueCents: 0, revenuePrevCents: 0, overdueCents: 0 });
    expect(empty.expected.months).toHaveLength(6);
    expect(empty.funnel.map((s: { key: string }) => s.key)).toEqual(['leads', 'clients', 'cases', 'approved']);
  });

  it('computes revenue, expected payments, services, leads, funnel and partners', async () => {
    const admin = await asAdmin();
    const partner = await prisma.referralPartner.create({ data: { name: uniq('Partnyor ') } });
    const [c1, c2, c3, c4] = (await Promise.all([1, 2, 3, 4].map(() => createClient()))).map((c) => c.user);
    // c1: the partner's client (registered 30 days ago); c2 signed up with c3's referral code; c4 came from an inquiry.
    await prisma.user.update({ where: { id: c1.id }, data: { ownerPartnerId: partner.id, ownerPartnerAt: ago(30), createdAt: ago(30) } });
    await prisma.clientReferral.create({ data: { referrerId: c3.id, referredId: c2.id, code: 'REF123' } });
    await prisma.inquiry.create({ data: { kind: 'contact', contactName: 'P', email: 'p@test.local', message: 'x', locale: 'az', partnerId: partner.id } });
    await prisma.inquiry.create({ data: { kind: 'contact', contactName: 'U', email: 'u@test.local', message: 'x', locale: 'az', utm: { source: 'facebook' }, visitorId: 'v1' } });
    await prisma.inquiry.create({ data: { kind: 'contact', contactName: 'D', email: 'd@test.local', message: 'x', locale: 'az', convertedUserId: c4.id, convertedAt: new Date() } });

    const approved = await prisma.case.create({ data: { number: uniq('TV-S-'), clientId: c1.id, profession: 'Aşpaz', status: 'APPROVED', partnerId: partner.id, decisionAt: ago(3), closedAt: ago(3) } });
    await prisma.case.create({ data: { number: uniq('TV-S-'), clientId: c4.id, profession: 'Aşpaz', status: 'DOCUMENTS_PENDING' } });

    // Package order paid through its invoice (c1, partner case).
    const pkg = await prisma.servicePackage.create({ data: { slug: uniq('pkg-'), tier: 'STANDARD', title: l10n('Standart'), summary: l10n('s'), features: { az: [], de: [], en: [], ru: [] }, priceCents: 50_000 } });
    const order = await prisma.packageOrder.create({ data: { packageId: pkg.id, clientId: c1.id, email: 'c1@test.local', name: 'C1', priceCents: 50_000, status: 'ACTIVE' } });
    const inv1 = await prisma.clientInvoice.create({
      data: { number: uniq('KR-'), clientId: c1.id, caseId: approved.id, issueDate: ago(10), dueDate: ago(3), items: [], netCents: 50_000, vatCents: 0, grossCents: 50_000, paidCents: 50_000, status: 'PAID', paidAt: ago(5), orderId: order.id },
    });
    await prisma.clientPayment.create({ data: { clientId: c1.id, invoiceId: inv1.id, caseId: approved.id, amountCents: 50_000, method: 'BANK', paidAt: ago(5) } });
    // Invoice with two kinds of lines (c2, no partner).
    const inv2 = await prisma.clientInvoice.create({
      data: {
        number: uniq('KR-'),
        clientId: c2.id,
        issueDate: ago(10),
        dueDate: ago(3),
        items: [
          { description: 'Xidmət', quantity: 1, unitPriceCents: 300, category: 'SERVICE_FEE' },
          { description: 'Tərcümə', quantity: 1, unitPriceCents: 100, category: 'TRANSLATION' },
        ],
        netCents: 400,
        vatCents: 0,
        grossCents: 400,
        paidCents: 400,
        status: 'PAID',
        paidAt: ago(4),
      },
    });
    await prisma.clientPayment.create({ data: { clientId: c2.id, invoiceId: inv2.id, amountCents: 400, method: 'CASH', paidAt: ago(4) } });
    // Previous period: a payment of the partner's client without a case.
    await prisma.clientPayment.create({ data: { clientId: c1.id, amountCents: 20_000, method: 'BANK', paidAt: ago(80) } });
    // AZN payments are not EUR revenue.
    await prisma.clientPayment.create({ data: { clientId: c2.id, amountCents: 9_999, currency: 'AZN', method: 'CASH', paidAt: ago(2) } });

    const company = await prisma.company.create({ data: { name: 'Alpha Pflege GmbH', email: 'a@alpha.test', status: 'ACTIVE' } });
    await prisma.invoice.create({ data: { number: uniq('RE-'), companyId: company.id, issueDate: ago(20), dueDate: ago(12), items: [], netCents: 100_000, vatCents: 0, grossCents: 100_000, status: 'PAID', paidAt: ago(10) } });
    // Open money: a client invoice due in 10 days, a partly paid overdue one, an overdue company invoice, an instalment.
    await prisma.clientInvoice.create({ data: { number: uniq('KR-'), clientId: c3.id, issueDate: ago(1), dueDate: ahead(10), items: [], netCents: 11_900, vatCents: 0, grossCents: 11_900, status: 'SENT' } });
    await prisma.clientInvoice.create({ data: { number: uniq('KR-'), clientId: c3.id, issueDate: ago(20), dueDate: ago(5), items: [], netCents: 5_000, vatCents: 0, grossCents: 5_000, paidCents: 1_000, status: 'PARTIALLY_PAID' } });
    const overdueCompany = await prisma.invoice.create({ data: { number: uniq('RE-'), companyId: company.id, issueDate: ago(40), dueDate: ago(20), items: [], netCents: 30_000, vatCents: 0, grossCents: 30_000, status: 'SENT' } });
    const plan = await prisma.paymentPlan.create({ data: { clientId: c4.id, title: 'Plan', totalCents: 7_000 } });
    await prisma.paymentInstallment.create({ data: { planId: plan.id, seq: 1, label: 'Viza', dueDate: ahead(40), amountCents: 7_000 } });
    await prisma.partnerCommission.create({ data: { partnerId: partner.id, caseId: approved.id, amountCents: 25_000 } });

    const body = expectStatus(await admin.agent.get(URL).query(query()), 200).body;

    expect(body.summary).toMatchObject({ revenueCents: 150_400, revenuePrevCents: 20_000, invoicesCents: 100_000, paymentsCents: 50_400, overdueCents: 34_000, overdueCount: 2, upcomingCents: 18_900 });
    expect(body.revenue.total.reduce((a: number, b: number) => a + b, 0)).toBe(150_400);
    expect(body.revenue.prevTotal.reduce((a: number, b: number) => a + b, 0)).toBe(20_000);

    expect(body.expected.overdue.rows[0]).toMatchObject({ kind: 'company', id: overdueCompany.id, who: 'Alpha Pflege GmbH', cents: 30_000, daysOverdue: 20 });
    expect(body.expected.overdue.rows[1]).toMatchObject({ kind: 'client', cents: 4_000 });

    const svc = (key: string) => body.services.find((s: { key: string }) => s.key === key);
    expect(svc(`package:${pkg.id}`)).toMatchObject({ kind: 'package', cents: 50_000, tier: 'STANDARD', title: { az: 'Standart az' } });
    expect(svc('employer')).toMatchObject({ cents: 100_000 });
    expect(svc('category:SERVICE_FEE')).toMatchObject({ cents: 300 });
    expect(svc('category:TRANSLATION')).toMatchObject({ cents: 100 });
    expect(svc('other')).toMatchObject({ cents: 0, prevCents: 20_000 });

    // Leads: 3 inquiries (partner, campaign, direct → c4) + signups c1 (partner), c2 (referral), c3 (website).
    const src = Object.fromEntries(body.leads.sources.map((s: { source: string; count: number }) => [s.source, s.count]));
    expect(src).toEqual({ website: 1, partner: 2, referral: 1, campaign: 1, direct: 1 });
    expect(body.funnel.map((s: { count: number }) => s.count)).toEqual([6, 4, 2, 1]);

    expect(body.partners).toHaveLength(1);
    expect(body.partners[0]).toMatchObject({ id: partner.id, name: partner.name, revenueCents: 50_000, prevRevenueCents: 20_000, clients: 1, payments: 1, commissionCents: 25_000 });

    const csv = await admin.agent.get(`${URL}.csv`).query({ ...query(), section: 'services' });
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain('İşəgötürən xidmətləri;1000,00');
    expect(csv.text).toContain('Standart az;500,00');
    const leadsCsv = await admin.agent.get(`${URL}.csv`).query({ ...query(), section: 'leads' });
    expect(leadsCsv.text).toContain('Partnyor;2');
  });
});
