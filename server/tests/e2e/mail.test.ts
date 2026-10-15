import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, type Actor } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { createClient, uniq } from '../helpers/factories';
import { SAMPLE, binaryParser } from '../helpers/files';
import { FakeImapServer } from '../../src/lib/mail/imapFake.js';
import { setImapFactory } from '../../src/lib/mail/imap.js';
import { FakeSmtp, setSmtpFactory } from '../../src/lib/mail/smtp.js';
import { flushRemote } from '../../src/lib/mail/core.js';
import { wakeSnoozed } from '../../src/lib/mail/sync.js';
import { open } from '../../src/lib/secretBox.js';

/**
 * Workspace mail against an in-memory IMAP server and SMTP transport (no sockets). Each test gets
 * a fresh fake server; accounts are created with sync disabled and synced explicitly.
 */
let imap: FakeImapServer;
let smtp: FakeSmtp;

beforeEach(() => {
  imap = new FakeImapServer();
  imap.credentials = { username: 'staff@example.az', password: 'app-password' };
  smtp = new FakeSmtp();
  setImapFactory(imap.createFactory());
  setSmtpFactory(smtp.createFactory());
});

afterEach(async () => {
  await flushRemote();
  setImapFactory(null);
  setSmtpFactory(null);
});

const accountBody = (over: Record<string, unknown> = {}) => ({
  email: 'staff@example.az',
  displayName: 'Staff Member',
  provider: 'CUSTOM',
  imapHost: 'imap.example.az',
  imapPort: 993,
  imapSecure: true,
  smtpHost: 'smtp.example.az',
  smtpPort: 465,
  smtpSecure: true,
  username: 'staff@example.az',
  password: 'app-password',
  syncEnabled: false,
  ...over,
});

