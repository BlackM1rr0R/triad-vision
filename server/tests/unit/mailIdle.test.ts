import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MailAccount } from '@prisma/client';
import { IdleManager, backoffDelay, type IdleManagerOptions } from '../../src/lib/mail/idle.js';
import { setImapWatchFactory } from '../../src/lib/mail/imap.js';
import { FakeImapServer } from '../../src/lib/mail/imapFake.js';
import { seal } from '../../src/lib/secretBox.js';
import { pollDue } from '../../src/jobs/mail.js';

/**
 * IDLE watcher manager without a database: accounts come from an in-memory list, the IDLE
 * connections from the fake IMAP server and the sync is a spy. Timers are faked.
 */
const account = (id: string, over: Partial<MailAccount> = {}): MailAccount =>
  ({
    id,
    userId: `user-${id}`,
    email: `${id}@example.az`,
    imapHost: 'imap.example.az',
    imapPort: 993,
    imapSecure: true,
    username: `${id}@example.az`,
    passwordEnc: seal('app-password'),
    syncEnabled: true,
    createdAt: new Date('2026-01-01'),
    ...over,
  }) as MailAccount;

let imap: FakeImapServer;
let accounts: MailAccount[];
let sync: ReturnType<typeof vi.fn<IdleManagerOptions['sync']>>;
let manager: IdleManager;
const logs: string[] = [];

const make = (over: Partial<IdleManagerOptions> = {}) =>
  new IdleManager({
    maxConnections: 10,
    debounceMs: 100,
    backoffBaseMs: 1000,
    backoffMaxMs: 8000,
    stableMs: 60_000,
    random: () => 1, // upper end of the jitter: delays are exactly base * 2^n
    listAccounts: async () => accounts.filter((a) => a.syncEnabled),
    loadAccount: async (id) => accounts.find((a) => a.id === id) ?? null,
    sync,
    log: (m) => logs.push(m),
    ...over,
  });

beforeEach(() => {
  vi.useFakeTimers();
  imap = new FakeImapServer();
  setImapWatchFactory(imap.createWatchFactory());
  accounts = [account('a1')];
  sync = vi.fn<IdleManagerOptions['sync']>(async () => ({ ok: true, newMessageIds: [] }));
  logs.length = 0;
});

afterEach(async () => {
  await manager?.stop();
  setImapWatchFactory(null);
  vi.useRealTimers();
});

const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

describe('mail idle: backoff', () => {
  it('doubles from the base, is capped, and jitters within the upper half', () => {
    expect(backoffDelay(0, 2000, 300_000, () => 1)).toBe(2000);
    expect(backoffDelay(0, 2000, 300_000, () => 0)).toBe(1000);
    expect(backoffDelay(3, 2000, 300_000, () => 1)).toBe(16_000);
    expect(backoffDelay(20, 2000, 300_000, () => 1)).toBe(300_000);
    expect(backoffDelay(20, 2000, 300_000, () => 0)).toBe(150_000);
    for (let i = 0; i < 50; i++) {
      const d = backoffDelay(4, 2000, 300_000);
      expect(d).toBeGreaterThanOrEqual(16_000);
      expect(d).toBeLessThanOrEqual(32_000);
    }
  });
});

