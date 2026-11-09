import { beforeEach, describe, expect, it } from 'vitest';
import type { CaseStatus, VisaType } from '@prisma/client';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient, uniq } from '../helpers/factories';
import { goalPace, healthScore, inquiryChannel, periodWindows } from '../../src/lib/analyticsOverview/compute.js';

const DAY = 24 * 60 * 60 * 1000;
const URL = '/api/admin/analytics/overview';

beforeEach(async () => {
  await prisma.arrivalPlan.deleteMany();
  await prisma.clientPayment.deleteMany();
  await prisma.clientInvoice.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.document.deleteMany();
  await prisma.case.deleteMany();
  await prisma.inquiry.deleteMany();
  await prisma.setting.deleteMany({ where: { key: 'analyticsOverviewGoal' } });
});

const mkCase = async (clientId: string, data: { status?: CaseStatus; visaType?: VisaType; createdAt?: Date; decisionAt?: Date; updatedAt?: Date; partnerId?: string } = {}) =>
  prisma.case.create({
    data: {
      number: uniq('TV-O-'),
      clientId,
      profession: 'Nurse',
      status: data.status ?? 'DOCUMENTS_PENDING',
      visaType: data.visaType ?? 'WORK',
      createdAt: data.createdAt,
      decisionAt: data.decisionAt,
      closedAt: data.status && ['APPROVED', 'REJECTED', 'CANCELLED'].includes(data.status) ? (data.decisionAt ?? new Date()) : null,
    },
  });

const mkInquiry = (over: Record<string, unknown> = {}) =>
  prisma.inquiry.create({ data: { kind: 'contact', contactName: 'Lead', email: `${uniq('l')}@example.com`, message: 'Hi', locale: 'az', ...over } });

