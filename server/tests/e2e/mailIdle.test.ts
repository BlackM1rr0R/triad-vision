import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asStaff, type Actor } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { FakeImapServer } from '../../src/lib/mail/imapFake.js';
import { setImapFactory, setImapWatchFactory } from '../../src/lib/mail/imap.js';
import { flushRemote } from '../../src/lib/mail/core.js';
import { mailIdleManager, startMailIdle, stopMailIdle } from '../../src/lib/mail/idle.js';
import { syncAccount, syncMailbox } from '../../src/lib/mail/sync.js';
import { subscribe, type RealtimeEvent } from '../../src/lib/messaging/realtime.js';

/**
 * Push mail end to end: the IDLE manager (started by the test, as src/index.ts does), the fake IMAP
 * server pushing EXISTS/FETCH/EXPUNGE, the incremental INBOX sync and the realtime events.
 */
let imap: FakeImapServer;

beforeEach(() => {
  imap = new FakeImapServer();
  imap.credentials = { username: 'staff@example.az', password: 'app-password' };
  setImapFactory(imap.createFactory());
  setImapWatchFactory(imap.createWatchFactory());
});

afterEach(async () => {
  await stopMailIdle();
  await flushRemote();
  setImapFactory(null);
  setImapWatchFactory(null);
});

