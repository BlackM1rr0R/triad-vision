import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asStaff, asSuperAdmin, type Actor } from '../helpers/api';
import { prisma } from '../helpers/db';
import { FakeImapServer } from '../../src/lib/mail/imapFake.js';
import { setImapFactory } from '../../src/lib/mail/imap.js';
import { FakeSmtp, setSmtpFactory } from '../../src/lib/mail/smtp.js';
import { flushRemote } from '../../src/lib/mail/core.js';
import { resetMailboxOpenLog } from '../../src/lib/mail/access.js';

/**
 * Shared workspace mailboxes (lib/mail/access, Access Center › Mailboxes): owners keep their mailbox private
 * unless a SUPER_ADMIN gives a colleague "read" or "read + send"; a SUPER_ADMIN reads every mailbox; grants,
 * revokes and openings of someone else's mailbox are audit-logged.
 */
let imap: FakeImapServer;
let smtp: FakeSmtp;

beforeEach(() => {
  imap = new FakeImapServer();
  imap.credentials = { username: 'owner@example.az', password: 'app-password' };
  smtp = new FakeSmtp();
  setImapFactory(imap.createFactory());
  setSmtpFactory(smtp.createFactory());
  resetMailboxOpenLog();
});

afterEach(async () => {
  await flushRemote();
  setImapFactory(null);
  setSmtpFactory(null);
});

const setup = async () => {
  const owner = await asStaff();
  const res = await owner.agent.post('/api/mail/accounts').send({
    email: 'owner@example.az',
    displayName: 'Owner',
    provider: 'CUSTOM',
    imapHost: 'imap.example.az',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.example.az',
    smtpPort: 465,
    smtpSecure: true,
    username: 'owner@example.az',
    password: 'app-password',
    syncEnabled: false,
  });
  expect(res.status).toBe(201);
  const account = res.body.account as { id: string };
  await imap.deliver({
    from: 'Aysel <aysel@client.az>',
    to: 'owner@example.az',
    subject: 'Visa documents',
    text: 'Hello',
    attachments: [{ filename: 'contract.pdf', content: Buffer.from('%PDF-1.4 test'), contentType: 'application/pdf' }],
    messageId: '<s1@client.az>',
    date: new Date('2026-10-01T10:00:00Z'),
  });
  expect((await owner.agent.post(`/api/mail/accounts/${account.id}/sync`)).status).toBe(200);
  const list = await owner.agent.get('/api/mail/messages').query({ accountId: account.id });
  const message = list.body.items[0] as { id: string };
  const detail = await owner.agent.get(`/api/mail/messages/${message.id}`);
  const attachmentId = detail.body.message.attachments[0].id as string;
  return { owner, account, messageId: message.id, attachmentId };
};

const grant = async (sa: Actor, accountId: string, userId: string, level: 'READ' | 'SEND') => {
  const res = await sa.agent.post('/api/admin/access/mailboxes/grants').send({ accountId, userId, level });
  expect([200, 201]).toContain(res.status);
  return res.body.grant as { id: string };
};

const sendBody = (accountId: string) => ({ accountId, to: [{ name: '', address: 'a@x.de' }], subject: 'Re', html: '<p>Hi</p>' });