describe('GET /api/admin/analytics/overview', () => {
  it('is for staff and above', async () => {
    expect((await anon().get(URL)).status).toBe(401);
    const client = await asClient();
    expect((await client.agent.get(URL)).status).toBe(403);
    const staff = await asStaff();
    expect((await staff.agent.get(URL)).status).toBe(200);
  });

  it('rejects an unknown period', async () => {
    const staff = await asStaff();
    expect((await staff.agent.get(`${URL}?period=forever`)).status).toBe(400);
  });

  it('returns the aggregated shape with a 12-month series and every source of the funnel', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.get(`${URL}?period=30d&fresh=1`);
    expect(res.status).toBe(200);
    const o = res.body;
    expect(o.period.key).toBe('30d');
    expect(o.monthly.months).toHaveLength(12);
    expect(Object.keys(o.monthly.casesByType)).toContain('WORK');
    expect(o.monthly.visas.approved).toHaveLength(12);
    expect(Object.keys(o.funnel).sort()).toEqual(['agent', 'all', 'partner', 'site']);
    expect(o.funnel.all.map((s: { key: string }) => s.key)).toEqual(['inquiries', 'cases', 'docsComplete', 'appointment', 'approved', 'arrived']);
    expect(o.kpis.activeCases.trend).toHaveLength(12);
    expect(o.attention).toEqual({ total: 0, rows: [] });
    expect(o.goal.metric).toBe('visas');
  });

  it('counts cases, approvals and inquiries of the period against the previous one', async () => {
    const admin = await asAdmin();
    const { user } = await createClient();
    const partner = await prisma.referralPartner.create({ data: { name: uniq('Partner ') } });
    const now = Date.now();
    await mkCase(user.id, { createdAt: new Date(now - 2 * DAY), visaType: 'AUSBILDUNG' });
    await mkCase(user.id, { createdAt: new Date(now - 3 * DAY), visaType: 'WORK' });
    await mkCase(user.id, { createdAt: new Date(now - 40 * DAY), visaType: 'WORK', status: 'APPROVED', decisionAt: new Date(now - 1 * DAY) });
    await mkCase(user.id, { createdAt: new Date(now - 50 * DAY), visaType: 'WORK', status: 'REJECTED', decisionAt: new Date(now - 35 * DAY) });
    await mkInquiry({ createdAt: new Date(now - DAY), utm: { source: 'Google' } });
    await mkInquiry({ createdAt: new Date(now - DAY), partnerId: partner.id });
    await mkInquiry({ createdAt: new Date(now - 45 * DAY) });

    const o = (await admin.agent.get(`${URL}?period=30d&fresh=1`)).body;
    expect(o.summary.newCases).toBe(2);
    expect(o.summary.newInquiries).toBe(2);
    expect(o.summary.newInquiriesPrev).toBe(1);
    expect(o.summary.approvals).toBe(1);
    expect(o.kpis.approvalRate.value).toBe(100);
    expect(o.kpis.approvalRate.prev).toBe(0);
    expect(o.kpis.processingDays.value).toBe(39);
    expect(o.kpis.activeCases.value).toBe(2);
    const seg = Object.fromEntries(o.segments.map((s: { key: string; count: number }) => [s.key, s.count]));
    expect(seg).toMatchObject({ AUSBILDUNG: 1, WORK: 1 });
    // Cohort funnel: step 1 = inquiries of the period + cases of the period opened without one of them.
    expect(o.funnel.all.map((s: { count: number }) => s.count)).toEqual([4, 2, 0, 0, 0, 0]);
    // Previous cohort: 1 inquiry + the two cases opened 40 / 50 days ago, followed up to now (one approved).
    expect(o.funnel.all.map((s: { prev: number }) => s.prev)).toEqual([3, 2, 2, 2, 1, 0]);
    expect(o.funnel.partner[0].count).toBe(1);
    expect(o.funnel.site[0].count).toBe(3);
    const channels = o.channels.map((c: { key: string }) => c.key);
    expect(channels).toContain('utm:google');
    expect(o.movement).toMatchObject({ created: 2, approved: 1, rejected: 0 });
  });

  it('follows the cohort of the period through every step: never increasing, conversions ≤ 100 %', async () => {
    const admin = await asAdmin();
    const now = Date.now();
    // Lead converted into a client whose case went all the way to arrival.
    const { user: a } = await createClient();
    await mkInquiry({ createdAt: new Date(now - 6 * DAY), convertedUserId: a.id });
    const ca = await mkCase(a.id, { createdAt: new Date(now - 5 * DAY), status: 'APPROVED', decisionAt: new Date(now - DAY) });
    await prisma.caseEvent.create({ data: { caseId: ca.id, type: 'STATUS_CHANGED', toStatus: 'DOCUMENTS_REVIEW' } });
    await prisma.arrivalPlan.create({ data: { caseId: ca.id, clientId: a.id, status: 'COMPLETED', arrivalTime: new Date() } });
    // Second case of the same client (family member) from the same inquiry: step 2 would exceed step 1 without the guard.
    await mkCase(a.id, { createdAt: new Date(now - 4 * DAY) });
    // Office client without an inquiry whose case reached documents only (history says so; status went back).
    const { user: b } = await createClient();
    const cb = await mkCase(b.id, { createdAt: new Date(now - 3 * DAY) });
    await prisma.caseEvent.create({ data: { caseId: cb.id, type: 'STATUS_CHANGED', toStatus: 'DOCUMENTS_REVIEW' } });
    // A case approved in the period but opened long before is NOT part of this cohort.
    const { user: c } = await createClient();
    await mkCase(c.id, { createdAt: new Date(now - 200 * DAY), status: 'APPROVED', decisionAt: new Date(now - DAY) });

    const o = (await admin.agent.get(`${URL}?period=30d&fresh=1`)).body;
    const counts = o.funnel.all.map((s: { count: number }) => s.count);
    expect(counts).toEqual([2, 2, 2, 1, 1, 1]);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    for (const src of ['all', 'partner', 'site', 'agent']) {
      const steps = o.funnel[src];
      for (let i = 1; i < steps.length; i++) {
        expect(steps[i].count).toBeLessThanOrEqual(steps[i - 1].count);
        expect(steps[i].prev).toBeLessThanOrEqual(steps[i - 1].prev);
      }
    }
  });

  it('hides every amount from staff but shows revenue and receivables to admins', async () => {
    const { user } = await createClient();
    const c = await mkCase(user.id, { createdAt: new Date(Date.now() - 5 * DAY), visaType: 'STUDY' });
    await prisma.clientPayment.create({ data: { clientId: user.id, caseId: c.id, amountCents: 50_000, method: 'BANK', paidAt: new Date(Date.now() - DAY) } });
    await prisma.clientInvoice.create({
      data: { number: uniq('KR-'), clientId: user.id, issueDate: new Date(Date.now() - 20 * DAY), dueDate: new Date(Date.now() - 5 * DAY), items: [], netCents: 10_000, vatCents: 1_900, grossCents: 11_900, status: 'SENT' },
    });

    const staff = await asStaff();
    const s = (await staff.agent.get(`${URL}?fresh=1`)).body;
    expect(s.finance).toBe(false);
    expect(s.monthly.revenue).toBeNull();
    expect(s.kpis.receivables).toBeNull();
    expect(s.summary.revenueCents).toBeNull();
    expect(s.segments.every((x: { revenueCents: unknown }) => x.revenueCents === null)).toBe(true);
    const csv = await staff.agent.get(`${URL.replace('/overview', '/overview.csv')}?fresh=1`);
    expect(csv.status).toBe(200);
    expect(csv.text).not.toContain('revenue');

    const admin = await asAdmin();
    const a = (await admin.agent.get(`${URL}?fresh=1`)).body;
    expect(a.finance).toBe(true);
    expect(a.summary.revenueCents).toBe(50_000);
    expect(a.monthly.revenue.payments.at(-1)).toBe(50_000);
    expect(a.kpis.receivables).toMatchObject({ grossCents: 11_900, overdueCents: 11_900, count: 1, overdueCount: 1 });
    expect(a.segments.find((x: { key: string }) => x.key === 'STUDY').revenueCents).toBe(50_000);
  });

  it('lists stalled cases that need a look with a health score and trend', async () => {
    const admin = await asAdmin();
    const { user } = await createClient({ firstName: 'Aysel', lastName: 'Quliyeva' });
    const old = new Date(Date.now() - 30 * DAY);
    const c = await mkCase(user.id, { createdAt: old, status: 'DOCUMENTS_PENDING' });
    await prisma.$executeRaw`UPDATE \`Case\` SET updatedAt = ${old} WHERE id = ${c.id}`;
    const o = (await admin.agent.get(`${URL}?fresh=1`)).body;
    expect(o.attention.total).toBe(1);
    const row = o.attention.rows[0];
    expect(row).toMatchObject({ caseId: c.id, initials: 'AQ', reasons: ['stuck'] });
    expect(row.health).toBeLessThan(50);
    expect(row.trend).toHaveLength(8);
    expect(o.summary.attention).toBe(1);
  });
});