const accountBody = (over: Record<string, unknown> = {}) => ({
  email: 'staff@example.az',
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

/** Account created with sync off, synced once (so later arrivals are announced), then switched on. */
const setup = async () => {
  const staff = await asStaff();
  await imap.deliver({ from: 'Old <old@client.az>', to: 'staff@example.az', subject: 'Already there', text: 'old', messageId: '<old@client.az>' });
  const res = await staff.agent.post('/api/mail/accounts').send(accountBody());
  expect(res.status).toBe(201);
  const accountId = res.body.account.id as string;
  expect((await staff.agent.post(`/api/mail/accounts/${accountId}/sync`)).body.ok).toBe(true);
  await prisma.mailAccount.update({ where: { id: accountId }, data: { syncEnabled: true } });
  const events: RealtimeEvent[] = [];
  const stop = subscribe(staff.user.id, (ev) => events.push(ev));
  return { staff, accountId, events, stop };
};

const startIdle = async () => {
  const m = await startMailIdle({ debounceMs: 20, backoffBaseMs: 50, backoffMaxMs: 200 });
  return m;
};

const watching = (accountId: string) => waitFor(async () => mailIdleManager()?.isWatching(accountId));

describe('mail idle: push', () => {
  it('syncs the inbox when the server reports new mail and publishes it to the owner', async () => {
    const { accountId, events, stop } = await setup();
    try {
      await startIdle();
      await watching(accountId);
      expect(imap.watches.size).toBe(1);

      await imap.deliver({ from: 'Aysel Mammadova <aysel@client.az>', to: 'staff@example.az', subject: 'Passport scan', text: 'Here it is', messageId: '<new@client.az>' });
      const updated = await waitFor(async () => events.find((e) => e.type === 'mail.updated' && e.payload.reason === 'idle'));
      const row = await prisma.mailMessage.findFirstOrThrow({ where: { accountId, messageId: 'new@client.az' } });
      const inbox = await prisma.mailFolder.findFirstOrThrow({ where: { accountId, role: 'INBOX' } });
      expect(updated.payload).toMatchObject({ accountId, folderId: inbox.id, unread: 2, newMessages: 1, newMessageIds: [row.id] });
      expect(inbox.unread).toBe(2);
      const announced = events.find((e) => e.type === 'mail.new');
      expect(announced?.payload).toMatchObject({ accountId, folderId: inbox.id, messageId: row.id, from: 'Aysel Mammadova', subject: 'Passport scan' });

      // a read on another device (FETCH FLAGS) updates the counts too
      events.length = 0;
      imap.message('INBOX', 1)!.flags.add('\\Seen');
      imap.notify('INBOX', 'flags');
      const flagged = await waitFor(async () => events.find((e) => e.type === 'mail.updated' && e.payload.reason === 'idle'));
      expect(flagged.payload).toMatchObject({ unread: 1, newMessageIds: [] });
      expect(events.some((e) => e.type === 'mail.new')).toBe(false);

      // deleted elsewhere (EXPUNGE)
      events.length = 0;
      imap.folder('INBOX').messages.delete(2);
      imap.notify('INBOX', 'expunge');
      await waitFor(async () => events.find((e) => e.type === 'mail.updated' && e.payload.reason === 'idle'));
      expect(await prisma.mailMessage.count({ where: { accountId, folderId: inbox.id } })).toBe(1);
    } finally {
      stop();
    }
  });

  it('reconnects after the connection drops and catches up on what arrived meanwhile', async () => {
    const { accountId, events, stop } = await setup();
    try {
      await startIdle();
      await watching(accountId);
      imap.failConnect = 'ECONNRESET';
      imap.dropWatches();
      expect(mailIdleManager()!.isWatching(accountId)).toBe(false);
      // mail arrives while nobody is listening
      await imap.deliver({ from: 'x@client.az', to: 'staff@example.az', subject: 'While offline', text: 'x', messageId: '<offline@client.az>' });
      await waitFor(async () => (mailIdleManager()!.status()[0]?.failures ?? 0) >= 2);
      imap.failConnect = null;
      await watching(accountId);
      await waitFor(() => prisma.mailMessage.findFirst({ where: { accountId, messageId: 'offline@client.az' } }));
      await waitFor(async () => events.find((e) => e.type === 'mail.new' && e.payload.subject === 'While offline'));
    } finally {
      stop();
    }
  });

  it('never runs an IDLE-triggered sync and a full sync at the same time', async () => {
    const { accountId, stop } = await setup();
    try {
      imap.beforeCommand = () => new Promise((r) => setTimeout(r, 40));
      imap.maxActiveSessions = 0;
      await imap.deliver({ from: 'x@client.az', to: 'staff@example.az', subject: 'One', text: 'x', messageId: '<one@client.az>' });
      const [full, folder, joined] = await Promise.all([syncAccount(accountId), syncMailbox(accountId, 'INBOX'), syncAccount(accountId)]);
      expect(full.ok).toBe(true);
      expect(joined).toBe(full);
      expect(folder.ok).toBe(true);
      expect(imap.maxActiveSessions).toBe(1);
      expect(await prisma.mailMessage.count({ where: { accountId, messageId: 'one@client.az' } })).toBe(1);
    } finally {
      stop();
    }
  });

  it('stops the watcher when the account is deleted or sync is switched off, and restarts on new credentials', async () => {
    const { staff, accountId, stop } = await setup();
    try {
      await startIdle();
      await watching(accountId);

      // new password: reconnect with it
      imap.credentials = { username: 'staff@example.az', password: 'new-password' };
      const starts = imap.watchStarts;
      expect((await staff.agent.patch(`/api/mail/accounts/${accountId}`).send({ password: 'new-password' })).status).toBe(200);
      await waitFor(async () => imap.watchStarts > starts && mailIdleManager()!.isWatching(accountId));
      expect([...imap.watches][0]!.conn.password).toBe('new-password');

      // sync off: closed
      expect((await staff.agent.patch(`/api/mail/accounts/${accountId}`).send({ syncEnabled: false })).status).toBe(200);
      await waitFor(async () => imap.watches.size === 0);
      expect(mailIdleManager()!.status()).toEqual([]);

      // back on, then deleted
      expect((await staff.agent.patch(`/api/mail/accounts/${accountId}`).send({ syncEnabled: true })).status).toBe(200);
      await watching(accountId);
      expect((await staff.agent.delete(`/api/mail/accounts/${accountId}`)).status).toBe(200);
      await waitFor(async () => imap.watches.size === 0 && mailIdleManager()!.status().length === 0);

      // a second account of another user created through the API is picked up right away
      const other: Actor = await asStaff();
      imap.credentials = null;
      const res = await other.agent.post('/api/mail/accounts').send(accountBody({ email: 'other@example.az', username: 'other@example.az', syncEnabled: true }));
      expect(res.status).toBe(201);
      await watching(res.body.account.id);
      // the route also starts a first full sync in the background; let it finish
      await waitFor(() => prisma.mailAccount.findFirst({ where: { id: res.body.account.id, lastSyncAt: { not: null } } }));
      await mailIdleManager()!.settled();
    } finally {
      stop();
    }
  });
});
