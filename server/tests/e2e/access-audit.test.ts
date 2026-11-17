import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createCaseVia, expectStatus } from '../helpers/workflow';
import { runAccessAnomalies } from '../../src/lib/accessAudit/anomalies';
import { invalidateAccess } from '../../src/lib/access/store';

/**
 * Access Center › Audit + the list / aggregate endpoints that follow the staff case scope (lib/accessAudit).
 * Default scope ALL = every row, exactly as before; ASSIGNED = only the user's cases.
 */

const clientWithCase = async (lastName: string, assignedStaffId?: string) => {
  const client = await asClient({ lastName });
  const c = await createCaseVia(client.agent);
  // in the team workflow, so the case-processing board lists it
  await prisma.case.update({ where: { id: c.id }, data: { processingStage: 'IN_PROGRESS', processingStageAt: new Date(), ...(assignedStaffId ? { assignedStaffId } : {}) } });
  return { client, c };
};

const setScope = async (sup: Agent, userId: string, caseScope: 'ALL' | 'ASSIGNED' | 'TEAM') => {
  expectStatus(await sup.put(`/api/admin/access/scope/users/${userId}`).send({ caseScope }), 200);
  invalidateAccess(userId);
};

/** Lists that must contain only in-scope cases (JSON body checked for the case ids / numbers). */
const LISTS = [
  '/api/admin/ops/kanban',
  '/api/admin/data-quality',
  '/api/admin/case-processing/board',
  '/api/admin/profitability',
  '/api/admin/users?role=CLIENT',
];

describe('case-scoped lists and aggregates', () => {
  it('ALL scope (default): every case on every fixed list, as before', async () => {
    const admin = await asAdmin();
    const a = await clientWithCase('Auditall1', admin.user.id);
    const b = await clientWithCase('Auditall2');
    for (const url of LISTS) {
      const body = JSON.stringify(expectStatus(await admin.agent.get(url), 200).body);
      expect(body.includes(a.c.id) || body.includes(a.client.user.id), url).toBe(true);
      expect(body.includes(b.c.id) || body.includes(b.client.user.id), url).toBe(true);
    }
    const wl = expectStatus(await admin.agent.get('/api/admin/ops/workload'), 200).body;
    expect(wl.unassigned).toBeGreaterThanOrEqual(1);
  });

  it('ASSIGNED: only in-scope rows on each fixed list, aggregates over in-scope cases', async () => {
    const sup = await asSuperAdmin();
    const admin = await asAdmin();
    const mine = await clientWithCase('Auditmine', admin.user.id);
    const other = await clientWithCase('Auditother');
    const appt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    await prisma.case.updateMany({ where: { id: { in: [mine.c.id, other.c.id] } }, data: { appointmentAt: appt, appointmentPlace: 'Baku embassy' } });
    await setScope(sup.agent, admin.user.id, 'ASSIGNED');

    for (const url of LISTS) {
      const body = JSON.stringify(expectStatus(await admin.agent.get(url), 200).body);
      expect(body.includes(mine.c.id) || body.includes(mine.client.user.id), url).toBe(true);
      expect(body.includes(other.c.id), url).toBe(false);
      expect(body.includes(other.client.user.id), url).toBe(false);
    }
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const cal = expectStatus(await admin.agent.get(`/api/admin/ops-calendar?from=${from}&to=${to}&types=embassy`), 200).body;
    expect(cal.items.map((i: { caseId: string }) => i.caseId)).toEqual([mine.c.id]);

    const wl = expectStatus(await admin.agent.get('/api/admin/ops/workload'), 200).body;
    expect(wl.unassigned).toBe(0); // the unassigned case is out of scope

    const rep = expectStatus(await admin.agent.post('/api/admin/reports/preview').send({ dataset: 'cases', config: {} }), 200).body;
    expect(rep.total).toBe(1);
    expect(JSON.stringify(rep.rows)).toContain(mine.c.number);

    // revenue that cannot be split by case: closed for a restricted scope
    expect((await admin.agent.get('/api/admin/analytics/sales')).status).toBe(403);
    // back to ALL: everything again
    await setScope(sup.agent, admin.user.id, 'ALL');
    expect(JSON.stringify(expectStatus(await admin.agent.get('/api/admin/ops/kanban'), 200).body)).toContain(other.c.id);
    expect((await admin.agent.get('/api/admin/analytics/sales')).status).toBe(200);
  });
});

