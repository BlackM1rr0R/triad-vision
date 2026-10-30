import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient, createStaff, TEST_PASSWORD } from '../helpers/factories';
import { PNG_BUFFER } from '../helpers/files';
import { createCaseVia, driveCaseTo } from '../helpers/workflow';

type Call = [method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, body?: object];

const staffAllowed: Call[] = [
  ['get', '/api/admin/dashboard'],
  ['get', '/api/admin/cases'],
  ['get', '/api/admin/inquiries'],
  ['get', '/api/admin/users'],
  ['get', '/api/admin/users/staff'],
];
const adminOnly: Call[] = [
  ['get', '/api/admin/content/services'],
  ['post', '/api/admin/content/services', {}],
  ['put', '/api/admin/content/services/x', {}],
  ['delete', '/api/admin/content/services/x'],
  ['get', '/api/admin/settings'],
  ['put', '/api/admin/settings/contact', { value: 1 }],
  ['post', '/api/admin/upload'],
  ['post', '/api/admin/users', {}],
  ['patch', '/api/admin/users/x', {}],
];

describe('admin API authorization', () => {
  it('anonymous users get 401 everywhere', async () => {
    for (const [method, url, body] of [...staffAllowed, ...adminOnly]) {
      const res = await anon()[method](url).send(body);
      expect(res.status, `${method} ${url}`).toBe(401);
    }
  });

  it('clients get 403 everywhere', async () => {
    const { agent } = await asClient();
    for (const [method, url, body] of [...staffAllowed, ...adminOnly, ['get', '/api/admin/cases/x'] as Call]) {
      const res = await agent[method](url).send(body);
      expect(res.status, `${method} ${url}`).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    }
  });

  it('staff can work cases, inquiries and see users but not content, settings, uploads or user management', async () => {
    const { agent } = await asStaff();
    for (const [method, url] of staffAllowed) {
      expect((await agent[method](url)).status, `${method} ${url}`).toBe(200);
    }
    for (const [method, url, body] of adminOnly) {
      const res = await agent[method](url).send(body);
      expect(res.status, `${method} ${url}`).toBe(403);
    }
    const upload = await agent.post('/api/admin/upload').attach('file', PNG_BUFFER, { filename: 'x.png', contentType: 'image/png' });
    expect(upload.status).toBe(403);
  });

  it('a deactivated admin is locked out', async () => {
    const { agent, user } = await asAdmin();
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect((await agent.get('/api/admin/dashboard')).status).toBe(401);
  });
});

describe('GET /api/admin/dashboard', () => {
  it('summarises cases, inquiries, new clients, recent events and cases waiting for staff', async () => {
    const admin = await asAdmin();
    const c1 = await asClient();
    const c2 = await asClient();
    const c3 = await asClient();
    await createClient(); // a client without a case still counts as new
    const old = await createClient();
    await prisma.user.update({ where: { id: old.user.id }, data: { createdAt: new Date('2020-01-01') } });

    const review = await driveCaseTo('DOCUMENTS_REVIEW', { client: c1.agent, admin: admin.agent });
    await createCaseVia(c2.agent);
    await driveCaseTo('CANCELLED', { client: c3.agent, admin: admin.agent });
    await prisma.inquiry.createMany({
      data: [
        { kind: 'contact', contactName: 'A', email: 'a@test.local', message: 'hello', locale: 'az' },
        { kind: 'contact', contactName: 'B', email: 'b@test.local', message: 'hello', locale: 'az', status: 'DONE' },
      ],
    });

    const res = await admin.agent.get('/api/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({ DOCUMENTS_REVIEW: 1, DOCUMENTS_PENDING: 1, CANCELLED: 1 });
    expect(res.body.newInquiries).toBe(1);
    expect(res.body.newClients30d).toBe(4);
    expect(res.body.waiting.map((c: { id: string }) => c.id)).toEqual([review.id]);
    expect(res.body.waiting[0].client).toEqual({ firstName: 'Test', lastName: 'User' });
    expect(res.body.recentEvents.length).toBeGreaterThan(0);
    expect(res.body.recentEvents.length).toBeLessThanOrEqual(15);
    expect(res.body.recentEvents[0]).toMatchObject({ case: { id: expect.any(String), number: expect.any(String) } });
  });
});

describe('/api/admin/inquiries', () => {
  it('lists newest first and updates the status', async () => {
    const { agent } = await asStaff();
    const older = await prisma.inquiry.create({
      data: { kind: 'contact', contactName: 'Old', email: 'o@test.local', message: 'hello', locale: 'az', createdAt: new Date('2026-01-01') },
    });
    const newer = await prisma.inquiry.create({
      data: { kind: 'company', companyName: 'GmbH', contactName: 'New', email: 'n@test.local', message: 'hello', locale: 'de' },
    });
    const list = await agent.get('/api/admin/inquiries');
    expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([newer.id, older.id]);

    const res = await agent.patch(`/api/admin/inquiries/${older.id}`).send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe('IN_PROGRESS');
    expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: older.id } })).status).toBe('IN_PROGRESS');
    // The change is in the audit log.
    expect(await prisma.auditLog.findFirst({ where: { action: 'INQUIRY_STATUS_CHANGED', target: older.id } })).toMatchObject({ details: { status: 'IN_PROGRESS' } });
  });

  it('validates the status and 404s unknown inquiries', async () => {
    const { agent } = await asAdmin();
    const i = await prisma.inquiry.create({ data: { kind: 'contact', contactName: 'X', email: 'x@test.local', message: 'hello', locale: 'az' } });
    expect((await agent.patch(`/api/admin/inquiries/${i.id}`).send({ status: 'SPAM' })).status).toBe(400);
    const missing = await agent.patch('/api/admin/inquiries/nope').send({ status: 'DONE' });
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('NOT_FOUND');
  });
});

