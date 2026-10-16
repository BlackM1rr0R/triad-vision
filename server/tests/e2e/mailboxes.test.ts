import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';
import { startFakeStalwart, type FakeStalwart } from '../helpers/fakeStalwart';
import { open, seal } from '../../src/lib/secretBox.js';
import { resetStalwartCaches } from '../../src/lib/stalwart/client.js';

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

const mailAccount = (userId: string, username: string, password: string, host = HOST) =>
  prisma.mailAccount.create({
    data: { userId, email: username, imapHost: host, smtpHost: host, username, passwordEnc: seal(password), syncStatus: 'ERROR', syncError: 'AUTHENTICATIONFAILED' },
  });

const auditRows = (action: string) => prisma.auditLog.findMany({ where: { action } });

describe('admin mailboxes — access and configuration', () => {
  it('ADMIN and SUPER_ADMIN only', async () => {
    for (const actor of [await asStaff(), await asClient()]) expectStatus(await actor.agent.get('/api/admin/mailboxes'), 403);
    for (const actor of [await asAdmin(), await asSuperAdmin()]) expectStatus(await actor.agent.get('/api/admin/mailboxes'), 200);
  });

  it('reports configured: false without admin credentials', async () => {
    const admin = await asAdmin();
    const pass = process.env.STALWART_ADMIN_PASSWORD;
    delete process.env.STALWART_ADMIN_PASSWORD;
    try {
      const res = expectStatus(await admin.agent.get('/api/admin/mailboxes'), 200);
      expect(res.body).toMatchObject({ configured: false, mailboxes: [], imap: { host: HOST, port: 993 }, smtp: { host: HOST, port: 465 } });
      expect(expectStatus(await admin.agent.post('/api/admin/mailboxes').send({ localPart: 'x' }), 503).body.error).toBe('MAIL_SERVER_NOT_CONFIGURED');
      expect(expectStatus(await admin.agent.get('/api/mailbox/me'), 200).body.configured).toBe(false);
    } finally {
      process.env.STALWART_ADMIN_PASSWORD = pass;
    }
  });

  it('a mail server that is down answers 502, never 401', async () => {
    const admin = await asAdmin();
    const url = process.env.STALWART_URL;
    process.env.STALWART_URL = 'http://127.0.0.1:1';
    try {
      expect(expectStatus(await admin.agent.get('/api/admin/mailboxes'), 502).body.error).toBe('MAIL_SERVER_UNREACHABLE');
    } finally {
      process.env.STALWART_URL = url;
    }
  });
});