describe('who can see what', () => {
  it('matrix, scope with visible case count, reverse view; manage access required', async () => {
    const sup = await asSuperAdmin();
    const staff = await asStaff();
    const admin = await asAdmin();
    const mine = await clientWithCase('Whomine', staff.user.id);
    await clientWithCase('Whoother');
    await setScope(sup.agent, staff.user.id, 'ASSIGNED');

    expect((await staff.agent.get('/api/admin/access/audit/users')).status).toBe(403);
    expect((await admin.agent.get('/api/admin/access/audit/users')).status).toBe(403);

    const rows = expectStatus(await sup.agent.get('/api/admin/access/audit/users?kind=STAFF'), 200).body.rows as {
      userId: string;
      staff: { caseScope: string; visibleCases: number; matrix: Record<string, string[]>; templateKey: string; superAdmin: boolean };
      reasons: string[];
    }[];
    const s = rows.find((r) => r.userId === staff.user.id)!;
    expect(s.staff).toMatchObject({ caseScope: 'ASSIGNED', visibleCases: 1, templateKey: 'legacy_staff', superAdmin: false });
    expect(s.staff.matrix.cases).toEqual(['view', 'edit', 'delete', 'export']);
    expect(s.reasons).not.toContain('SCOPE_ALL');
    const a = rows.find((r) => r.userId === admin.user.id)!;
    expect(a.staff.caseScope).toBe('ALL');
    expect(a.reasons).toContain('SCOPE_ALL');
    expect(rows.find((r) => r.userId === sup.user.id)!.reasons).toEqual(['SUPER_ADMIN']);

    const who = expectStatus(await sup.agent.get(`/api/admin/access/audit/case-access/${mine.c.id}`), 200).body;
    const via = Object.fromEntries((who.staff as { userId: string; via: string }[]).map((x) => [x.userId, x.via]));
    expect(via[staff.user.id]).toBe('ASSIGNED');
    expect(via[admin.user.id]).toBe('SCOPE_ALL');
    expect(via[sup.user.id]).toBe('SUPER_ADMIN');
    const otherCase = await clientWithCase('Whoother2');
    const who2 = expectStatus(await sup.agent.get(`/api/admin/access/audit/case-access/${otherCase.c.id}`), 200).body;
    expect((who2.staff as { userId: string }[]).map((x) => x.userId)).not.toContain(staff.user.id);

    const csv = expectStatus(await sup.agent.get('/api/admin/access/audit/users.csv?kind=STAFF'), 200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain(staff.user.email);
    expect(await prisma.auditLog.count({ where: { action: 'ACCESS_AUDIT_EXPORTED' } })).toBe(1);
  });
});

describe('quarterly access review', () => {
  it('creates one review per quarter, items confirmable, completion recorded', async () => {
    const sup = await asSuperAdmin();
    const staff = await asStaff();
    const first = expectStatus(await sup.agent.post('/api/admin/access/audit/reviews'), 201).body;
    expect(first.created).toBe(true);
    const again = expectStatus(await sup.agent.post('/api/admin/access/audit/reviews'), 200).body;
    expect(again.created).toBe(false);
    expect(await prisma.accessReview.count()).toBe(1);

    const detail = expectStatus(await sup.agent.get(`/api/admin/access/audit/reviews/${first.review.id}`), 200).body.review;
    const item = (detail.items as { id: string; userId: string; reasons: string[] }[]).find((i) => i.userId === staff.user.id)!;
    expect(item.reasons).toContain('SCOPE_ALL');
    expect((await sup.agent.post(`/api/admin/access/audit/reviews/${first.review.id}/complete`)).status).toBe(409);
    for (const i of detail.items as { id: string }[]) expectStatus(await sup.agent.post(`/api/admin/access/audit/reviews/items/${i.id}`).send({ status: 'CONFIRMED' }), 200);
    const done = expectStatus(await sup.agent.post(`/api/admin/access/audit/reviews/${first.review.id}/complete`), 200).body.review;
    expect(done.completedAt).toBeTruthy();
    expect(await prisma.auditLog.count({ where: { action: 'ACCESS_REVIEW_COMPLETED' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: sup.user.id, type: 'ACCESS_REVIEW' } })).toBe(1);
  });
});

describe('anomaly alerts', () => {
  it('thresholds are editable and a crossing raises one alert for admins', async () => {
    const sup = await asSuperAdmin();
    const staff = await asStaff();
    const res = expectStatus(await sup.agent.put('/api/admin/access/audit/anomalies/settings').send({ manyReveals: { threshold: 2 } }), 200).body;
    expect(res.settings.manyReveals).toEqual({ enabled: true, threshold: 2 });
    expect(await prisma.auditLog.count({ where: { action: 'ACCESS_ANOMALY_SETTINGS_CHANGED' } })).toBe(1);

    const reveal = () => prisma.auditLog.create({ data: { action: 'SENSITIVE_REVEALED', actorId: staff.user.id, target: 'user:x', details: {} } });
    await reveal();
    await reveal();
    expect((await runAccessAnomalies()).created).toBe(0); // 2 = not more than the limit
    await reveal();
    expect((await runAccessAnomalies()).created).toBe(1);
    expect((await runAccessAnomalies()).created).toBe(0); // same events: no second alert
    const alert = await prisma.securityAlert.findFirst({ where: { rule: 'accessManyReveals' } });
    expect(alert?.userId).toBe(staff.user.id);
    expect(await prisma.notification.count({ where: { userId: sup.user.id, type: 'SECURITY_ALERT', link: `/admin/security-alerts?id=${alert!.id}` } })).toBe(1);
    const list = expectStatus(await sup.agent.get('/api/admin/access/audit/anomalies'), 200).body;
    expect(list.alerts).toHaveLength(1);
    expect(list.alerts[0].title).toBeTruthy();
  });
});

describe('user deletion cleanup', () => {
  it('removes the access rows of a deleted staff account', async () => {
    const sup = await asSuperAdmin();
    const staff = await asStaff();
    await setScope(sup.agent, staff.user.id, 'ASSIGNED');
    await prisma.staffRecordAccess.create({ data: { userId: staff.user.id, record: 'case:x', hour: new Date() } });
    expect(await prisma.staffAccess.count({ where: { userId: staff.user.id } })).toBe(1);
    expectStatus(await sup.agent.delete(`/api/admin/users/${staff.user.id}`).send({ confirmEmail: staff.user.email }), 200);
    expect(await prisma.staffAccess.count({ where: { userId: staff.user.id } })).toBe(0);
    expect(await prisma.staffRecordAccess.count({ where: { userId: staff.user.id } })).toBe(0);
  });
});
