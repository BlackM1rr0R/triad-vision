import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';
import { startFakeStalwart, type FakeStalwart } from '../helpers/fakeStalwart';
import { open, seal } from '../../src/lib/secretBox.js';
import { resetStalwartCaches } from '../../src/lib/stalwart/client.js';

/** Super-admin mailbox management: role guard, reserved names, staff link, disable / enable. Stalwart is faked in-process. */

const DOMAIN = 'triad-vision.de';
const HOST = 'mail.triad-vision.de';
const ENV = { STALWART_ADMIN_USER: `admin@${DOMAIN}`, STALWART_ADMIN_PASSWORD: 'Stalwart-Admin-Secret-1', STALWART_DOMAIN: DOMAIN, STALWART_MAIL_HOST: HOST, SMTP_USER: `no-reply@${DOMAIN}` };

let fake: FakeStalwart;
const saved: Record<string, string | undefined> = {};

beforeAll(async () => {
  fake = await startFakeStalwart({ domain: DOMAIN, adminUser: ENV.STALWART_ADMIN_USER, adminPassword: ENV.STALWART_ADMIN_PASSWORD });
  for (const [k, v] of Object.entries({ ...ENV, STALWART_URL: fake.url, STALWART_TIMEOUT_MS: '2000' })) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
});

afterAll(async () => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await fake.close();
});

beforeEach(() => {
  fake.reset();
  resetStalwartCaches();
});

const auditRows = (action: string) => prisma.auditLog.findMany({ where: { action } });
const listBy = async (agent: Awaited<ReturnType<typeof asAdmin>>['agent']) => {
  const res = expectStatus(await agent.get('/api/admin/mailboxes'), 200);
  return Object.fromEntries((res.body.mailboxes as { address: string }[]).map((m) => [m.address, m])) as Record<string, Record<string, unknown>>;
};

describe('mailbox management — role guard', () => {
  it('ADMIN may only look; every change is SUPER_ADMIN', async () => {
    const admin = await asAdmin();
    const acc = fake.addAccount({ name: 'info', password: 'Info-Pass-12345' });
    const list = expectStatus(await admin.agent.get('/api/admin/mailboxes'), 200);
    expect(list.body.canManage).toBe(false);
    expectStatus(await admin.agent.get(`/api/admin/mailboxes/${acc.id}/auto-reply`), 200);

    const attempts = [
      admin.agent.get('/api/admin/mailboxes/staff'),
      admin.agent.post('/api/admin/mailboxes').send({ localPart: 'jobs' }),
      admin.agent.patch(`/api/admin/mailboxes/${acc.id}`).send({ displayName: 'x' }),
      admin.agent.post(`/api/admin/mailboxes/${acc.id}/password`).send({}),
      admin.agent.post(`/api/admin/mailboxes/${acc.id}/disable`).send({}),
      admin.agent.post(`/api/admin/mailboxes/${acc.id}/enable`).send({}),
      admin.agent.delete(`/api/admin/mailboxes/${acc.id}`).send({ confirmAddress: `info@${DOMAIN}` }),
      admin.agent.put(`/api/admin/mailboxes/${acc.id}/auto-reply`).send({ enabled: false }),
    ];
    for (const r of await Promise.all(attempts)) expectStatus(r, 403);
    expect(fake.accounts.size).toBe(2);
    expect(acc.secret).toBe('Info-Pass-12345');
    expect(fake.calls.some((c) => c.method === 'x:Account/set')).toBe(false);

    for (const actor of [await asStaff(), await asClient()]) expectStatus(await actor.agent.post('/api/admin/mailboxes').send({ localPart: 'jobs' }), 403);
    const sa = await asSuperAdmin();
    expect(expectStatus(await sa.agent.get('/api/admin/mailboxes'), 200).body.canManage).toBe(true);
  });

  it('without a configured mail server: list says so, create answers 503', async () => {
    const sa = await asSuperAdmin();
    const pass = process.env.STALWART_ADMIN_PASSWORD;
    delete process.env.STALWART_ADMIN_PASSWORD;
    try {
      expect(expectStatus(await sa.agent.get('/api/admin/mailboxes'), 200).body).toMatchObject({ configured: false, canManage: true, domain: DOMAIN });
      expect(expectStatus(await sa.agent.post('/api/admin/mailboxes').send({ localPart: 'jobs' }), 503).body.error).toBe('MAIL_SERVER_NOT_CONFIGURED');
    } finally {
      process.env.STALWART_ADMIN_PASSWORD = pass;
    }
  });
});

