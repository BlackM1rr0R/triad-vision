import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';
import { pruneAdminPageVisits, usageReport, visitDay } from '../../src/lib/navModules.js';

const DAY = 86_400_000;

describe('GET/PUT /api/admin/me/nav', () => {
  it('needs a staff session; the default desk follows the role', async () => {
    expect((await anon().get('/api/admin/me/nav')).status).toBe(401);
    const client = await asClient();
    expect((await client.agent.get('/api/admin/me/nav')).status).toBe(403);

    const staff = await asStaff();
    const s = expectStatus(await staff.agent.get('/api/admin/me/nav'), 200).body;
    expect(s).toMatchObject({ desk: 'MANAGER', defaultDesk: 'MANAGER', pins: [], recent: [] });
    expect(s.modules).toMatchObject({ campaigns: true, liveChat: true, calls: true });

    const admin = await asAdmin();
    expect(expectStatus(await admin.agent.get('/api/admin/me/nav'), 200).body).toMatchObject({ desk: 'ALL', defaultDesk: 'ALL' });
  });

  it('saves the own desk and favourites (deduplicated, invalid ids rejected)', async () => {
    const staff = await asStaff();
    const saved = expectStatus(await staff.agent.put('/api/admin/me/nav').send({ desk: 'FINANCE', pins: ['cases', 'invoices', 'cases', 'hub.finance'] }), 200).body;
    expect(saved).toMatchObject({ desk: 'FINANCE', defaultDesk: 'MANAGER', pins: ['cases', 'invoices', 'hub.finance'] });
    expect((await staff.agent.put('/api/admin/me/nav').send({ desk: 'BOSS' })).status).toBe(400);
    expect((await staff.agent.put('/api/admin/me/nav').send({ pins: ['../etc'] })).status).toBe(400);
    // null = back to the role default
    expect(expectStatus(await staff.agent.put('/api/admin/me/nav').send({ desk: null }), 200).body.desk).toBe('MANAGER');
    expect(expectStatus(await staff.agent.get('/api/admin/me/nav'), 200).body.pins).toEqual(['cases', 'invoices', 'hub.finance']);
  });

  it('records page opens per user and day and keeps the recent list', async () => {
    const staff = await asStaff();
    expectStatus(await staff.agent.post('/api/admin/me/nav/visit').send({ navId: 'cases' }), 200);
    expectStatus(await staff.agent.post('/api/admin/me/nav/visit').send({ navId: 'invoices' }), 200);
    const last = expectStatus(await staff.agent.post('/api/admin/me/nav/visit').send({ navId: 'cases' }), 200).body;
    expect(last.recent.map((r: { id: string }) => r.id)).toEqual(['cases', 'invoices']);
    expect((await staff.agent.post('/api/admin/me/nav/visit').send({ navId: '' })).status).toBe(400);

    const rows = await prisma.adminPageVisit.findMany({ where: { userId: staff.user.id }, orderBy: { navId: 'asc' } });
    expect(rows.map((r) => [r.navId, r.count])).toEqual([
      ['cases', 2],
      ['invoices', 1],
    ]);
    expect(expectStatus(await staff.agent.get('/api/admin/me/nav'), 200).body.recent.map((r: { id: string }) => r.id)).toEqual(['cases', 'invoices']);
  });
});

describe('desks of other staff (ADMIN+)', () => {
  it('lists staff and sets a desk; STAFF cannot', async () => {
    const staff = await asStaff();
    expect((await staff.agent.get('/api/admin/nav/desks')).status).toBe(403);
    expect((await staff.agent.put(`/api/admin/nav/desks/${staff.user.id}`).send({ desk: 'ALL' })).status).toBe(403);

    const admin = await asAdmin();
    expectStatus(await admin.agent.put(`/api/admin/nav/desks/${staff.user.id}`).send({ desk: 'MARKETING' }), 200);
    const list = expectStatus(await admin.agent.get('/api/admin/nav/desks'), 200).body.items;
    expect(list).toContainEqual(expect.objectContaining({ id: staff.user.id, desk: 'MARKETING', defaultDesk: 'MANAGER' }));
    expect(expectStatus(await staff.agent.get('/api/admin/me/nav'), 200).body.desk).toBe('MARKETING');

    const client = await asClient();
    expect((await admin.agent.put(`/api/admin/nav/desks/${client.user.id}`).send({ desk: 'ALL' })).status).toBe(404);
  });
});

describe('module toggles (SUPER_ADMIN)', () => {
  it('only a super admin switches modules; everyone sees the result; the generic settings route refuses the key', async () => {
    const admin = await asAdmin();
    expect((await admin.agent.put('/api/admin/nav/modules').send({ modules: { campaigns: false } })).status).toBe(403);
    expect((await admin.agent.put('/api/admin/settings/modules').send({ value: { campaigns: false } })).status).toBe(403);

    const sa = await asSuperAdmin();
    expect((await sa.agent.put('/api/admin/nav/modules').send({ modules: { nope: false } })).status).toBe(400);
    const body = expectStatus(await sa.agent.put('/api/admin/nav/modules').send({ modules: { campaigns: false, calls: false } }), 200).body;
    expect(body.modules).toMatchObject({ campaigns: false, calls: false, liveChat: true });

    const staff = await asStaff();
    expect(expectStatus(await staff.agent.get('/api/admin/me/nav'), 200).body.modules).toMatchObject({ campaigns: false, calls: false, liveChat: true });
    // Server endpoints keep working while the module is hidden.
    expect((await admin.agent.get('/api/admin/campaigns')).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'MODULES_UPDATED' } })).toBe(1);
  });
});

describe('page usage report (SUPER_ADMIN)', () => {
  it('sums opens, counts users and the last day; only super admins may read it', async () => {
    const a = await asStaff();
    const b = await asStaff();
    const today = visitDay();
    await prisma.adminPageVisit.createMany({
      data: [
        { userId: a.user.id, navId: 'cases', day: today, count: 3 },
        { userId: b.user.id, navId: 'cases', day: new Date(today.getTime() - 2 * DAY), count: 2 },
        { userId: a.user.id, navId: 'kpi', day: new Date(today.getTime() - 20 * DAY), count: 1 },
        { userId: a.user.id, navId: 'old', day: new Date(today.getTime() - 500 * DAY), count: 9 },
      ],
    });
    const admin = await asAdmin();
    expect((await admin.agent.get('/api/admin/nav/usage')).status).toBe(403);
    const sa = await asSuperAdmin();
    const week = expectStatus(await sa.agent.get('/api/admin/nav/usage').query({ days: '7' }), 200).body;
    expect(week.items).toContainEqual({ navId: 'cases', opens: 5, users: 2, lastDay: today.toISOString().slice(0, 10) });
    expect(week.items).toContainEqual(expect.objectContaining({ navId: 'kpi', opens: 0, users: 0 }));
    expect((await sa.agent.get('/api/admin/nav/usage').query({ days: '5' })).status).toBe(400);
    const month = await usageReport(30);
    expect(month.items.find((i) => i.navId === 'kpi')).toMatchObject({ opens: 1, users: 1 });

    expect(await pruneAdminPageVisits()).toBe(1);
    expect(await prisma.adminPageVisit.count({ where: { navId: 'old' } })).toBe(0);
  });
});

describe('GET /api/admin/check-ins/cases/:caseId', () => {
  it('returns null for a case without a follow-up', async () => {
    const staff = await asStaff();
    expect(expectStatus(await staff.agent.get('/api/admin/check-ins/cases/nope'), 200).body).toEqual({ followUp: null });
  });
});