const makeAccount = async (actor: Actor, over: Record<string, unknown> = {}) => {
  const res = await actor.agent.post('/api/mail/accounts').send(accountBody(over));
  if (res.status !== 201) throw new Error(`account: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.account as { id: string; email: string };
};

const sync = async (actor: Actor, accountId: string) => {
  const res = await actor.agent.post(`/api/mail/accounts/${accountId}/sync`);
  expect(res.status).toBe(200);
  return res.body as { ok: boolean; error?: string; newMessages: number };
};

const list = async (actor: Actor, params: Record<string, string>) => {
  const res = await actor.agent.get('/api/mail/messages').query(params);
  expect(res.status).toBe(200);
  return res.body as { items: { id: string; subject: string; seen: boolean; flagged: boolean; snippet: string; threadCount: number; hasAttachments: boolean; folderRole: string }[]; nextCursor: string | null; total?: number };
};

const seeded = async (actor: Actor) => {
  const account = await makeAccount(actor);
  await imap.deliver({ from: 'Aysel Mammadova <aysel@client.az>', to: 'staff@example.az', subject: 'Visa documents', text: 'Hello, attached are my documents.', messageId: '<m1@client.az>', date: new Date('2026-10-01T10:00:00Z') });
  await imap.deliver({ from: 'Botschaft Baku <termin@auswaertiges-amt.de>', to: 'staff@example.az', subject: 'Termin bestätigt', html: '<p>Ihr <b>Termin</b> am 20.10.</p><img src="https://tracker.example/x.gif">', messageId: '<m2@embassy.de>', date: new Date('2026-10-02T10:00:00Z'), flags: ['\\Seen'] });
  await imap.deliver({ from: 'Kamran <kamran@partner.de>', to: 'staff@example.az', subject: 'Contract draft', text: 'Please find the contract attached.', attachments: [{ filename: 'contract.pdf', content: Buffer.from('%PDF-1.4 test'), contentType: 'application/pdf' }], messageId: '<m3@partner.de>', date: new Date('2026-10-03T10:00:00Z'), flags: ['\\Flagged'] });
  await sync(actor, account.id);
  return account;
};

describe('mail: access', () => {
  it('requires a staff session', async () => {
    expect((await anon().get('/api/mail/accounts')).status).toBe(401);
    const client = await asClient();
    expect((await client.agent.get('/api/mail/accounts')).status).toBe(403);
    expect((await client.agent.get('/api/mail/summary')).status).toBe(403);
  });
});

describe('mail: accounts', () => {
  it('creates an account with a sealed password that is never returned, lists it and guesses the provider', async () => {
    const staff = await asStaff();
    const res = await staff.agent.post('/api/mail/accounts').send(accountBody({ email: 'me@gmail.com', username: 'me@gmail.com', provider: undefined }));
    expect(res.status).toBe(201);
    expect(res.body.account).toMatchObject({ email: 'me@gmail.com', provider: 'GMAIL', isDefault: true, syncStatus: 'IDLE' });
    expect(JSON.stringify(res.body)).not.toContain('app-password');
    expect(res.body.account.password).toBeUndefined();
    expect(res.body.account.passwordEnc).toBeUndefined();
    const row = await prisma.mailAccount.findUniqueOrThrow({ where: { id: res.body.account.id } });
    expect(row.passwordEnc).not.toContain('app-password');
    expect(open(row.passwordEnc)).toBe('app-password');

    const listRes = await staff.agent.get('/api/mail/accounts');
    expect(listRes.body.accounts).toHaveLength(1);
    expect(JSON.stringify(listRes.body)).not.toContain('app-password');

    // Same address twice is a conflict; a second account is not default.
    expect((await staff.agent.post('/api/mail/accounts').send(accountBody({ email: 'me@gmail.com' }))).status).toBe(409);
    const second = await staff.agent.post('/api/mail/accounts').send(accountBody({ email: 'other@example.az' }));
    expect(second.body.account.isDefault).toBe(false);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'MAIL_ACCOUNT_CREATED', actorId: staff.user.id } });
    expect(audit).not.toBeNull();
  });

  it('validates input', async () => {
    const staff = await asStaff();
    expect((await staff.agent.post('/api/mail/accounts').send(accountBody({ email: 'nope' }))).status).toBe(400);
    expect((await staff.agent.post('/api/mail/accounts').send(accountBody({ imapPort: 70000 }))).status).toBe(400);
    expect((await staff.agent.post('/api/mail/accounts').send({ ...accountBody(), password: '' })).status).toBe(400);
  });

  it('updates fields, keeps the password when omitted, switches the default and deletes', async () => {
    const staff = await asStaff();
    const a = await makeAccount(staff);
    const b = await makeAccount(staff, { email: 'b@example.az' });
    const patch = await staff.agent.patch(`/api/mail/accounts/${b.id}`).send({ displayName: 'B', isDefault: true, signatureHtml: '<p>Regards<script>x</script></p>' });
    expect(patch.status).toBe(200);
    expect(patch.body.account).toMatchObject({ displayName: 'B', isDefault: true, signatureHtml: '<p>Regards</p>' });
    expect((await prisma.mailAccount.findUniqueOrThrow({ where: { id: a.id } })).isDefault).toBe(false);
    const row = await prisma.mailAccount.findUniqueOrThrow({ where: { id: b.id } });
    expect(open(row.passwordEnc)).toBe('app-password');
    await staff.agent.patch(`/api/mail/accounts/${b.id}`).send({ password: 'new-secret' });
    expect(open((await prisma.mailAccount.findUniqueOrThrow({ where: { id: b.id } })).passwordEnc)).toBe('new-secret');

    expect((await staff.agent.delete(`/api/mail/accounts/${b.id}`)).status).toBe(200);
    expect(await prisma.mailAccount.count({ where: { userId: staff.user.id } })).toBe(1);
    // the remaining account becomes default again
    expect((await prisma.mailAccount.findUniqueOrThrow({ where: { id: a.id } })).isDefault).toBe(true);
  });

  it('is private: another staff member gets 404 on my account, admin sees health but no secrets', async () => {
    const me = await asStaff();
    const other = await asStaff();
    const admin = await asAdmin();
    const a = await makeAccount(me);
    expect((await other.agent.get('/api/mail/accounts')).body.accounts).toEqual([]);
    expect((await other.agent.patch(`/api/mail/accounts/${a.id}`).send({ displayName: 'x' })).status).toBe(404);
    expect((await other.agent.delete(`/api/mail/accounts/${a.id}`)).status).toBe(404);
    expect((await other.agent.post(`/api/mail/accounts/${a.id}/sync`)).status).toBe(404);
    expect((await me.agent.get('/api/mail/admin/accounts')).status).toBe(403);
    const adminList = await admin.agent.get('/api/mail/admin/accounts');
    expect(adminList.status).toBe(200);
    expect(adminList.body.accounts).toHaveLength(1);
    expect(adminList.body.accounts[0]).toMatchObject({ id: a.id, email: 'staff@example.az', syncStatus: 'IDLE', user: { id: me.user.id } });
    expect(JSON.stringify(adminList.body)).not.toContain('app-password');
    expect(adminList.body.accounts[0].passwordEnc).toBeUndefined();
    // Admin cannot read the messages of that account.
    expect((await admin.agent.get('/api/mail/messages').query({ accountId: a.id })).status).toBe(404);
    expect((await admin.agent.get('/api/mail/folders').query({ accountId: a.id })).status).toBe(404);
  });

  it('tests a connection without saving (IMAP + SMTP, reporting each)', async () => {
    const staff = await asStaff();
    const ok = await staff.agent.post('/api/mail/accounts/test').send(accountBody());
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ ok: true, imap: { ok: true }, smtp: { ok: true } });
    expect(smtp.verified).toBe(1);
    const bad = await staff.agent.post('/api/mail/accounts/test').send(accountBody({ password: 'wrong' }));
    expect(bad.body.ok).toBe(false);
    expect(bad.body.imap).toMatchObject({ ok: false, error: 'AUTHENTICATIONFAILED' });
    expect(await prisma.mailAccount.count()).toBe(0);
    expect((await staff.agent.get('/api/mail/providers')).body.providers.map((p: { provider: string }) => p.provider)).toEqual(['GMAIL', 'OUTLOOK', 'YANDEX', 'MAILRU', 'CUSTOM']);
  });
});

describe('mail: sync', () => {
  it('imports folders with roles, messages with flags, attachments metadata and sanitised html', async () => {
    const staff = await asStaff();
    const account = await seeded(staff);
    const folders = await staff.agent.get('/api/mail/folders').query({ accountId: account.id });
    expect(folders.status).toBe(200);
    const roles = folders.body.folders.map((f: { role: string }) => f.role);
    expect(roles).toEqual(['INBOX', 'DRAFTS', 'SENT', 'ARCHIVE', 'JUNK', 'TRASH']);
    const inbox = folders.body.folders.find((f: { role: string }) => f.role === 'INBOX');
    expect(inbox).toMatchObject({ unread: 2, total: 3, local: false });
    expect(folders.body.views).toMatchObject({ inbox: 2, unread: 2, flagged: 1, snoozed: 0, drafts: 0 });
    expect(folders.body.accounts[0]).toMatchObject({ id: account.id, syncStatus: 'OK', syncError: null });

    const { items } = await list(staff, { accountId: account.id });
    expect(items.map((m) => m.subject)).toEqual(['Contract draft', 'Termin bestätigt', 'Visa documents']);
    expect(items[0]).toMatchObject({ hasAttachments: true, flagged: true, seen: false });
    expect(items[1]).toMatchObject({ seen: true, snippet: 'Ihr Termin am 20.10.' });

    const detail = await staff.agent.get(`/api/mail/messages/${items[1]!.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.message.html).toContain('<b>Termin</b>');
    expect(detail.body.message.html).toContain('data-src="https://tracker.example/x.gif"');
    expect(detail.body.message.from).toEqual({ name: 'Botschaft Baku', address: 'termin@auswaertiges-amt.de' });
    expect(detail.body.message.threadKey).toBe('m2@embassy.de');

    const withAtt = await staff.agent.get(`/api/mail/messages/${items[0]!.id}`);
    expect(withAtt.body.message.attachments).toEqual([expect.objectContaining({ filename: 'contract.pdf', mimeType: 'application/pdf', inline: false, cached: false })]);
  });

  it('is incremental: a second sync only fetches new UIDs and re-reads flags; deletions on the server propagate', async () => {
    const staff = await asStaff();
    const account = await seeded(staff);
    imap.log.length = 0;
    const first = (await list(staff, { accountId: account.id })).items;
    // phone marks "Contract draft" read and deletes "Visa documents"
    imap.message('INBOX', 3)!.flags.add('\\Seen');
    imap.folder('INBOX').messages.delete(1);
    await imap.deliver({ from: 'new@x.de', to: 'staff@example.az', subject: 'Fourth', text: 'new one' });
    const r = await sync(staff, account.id);
    expect(r.newMessages).toBe(1);
    const fetches = imap.log.filter((l) => l.op === 'fetch' && l.path === 'INBOX');
    expect(fetches).toHaveLength(1);
    expect(fetches[0]!.uids).toEqual([4]);
    const { items } = await list(staff, { accountId: account.id });
    expect(items.map((m) => m.subject)).toEqual(['Fourth', 'Contract draft', 'Termin bestätigt']);
    expect(items.find((m) => m.subject === 'Contract draft')!.seen).toBe(true);
    expect(await prisma.mailMessage.findUnique({ where: { id: first[2]!.id } })).toBeNull();
  });

  it('resets a folder when UIDVALIDITY changes and records connection errors on the account', async () => {
    const staff = await asStaff();
    const account = await seeded(staff);
    imap.resetFolder('INBOX');
    const r = await sync(staff, account.id);
    expect(r.ok).toBe(true);
    expect(await prisma.mailMessage.count({ where: { accountId: account.id, folder: { role: 'INBOX' } } })).toBe(3);

    imap.failConnect = 'ECONNREFUSED imap.example.az';
    const bad = await sync(staff, account.id);
    expect(bad.ok).toBe(false);
    const row = await prisma.mailAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(row.syncStatus).toBe('ERROR');
    expect(row.syncError).toContain('ECONNREFUSED');
    expect(await prisma.mailMessage.count({ where: { accountId: account.id } })).toBe(3);
  });

  it('limits the initial sync to the newest N messages', async () => {
    const staff = await asStaff();
    const account = await makeAccount(staff);
    process.env.MAIL_INITIAL_SYNC_LIMIT = '2';
    const { mailSettings } = await import('../../src/lib/mail/settings.js');
    const before = mailSettings.initialSyncLimit;
    mailSettings.initialSyncLimit = 2;
    try {
      for (let i = 1; i <= 5; i++) await imap.deliver({ from: 'a@x.de', to: 'staff@example.az', subject: `Msg ${i}`, text: 'x', date: new Date(2026, 0, i) });
      await sync(staff, account.id);
      const { items } = await list(staff, { accountId: account.id });
      expect(items.map((m) => m.subject)).toEqual(['Msg 5', 'Msg 4']);
    } finally {
      mailSettings.initialSyncLimit = before;
    }
  });

  it('stores inline cid images eagerly and serves them through /inline; other attachments download lazily', async () => {
    const staff = await asStaff();
    const account = await makeAccount(staff);
    await imap.deliver({
      from: 'a@x.de',
      to: 'staff@example.az',
      subject: 'Logo',
      html: '<p>Hi</p><img src="cid:logo@x">',
      attachments: [
        { filename: 'logo.png', content: SAMPLE.png, contentType: 'image/png', cid: 'logo@x' },
        { filename: 'report.pdf', content: Buffer.from('%PDF-1.4 report'), contentType: 'application/pdf' },
      ],
    });
    await sync(staff, account.id);
    const { items } = await list(staff, { accountId: account.id });
    const detail = (await staff.agent.get(`/api/mail/messages/${items[0]!.id}`)).body.message;
    const inline = detail.attachments.find((a: { inline: boolean }) => a.inline);
    const pdf = detail.attachments.find((a: { inline: boolean }) => !a.inline);
    expect(inline).toMatchObject({ filename: 'logo.png', cached: true });
    expect(pdf).toMatchObject({ filename: 'report.pdf', cached: false });
    expect(detail.html).toContain(`src="/api/mail/inline/${inline.id}"`);
    expect(detail.hasAttachments).toBe(true);

    const img = await staff.agent.get(`/api/mail/inline/${inline.id}`).buffer().parse(binaryParser);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['content-disposition']).toContain('inline');
    expect(Buffer.from(img.body).equals(SAMPLE.png)).toBe(true);

    imap.log.length = 0;
    const dl = await staff.agent.get(`/api/mail/attachments/${pdf.id}`).buffer().parse(binaryParser);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-disposition']).toContain('attachment');
    expect(dl.headers['content-disposition']).toContain('report.pdf');
    expect(Buffer.from(dl.body).toString()).toBe('%PDF-1.4 report');
    expect(imap.log.filter((l) => l.op === 'download')).toHaveLength(1);
    // second download is served from disk
    await staff.agent.get(`/api/mail/attachments/${pdf.id}`).buffer().parse(binaryParser);
    expect(imap.log.filter((l) => l.op === 'download')).toHaveLength(1);
    // not mine
    const other = await asStaff();
    expect((await other.agent.get(`/api/mail/attachments/${pdf.id}`)).status).toBe(404);
    expect((await other.agent.get(`/api/mail/inline/${inline.id}`)).status).toBe(404);
  });

  it('groups replies into threads and the thread endpoint returns the conversation', async () => {
    const staff = await asStaff();
    const account = await makeAccount(staff);
    await imap.deliver({ from: 'a@x.de', to: 'staff@example.az', subject: 'Question', text: 'q', messageId: '<q1@x.de>', date: new Date('2026-10-01T10:00:00Z') });
    await imap.deliver({ from: 'a@x.de', to: 'staff@example.az', subject: 'Re: Question', text: 'follow-up', messageId: '<q2@x.de>', inReplyTo: '<q1@x.de>', references: '<q1@x.de>', date: new Date('2026-10-02T10:00:00Z') });
    await imap.deliver({ from: 'b@x.de', to: 'staff@example.az', subject: 'Other', text: 'o', messageId: '<o1@x.de>', date: new Date('2026-10-01T12:00:00Z') });
    await sync(staff, account.id);
    const flat = await list(staff, { accountId: account.id });
    expect(flat.items).toHaveLength(3);
    const threads = await list(staff, { accountId: account.id, threads: '1' });
    expect(threads.items.map((m) => [m.subject, m.threadCount])).toEqual([
      ['Re: Question', 2],
      ['Other', 1],
    ]);
    const thread = await staff.agent.get(`/api/mail/messages/${threads.items[0]!.id}/thread`);
    expect(thread.body.messages.map((m: { subject: string }) => m.subject)).toEqual(['Question', 'Re: Question']);
  });
});

