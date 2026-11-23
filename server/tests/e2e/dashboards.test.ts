import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, sessionAgent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createUser } from '../helpers/factories';
import { createCaseVia, expectStatus } from '../helpers/workflow';

/**
 * Visual dashboards of Admin → Biznes analitikası: pipeline funnel, stage heatmap (+ the cases behind a cell),
 * live placement map, expected-vs-received revenue plan, and the monthly trend of the partner dashboard.
 * Pure maths: tests/unit/dashboardsAggregation.test.ts.
 */

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

const openCase = async (daysInStage: number) => {
  const client = await asClient();
  const c = await createCaseVia(client.agent);
  await prisma.caseEvent.deleteMany({ where: { caseId: c.id } });
  await prisma.case.update({ where: { id: c.id }, data: { status: 'DOCUMENTS_PENDING', createdAt: ago(daysInStage + 1) } });
  await prisma.caseEvent.create({ data: { caseId: c.id, type: 'CASE_CREATED', toStatus: 'DOCUMENTS_PENDING', createdAt: ago(daysInStage) } });
  return c;
};

describe('GET /api/admin/analytics/stage-heatmap', () => {
  it('is for admins only', async () => {
    expect((await anon().get('/api/admin/analytics/stage-heatmap')).status).toBe(401);
    expect((await (await asClient()).agent.get('/api/admin/analytics/stage-heatmap')).status).toBe(403);
    expect((await (await asStaff()).agent.get('/api/admin/analytics/stage-heatmap')).status).toBe(403);
    expect((await (await asStaff()).agent.get('/api/admin/analytics/stage-heatmap/cases').query({ stage: 'DOCUMENTS_PENDING', bucket: 'd60' })).status).toBe(403);
  });

  it('counts open cases by waiting time and lists the cases behind a stuck cell', async () => {
    const admin = await asAdmin();
    const fresh = await openCase(2);
    const stuck = await openCase(45);
    const grid = expectStatus(await admin.agent.get('/api/admin/analytics/stage-heatmap'), 200).body;
    const docs = grid.rows.find((r: { stage: string }) => r.stage === 'DOCUMENTS_PENDING');
    expect(docs.counts.d7).toBeGreaterThanOrEqual(1);
    expect(docs.counts.d60).toBeGreaterThanOrEqual(1);
    expect(grid.totalStuck).toBeGreaterThanOrEqual(1);

    const list = expectStatus(await admin.agent.get('/api/admin/analytics/stage-heatmap/cases').query({ stage: 'DOCUMENTS_PENDING', bucket: 'd60' }), 200).body;
    const ids = list.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(stuck.id);
    expect(ids).not.toContain(fresh.id);
    expect(list.items.find((i: { id: string }) => i.id === stuck.id).waitingDays).toBeGreaterThanOrEqual(44);
    expect((await admin.agent.get('/api/admin/analytics/stage-heatmap/cases').query({ stage: 'APPROVED', bucket: 'd60' })).status).toBe(400);
  });
});

describe('GET /api/admin/analytics/placements', () => {
  it('is for admins only and returns counts per city', async () => {
    expect((await anon().get('/api/admin/analytics/placements')).status).toBe(401);
    expect((await (await asStaff()).agent.get('/api/admin/analytics/placements')).status).toBe(403);
    await prisma.pastPlacement.create({ data: { city: 'Hannover', cityKey: 'hannover', count: 2, year: 2024 } });
    const admin = await asAdmin();
    const body = expectStatus(await admin.agent.get('/api/admin/analytics/placements'), 200).body;
    const city = body.cities.find((c: { cityKey: string }) => c.cityKey === 'hannover');
    expect(city.workers).toBeGreaterThanOrEqual(2);
    expect(body.total).toBeGreaterThanOrEqual(2);
    // Counts only: no case or person data.
    expect(Object.keys(city).sort()).toEqual(['city', 'cityKey', 'computed', 'lat', 'lng', 'past', 'professions', 'source', 'workers']);
  });
});

describe('sales analytics: expected vs received', () => {
  it('adds the monthly plan with the previous period', async () => {
    const admin = await asAdmin();
    const body = expectStatus(await admin.agent.get('/api/admin/analytics/sales'), 200).body;
    expect(body.plan.months).toEqual(body.revenue.months);
    expect(body.plan.expected).toHaveLength(body.plan.months.length);
    expect(body.plan.received).toEqual(body.revenue.total);
    expect(body.plan.prevExpected).toHaveLength(body.plan.months.length);
  });
});

describe('GET /api/partner/dashboard: monthly trend', () => {
  it('counts only the partner’s own cases per month', async () => {
    const admin = await asAdmin();
    const u = await createUser({ role: 'AGENT', firstName: 'Trend', lastName: 'Partner' });
    const partner = await prisma.referralPartner.create({ data: { name: 'Trend Partner', userId: u.user.id } });
    const other = await prisma.referralPartner.create({ data: { name: 'Other Trend Partner' } });
    const mine = await asClient();
    const theirs = await asClient();
    const c1 = await createCaseVia(mine.agent);
    const c2 = await createCaseVia(theirs.agent);
    expectStatus(await admin.agent.patch('/api/admin/partners/assign').send({ caseIds: [c1.id], partnerId: partner.id }), 200);
    expectStatus(await admin.agent.patch('/api/admin/partners/assign').send({ caseIds: [c2.id], partnerId: other.id }), 200);
    const agent = sessionAgent(u.token);
    const d = expectStatus(await agent.get('/api/partner/dashboard'), 200).body;
    expect(d.trend.months).toHaveLength(12);
    expect(d.trend.cases.at(-1)).toBe(1);
    expect(d.trend.clients.at(-1)).toBe(1);
    expect(d.trend.approved.every((n: number) => n === 0)).toBe(true);
  });
});