describe('shared mailboxes', () => {
  it('owner sees their own mailbox; other staff and admins get 404 without a grant', async () => {
    const { owner, account, messageId, attachmentId } = await setup();
    expect((await owner.agent.get(`/api/mail/messages/${messageId}`)).body.message.access).toBe('OWNER');
    for (const other of [await asStaff(), await asAdmin()]) {
      expect((await other.agent.get('/api/mail/messages').query({ accountId: account.id })).status).toBe(404);
      expect((await other.agent.get('/api/mail/folders').query({ accountId: account.id })).status).toBe(404);
      expect((await other.agent.get(`/api/mail/messages/${messageId}`)).status).toBe(404);
      expect((await other.agent.get(`/api/mail/attachments/${attachmentId}`)).status).toBe(404);
      expect((await other.agent.post('/api/mail/send').send(sendBody(account.id))).status).toBe(404);
      expect((await other.agent.get('/api/mail/mailboxes')).body.shared).toEqual([]);
    }
  });

  it('a read grant opens the mailbox for reading only', async () => {
    const { account, messageId, attachmentId } = await setup();
    const sa = await asSuperAdmin();
    const colleague = await asStaff();
    await grant(sa, account.id, colleague.user.id, 'READ');

    const boxes = await colleague.agent.get('/api/mail/mailboxes');
    expect(boxes.body.shared).toEqual([expect.objectContaining({ id: account.id, access: 'READ' })]);
    const folders = await colleague.agent.get('/api/mail/folders').query({ accountId: account.id });
    expect(folders.status).toBe(200);
    expect(folders.body.accounts[0]).toMatchObject({ id: account.id, access: 'READ', imapHost: '', username: '' });
    expect(JSON.stringify(folders.body)).not.toContain('app-password');
    expect((await colleague.agent.get('/api/mail/messages').query({ accountId: account.id })).body.items).toHaveLength(1);
    expect((await colleague.agent.get(`/api/mail/messages/${messageId}`)).body.message.access).toBe('READ');
    expect((await colleague.agent.get(`/api/mail/attachments/${attachmentId}`)).status).toBe(200);
    // Not merged into the colleague's own "all mailboxes" view.
    expect((await colleague.agent.get('/api/mail/messages')).body.items).toEqual([]);

    expect((await colleague.agent.post('/api/mail/send').send(sendBody(account.id))).body.error).toBe('MAIL_READ_ONLY');
    expect((await colleague.agent.post(`/api/mail/messages/${messageId}/read`)).status).toBe(403);
    expect((await colleague.agent.post('/api/mail/messages/bulk').send({ ids: [messageId], action: 'trash' })).status).toBe(403);
    expect((await colleague.agent.post('/api/mail/drafts').send({ accountId: account.id, subject: 'x' })).status).toBe(403);
    // Settings stay with the owner.
    expect((await colleague.agent.patch(`/api/mail/accounts/${account.id}`).send({ displayName: 'x' })).status).toBe(404);
    expect((await colleague.agent.get(`/api/mail/accounts/${account.id}/access`)).status).toBe(404);
    expect(smtp.sent).toHaveLength(0);
  });

  it('a send grant allows replying as the mailbox', async () => {
    const { account, messageId } = await setup();
    const sa = await asSuperAdmin();
    const colleague = await asStaff();
    await grant(sa, account.id, colleague.user.id, 'SEND');
    const res = await colleague.agent.post('/api/mail/send').send({ ...sendBody(account.id), replyToMessageId: messageId });
    expect(res.status).toBe(201);
    expect(smtp.sent).toHaveLength(1);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'MAIL_SENT', actorId: colleague.user.id } });
    expect(audit?.details).toMatchObject({ accountId: account.id, onBehalfOf: expect.any(String) });
  });

  it('a super admin reads every mailbox without a grant, but cannot send', async () => {
    const { account, messageId } = await setup();
    const sa = await asSuperAdmin();
    const boxes = await sa.agent.get('/api/mail/mailboxes');
    expect(boxes.body.shared).toEqual([expect.objectContaining({ id: account.id, access: 'READ' })]);
    expect((await sa.agent.get(`/api/mail/messages/${messageId}`)).status).toBe(200);
    expect((await sa.agent.post('/api/mail/send').send(sendBody(account.id))).status).toBe(403);
  });

  it('only a super admin manages grants; revoking removes access; everything is audit-logged once', async () => {
    const { owner, account, messageId } = await setup();
    const sa = await asSuperAdmin();
    const colleague = await asStaff();
    const admin = await asAdmin();
    expect((await admin.agent.get('/api/admin/access/mailboxes')).status).toBe(403);
    expect((await admin.agent.post('/api/admin/access/mailboxes/grants').send({ accountId: account.id, userId: colleague.user.id, level: 'READ' })).status).toBe(403);
    expect((await sa.agent.post('/api/admin/access/mailboxes/grants').send({ accountId: account.id, userId: owner.user.id, level: 'READ' })).body.error).toBe('OWNER_HAS_ACCESS');

    const g = await grant(sa, account.id, colleague.user.id, 'READ');
    const overview = await sa.agent.get('/api/admin/access/mailboxes');
    expect(overview.status).toBe(200);
    expect(overview.body.mailboxes[0]).toMatchObject({ id: account.id, owner: { id: owner.user.id }, grants: [{ id: g.id, level: 'READ', user: { id: colleague.user.id } }] });
    expect(JSON.stringify(overview.body)).not.toMatch(/passwordEnc|app-password/);

    // The owner sees who has access and gets a notice.
    const mine = await owner.agent.get(`/api/mail/accounts/${account.id}/access`);
    expect(mine.body.grants).toEqual([expect.objectContaining({ level: 'READ', user: expect.objectContaining({ id: colleague.user.id }) })]);
    expect(mine.body.superAdmins.map((u: { id: string }) => u.id)).toContain(sa.user.id);
    expect(await prisma.notification.count({ where: { userId: owner.user.id, type: 'MAIL_ACCESS' } })).toBe(1);

    // Opening is logged once per day, not per message.
    await colleague.agent.get('/api/mail/messages').query({ accountId: account.id });
    await colleague.agent.get(`/api/mail/messages/${messageId}`);
    await colleague.agent.get(`/api/mail/messages/${messageId}/thread`);
    expect(await prisma.auditLog.count({ where: { action: 'MAIL_MAILBOX_OPENED', actorId: colleague.user.id, target: account.id } })).toBe(1);
    // The owner's own reading is never logged.
    await owner.agent.get(`/api/mail/messages/${messageId}`);
    expect(await prisma.auditLog.count({ where: { action: 'MAIL_MAILBOX_OPENED', actorId: owner.user.id } })).toBe(0);
    expect((await owner.agent.get(`/api/mail/accounts/${account.id}/access`)).body.opens).toHaveLength(1);

    expect((await sa.agent.delete(`/api/admin/access/mailboxes/grants/${g.id}`)).status).toBe(200);
    expect((await colleague.agent.get(`/api/mail/messages/${messageId}`)).status).toBe(404);
    expect((await colleague.agent.get('/api/mail/mailboxes')).body.shared).toEqual([]);
    expect(await prisma.auditLog.count({ where: { action: 'MAIL_ACCESS_GRANTED', target: account.id, actorId: sa.user.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'MAIL_ACCESS_REVOKED', target: account.id, actorId: sa.user.id } })).toBe(1);
  });
});