describe('mail: listing, filters, search', () => {
  it('filters by view, folder, unread, attachments, label, from/to and searches subject/body', async () => {
    const staff = await asStaff();
    const account = await seeded(staff);
    expect((await list(staff, { view: 'unread' })).items.map((m) => m.subject)).toEqual(['Contract draft', 'Visa documents']);
    expect((await list(staff, { view: 'flagged' })).items.map((m) => m.subject)).toEqual(['Contract draft']);
    expect((await list(staff, { accountId: account.id, hasAttachments: '1' })).items.map((m) => m.subject)).toEqual(['Contract draft']);
    expect((await list(staff, { view: 'sent' })).items).toEqual([]);
    expect((await list(staff, { q: 'documents' })).items.map((m) => m.subject)).toEqual(['Visa documents']);
    expect((await list(staff, { q: 'contract' })).items.map((m) => m.subject)).toEqual(['Contract draft']);
    expect((await list(staff, { q: 'Termin' })).items.map((m) => m.subject)).toEqual(['Termin bestätigt']);
    expect((await list(staff, { q: 'zzzz-nothing' })).items).toEqual([]);
    expect((await list(staff, { from: 'partner.de' })).items.map((m) => m.subject)).toEqual(['Contract draft']);
    expect((await list(staff, { from: 'aysel', q: 'documents' })).items.map((m) => m.subject)).toEqual(['Visa documents']);
    expect((await list(staff, { to: 'staff@example.az' })).items).toHaveLength(3);
    expect((await list(staff, { to: 'nobody@else' })).items).toEqual([]);

    const folders = (await staff.agent.get('/api/mail/folders')).body.folders as { id: string; role: string }[];
    const trash = folders.find((f) => f.role === 'TRASH')!;
    expect((await list(staff, { folderId: trash.id })).items).toEqual([]);
    expect((await staff.agent.get('/api/mail/messages').query({ folderId: 'nope' })).status).toBe(404);

    const label = (await staff.agent.post('/api/mail/labels').send({ name: 'Embassy', color: '#ff0000' })).body.label;
    const termin = (await list(staff, { q: 'Termin' })).items[0]!;
    await staff.agent.post(`/api/mail/messages/${termin.id}/labels`).send({ add: [label.id] });
    expect((await list(staff, { labelId: label.id })).items.map((m) => m.id)).toEqual([termin.id]);
  });

  it('paginates with cursors and pages', async () => {
    const staff = await asStaff();
    const account = await makeAccount(staff);
    for (let i = 1; i <= 7; i++) await imap.deliver({ from: 'a@x.de', to: 'staff@example.az', subject: `N${i}`, text: 'x', date: new Date(2026, 5, i) });
    await sync(staff, account.id);
    const p1 = await list(staff, { accountId: account.id, limit: '3' });
    expect(p1.items.map((m) => m.subject)).toEqual(['N7', 'N6', 'N5']);
    expect(p1.nextCursor).toBeTruthy();
    const p2 = await list(staff, { accountId: account.id, limit: '3', cursor: p1.nextCursor! });
    expect(p2.items.map((m) => m.subject)).toEqual(['N4', 'N3', 'N2']);
    const p3 = await list(staff, { accountId: account.id, limit: '3', cursor: p2.nextCursor! });
    expect(p3.items.map((m) => m.subject)).toEqual(['N1']);
    expect(p3.nextCursor).toBeNull();
    const paged = await list(staff, { accountId: account.id, limit: '5', page: '2' });
    expect(paged.items.map((m) => m.subject)).toEqual(['N2', 'N1']);
    expect(paged.total).toBe(7);
  });

  it('never shows another staff member my messages', async () => {
    const me = await asStaff();
    const other = await asStaff();
    await seeded(me);
    const mine = (await list(me, {})).items;
    expect((await list(other, {})).items).toEqual([]);
    expect((await other.agent.get(`/api/mail/messages/${mine[0]!.id}`)).status).toBe(404);
    expect((await other.agent.post(`/api/mail/messages/${mine[0]!.id}/read`)).status).toBe(404);
    expect((await other.agent.post('/api/mail/messages/bulk').send({ ids: [mine[0]!.id], action: 'trash' })).status).toBe(404);
    expect((await other.agent.get(`/api/mail/messages/${mine[0]!.id}/thread`)).status).toBe(404);
    expect(await prisma.mailMessage.count()).toBe(3);
  });
});