describe('mail idle: watcher', () => {
  it('opens one IDLE connection per account and syncs on change, coalescing bursts', async () => {
    manager = make();
    await manager.start();
    await tick();
    expect(imap.watches.size).toBe(1);
    expect(manager.isWatching('a1')).toBe(true);
    // first connect: no catch-up sync (the poll covers the start)
    expect(sync).not.toHaveBeenCalled();

    imap.notify('INBOX', 'exists');
    imap.notify('INBOX', 'flags');
    imap.notify('INBOX', 'exists');
    await tick(50);
    expect(sync).not.toHaveBeenCalled();
    await tick(60);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith('a1', 'INBOX');

    // other folders are not watched
    imap.notify('Sent', 'exists');
    await tick(200);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('runs exactly one more sync when changes arrive while a sync is running', async () => {
    let release!: () => void;
    sync.mockImplementationOnce(() => new Promise((r) => (release = () => r({ ok: true, newMessageIds: [] }))));
    manager = make();
    await manager.start();
    await tick();
    imap.notify('INBOX', 'exists');
    await tick(100);
    expect(sync).toHaveBeenCalledTimes(1);
    imap.notify('INBOX', 'exists');
    await tick(100);
    imap.notify('INBOX', 'expunge');
    await tick(100);
    expect(sync).toHaveBeenCalledTimes(1); // still the first one
    release();
    await tick();
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('retries a failing login with exponential backoff, then catches up once connected', async () => {
    imap.failConnect = 'ECONNREFUSED';
    manager = make();
    await manager.start();
    await tick();
    const attempts = () => imap.log.filter((l) => l.op === 'idle').length;
    expect(attempts()).toBe(1);
    expect(manager.status()[0]).toMatchObject({ state: 'waiting', failures: 1, nextRetryMs: 1000, lastError: 'ECONNREFUSED' });
    expect(manager.isWatching('a1')).toBe(false);

    await tick(999);
    expect(attempts()).toBe(1);
    await tick(1);
    expect(attempts()).toBe(2);
    expect(manager.status()[0]!.nextRetryMs).toBe(2000);
    await tick(2000);
    expect(attempts()).toBe(3);
    expect(manager.status()[0]!.nextRetryMs).toBe(4000);
    await tick(4000);
    expect(manager.status()[0]!.nextRetryMs).toBe(8000);
    await tick(8000);
    expect(manager.status()[0]!.nextRetryMs).toBe(8000); // capped
    expect(attempts()).toBe(5);

    imap.failConnect = null;
    await tick(8000);
    expect(attempts()).toBe(6);
    expect(manager.isWatching('a1')).toBe(true);
    // reconnected after failures: one catch-up sync for what was missed
    await tick(10);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(logs.join('\n')).not.toContain('app-password');
  });

  it('reconnects after a dropped connection and resets the backoff when it had been stable', async () => {
    manager = make();
    await manager.start();
    await tick();
    expect(imap.watchStarts).toBe(1);

    imap.dropWatches();
    expect(manager.status()[0]).toMatchObject({ state: 'waiting', failures: 1, nextRetryMs: 1000 });
    await tick(1000);
    expect(imap.watchStarts).toBe(2);
    expect(manager.isWatching('a1')).toBe(true);
    await tick(10);
    expect(sync).toHaveBeenCalledTimes(1); // catch-up

    // quick second drop: backoff keeps growing
    imap.dropWatches();
    expect(manager.status()[0]!.nextRetryMs).toBe(2000);
    await tick(2000);
    expect(imap.watchStarts).toBe(3);

    // stable for longer than stableMs: the next drop starts over at the base delay
    await tick(61_000);
    imap.dropWatches();
    expect(manager.status()[0]!.nextRetryMs).toBe(1000);
  });

  it('ignores events of a connection it already replaced', async () => {
    manager = make();
    await manager.start();
    await tick();
    const [old] = [...imap.watches];
    imap.dropWatches();
    await tick(1010);
    sync.mockClear();
    old!.handlers.onChange('exists');
    await tick(500);
    expect(sync).not.toHaveBeenCalled();
  });

  it('follows account changes: removal, disabling, new credentials, the connection cap', async () => {
    accounts = [account('a1'), account('a2'), account('a3')];
    manager = make({ maxConnections: 2 });
    await manager.start();
    await tick();
    expect(imap.watches.size).toBe(2);
    expect(manager.isWatching('a1')).toBe(true);
    expect(manager.isWatching('a2')).toBe(true);
    expect(manager.isWatching('a3')).toBe(false); // over the cap: polled

    // a1 deleted: its connection closes and a3 takes the free slot
    accounts = accounts.filter((a) => a.id !== 'a1');
    await manager.reconcile();
    await tick();
    expect(manager.isWatching('a1')).toBe(false);
    expect(manager.isWatching('a3')).toBe(true);
    expect(imap.watchesOf('a1@example.az')).toHaveLength(0);
    expect(imap.watches.size).toBe(2);

    // password changed: reconnect with the new login
    const starts = imap.watchStarts;
    accounts = accounts.map((a) => (a.id === 'a2' ? { ...a, passwordEnc: seal('new-password') } : a));
    await manager.reconcile();
    await tick();
    expect(imap.watchStarts).toBe(starts + 1);
    expect(imap.watchesOf('a2@example.az')[0]!.conn.password).toBe('new-password');

    // unchanged accounts are left alone
    await manager.reconcile();
    await tick();
    expect(imap.watchStarts).toBe(starts + 1);

    // sync disabled: closed
    accounts = accounts.map((a) => (a.id === 'a3' ? { ...a, syncEnabled: false } : a));
    await manager.reconcile();
    await tick();
    expect(imap.watchesOf('a3@example.az')).toHaveLength(0);
    expect(manager.status().map((s) => s.accountId)).toEqual(['a2']);
  });

  it('stops retrying and closes everything on stop()', async () => {
    accounts = [account('a1'), account('a2')];
    manager = make();
    await manager.start();
    await tick();
    expect(imap.watches.size).toBe(2);
    imap.failConnect = 'down';
    imap.dropWatches();
    await manager.stop();
    await tick(60_000);
    expect(imap.watches.size).toBe(0);
    expect(imap.log.filter((l) => l.op === 'idle')).toHaveLength(2);
    expect(manager.status()).toEqual([]);
  });
});

describe('mail idle: poll interval', () => {
  const now = new Date('2026-10-16T12:00:00Z');
  const ago = (s: number) => new Date(now.getTime() - s * 1000);

  it('polls unwatched accounts every run and watched ones every 5 minutes', () => {
    expect(pollDue({ id: 'x', lastSyncAt: ago(30) }, now, () => false)).toBe(true);
    expect(pollDue({ id: 'x', lastSyncAt: null }, now, () => true)).toBe(true);
    expect(pollDue({ id: 'x', lastSyncAt: ago(60) }, now, () => true)).toBe(false);
    expect(pollDue({ id: 'x', lastSyncAt: ago(240) }, now, () => true)).toBe(false);
    expect(pollDue({ id: 'x', lastSyncAt: ago(299) }, now, () => true)).toBe(true);
  });
});