describe('admin mailboxes — list / create / update', () => {
  it('lists mailboxes with usage, aliases, protection and linked staff', async () => {
    const admin = await asAdmin();
    const staff = await asStaff({ email: `anna@${DOMAIN}`, firstName: 'Anna', lastName: 'K' });
    const other = await asStaff({ firstName: 'Bob', lastName: 'L' });
    fake.addAccount({ name: 'anna', password: 'Anna-Pass-12345', description: 'Anna K', usedDiskQuota: 5000 });
    fake.addAccount({ name: 'info', password: 'Info-Pass-12345', description: 'Info' });
    fake.addAccount({ name: 'no-reply', password: 'Site-Pass-12345' });
    fake.addAccount({ name: 'stranger', domain: 'other.test', password: 'Other-Pass-12345' });
    await mailAccount(other.user.id, `info@${DOMAIN}`, 'Info-Pass-12345');

    const res = expectStatus(await admin.agent.get('/api/admin/mailboxes'), 200);
    expect(res.body.configured).toBe(true);
    const by = Object.fromEntries((res.body.mailboxes as { address: string }[]).map((m) => [m.address, m])) as Record<string, Record<string, unknown>>;
    expect(Object.keys(by).sort()).toEqual([`admin@${DOMAIN}`, `anna@${DOMAIN}`, `info@${DOMAIN}`, `no-reply@${DOMAIN}`]);
    expect(by[`anna@${DOMAIN}`]).toMatchObject({ displayName: 'Anna K', usedBytes: 5000, linkedUser: { id: staff.user.id, name: 'Anna K' }, canDelete: true, canResetPassword: true });
    expect(by[`info@${DOMAIN}`]).toMatchObject({ linkedUser: null, workspaceUsers: [{ id: other.user.id }] });
    expect(by[`no-reply@${DOMAIN}`]).toMatchObject({ protection: 'SITE_SENDER', canDelete: false, canResetPassword: false });
    expect(by[`admin@${DOMAIN}`]).toMatchObject({ protection: 'MAIL_ADMIN', canDelete: false });
    expect(JSON.stringify(res.body)).not.toMatch(/Pass-12345/);
  });

  it('creates with a generated password returned exactly once', async () => {
    const admin = await asAdmin();
    const res = expectStatus(await admin.agent.post('/api/admin/mailboxes').send({ localPart: 'Jobs', displayName: 'Jobs', quotaMb: 512, aliases: ['karriere', `bewerbung@${DOMAIN}`] }), 201);
    expect(res.body.generated).toBe(true);
    expect(res.body.password).toMatch(/^[A-Za-z0-9]{5}(-[A-Za-z0-9]{5}){3}$/);
    expect(res.body.mailbox).toMatchObject({ address: `jobs@${DOMAIN}`, quotaBytes: 512 * 1024 * 1024, aliases: [`karriere@${DOMAIN}`, `bewerbung@${DOMAIN}`] });
    expect(res.body.settings).toMatchObject({ imap: { host: HOST, port: 993 }, smtp: { host: HOST, port: 465 } });
    expect(fake.accounts.get(res.body.mailbox.id)?.secret).toBe(res.body.password);

    // Never again: not in the list, not in the audit log.
    const list = expectStatus(await admin.agent.get('/api/admin/mailboxes'), 200);
    expect(JSON.stringify(list.body)).not.toContain(res.body.password);
    const [row] = await auditRows('MAILBOX_CREATED');
    expect(row).toMatchObject({ actorId: admin.user.id, target: `jobs@${DOMAIN}` });
    expect(JSON.stringify(row.details)).not.toContain(res.body.password);

    expect(expectStatus(await admin.agent.post('/api/admin/mailboxes').send({ localPart: 'jobs' }), 409).body.error).toBe('MAILBOX_EXISTS');
  });

  it('validates input: local part, own password policy, alias domain', async () => {
    const admin = await asAdmin();
    for (const body of [{ localPart: 'bad name' }, { localPart: '.x' }, { localPart: 'ok', password: 'short1' }, { localPart: 'ok', password: 'onlyletterss' }, { localPart: 'ok', aliases: ['x@gmail.com'] }, { localPart: 'ok', quotaMb: 0 }]) {
      expectStatus(await admin.agent.post('/api/admin/mailboxes').send(body), 400);
    }
    const own = expectStatus(await admin.agent.post('/api/admin/mailboxes').send({ localPart: 'ok', password: 'Chosen-Pass-2026' }), 201);
    expect(own.body).toMatchObject({ generated: false, password: 'Chosen-Pass-2026' });
    expect(fake.accounts.size).toBe(2);
  });

  it('updates display name, quota and aliases', async () => {
    const admin = await asAdmin();
    const acc = fake.addAccount({ name: 'info', password: 'Info-Pass-12345' });
    const res = expectStatus(await admin.agent.patch(`/api/admin/mailboxes/${acc.id}`).send({ displayName: 'Triad Info', quotaMb: 1024, aliases: ['kontakt'] }), 200);
    expect(res.body.mailbox).toMatchObject({ displayName: 'Triad Info', quotaBytes: 1024 * 1024 * 1024, aliases: [`kontakt@${DOMAIN}`] });
    expect(expectStatus(await admin.agent.patch(`/api/admin/mailboxes/${acc.id}`).send({ quotaMb: null }), 200).body.mailbox.quotaBytes).toBeNull();
    expect((await auditRows('MAILBOX_UPDATED')).length).toBe(2);
    // Accounts of other domains are invisible.
    const foreign = fake.addAccount({ name: 'x', domain: 'other.test', password: 'Other-Pass-12345' });
    expect(expectStatus(await admin.agent.patch(`/api/admin/mailboxes/${foreign.id}`).send({ displayName: 'y' }), 404).body.error).toBe('MAILBOX_NOT_FOUND');
  });
});

