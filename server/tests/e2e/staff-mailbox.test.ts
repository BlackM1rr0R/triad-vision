import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';
import { uniq } from '../helpers/factories';
import { startFakeStalwart, type FakeStalwart } from '../helpers/fakeStalwart';
import { open } from '../../src/lib/secretBox.js';
import { resetStalwartCaches } from '../../src/lib/stalwart/client.js';
import { suggestLocalPart } from '../../src/lib/stalwart/service.js';

// New staff account with the optional "Create mailbox ad.soyad@domain" checkbox (Stalwart is the fake server).

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

const staffBody = (over: Record<string, unknown> = {}) => ({ email: `${uniq('staff')}@test.local`, password: 'Password123', firstName: 'Əli', lastName: 'Məmmədov', role: 'STAFF', ...over });

describe('suggestLocalPart', () => {
  it('transliterates names into ad.soyad', () => {
    expect(suggestLocalPart('Əli', 'Məmmədov')).toBe('eli.memmedov');
    expect(suggestLocalPart('Jürgen', 'Groß')).toBe('jurgen.gross');
    expect(suggestLocalPart('Анна', 'Иванова')).toBe('anna.ivanova');
    expect(suggestLocalPart('Ali Rza', 'Quliyev')).toBe('ali-rza.quliyev');
    expect(suggestLocalPart('', '')).toBe('');
  });
});

describe('POST /api/admin/users with createMailbox', () => {
  it('suggests the address, creates user + mailbox, returns the password once and connects workspace mail', async () => {
    const sa = await asSuperAdmin();
    const sug = expectStatus(await sa.agent.get('/api/admin/users/mailbox-suggestion').query({ firstName: 'Əli', lastName: 'Məmmədov' }), 200);
    expect(sug.body).toEqual({ localPart: 'eli.memmedov', domain: DOMAIN, configured: true });

    const res = expectStatus(await sa.agent.post('/api/admin/users').send(staffBody({ createMailbox: true })), 201);
    const address = `eli.memmedov@${DOMAIN}`;
    expect(res.body.mailbox).toMatchObject({ address, workspaceConnected: true, settings: { imap: { host: HOST, port: 993 }, smtp: { host: HOST, port: 465 } } });
    const password = res.body.mailbox.password as string;
    expect(password).toMatch(/^[A-Za-z0-9]{5}(-[A-Za-z0-9]{5}){3}$/);
    // The mailbox exists on the mail server with the display name and the same password.
    const acc = [...fake.accounts.values()].find((a) => a.name === 'eli.memmedov');
    expect(acc).toBeTruthy();
    expect(acc!.description).toBe('Əli Məmmədov');
    // Workspace mail: own server, username = address, password encrypted (never stored in clear).
    const ws = await prisma.mailAccount.findFirstOrThrow({ where: { userId: res.body.user.id } });
    expect(ws).toMatchObject({ email: address, username: address, imapHost: HOST, imapPort: 993, imapSecure: true, smtpHost: HOST, smtpPort: 465, smtpSecure: true, isDefault: true });
    expect(ws.passwordEnc).not.toContain(password);
    expect(open(ws.passwordEnc)).toBe(password);
    // Audited without the password.
    const rows = await waitFor(async () => {
      const r = await prisma.auditLog.findMany({ where: { action: 'MAILBOX_CREATED', target: address } });
      return r.length ? r : null;
    });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toContain(password);
  });

  it('uses a custom local part; refuses a taken address before creating the account', async () => {
    const sa = await asSuperAdmin();
    fake.addAccount({ name: 'info', password: 'Old-password-1' });
    const taken = staffBody({ createMailbox: true, mailboxLocalPart: 'info' });
    expect(expectStatus(await sa.agent.post('/api/admin/users').send(taken), 409).body.error).toBe('MAILBOX_EXISTS');
    expect(await prisma.user.findUnique({ where: { email: taken.email as string } })).toBeNull();

    const ok = expectStatus(await sa.agent.post('/api/admin/users').send(staffBody({ createMailbox: true, mailboxLocalPart: 'Ali.M' })), 201);
    expect(ok.body.mailbox.address).toBe(`ali.m@${DOMAIN}`);
    expectStatus(await sa.agent.post('/api/admin/users').send(staffBody({ createMailbox: true, mailboxLocalPart: '.bad' })), 400);
  });

  it('without the checkbox nothing changes; without a configured mail server it refuses (nothing created)', async () => {
    const sa = await asSuperAdmin();
    const plain = expectStatus(await sa.agent.post('/api/admin/users').send(staffBody()), 201);
    expect(plain.body.mailbox).toBeNull();
    expect(await prisma.mailAccount.count({ where: { userId: plain.body.user.id } })).toBe(0);

    const pass = process.env.STALWART_ADMIN_PASSWORD;
    delete process.env.STALWART_ADMIN_PASSWORD;
    try {
      const body = staffBody({ createMailbox: true });
      expect(expectStatus(await sa.agent.post('/api/admin/users').send(body), 503).body.error).toBe('MAIL_SERVER_NOT_CONFIGURED');
      expect(await prisma.user.findUnique({ where: { email: body.email as string } })).toBeNull();
      expect(expectStatus(await sa.agent.get('/api/admin/users/mailbox-suggestion').query({ firstName: 'A', lastName: 'B' }), 200).body.configured).toBe(false);
    } finally {
      process.env.STALWART_ADMIN_PASSWORD = pass;
    }
  });

  it('is SUPER_ADMIN only', async () => {
    const admin = await asAdmin();
    expectStatus(await admin.agent.get('/api/admin/users/mailbox-suggestion'), 403);
    expectStatus(await admin.agent.post('/api/admin/users').send(staffBody({ createMailbox: true })), 403);
  });
});