describe('mailbox management — create', () => {
  it('blocks reserved role addresses unless explicitly allowed', async () => {
    const sa = await asSuperAdmin();
    for (const body of [{ localPart: 'postmaster' }, { localPart: 'Abuse' }, { localPart: 'noreply' }, { localPart: 'jobs', aliases: ['admin'] }]) {
      expect(expectStatus(await sa.agent.post('/api/admin/mailboxes').send(body), 400).body.error).toBe('RESERVED_LOCAL_PART');
    }
    expect(fake.accounts.size).toBe(1);
    const ok = expectStatus(await sa.agent.post('/api/admin/mailboxes').send({ localPart: 'postmaster', allowReserved: true }), 201);
    expect(ok.body.mailbox.address).toBe(`postmaster@${DOMAIN}`);
    expect((await auditRows('MAILBOX_CREATED'))[0].details).toMatchObject({ allowReserved: true });

    // Adding a reserved alias later needs the flag too; keeping an existing one does not.
    const jobs = expectStatus(await sa.agent.post('/api/admin/mailboxes').send({ localPart: 'jobs' }), 201).body.mailbox;
    expect(expectStatus(await sa.agent.patch(`/api/admin/mailboxes/${jobs.id}`).send({ aliases: ['abuse'] }), 400).body.error).toBe('RESERVED_LOCAL_PART');
    expectStatus(await sa.agent.patch(`/api/admin/mailboxes/${jobs.id}`).send({ aliases: ['abuse'], allowReserved: true }), 200);
    expectStatus(await sa.agent.patch(`/api/admin/mailboxes/${jobs.id}`).send({ aliases: ['abuse', 'karriere'] }), 200);
  });

  it('lists staff with a suggested address and connects the new mailbox in their workspace mail', async () => {
    const sa = await asSuperAdmin();
    const staff = await asStaff({ firstName: 'Əli', lastName: 'Məmmədov' });
    const client = await asClient({ firstName: 'Cli', lastName: 'Ent' });

    const staffList = expectStatus(await sa.agent.get('/api/admin/mailboxes/staff'), 200).body.users as { id: string; suggestedLocalPart: string }[];
    expect(staffList.find((u) => u.id === staff.user.id)?.suggestedLocalPart).toBe('eli.memmedov');
    expect(staffList.some((u) => u.id === client.user.id)).toBe(false);

    // Unknown or non-staff user: refused before anything is created on the mail server.
    for (const userId of ['nope', client.user.id]) {
      expect(expectStatus(await sa.agent.post('/api/admin/mailboxes').send({ localPart: 'x1', userId }), 404).body.error).toBe('USER_NOT_FOUND');
    }
    expect(fake.accounts.size).toBe(1);

    const res = expectStatus(await sa.agent.post('/api/admin/mailboxes').send({ localPart: 'ali.memmedov', userId: staff.user.id, quotaMb: 2048 }), 201);
    expect(res.body).toMatchObject({ generated: true, workspaceConnected: true, mailbox: { address: `ali.memmedov@${DOMAIN}`, displayName: 'Əli Məmmədov', quotaBytes: 2048 * 1024 * 1024, status: 'ACTIVE' } });
    expect(fake.accounts.get(res.body.mailbox.id)?.secret).toBe(res.body.password);

    const ws = await prisma.mailAccount.findFirstOrThrow({ where: { userId: staff.user.id } });
    expect(ws).toMatchObject({ email: `ali.memmedov@${DOMAIN}`, username: `ali.memmedov@${DOMAIN}`, imapHost: HOST, smtpHost: HOST, imapPort: 993, smtpPort: 465, isDefault: true, syncEnabled: true });
    expect(open(ws.passwordEnc)).toBe(res.body.password);
    expect(ws.passwordEnc).not.toContain(res.body.password);

    const [row] = await auditRows('MAILBOX_CREATED');
    expect(row.details).toMatchObject({ forUser: staff.user.id, workspaceConnected: true, generatedPassword: true });
    expect(JSON.stringify(row.details)).not.toContain(res.body.password);

    const by = await listBy(sa.agent);
    expect(by[`ali.memmedov@${DOMAIN}`]).toMatchObject({ workspaceUsers: [{ id: staff.user.id }] });
    expect(JSON.stringify(by)).not.toContain(res.body.password);
  });
});

