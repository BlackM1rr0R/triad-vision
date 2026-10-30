import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient } from '../helpers/factories';
import { expectStatus } from '../helpers/workflow';

// Server paging of the admin lists that used to cap at a fixed `take` (users 200, invoices 500, agents 500),
// plus the invoice CSV export with the list filters.

describe('GET /api/admin/users — paging, phone search, online filter', () => {
  it('pages with total / page / pageSize and keeps the users key', async () => {
    const { agent } = await asStaff();
    for (let i = 0; i < 4; i++) await createClient({ firstName: `Pager${i}`, email: `pager${i}@test.local` });
    const p1 = expectStatus(await agent.get('/api/admin/users').query({ role: 'CLIENT', pageSize: 3 }), 200).body;
    expect(p1).toMatchObject({ total: 4, page: 1, pageSize: 3 });
    expect(p1.users).toHaveLength(3);
    const p2 = expectStatus(await agent.get('/api/admin/users').query({ role: 'CLIENT', pageSize: 3, page: 2 }), 200).body;
    expect(p2.users).toHaveLength(1);
    const ids = new Set([...p1.users, ...p2.users].map((u: { id: string }) => u.id));
    expect(ids.size).toBe(4); // no overlap between pages
    expect((await agent.get('/api/admin/users').query({ pageSize: 500 })).status).toBe(400);
  });

  it('searches the phone and filters online accounts server-side', async () => {
    const su = await asSuperAdmin();
    const c = await createClient({ firstName: 'Telli', email: 'telli@test.local' });
    await prisma.user.update({ where: { id: c.user.id }, data: { phone: '+994551234567' } });
    const hit = expectStatus(await su.agent.get('/api/admin/users').query({ search: '5512345' }), 200).body;
    expect(hit.users.map((u: { id: string }) => u.id)).toEqual([c.user.id]);

    // The super admin has a live session (just logged in); the client's session is old → offline.
    await prisma.session.updateMany({ where: { userId: c.user.id }, data: { lastSeenAt: new Date(Date.now() - 60 * 60 * 1000) } });
    const online = expectStatus(await su.agent.get('/api/admin/users').query({ online: '1' }), 200).body;
    const onlineIds = online.users.map((u: { id: string }) => u.id);
    expect(onlineIds).toContain(su.user.id);
    expect(onlineIds).not.toContain(c.user.id);
    expect(online.onlineCount).toBe(online.total);
  });
});

describe('GET /api/admin/invoices — paging and CSV export', () => {
  const cleanup = async () => {
    await prisma.invoice.deleteMany();
    await prisma.company.deleteMany();
  };
  beforeEach(cleanup);
  afterAll(cleanup);
  const year = new Date().getUTCFullYear();

  it('pages the list; totals stay global; CSV follows the filters and is audited', async () => {
    const admin = await asAdmin();
    const a = await prisma.company.create({ data: { name: 'Alpha Pflege GmbH', email: 'a@alpha.test', status: 'ACTIVE' } });
    const b = await prisma.company.create({ data: { name: 'Beta Bau; "Nord"', email: 'b@beta.test', status: 'ACTIVE' } });
    for (const [c, day] of [[a, 10], [a, 11], [b, 12]] as const) {
      expectStatus(
        await admin.agent.post('/api/admin/invoices').send({ companyId: c.id, issueDate: `${year}-03-${day}`, items: [{ description: 'Vermittlung', quantity: 1, unitPriceCents: 100000 }] }),
        201,
      );
    }
    const p1 = expectStatus(await admin.agent.get('/api/admin/invoices').query({ pageSize: 2 }), 200).body;
    expect(p1).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(p1.invoices).toHaveLength(2);
    expect(p1.totals.draftCount).toBe(3);
    expect(p1.invoices[0].company.name).toBe('Beta Bau; "Nord"'); // newest issue date first
    const p2 = expectStatus(await admin.agent.get('/api/admin/invoices').query({ pageSize: 2, page: 2 }), 200).body;
    expect(p2.invoices).toHaveLength(1);
    expect(expectStatus(await admin.agent.get('/api/admin/invoices').query({ companyId: a.id }), 200).body.total).toBe(2);

    const csv = await admin.agent.get('/api/admin/invoices/export.csv').query({ companyId: b.id }).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toMatch(/attachment; filename="invoices-\d{4}-\d{2}-\d{2}\.csv"/);
    const lines = csv.text.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toBe('number;status;company;vatId;issueDate;dueDate;currency;net;vat;gross;sentAt;paidAt');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('DRAFT;"Beta Bau; ""Nord"""');
    expect(lines[1]).toContain(`${year}-03-12`);
    expect(await prisma.auditLog.count({ where: { action: 'INVOICES_EXPORTED' } })).toBe(1);

    const staff = await asStaff();
    expect((await staff.agent.get('/api/admin/invoices/export.csv')).status).toBe(403);
  });
});

describe('GET /api/admin/agents — paging', () => {
  it('pages the agents with a total over the filter', async () => {
    const admin = await asAdmin();
    for (const n of ['Bir', 'Iki', 'Uc']) {
      expectStatus(await admin.agent.post('/api/admin/agents').send({ firstName: n, lastName: 'Agent', email: `${n.toLowerCase()}.pager@example.com` }), 201);
    }
    const p1 = expectStatus(await admin.agent.get('/api/admin/agents').query({ pageSize: 2 }), 200).body;
    expect(p1).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(p1.items).toHaveLength(2);
    expect(p1.counts.ACTIVE).toBe(3);
    const p2 = expectStatus(await admin.agent.get('/api/admin/agents').query({ pageSize: 2, page: 2 }), 200).body;
    expect(p2.items).toHaveLength(1);
    expect(expectStatus(await admin.agent.get('/api/admin/agents').query({ search: 'iki.pager' }), 200).body.total).toBe(1);
  });
});