describe('mail: actions', () => {
  it('read/unread/flag mirror to the server and update counts', async () => {
    const staff = await asStaff();
    const account = await seeded(staff);
    const visa = (await list(staff, { q: 'documents' })).items[0]!;
    const r = await staff.agent.post(`/api/mail/messages/${visa.id}/read`);
    expect(r.status).toBe(200);
    expect(r.body.message.seen).toBe(true);
    await flushRemote();
    expect(imap.message('INBOX', 1)!.flags.has('\\Seen')).toBe(true);
    expect((await staff.agent.get('/api/mail/summary')).body).toMatchObject({ unread: 1, accounts: [{ id: account.id, unread: 1 }] });

    await staff.agent.post(`/api/mail/messages/${visa.id}/unread`);
    await staff.agent.post(`/api/mail/messages/${visa.id}/flag`);
    await flushRemote();
    expect(imap.message('INBOX', 1)!.flags.has('\\Seen')).toBe(false);
    expect(imap.message('INBOX', 1)!.flags.has('\\Flagged')).toBe(true);
    expect((await staff.agent.get('/api/mail/summary')).body.unread).toBe(2);
    await staff.agent.post(`/api/mail/messages/${visa.id}/unflag`);
    await flushRemote();
    expect(imap.message('INBOX', 1)!.flags.has('\\Flagged')).toBe(false);
  });

  it('trash, archive, move and permanent delete (bulk)', async () => {
    const staff = await asStaff();
    const account = await seeded(staff);
    const items = (await list(staff, {})).items;
    const [contract, termin, visa] = items;
    const bulk = await staff.agent.post('/api/mail/messages/bulk').send({ ids: [contract!.id, termin!.id], action: 'trash' });
    expect(bulk.status).toBe(200);
    await flushRemote();
    expect((await list(staff, {})).items.map((m) => m.id)).toEqual([visa!.id]);
    expect((await list(staff, { view: 'trash' })).items).toHaveLength(2);
    expect(imap.folder('INBOX').messages.size).toBe(1);
    expect(imap.folder('Trash').messages.size).toBe(2);
    const folders = (await staff.agent.get('/api/mail/folders')).body.folders as { id: string; role: string; total: number; unread: number }[];
    expect(folders.find((f) => f.role === 'TRASH')).toMatchObject({ total: 2 });
    expect(folders.find((f) => f.role === 'INBOX')).toMatchObject({ total: 1, unread: 1 });

    // trashing again from the bin deletes for good
    await staff.agent.post(`/api/mail/messages/${termin!.id}/trash`);
    await flushRemote();
    expect(await prisma.mailMessage.findUnique({ where: { id: termin!.id } })).toBeNull();
    expect((await list(staff, { view: 'trash' })).items).toHaveLength(1);

    const archive = await staff.agent.post(`/api/mail/messages/${visa!.id}/archive`);
    expect(archive.body.message.folderRole).toBe('ARCHIVE');
    await flushRemote();
    expect(imap.folder('Archive').messages.size).toBe(1);

    const inbox = folders.find((f) => f.role === 'INBOX')!;
    const move = await staff.agent.post(`/api/mail/messages/${contract!.id}/move`).send({ folderId: inbox.id });
    expect(move.body.message.folderRole).toBe('INBOX');
    expect((await staff.agent.post(`/api/mail/messages/${contract!.id}/move`).send({})).status).toBe(400);
    expect((await staff.agent.post(`/api/mail/messages/${contract!.id}/move`).send({ folderId: 'nope' })).status).toBe(404);

    const del = await staff.agent.delete(`/api/mail/messages/${contract!.id}`);
    expect(del.status).toBe(200);
    expect(await prisma.mailMessage.count({ where: { accountId: account.id } })).toBe(1);
    // a sync afterwards does not resurrect anything (uids beyond lastUid are known)
    await sync(staff, account.id);
    expect(await prisma.mailMessage.count({ where: { accountId: account.id, folder: { role: 'INBOX' } } })).toBe(0);
  });

  it('snoozes with a date or preset, hides the message until the job wakes it up', async () => {
    const staff = await asStaff();
    await seeded(staff);
    const visa = (await list(staff, { q: 'documents' })).items[0]!;
    const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const r = await staff.agent.post(`/api/mail/messages/${visa.id}/snooze`).send({ until });
    expect(r.status).toBe(200);
    expect(r.body.message.snoozedUntil).toBe(until);
    expect((await list(staff, {})).items.map((m) => m.id)).not.toContain(visa.id);
    expect((await list(staff, { view: 'snoozed' })).items.map((m) => m.id)).toEqual([visa.id]);
    expect((await staff.agent.get('/api/mail/folders')).body.views.snoozed).toBe(1);
    expect((await staff.agent.post(`/api/mail/messages/${visa.id}/snooze`).send({ until: '2000-01-01T00:00:00Z' })).status).toBe(400);
    expect((await staff.agent.post(`/api/mail/messages/${visa.id}/snooze`).send({})).status).toBe(400);

    // not due yet
    expect(await wakeSnoozed(new Date())).toBe(0);
    expect(await wakeSnoozed(new Date(Date.now() + 2 * 60 * 60 * 1000))).toBe(1);
    const back = (await list(staff, {})).items.find((m) => m.id === visa.id)!;
    expect(back.seen).toBe(false);
    expect((await list(staff, { view: 'snoozed' })).items).toEqual([]);

    const preset = await staff.agent.post(`/api/mail/messages/${visa.id}/snooze`).send({ preset: 'tomorrow', tzOffset: -240 });
    expect(preset.status).toBe(200);
    expect(new Date(preset.body.message.snoozedUntil).getTime()).toBeGreaterThan(Date.now());
    await staff.agent.post(`/api/mail/messages/${visa.id}/unsnooze`);
    expect((await list(staff, {})).items.map((m) => m.id)).toContain(visa.id);
  });

  it('links a message to a case and labels in bulk', async () => {
    const staff = await asStaff();
    await seeded(staff);
    const { user: client } = await createClient({ firstName: 'Aysel', lastName: 'Mammadova' });
    const c = await prisma.case.create({ data: { number: uniq('TV-'), clientId: client.id, profession: 'Driver' } });
    const items = (await list(staff, {})).items;
    const linked = await staff.agent.post(`/api/mail/messages/${items[0]!.id}/link-case`).send({ caseId: c.id });
    expect(linked.status).toBe(200);
    expect(linked.body.message.case).toMatchObject({ id: c.id, number: c.number, clientName: 'Aysel Mammadova' });
    expect((await staff.agent.post(`/api/mail/messages/${items[0]!.id}/link-case`).send({ caseId: 'nope' })).status).toBe(400);
    const unlinked = await staff.agent.post(`/api/mail/messages/${items[0]!.id}/link-case`).send({ caseId: null });
    expect(unlinked.body.message.case).toBeNull();

    const label = (await staff.agent.post('/api/mail/labels').send({ name: 'Clients', color: '#00aa00' })).body.label;
    const b = await staff.agent.post('/api/mail/messages/bulk').send({ ids: items.map((m) => m.id), action: 'label', labelId: label.id });
    expect(b.status).toBe(200);
    expect((await list(staff, { labelId: label.id })).items).toHaveLength(3);
    await staff.agent.post('/api/mail/messages/bulk').send({ ids: [items[0]!.id], action: 'unlabel', labelId: label.id });
    expect((await list(staff, { labelId: label.id })).items).toHaveLength(2);
    expect((await staff.agent.post('/api/mail/messages/bulk').send({ ids: [items[0]!.id], action: 'label' })).status).toBe(400);
    expect((await staff.agent.post('/api/mail/messages/bulk').send({ ids: [items[0]!.id], action: 'explode' })).status).toBe(400);
  });
});

