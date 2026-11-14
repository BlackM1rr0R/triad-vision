import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin, sessionAgent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createUser } from '../helpers/factories';
import { expectStatus } from '../helpers/workflow';

// Phone numbers typed into the profile and the staff forms are normalised with the shared rules
// (src/lib/phone.ts) and refused with 400 INVALID_PHONE when they cannot be read. A legacy value that
// is sent back unchanged keeps working.

const phoneOf = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id }, select: { phone: true } })).phone;

describe('PATCH /api/auth/me — phone', () => {
  it('normalises Azerbaijani local and international numbers for a candidate', async () => {
    const c = await asClient();
    expect(expectStatus(await c.agent.patch('/api/auth/me').send({ phone: '050 123 45 67' }), 200).body.user.phone).toBe('+994501234567');
    expect(expectStatus(await c.agent.patch('/api/auth/me').send({ phone: '0049 (0) 151 1234-5678' }), 200).body.user.phone).toBe('+4915112345678');
    expect(await phoneOf(c.user.id)).toBe('+4915112345678');
    expect(expectStatus(await c.agent.patch('/api/auth/me').send({ phone: '' }), 200).body.user.phone).toBeNull();
  });

  it('refuses numbers it cannot read and leaves the stored one alone', async () => {
    const c = await asClient({ phone: '+994501234567' });
    for (const phone of ['call me', '0151 12345678', '+994 123', '12345']) {
      const res = expectStatus(await c.agent.patch('/api/auth/me').send({ phone }), 400);
      expect(res.body.error).toBe('INVALID_PHONE');
    }
    expect(await phoneOf(c.user.id)).toBe('+994501234567');
  });

  it('reads a German local number on an employer account', async () => {
    const u = await createUser({ role: 'COMPANY', locale: 'de' });
    const res = expectStatus(await sessionAgent(u.token).patch('/api/auth/me').send({ phone: '0151 12345678' }), 200);
    expect(res.body.user.phone).toBe('+4915112345678');
  });

  it('keeps saving a profile whose legacy phone the normaliser cannot read, as long as it is unchanged', async () => {
    const c = await asClient({ phone: 'WhatsApp: ask office' });
    const res = expectStatus(await c.agent.patch('/api/auth/me').send({ firstName: 'Aysel', phone: 'WhatsApp: ask office', city: 'Bakı' }), 200);
    expect(res.body.user).toMatchObject({ firstName: 'Aysel', phone: 'WhatsApp: ask office', city: 'Bakı' });
    // Saving without the phone field also leaves it as it is.
    expectStatus(await c.agent.patch('/api/auth/me').send({ lastName: 'Quliyeva' }), 200);
    expect(await phoneOf(c.user.id)).toBe('WhatsApp: ask office');
    // Editing it means the new value must be readable.
    expect(expectStatus(await c.agent.patch('/api/auth/me').send({ phone: 'WhatsApp: ask office!' }), 400).body.error).toBe('INVALID_PHONE');
    expect(expectStatus(await c.agent.patch('/api/auth/me').send({ phone: '055 555 55 55' }), 200).body.user.phone).toBe('+994555555555');
  });
});

describe('staff forms — phone', () => {
  it('normalises and validates the phone of a new staff account', async () => {
    const { agent } = await asSuperAdmin();
    const base = { password: 'StaffPass123', firstName: 'Nigar', lastName: 'Əliyeva', role: 'STAFF' };
    const ok = expectStatus(await agent.post('/api/admin/users').send({ ...base, email: 'p1@test.local', phone: '012 555 12 34' }), 201);
    expect(ok.body.user.phone).toBe('+994125551234');
    expect(expectStatus(await agent.post('/api/admin/users').send({ ...base, email: 'p2@test.local', phone: '0151 12345678' }), 400).body.error).toBe('INVALID_PHONE');
    expect(await prisma.user.count({ where: { email: 'p2@test.local' } })).toBe(0);
  });

  it('normalises agent phones and keeps an unchanged legacy one on update', async () => {
    const admin = await asAdmin();
    const res = expectStatus(await admin.agent.post('/api/admin/agents').send({ firstName: 'Əli', lastName: 'Həsənov', email: 'ali.phone@example.com', phone: '070 111 22 33' }), 201);
    const agentId = res.body.agent.id as string;
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: 'ali.phone@example.com' } })).id;
    expect(await phoneOf(userId)).toBe('+994701112233');
    expect(expectStatus(await admin.agent.post('/api/admin/agents').send({ firstName: 'X', lastName: 'Y', email: 'x.phone@example.com', phone: 'abc' }), 400).body.error).toBe('INVALID_PHONE');

    await prisma.user.update({ where: { id: userId }, data: { phone: 'old: 50-1' } });
    expectStatus(await admin.agent.patch(`/api/admin/agents/${agentId}`).send({ region: 'Gəncə', phone: 'old: 50-1' }), 200);
    expect(await phoneOf(userId)).toBe('old: 50-1');
    expect(expectStatus(await admin.agent.patch(`/api/admin/agents/${agentId}`).send({ phone: 'old: 50-2' }), 400).body.error).toBe('INVALID_PHONE');
    expectStatus(await admin.agent.patch(`/api/admin/agents/${agentId}`).send({ phone: '+994 99 123 45 67' }), 200);
    expect(await phoneOf(userId)).toBe('+994991234567');
  });

  it('reads company phones as German numbers', async () => {
    const { agent } = await asStaff();
    const res = expectStatus(await agent.post('/api/admin/companies').send({ company: { name: 'West Pflege GmbH', sector: 'healthcare', city: 'Köln', phone: '0221 123456' } }), 201);
    expect(res.body.company.phone).toBe('+49221123456');
    const id = res.body.company.id as string;
    await prisma.company.update({ where: { id }, data: { phone: 'Zentrale 0221' } });
    // Unchanged legacy value: saving other fields still works.
    expectStatus(await agent.patch(`/api/admin/companies/${id}`).send({ phone: 'Zentrale 0221', note: 'x' }), 200);
    expect((await prisma.company.findUniqueOrThrow({ where: { id } })).phone).toBe('Zentrale 0221');
    expect(expectStatus(await agent.patch(`/api/admin/companies/${id}`).send({ phone: 'Zentrale 0222' }), 400).body.error).toBe('INVALID_PHONE');
    expectStatus(await agent.patch(`/api/admin/companies/${id}`).send({ phone: '030 1234567' }), 200);
    expect((await prisma.company.findUniqueOrThrow({ where: { id } })).phone).toBe('+49301234567');

    const admin = await asAdmin();
    const p = expectStatus(await admin.agent.post('/api/admin/quotes/prospect').send({ name: 'Neukunde GmbH', phone: '0421 555000' }), 201).body.company;
    expect((await prisma.company.findUniqueOrThrow({ where: { id: p.id } })).phone).toBe('+49421555000');
  });
});