describe('admin mailboxes — password reset and delete', () => {
  it('resets the password once and re-encrypts every workspace account using it', async () => {
    const admin = await asAdmin();
    const s1 = await asStaff();
    const s2 = await asStaff();
    const acc = fake.addAccount({ name: 'info', password: 'Info-Old-Pass-1' });
    const a1 = await mailAccount(s1.user.id, `info@${DOMAIN}`, 'Info-Old-Pass-1');
    const a2 = await mailAccount(s2.user.id, `INFO@${DOMAIN}`, 'Info-Old-Pass-1');
    const elsewhere = await mailAccount(s2.user.id, `info@${DOMAIN}`.replace('info', 'info2'), 'keep-me', 'imap.gmail.com');

    const res = expectStatus(await admin.agent.post(`/api/admin/mailboxes/${acc.id}/password`).send({}), 200);
    expect(res.body).toMatchObject({ generated: true, workspaceAccountsUpdated: 2 });
    expect(acc.secret).toBe(res.body.password);
    for (const id of [a1.id, a2.id]) {
      const row = await prisma.mailAccount.findUniqueOrThrow({ where: { id } });
      expect(open(row.passwordEnc)).toBe(res.body.password);
      expect(row).toMatchObject({ syncStatus: 'IDLE', syncError: null });
    }
    expect(open((await prisma.mailAccount.findUniqueOrThrow({ where: { id: elsewhere.id } })).passwordEnc)).toBe('keep-me');

    const set = expectStatus(await admin.agent.post(`/api/admin/mailboxes/${acc.id}/password`).send({ password: 'Admin-Chosen-77' }), 200);
    expect(set.body.generated).toBe(false);
    expect(acc.secret).toBe('Admin-Chosen-77');
    const rows = await auditRows('MAILBOX_PASSWORD_RESET');
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows.map((r) => r.details))).not.toMatch(/Admin-Chosen-77|Info-Old/);
    expect(JSON.stringify(rows.map((r) => r.details))).not.toContain(res.body.password);
  });

  it('refuses to reset the site sender and the mail admin', async () => {
    const admin = await asSuperAdmin();
    const sender = fake.addAccount({ name: 'no-reply', password: 'Site-Pass-12345' });
    const adminAcc = [...fake.accounts.values()].find((a) => a.name === 'admin')!;
    expect(expectStatus(await admin.agent.post(`/api/admin/mailboxes/${sender.id}/password`).send({}), 409).body.error).toBe('SITE_SENDER_PROTECTED');
    expect(expectStatus(await admin.agent.post(`/api/admin/mailboxes/${adminAcc.id}/password`).send({ password: 'Whatever-Pass-1' }), 409).body.error).toBe('MAIL_ADMIN_PROTECTED');
    expect(sender.secret).toBe('Site-Pass-12345');
    expect(adminAcc.secret).toBe(ENV.STALWART_ADMIN_PASSWORD);
  });

  it('delete: protected addresses 409, confirmation required, audit row', async () => {
    const admin = await asAdmin();
    const sender = fake.addAccount({ name: 'no-reply', password: 'Site-Pass-12345' });
    const adminAcc = [...fake.accounts.values()].find((a) => a.name === 'admin')!;
    const old = fake.addAccount({ name: 'old', password: 'Old-Pass-12345', usedDiskQuota: 99 });
    expect(expectStatus(await admin.agent.delete(`/api/admin/mailboxes/${sender.id}`).send({ confirmAddress: `no-reply@${DOMAIN}` }), 409).body.error).toBe('SITE_SENDER_PROTECTED');
    expect(expectStatus(await admin.agent.delete(`/api/admin/mailboxes/${adminAcc.id}`).send({ confirmAddress: `admin@${DOMAIN}` }), 409).body.error).toBe('MAIL_ADMIN_PROTECTED');
    expect(expectStatus(await admin.agent.delete(`/api/admin/mailboxes/${old.id}`).send({ confirmAddress: 'old' }), 400).body.error).toBe('CONFIRMATION_MISMATCH');
    expectStatus(await admin.agent.delete(`/api/admin/mailboxes/${old.id}`).send({}), 400);
    expect(fake.accounts.has(old.id)).toBe(true);
    expectStatus(await admin.agent.delete(`/api/admin/mailboxes/${old.id}`).send({ confirmAddress: `OLD@${DOMAIN}` }), 200);
    expect(fake.accounts.has(old.id)).toBe(false);
    expect(await auditRows('MAILBOX_DELETED')).toMatchObject([{ target: `old@${DOMAIN}`, actorId: admin.user.id }]);
  });
});