describe('overview goal', () => {
  it('only admins set it; staff never see a revenue goal', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const year = new Date().getUTCFullYear();
    expect((await staff.agent.put(`${URL}/goal`).send({ metric: 'visas', target: 10, year })).status).toBe(403);
    expect((await admin.agent.put(`${URL}/goal`).send({ metric: 'visas', target: 0, year })).status).toBe(400);
    expect((await admin.agent.put(`${URL}/goal`).send({ metric: 'revenue', target: 1_000_000, year })).status).toBe(200);
    const s = (await staff.agent.get(`${URL}?fresh=1`)).body;
    expect(s.goal).toEqual({ metric: 'revenue', hidden: true });
    const a = (await admin.agent.get(`${URL}?fresh=1`)).body;
    expect(a.goal).toMatchObject({ metric: 'revenue', hidden: false, target: 1_000_000, value: 0, remaining: 1_000_000 });
    const log = await prisma.auditLog.findFirst({ where: { action: 'ANALYTICS_GOAL_SET' }, orderBy: { createdAt: 'desc' } });
    expect(log?.target).toBe('revenue');
  });
});

describe('GET /api/admin/analytics/overview/activity', () => {
  it('returns privacy-safe items: case numbers and channels, payments only for admins', async () => {
    const { user } = await createClient({ firstName: 'Secret', lastName: 'Person' });
    const c = await mkCase(user.id);
    await prisma.caseEvent.create({ data: { caseId: c.id, type: 'STATUS_CHANGED', toStatus: 'DOCUMENTS_REVIEW', note: 'private note' } });
    await mkInquiry({ contactName: 'Hidden Lead', agentId: null });
    await prisma.clientPayment.create({ data: { clientId: user.id, caseId: c.id, amountCents: 1234, method: 'CASH', paidAt: new Date() } });

    const staff = await asStaff();
    const s = await staff.agent.get(`${URL}/activity`);
    expect(s.status).toBe(200);
    const text = JSON.stringify(s.body);
    expect(text).not.toContain('Secret');
    expect(text).not.toContain('Hidden Lead');
    expect(text).not.toContain('private note');
    expect(s.body.items.some((i: { kind: string }) => i.kind === 'payment')).toBe(false);
    expect(s.body.items.find((i: { kind: string }) => i.kind === 'case').caseNumber).toBe(c.number);
    expect(s.body.today).toBeGreaterThanOrEqual(2);

    const admin = await asAdmin();
    const a = (await admin.agent.get(`${URL}/activity`)).body;
    expect(a.items.find((i: { kind: string }) => i.kind === 'payment').amountCents).toBe(1234);
  });
});