describe('mail: drafts and sending', () => {
  it('creates, autosaves and deletes drafts (sanitised html) in a local Drafts folder before the first sync', async () => {
    const staff = await asStaff();
    const account = await makeAccount(staff);
    const created = await staff.agent.post('/api/mail/drafts').send({ accountId: account.id, to: [{ name: 'Aysel', address: 'aysel@client.az' }], subject: 'Hello', html: '<p>Hi<script>x</script></p>' });
    expect(created.status).toBe(201);
    expect(created.body.draft).toMatchObject({ isDraft: true, folderRole: 'DRAFTS', subject: 'Hello', html: '<p>Hi</p>', to: [{ name: 'Aysel', address: 'aysel@client.az' }] });
    expect((await list(staff, { view: 'drafts' })).items.map((m) => m.id)).toEqual([created.body.draft.id]);
    const patched = await staff.agent.patch(`/api/mail/drafts/${created.body.draft.id}`).send({ subject: 'Hello again', cc: [{ address: 'cc@x.de' }] });
    expect(patched.status).toBe(200);
    expect(patched.body.draft).toMatchObject({ subject: 'Hello again', cc: [{ name: '', address: 'cc@x.de' }], to: [{ address: 'aysel@client.az' }] });
    expect((await staff.agent.post('/api/mail/drafts').send({ accountId: account.id, to: [{ address: 'bad' }], html: '' })).status).toBe(400);
    const other = await asStaff();
    expect((await other.agent.patch(`/api/mail/drafts/${created.body.draft.id}`).send({ subject: 'x' })).status).toBe(404);
    expect((await staff.agent.delete(`/api/mail/drafts/${created.body.draft.id}`)).status).toBe(200);
    expect((await list(staff, { view: 'drafts' })).items).toEqual([]);
    // the placeholder folder is merged with the real one on sync
    await sync(staff, account.id);
    const folders = (await staff.agent.get('/api/mail/folders')).body.folders as { role: string; local: boolean; path: string }[];
    expect(folders.filter((f) => f.role === 'DRAFTS')).toEqual([expect.objectContaining({ local: false, path: 'Drafts' })]);
  });

  it('uploads attachments to a draft with content checks and sends them', async () => {
    const staff = await asStaff();
    const account = await makeAccount(staff);
    const draft = (await staff.agent.post('/api/mail/drafts').send({ accountId: account.id, to: [{ address: 'aysel@client.az' }], subject: 'Docs', html: '<p>See attached</p>' })).body.draft;
    const up = await staff.agent.post(`/api/mail/drafts/${draft.id}/attachments`).attach('file', SAMPLE.png, { filename: 'photo.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    expect(up.body.attachment).toMatchObject({ filename: 'photo.png', mimeType: 'image/png', cached: true });
    const fake = await staff.agent.post(`/api/mail/drafts/${draft.id}/attachments`).attach('file', Buffer.from('<script>'), { filename: 'evil.png', contentType: 'image/png' });
    expect(fake.status).toBe(400);
    expect(fake.body.error).toBe('FILE_CONTENT_MISMATCH');
    const exe = await staff.agent.post(`/api/mail/drafts/${draft.id}/attachments`).attach('file', Buffer.from('MZ'), { filename: 'x.exe', contentType: 'application/octet-stream' });
    expect(exe.status).toBe(400);
    const pdf = await staff.agent.post(`/api/mail/drafts/${draft.id}/attachments`).attach('file', Buffer.from('%PDF-1.4 x'), { filename: 'cv.pdf', contentType: 'application/pdf' });
    expect(pdf.status).toBe(201);
    expect((await staff.agent.delete(`/api/mail/drafts/${draft.id}/attachments/${pdf.body.attachment.id}`)).status).toBe(200);

    const sent = await staff.agent.post('/api/mail/send').send({
      accountId: account.id,
      draftId: draft.id,
      to: [{ name: 'Aysel', address: 'aysel@client.az' }],
      subject: 'Docs',
      html: '<p>See attached</p>',
      attachmentIds: [up.body.attachment.id],
    });
    expect(sent.status).toBe(201);
    expect(sent.body.message).toMatchObject({ isDraft: false, folderRole: 'SENT', seen: true, hasAttachments: true, subject: 'Docs' });
    expect(sent.body.message.attachments).toHaveLength(1);
    expect(smtp.sent).toHaveLength(1);
    const raw = smtp.sent[0]!.raw.toString();
    expect(smtp.sent[0]!.envelope).toEqual({ from: 'staff@example.az', to: ['aysel@client.az'] });
    expect(raw).toContain('Subject: Docs');
    expect(raw).toContain('filename=photo.png');
    expect(raw).toContain('From: Staff Member <staff@example.az>');
    expect(await prisma.mailMessage.count({ where: { isDraft: true } })).toBe(0);
    expect((await list(staff, { view: 'sent' })).items.map((m) => m.subject)).toEqual(['Docs']);
    // before the first sync the Sent folder is local: nothing is appended to the server
    await flushRemote();
    expect(imap.log.filter((l) => l.op === 'append')).toHaveLength(0);
  });

  it('replies set In-Reply-To/References, mark the original answered, append to the server Sent folder and add contacts', async () => {
    const staff = await asStaff();
    const account = await seeded(staff);
    const visa = (await list(staff, { q: 'documents' })).items[0]!;
    const res = await staff.agent.post('/api/mail/send').send({
      accountId: account.id,
      replyToMessageId: visa.id,
      to: [{ name: 'Aysel Mammadova', address: 'aysel@client.az' }],
      cc: [{ address: 'kamran@partner.de' }],
      subject: 'Re: Visa documents',
      html: '<p>Thank you.</p><blockquote>Hello</blockquote>',
    });
    expect(res.status).toBe(201);
    expect(res.body.message.threadKey).toBe('m1@client.az');
    expect(res.body.message.inReplyTo).toBe('m1@client.az');
    const raw = smtp.sent[0]!.raw.toString();
    expect(raw).toContain('In-Reply-To: <m1@client.az>');
    expect(raw).toContain('References: <m1@client.az>');
    expect(raw).toContain('Cc: kamran@partner.de');
    expect(smtp.sent[0]!.envelope.to.sort()).toEqual(['aysel@client.az', 'kamran@partner.de']);
    expect((await prisma.mailMessage.findUniqueOrThrow({ where: { id: visa.id } })).answered).toBe(true);
    await flushRemote();
    expect(imap.message('INBOX', 1)!.flags.has('\\Answered')).toBe(true);
    expect(imap.folder('Sent').messages.size).toBe(1);
    const sentRow = await prisma.mailMessage.findUniqueOrThrow({ where: { id: res.body.message.id } });
    expect(sentRow.uid).toBe(1n);
    // the thread now has both
    const thread = await staff.agent.get(`/api/mail/messages/${visa.id}/thread`);
    expect(thread.body.messages.map((m: { subject: string }) => m.subject)).toEqual(['Visa documents', 'Re: Visa documents']);
    // a later sync of Sent adopts the appended row instead of duplicating it
    await sync(staff, account.id);
    expect(await prisma.mailMessage.count({ where: { accountId: account.id, folder: { role: 'SENT' } } })).toBe(1);

    const contacts = await prisma.contact.findMany({ orderBy: { email: 'asc' } });
    expect(contacts.map((c) => [c.email, c.firstName, c.lastName, c.source, c.shared, c.createdById])).toEqual([
      ['aysel@client.az', 'Aysel', 'Mammadova', 'MAIL', true, staff.user.id],
      ['kamran@partner.de', 'Kamran', null, 'MAIL', true, staff.user.id],
    ]);
    // opening a message also records its correspondents, without duplicates
    const termin = (await list(staff, { q: 'Termin' })).items[0]!;
    await staff.agent.get(`/api/mail/messages/${termin.id}`);
    await waitFor(() => prisma.contact.findFirst({ where: { email: 'termin@auswaertiges-amt.de' } }));
    await staff.agent.get(`/api/mail/messages/${visa.id}`);
    expect(await prisma.contact.count()).toBe(3);
  });

  it('validates recipients, enforces the hourly limit and reports SMTP failures', async () => {
    const staff = await asStaff();
    const account = await makeAccount(staff);
    const base = { accountId: account.id, subject: 'x', html: '<p>x</p>' };
    expect((await staff.agent.post('/api/mail/send').send({ ...base, to: [] })).status).toBe(400);
    expect((await staff.agent.post('/api/mail/send').send({ ...base, to: [{ address: 'not-an-address' }] })).status).toBe(400);
    const many = Array.from({ length: 51 }, (_, i) => ({ address: `r${i}@x.de` }));
    expect((await staff.agent.post('/api/mail/send').send({ ...base, to: many })).status).toBe(400);
    expect((await staff.agent.post('/api/mail/send').send({ ...base, to: [{ address: 'a@x.de' }], attachmentIds: ['nope'] })).status).toBe(400);
    const other = await asStaff();
    expect((await other.agent.post('/api/mail/send').send({ ...base, to: [{ address: 'a@x.de' }] })).status).toBe(404);

    smtp.fail = '535 Authentication failed';
    const failed = await staff.agent.post('/api/mail/send').send({ ...base, to: [{ address: 'a@x.de' }] });
    expect(failed.status).toBe(502);
    expect(failed.body.error).toBe('MAIL_SEND_FAILED');
    expect(await prisma.mailMessage.count({ where: { accountId: account.id } })).toBe(0);
    smtp.fail = null;

    const { mailSettings } = await import('../../src/lib/mail/settings.js');
    const before = mailSettings.sendPerHour;
    mailSettings.sendPerHour = 2;
    try {
      expect((await staff.agent.post('/api/mail/send').send({ ...base, to: [{ address: 'a@x.de' }] })).status).toBe(201);
      expect((await staff.agent.post('/api/mail/send').send({ ...base, to: [{ address: 'a@x.de' }] })).status).toBe(201);
      const limited = await staff.agent.post('/api/mail/send').send({ ...base, to: [{ address: 'a@x.de' }] });
      expect(limited.status).toBe(429);
      expect(limited.body.error).toBe('MAIL_SEND_LIMIT');
    } finally {
      mailSettings.sendPerHour = before;
    }
  });

  it('suggests recent correspondents', async () => {
    const staff = await asStaff();
    const account = await seeded(staff);
    await staff.agent.post('/api/mail/send').send({ accountId: account.id, to: [{ name: 'Nigar', address: 'nigar@new.az' }], subject: 'x', html: '<p>x</p>' });
    const all = await staff.agent.get('/api/mail/recipients');
    expect(all.status).toBe(200);
    expect(all.body.recipients.map((r: { address: string }) => r.address)).toEqual(expect.arrayContaining(['aysel@client.az', 'kamran@partner.de', 'nigar@new.az']));
    const q = await staff.agent.get('/api/mail/recipients').query({ q: 'nig' });
    expect(q.body.recipients).toEqual([{ name: 'Nigar', address: 'nigar@new.az' }]);
    const empty = await asStaff();
    expect((await empty.agent.get('/api/mail/recipients')).body.recipients).toEqual([]);
  });
});

describe('mail: labels, rules, templates', () => {
  it('labels: CRUD, unique per user, cascade from messages', async () => {
    const staff = await asStaff();
    const other = await asStaff();
    const created = await staff.agent.post('/api/mail/labels').send({ name: 'Urgent', color: '#ff0000' });
    expect(created.status).toBe(201);
    expect((await staff.agent.post('/api/mail/labels').send({ name: 'Urgent', color: '#ff0000' })).status).toBe(409);
    expect((await staff.agent.post('/api/mail/labels').send({ name: 'Bad', color: 'red' })).status).toBe(400);
    const patched = await staff.agent.patch(`/api/mail/labels/${created.body.label.id}`).send({ name: 'Very urgent' });
    expect(patched.body.label.name).toBe('Very urgent');
    expect((await other.agent.patch(`/api/mail/labels/${created.body.label.id}`).send({ name: 'x' })).status).toBe(404);
    expect((await other.agent.get('/api/mail/labels')).body.labels).toEqual([]);
    expect((await staff.agent.get('/api/mail/labels')).body.labels).toHaveLength(1);
    expect((await staff.agent.delete(`/api/mail/labels/${created.body.label.id}`)).status).toBe(200);
    expect((await staff.agent.get('/api/mail/labels')).body.labels).toEqual([]);
  });

  it('rules: validation, apply to new inbox mail during sync, run on the existing inbox', async () => {
    const staff = await asStaff();
    const account = await makeAccount(staff);
    const label = (await staff.agent.post('/api/mail/labels').send({ name: 'Embassy', color: '#0000ff' })).body.label;
    expect((await staff.agent.post('/api/mail/rules').send({ name: 'x', conditions: {}, actions: { markRead: true } })).status).toBe(400);
    expect((await staff.agent.post('/api/mail/rules').send({ name: 'x', conditions: { from: 'a' }, actions: {} })).status).toBe(400);
    expect((await staff.agent.post('/api/mail/rules').send({ name: 'x', conditions: { from: 'a' }, actions: { addLabelId: 'nope' } })).status).toBe(400);
    const rule = await staff.agent.post('/api/mail/rules').send({ name: 'Embassy mail', conditions: { from: 'auswaertiges-amt.de' }, actions: { addLabelId: label.id, markRead: true, flag: true } });
    expect(rule.status).toBe(201);
    expect(rule.body.rule).toMatchObject({ name: 'Embassy mail', enabled: true, conditions: { match: 'all', from: 'auswaertiges-amt.de' } });

    await imap.deliver({ from: 'termin@auswaertiges-amt.de', to: 'staff@example.az', subject: 'Termin', text: 'x' });
    await imap.deliver({ from: 'someone@else.de', to: 'staff@example.az', subject: 'Other', text: 'x' });
    await sync(staff, account.id);
    await flushRemote();
    const { items } = await list(staff, {});
    const termin = items.find((m) => m.subject === 'Termin')!;
    expect(termin).toMatchObject({ seen: true, flagged: true });
    expect(items.find((m) => m.subject === 'Other')).toMatchObject({ seen: false, flagged: false });
    expect((await list(staff, { labelId: label.id })).items.map((m) => m.id)).toEqual([termin.id]);
    expect(imap.message('INBOX', 1)!.flags.has('\\Seen')).toBe(true);

    // a new rule that moves to Trash, run against the existing inbox
    const folders = (await staff.agent.get('/api/mail/folders')).body.folders as { id: string; role: string }[];
    const trash = folders.find((f) => f.role === 'TRASH')!;
    const mover = await staff.agent.post('/api/mail/rules').send({ name: 'Bin it', conditions: { subject: 'other' }, actions: { moveToFolderId: trash.id } });
    expect(mover.status).toBe(201);
    const run = await staff.agent.post(`/api/mail/rules/${mover.body.rule.id}/run`);
    expect(run.status).toBe(200);
    expect(run.body.matched).toBe(1);
    await flushRemote();
    expect((await list(staff, { view: 'trash' })).items.map((m) => m.subject)).toEqual(['Other']);
    expect(imap.folder('Trash').messages.size).toBe(1);

    // disabled rules are skipped; patch/delete; other users cannot touch mine
    await staff.agent.patch(`/api/mail/rules/${rule.body.rule.id}`).send({ enabled: false });
    await imap.deliver({ from: 'termin@auswaertiges-amt.de', to: 'staff@example.az', subject: 'Termin 2', text: 'x' });
    await sync(staff, account.id);
    expect((await list(staff, {})).items.find((m) => m.subject === 'Termin 2')).toMatchObject({ seen: false });
    const other = await asStaff();
    expect((await other.agent.delete(`/api/mail/rules/${rule.body.rule.id}`)).status).toBe(404);
    expect((await other.agent.post(`/api/mail/rules/${rule.body.rule.id}/run`)).status).toBe(404);
    expect((await staff.agent.get('/api/mail/rules')).body.rules).toHaveLength(2);
    expect((await staff.agent.delete(`/api/mail/rules/${rule.body.rule.id}`)).status).toBe(200);
  });

  it('templates: personal and shared, edited by the author or an admin', async () => {
    const author = await asStaff();
    const colleague = await asStaff();
    const admin = await asAdmin();
    const priv = await author.agent.post('/api/mail/templates').send({ name: 'Private', html: '<p>mine</p>' });
    const shared = await author.agent.post('/api/mail/templates').send({ name: 'Welcome', subject: 'Welcome to Triad Vision', html: '<p>Hello<script>x</script></p>', shared: true });
    expect(priv.status).toBe(201);
    expect(shared.status).toBe(201);
    expect(shared.body.template).toMatchObject({ shared: true, mine: true, canEdit: true, html: '<p>Hello</p>' });
    const mine = await author.agent.get('/api/mail/templates');
    expect(mine.body.templates.map((t: { name: string }) => t.name)).toEqual(['Private', 'Welcome']);
    const theirs = await colleague.agent.get('/api/mail/templates');
    expect(theirs.body.templates.map((t: { name: string; canEdit: boolean; mine: boolean }) => [t.name, t.mine, t.canEdit])).toEqual([['Welcome', false, false]]);
    expect((await colleague.agent.patch(`/api/mail/templates/${shared.body.template.id}`).send({ name: 'x' })).status).toBe(403);
    expect((await colleague.agent.patch(`/api/mail/templates/${priv.body.template.id}`).send({ name: 'x' })).status).toBe(404);
    expect((await admin.agent.patch(`/api/mail/templates/${shared.body.template.id}`).send({ name: 'Welcome v2' })).status).toBe(200);
    expect((await admin.agent.get('/api/mail/templates')).body.templates[0]).toMatchObject({ name: 'Welcome v2', canEdit: true, mine: false });
    expect((await admin.agent.delete(`/api/mail/templates/${priv.body.template.id}`)).status).toBe(404);
    expect((await author.agent.delete(`/api/mail/templates/${priv.body.template.id}`)).status).toBe(200);
    expect((await colleague.agent.delete(`/api/mail/templates/${shared.body.template.id}`)).status).toBe(403);
  });
});