describe('own @domain e-mail as the mailbox (new staff dialog)', () => {
  it('the suggestion and the creation use the entered e-mail local part', async () => {
    const sa = await asSuperAdmin();
    const lp = uniq('tofig').toLowerCase().replace(/[^a-z0-9]/g, '');
    const sug = expectStatus(await sa.agent.get('/api/admin/users/mailbox-suggestion').query({ firstName: 'Tofiq', lastName: 'Abdullayev', email: `${lp}@${DOMAIN}` }), 200);
    expect(sug.body.localPart).toBe(lp);
    const res = expectStatus(await sa.agent.post('/api/admin/users').send(staffBody({ email: `${lp}@${DOMAIN}`, createMailbox: true })), 201);
    expect(res.body.mailbox.address).toBe(`${lp}@${DOMAIN}`);
  });
});

describe('/api/admin/users/:id/mailbox (existing staff)', () => {
  it('creates a missing mailbox on the own @domain address and connects it; audited without the password', async () => {
    const sa = await asSuperAdmin();
    const lp = uniq('at').toLowerCase().replace(/[^a-z0-9]/g, '');
    const staff = await asStaff({ email: `${lp}@${DOMAIN}` });
    const st = expectStatus(await sa.agent.get(`/api/admin/users/${staff.user.id}/mailbox`), 200).body;
    expect(st).toMatchObject({ configured: true, localPart: lp, address: `${lp}@${DOMAIN}`, emailOnOurDomain: true, exists: false, connected: false });
    const res = expectStatus(await sa.agent.post(`/api/admin/users/${staff.user.id}/mailbox`).send({}), 201);
    expect(res.body.created).toBe(true);
    const password = res.body.mailbox.password as string;
    const ws = await prisma.mailAccount.findFirstOrThrow({ where: { userId: staff.user.id } });
    expect(ws).toMatchObject({ email: `${lp}@${DOMAIN}`, imapHost: HOST, isDefault: true });
    expect(open(ws.passwordEnc)).toBe(password);
    const rows = await waitFor(async () => {
      const r = await prisma.auditLog.findMany({ where: { action: 'MAILBOX_CREATED', target: `${lp}@${DOMAIN}` } });
      return r.length ? r : null;
    });
    expect(JSON.stringify(rows[0])).not.toContain(password);
    // already connected: clear conflict
    expect(expectStatus(await sa.agent.post(`/api/admin/users/${staff.user.id}/mailbox`).send({}), 409).body.error).toBe('MAILBOX_ALREADY_CONNECTED');
  });

  it('an existing mailbox needs "reset password and connect" (we do not hold its password)', async () => {
    const sa = await asSuperAdmin();
    const lp = uniq('ex').toLowerCase().replace(/[^a-z0-9]/g, '');
    fake.addAccount({ name: lp, password: 'Old-password-1' });
    const staff = await asStaff({ email: `${lp}@${DOMAIN}` });
    expect(expectStatus(await sa.agent.get(`/api/admin/users/${staff.user.id}/mailbox`), 200).body.exists).toBe(true);
    expect(expectStatus(await sa.agent.post(`/api/admin/users/${staff.user.id}/mailbox`).send({}), 409).body.error).toBe('MAILBOX_PASSWORD_NEEDED');
    expect(await prisma.mailAccount.count({ where: { userId: staff.user.id } })).toBe(0);
    const res = expectStatus(await sa.agent.post(`/api/admin/users/${staff.user.id}/mailbox`).send({ resetPassword: true }), 200);
    expect(res.body.created).toBe(false);
    const password = res.body.mailbox.password as string;
    const ws = await prisma.mailAccount.findFirstOrThrow({ where: { userId: staff.user.id } });
    expect(open(ws.passwordEnc)).toBe(password);
    expect([...fake.accounts.values()].find((a) => a.name === lp)?.secret).toBe(password);
    expect((await prisma.auditLog.findMany({ where: { action: 'MAILBOX_CONNECTED', target: `${lp}@${DOMAIN}` } })).length).toBeGreaterThan(0);
  });

  it('is SUPER_ADMIN only, staff only, and refuses without a configured mail server', async () => {
    const sa = await asSuperAdmin();
    const admin = await asAdmin();
    const staff = await asStaff();
    expectStatus(await admin.agent.get(`/api/admin/users/${staff.user.id}/mailbox`), 403);
    expectStatus(await admin.agent.post(`/api/admin/users/${staff.user.id}/mailbox`).send({}), 403);
    const client = await asClient();
    expectStatus(await sa.agent.post(`/api/admin/users/${client.user.id}/mailbox`).send({}), 400);
    const pass = process.env.STALWART_ADMIN_PASSWORD;
    delete process.env.STALWART_ADMIN_PASSWORD;
    try {
      expect(expectStatus(await sa.agent.post(`/api/admin/users/${staff.user.id}/mailbox`).send({}), 503).body.error).toBe('MAIL_SERVER_NOT_CONFIGURED');
      expect(expectStatus(await sa.agent.get(`/api/admin/users/${staff.user.id}/mailbox`), 200).body.configured).toBe(false);
    } finally {
      process.env.STALWART_ADMIN_PASSWORD = pass;
    }
  });
});