describe('admin mailboxes — auto-reply', () => {
  it('reads and writes any mailbox auto-reply', async () => {
    const admin = await asAdmin();
    const acc = fake.addAccount({ name: 'info', password: 'Info-Pass-12345' });
    acc.vacation = { isEnabled: true, subject: 'Danke', textBody: 'Wir melden uns.', htmlBody: null, fromDate: null, toDate: null };
    expect(expectStatus(await admin.agent.get(`/api/admin/mailboxes/${acc.id}/auto-reply`), 200).body.autoReply).toEqual({ enabled: true, subject: 'Danke', text: 'Wir melden uns.', fromDate: null, toDate: null });

    const body = { enabled: true, subject: 'Urlaub', text: 'Bis 30.10.\r\nGrüße', fromDate: '2026-10-20T00:00:00.000Z', toDate: '2026-10-30T00:00:00.000Z' };
    const res = expectStatus(await admin.agent.put(`/api/admin/mailboxes/${acc.id}/auto-reply`).send(body), 200);
    expect(res.body.autoReply).toEqual({ enabled: true, subject: 'Urlaub', text: 'Bis 30.10.\nGrüße', fromDate: '2026-10-20T00:00:00Z', toDate: '2026-10-30T00:00:00Z' });
    expect(await auditRows('MAILBOX_AUTOREPLY_UPDATED')).toHaveLength(1);

    expectStatus(await admin.agent.put(`/api/admin/mailboxes/${acc.id}/auto-reply`).send({ enabled: true, text: '' }), 400);
    expectStatus(await admin.agent.put(`/api/admin/mailboxes/${acc.id}/auto-reply`).send({ ...body, fromDate: body.toDate, toDate: body.fromDate }), 400);
    expectStatus(await admin.agent.put(`/api/admin/mailboxes/${acc.id}/auto-reply`).send({ enabled: false }), 200);
    expect(acc.vacation.isEnabled).toBe(false);
  });
});