describe('/api/admin/users', () => {
  it('lists users with role filter, search and case counts, never exposing password hashes', async () => {
    const { agent } = await asStaff({ firstName: 'Staffer' });
    const ali = await asClient({ firstName: 'Əli', lastName: 'Həsənov', email: 'ali@test.local' });
    await createClient({ firstName: 'Ivan', lastName: 'Petrov', email: 'ivan@test.local' });
    await createCaseVia(ali.agent);

    const all = await agent.get('/api/admin/users');
    expect(all.status).toBe(200);
    expect(all.body.users).toHaveLength(3);
    expect(all.body.users.every((u: object) => !('passwordHash' in u))).toBe(true);

    const clients = await agent.get('/api/admin/users?role=CLIENT');
    expect(clients.body.users).toHaveLength(2);

    const search = await agent.get(`/api/admin/users?search=${encodeURIComponent('həsən')}`);
    expect(search.body.users.map((u: { email: string }) => u.email)).toEqual(['ali@test.local']);
    expect(search.body.users[0]._count).toEqual({ cases: 1, assignedCases: 0, docFiles: 0, messages: 0 });
    expect((await agent.get('/api/admin/users?search=IVAN@')).body.users).toHaveLength(1);
    expect((await agent.get('/api/admin/users?role=GOD')).status).toBe(400);
  });

  it('GET /staff lists active staff and admins only', async () => {
    const admin = await asAdmin({ firstName: 'Zaur' });
    const staff = await createStaff({ firstName: 'Aynur' });
    await createStaff({ firstName: 'Gone', isActive: false });
    await createClient();
    const res = await admin.agent.get('/api/admin/users/staff');
    expect(res.body.staff).toEqual([
      { id: staff.user.id, firstName: 'Aynur', lastName: 'User', role: 'STAFF' },
      { id: admin.user.id, firstName: 'Zaur', lastName: 'User', role: 'ADMIN' },
    ]);
  });

  it('the super admin creates staff accounts that can log in', async () => {
    const { agent } = await asSuperAdmin();
    const res = await agent
      .post('/api/admin/users')
      .send({ email: ' New.Staff@Test.local ', password: 'StaffPass123', firstName: 'Nigar', lastName: 'Əliyeva', role: 'STAFF' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'new.staff@test.local', role: 'STAFF', isActive: true, _count: { cases: 0 } });
    expect(res.body.user.passwordHash).toBeUndefined();

    const login = await anon().post('/api/auth/login').send({ email: 'new.staff@test.local', password: 'StaffPass123' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('STAFF');
  });

  it('refuses duplicates and invalid input', async () => {
    const { agent } = await asSuperAdmin();
    await createClient({ email: 'dupe@test.local' });
    const dup = await agent.post('/api/admin/users').send({ email: 'DUPE@test.local', password: 'StaffPass123', firstName: 'A', lastName: 'B', role: 'STAFF' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('EMAIL_TAKEN');

    for (const body of [
      { email: 'x@test.local', password: 'StaffPass123', firstName: 'A', lastName: 'B', role: 'CLIENT' },
      { email: 'x@test.local', password: 'short', firstName: 'A', lastName: 'B', role: 'STAFF' },
      { email: 'not-email', password: 'StaffPass123', firstName: 'A', lastName: 'B', role: 'STAFF' },
    ]) {
      const res = await agent.post('/api/admin/users').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION');
    }
  });

  it('PATCH changes role, deactivates and resets passwords', async () => {
    const { agent } = await asSuperAdmin();
    const target = await asClient({ email: 'target@test.local' });

    const promoted = await agent.patch(`/api/admin/users/${target.user.id}`).send({ role: 'STAFF' });
    expect(promoted.status).toBe(200);
    expect(promoted.body.user.role).toBe('STAFF');
    // New staff must enroll in 2FA before the admin API opens up.
    expect((await target.agent.get('/api/admin/cases')).body.error).toBe('TWO_FACTOR_ENROLLMENT_REQUIRED');
    await prisma.user.update({ where: { id: target.user.id }, data: { totpEnabledAt: new Date() } });
    expect((await target.agent.get('/api/admin/cases')).status).toBe(200);

    expect((await agent.patch(`/api/admin/users/${target.user.id}`).send({ password: 'ResetPass999' })).status).toBe(200);
    expect((await anon().post('/api/auth/login').send({ email: 'target@test.local', password: TEST_PASSWORD })).status).toBe(401);
    expect((await anon().post('/api/auth/login').send({ email: 'target@test.local', password: 'ResetPass999' })).status).toBe(200);

    const off = await agent.patch(`/api/admin/users/${target.user.id}`).send({ isActive: false });
    expect(off.body.user.isActive).toBe(false);
    expect((await target.agent.get('/api/admin/cases')).status).toBe(401);
  });

  it('the super admin cannot demote or deactivate themselves', async () => {
    const me = await asSuperAdmin();
    for (const body of [{ role: 'STAFF' }, { isActive: false }]) {
      const res = await me.agent.patch(`/api/admin/users/${me.user.id}`).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('CANNOT_CHANGE_SELF');
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.user.id } })).role).toBe('SUPER_ADMIN');
    // changing their own password is fine
    expect((await me.agent.patch(`/api/admin/users/${me.user.id}`).send({ password: 'MyNewPass123' })).status).toBe(200);
  });

  it('PATCH validates input and 404s unknown users', async () => {
    const { agent } = await asSuperAdmin();
    const u = await createClient();
    expect((await agent.patch(`/api/admin/users/${u.user.id}`).send({ role: 'ROOT' })).status).toBe(400);
    expect((await agent.patch('/api/admin/users/nope').send({ isActive: true })).status).toBe(404);
  });
});