describe('mailbox management — disable / enable', () => {
  it('locks the mailbox with an unknown secret, pauses workspace sync, and re-opens it with a one-time password', async () => {
    const sa = await asSuperAdmin();
    const staff = await asStaff();
    const acc = fake.addAccount({ name: 'anna', password: 'Anna-Pass-12345' });
    const ws = await prisma.mailAccount.create({ data: { userId: staff.user.id, email: `anna@${DOMAIN}`, imapHost: HOST, smtpHost: HOST, username: `anna@${DOMAIN}`, passwordEnc: seal('Anna-Pass-12345') } });

    const off = expectStatus(await sa.agent.post(`/api/admin/mailboxes/${acc.id}/disable`).send({}), 200);
    expect(off.body).toMatchObject({ status: 'DISABLED', workspaceAccountsPaused: 1 });
    expect(acc.secret).not.toBe('Anna-Pass-12345');
    expect(JSON.stringify(off.body)).not.toContain(acc.secret);
    expect(fake.accounts.has(acc.id)).toBe(true); // mail keeps arriving, nothing deleted
    expect((await prisma.mailAccount.findUniqueOrThrow({ where: { id: ws.id } })).syncEnabled).toBe(false);
    const by = await listBy(sa.agent);
    expect(by[`anna@${DOMAIN}`]).toMatchObject({ status: 'DISABLED' });
    expect(by[`anna@${DOMAIN}`].disabledAt).toBeTruthy();
    expect(JSON.stringify(by)).not.toContain(acc.secret);

    // A disabled mailbox is not re-opened by a password reset, and cannot be disabled twice.
    expect(expectStatus(await sa.agent.post(`/api/admin/mailboxes/${acc.id}/password`).send({}), 409).body.error).toBe('MAILBOX_DISABLED');
    expect(expectStatus(await sa.agent.post(`/api/admin/mailboxes/${acc.id}/disable`).send({}), 409).body.error).toBe('MAILBOX_ALREADY_DISABLED');

    const on = expectStatus(await sa.agent.post(`/api/admin/mailboxes/${acc.id}/enable`).send({}), 200);
    expect(on.body).toMatchObject({ status: 'ACTIVE', generated: true, workspaceAccountsUpdated: 1 });
    expect(acc.secret).toBe(on.body.password);
    const after = await prisma.mailAccount.findUniqueOrThrow({ where: { id: ws.id } });
    expect(after.syncEnabled).toBe(true);
    expect(open(after.passwordEnc)).toBe(on.body.password);
    expect((await listBy(sa.agent))[`anna@${DOMAIN}`]).toMatchObject({ status: 'ACTIVE', disabledAt: null });
    expect(expectStatus(await sa.agent.post(`/api/admin/mailboxes/${acc.id}/enable`).send({}), 409).body.error).toBe('MAILBOX_NOT_DISABLED');

    // Audit without secrets.
    const rows = [...(await auditRows('MAILBOX_DISABLED')), ...(await auditRows('MAILBOX_ENABLED'))];
    expect(rows.map((r) => r.action).sort()).toEqual(['MAILBOX_DISABLED', 'MAILBOX_ENABLED']);
    expect(rows.every((r) => r.actorId === sa.user.id && r.target === `anna@${DOMAIN}`)).toBe(true);
    expect(JSON.stringify(rows.map((r) => r.details))).not.toMatch(/Anna-Pass|password"\s*:\s*"/);
    expect(JSON.stringify(rows.map((r) => r.details))).not.toContain(on.body.password);
  });

  it('enable accepts a chosen password; protected mailboxes cannot be disabled; delete clears the state', async () => {
    const sa = await asSuperAdmin();
    const sender = fake.addAccount({ name: 'no-reply', password: 'Site-Pass-12345' });
    const adminAcc = [...fake.accounts.values()].find((a) => a.name === 'admin')!;
    expect(expectStatus(await sa.agent.post(`/api/admin/mailboxes/${sender.id}/disable`).send({}), 409).body.error).toBe('SITE_SENDER_PROTECTED');
    expect(expectStatus(await sa.agent.post(`/api/admin/mailboxes/${adminAcc.id}/disable`).send({}), 409).body.error).toBe('MAIL_ADMIN_PROTECTED');
    expect(sender.secret).toBe('Site-Pass-12345');

    const acc = fake.addAccount({ name: 'temp', password: 'Temp-Pass-12345' });
    expectStatus(await sa.agent.post(`/api/admin/mailboxes/${acc.id}/disable`).send({}), 200);
    expectStatus(await sa.agent.post(`/api/admin/mailboxes/${acc.id}/enable`).send({ password: 'short' }), 400);
    const on = expectStatus(await sa.agent.post(`/api/admin/mailboxes/${acc.id}/enable`).send({ password: 'Chosen-Pass-2026' }), 200);
    expect(on.body).toMatchObject({ generated: false, password: 'Chosen-Pass-2026' });
    expect(acc.secret).toBe('Chosen-Pass-2026');

    expectStatus(await sa.agent.post(`/api/admin/mailboxes/${acc.id}/disable`).send({}), 200);
    expect(await prisma.staffMailbox.count()).toBe(1);
    expectStatus(await sa.agent.delete(`/api/admin/mailboxes/${acc.id}`).send({ confirmAddress: `temp@${DOMAIN}` }), 200);
    expect(await prisma.staffMailbox.count()).toBe(0);
    // Same address again: a brand-new, active mailbox.
    const again = expectStatus(await sa.agent.post('/api/admin/mailboxes').send({ localPart: 'temp' }), 201);
    expect(again.body.mailbox.status).toBe('ACTIVE');
  });
});