describe('self-service /api/mailbox/me', () => {
  it('lists own mailboxes from the login email and connected workspace accounts', async () => {
    const staff = await asStaff({ email: `anna@${DOMAIN}` });
    fake.addAccount({ name: 'anna', password: 'Anna-Pass-12345' });
    fake.addAccount({ name: 'info', password: 'Info-Pass-12345' });
    fake.addAccount({ name: 'jobs', password: 'Jobs-Pass-12345' });
    await mailAccount(staff.user.id, `info@${DOMAIN}`, 'Info-Pass-12345');
    const res = expectStatus(await staff.agent.get('/api/mailbox/me'), 200);
    expect(res.body.configured).toBe(true);
    expect(res.body.mailboxes.map((m: { address: string }) => m.address).sort()).toEqual([`anna@${DOMAIN}`, `info@${DOMAIN}`]);

    const nobody = await asStaff();
    expect(expectStatus(await nobody.agent.get('/api/mailbox/me'), 200).body.mailboxes).toEqual([]);
    expectStatus(await (await asClient()).agent.get('/api/mailbox/me'), 403);
  });

  it('changes the password with the current one and updates workspace accounts', async () => {
    const staff = await asStaff({ email: `anna@${DOMAIN}` });
    const acc = fake.addAccount({ name: 'anna', password: 'Anna-Old-Pass-1' });
    const ws = await mailAccount(staff.user.id, `anna@${DOMAIN}`, 'Anna-Old-Pass-1');
    const url = '/api/mailbox/me/password';

    expect(expectStatus(await staff.agent.post(url).send({ address: `anna@${DOMAIN}`, currentPassword: 'wrong', newPassword: 'Anna-New-Pass-2' }), 400).body.error).toBe('MAILBOX_PASSWORD_WRONG');
    expect(acc.secret).toBe('Anna-Old-Pass-1');
    expect(await auditRows('MAILBOX_PASSWORD_CHANGE_FAILED')).toHaveLength(1);
    expectStatus(await staff.agent.post(url).send({ address: `anna@${DOMAIN}`, currentPassword: 'Anna-Old-Pass-1', newPassword: 'tooweak' }), 400);

    const ok = expectStatus(await staff.agent.post(url).send({ address: `anna@${DOMAIN}`, currentPassword: 'Anna-Old-Pass-1', newPassword: 'Anna-New-Pass-2' }), 200);
    expect(ok.body).toEqual({ ok: true, workspaceAccountsUpdated: 1 });
    expect(acc.secret).toBe('Anna-New-Pass-2');
    expect(open((await prisma.mailAccount.findUniqueOrThrow({ where: { id: ws.id } })).passwordEnc)).toBe('Anna-New-Pass-2');
    const [row] = await auditRows('MAILBOX_PASSWORD_CHANGED');
    expect(row).toMatchObject({ actorId: staff.user.id, target: `anna@${DOMAIN}` });
    expect(JSON.stringify(row.details)).not.toMatch(/Anna-/);
  });

  it("refuses someone else's mailbox and the site sender", async () => {
    fake.addAccount({ name: 'boss', password: 'Boss-Pass-12345' });
    fake.addAccount({ name: 'no-reply', password: 'Site-Pass-12345' });
    const staff = await asStaff({ email: `no-reply@${DOMAIN}` });
    const url = '/api/mailbox/me/password';
    expect(expectStatus(await staff.agent.post(url).send({ address: `boss@${DOMAIN}`, currentPassword: 'Boss-Pass-12345', newPassword: 'Boss-New-Pass-1' }), 403).body.error).toBe('NOT_YOUR_MAILBOX');
    expect(expectStatus(await staff.agent.post(url).send({ address: `no-reply@${DOMAIN}`, currentPassword: 'Site-Pass-12345', newPassword: 'Site-New-Pass-1' }), 409).body.error).toBe('SITE_SENDER_PROTECTED');
    expect(expectStatus(await staff.agent.get(`/api/mailbox/me/auto-reply?address=boss@${DOMAIN}`), 403).body.error).toBe('NOT_YOUR_MAILBOX');
  });

  it('rate-limits password attempts per user', async () => {
    const staff = await asStaff({ email: `rl@${DOMAIN}` });
    fake.addAccount({ name: 'rl', password: 'Rl-Pass-123456' });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await staff.agent.post('/api/mailbox/me/password').send({ address: `rl@${DOMAIN}`, currentPassword: 'nope', newPassword: 'Rl-New-Pass-1' })).status);
    expect(statuses).toEqual([400, 400, 400, 400, 400, 429]);
  });

  it('edits the own auto-reply', async () => {
    const staff = await asStaff({ email: `anna@${DOMAIN}` });
    const acc = fake.addAccount({ name: 'anna', password: 'Anna-Pass-12345' });
    expect(expectStatus(await staff.agent.get(`/api/mailbox/me/auto-reply?address=anna@${DOMAIN}`), 200).body.autoReply.enabled).toBe(false);
    const res = expectStatus(await staff.agent.put('/api/mailbox/me/auto-reply').send({ address: `anna@${DOMAIN}`, enabled: true, subject: 'Abwesend', text: 'Ab Montag wieder da.' }), 200);
    expect(res.body.autoReply).toMatchObject({ enabled: true, subject: 'Abwesend', text: 'Ab Montag wieder da.' });
    expect(acc.vacation.isEnabled).toBe(true);
    expect(await auditRows('MAILBOX_AUTOREPLY_UPDATED')).toMatchObject([{ actorId: staff.user.id, target: `anna@${DOMAIN}` }]);
  });
});