describe('overview CSV', () => {
  it('exports the aggregates for admins and audits it', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.get(`/api/admin/analytics/overview.csv?period=quarter&fresh=1`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('section,key,current,previous');
    expect(res.text).toContain('revenueEur');
    expect(await prisma.auditLog.count({ where: { action: 'ANALYTICS_OVERVIEW_EXPORTED' } })).toBeGreaterThan(0);
  });
});

describe('overview helpers', () => {
  it('compares this month so far with the same days of last month (Baku time)', () => {
    const now = new Date('2026-03-10T08:00:00Z'); // 12:00 in Baku
    const w = periodWindows('month', now);
    expect(w.cur.start.toISOString()).toBe('2026-02-28T20:00:00.000Z');
    expect(w.prev.start.toISOString()).toBe('2026-01-31T20:00:00.000Z');
    expect(w.prev.end.getTime() - w.prev.start.getTime()).toBe(w.cur.end.getTime() - w.cur.start.getTime());
    const d = periodWindows('30d', now);
    expect(d.prev.end.getTime()).toBe(d.cur.start.getTime());
  });

  it('classifies inquiry channels', () => {
    const base = { partnerId: null, agentId: null, source: null, landingPageId: null, utm: null };
    expect(inquiryChannel({ ...base, partnerId: 'p', utm: { source: 'google' } })).toBe('partner');
    expect(inquiryChannel({ ...base, source: 'event:1' })).toBe('event');
    expect(inquiryChannel({ ...base, utm: { source: 'WWW.Facebook.com' } })).toBe('utm:facebook.com');
    expect(inquiryChannel({ ...base, landingPageId: 'x' })).toBe('landing');
    expect(inquiryChannel(base)).toBe('direct');
  });

  it('scores health and goal pace', () => {
    expect(healthScore({ idleDays: 0, reasons: [], expiryDays: null })).toBe(100);
    expect(healthScore({ idleDays: 40, reasons: ['stuck', 'expired'], expiryDays: -2 })).toBe(5);
    const g = goalPace(100, 25, 2026, new Date('2026-04-01T20:00:00Z'));
    expect(g.remaining).toBe(75);
    expect(g.pct).toBe(25);
    expect(g.projected).toBeGreaterThan(95);
    expect(g.reachDate?.slice(0, 4)).toBe('2026');
    expect(goalPace(null, 3, 2026, new Date('2026-06-01T00:00:00Z')).remaining).toBeNull();
  });
});
