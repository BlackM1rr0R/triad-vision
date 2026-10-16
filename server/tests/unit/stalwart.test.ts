import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  StalwartError,
  changeOwnPassword,
  createMailbox,
  deleteMailbox,
  findMailboxByAddress,
  getAutoReply,
  getMailbox,
  listMailboxes,
  resetStalwartCaches,
  setAutoReply,
  setMailboxPassword,
  updateMailbox,
} from '../../src/lib/stalwart/client.js';
import type { StalwartConfig } from '../../src/lib/stalwart/config.js';
import { generatePassword, mailboxPassword } from '../../src/lib/stalwart/service.js';
import { startFakeStalwart, type FakeStalwart } from '../helpers/fakeStalwart';

const ADMIN = { domain: 'example.test', adminUser: 'admin@example.test', adminPassword: 'Admin-Secret-123' };
let fake: FakeStalwart;
let cfg: StalwartConfig;

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(StalwartError);
    return err as StalwartError;
  }
  throw new Error('expected a StalwartError');
};

beforeAll(async () => {
  fake = await startFakeStalwart(ADMIN);
});
afterAll(async () => {
  await fake.close();
});
beforeEach(() => {
  fake.reset();
  resetStalwartCaches();
  cfg = { url: fake.url, adminUser: ADMIN.adminUser, adminPassword: ADMIN.adminPassword, domain: ADMIN.domain, mailHost: 'mail.example.test', timeoutMs: 2000 };
});

describe('stalwart client', () => {
  it('lists only user accounts of the configured domain', async () => {
    fake.addAccount({ name: 'info', password: 'Info-Pass-1234', description: 'Info', usedDiskQuota: 2048 });
    fake.addAccount({ name: 'team', password: 'x', type: 'Group' });
    fake.addAccount({ name: 'foreign', domain: 'other.test', password: 'Foreign-Pass-1' });
    const list = await listMailboxes(cfg);
    expect(list.map((m) => m.address)).toEqual(['admin@example.test', 'info@example.test']);
    const info = list[1];
    expect(info).toMatchObject({ localPart: 'info', displayName: 'Info', usedBytes: 2048, quotaBytes: null, aliases: [], isAdmin: false });
    expect(list[0].isAdmin).toBe(true);
    expect(fake.calls.map((c) => c.method)).toEqual(['x:Domain/get', 'x:Account/query', 'x:Account/get']);
  });

  it('creates, updates (quota, aliases, name), resets and deletes a mailbox', async () => {
    const m = await createMailbox(cfg, { localPart: 'jobs', displayName: 'Jobs', password: 'Jobs-Pass-12345', quotaBytes: 100 * 1024 * 1024, aliases: ['karriere'] });
    expect(m).toMatchObject({ address: 'jobs@example.test', quotaBytes: 100 * 1024 * 1024, aliases: ['karriere@example.test'] });
    expect(fake.accounts.get(m.id)?.secret).toBe('Jobs-Pass-12345');

    const dup = await codeOf(createMailbox(cfg, { localPart: 'jobs', displayName: null, password: 'Jobs-Pass-12345', quotaBytes: null, aliases: [] }));
    expect(dup.code).toBe('MAILBOX_EXISTS');

    const u = await updateMailbox(cfg, m.id, { displayName: 'Careers', quotaBytes: null, aliases: ['a', 'b'] });
    expect(u).toMatchObject({ displayName: 'Careers', quotaBytes: null, aliases: ['a@example.test', 'b@example.test'] });

    await setMailboxPassword(cfg, m.id, 'Brand-New-Pass-9');
    expect(fake.accounts.get(m.id)?.secret).toBe('Brand-New-Pass-9');
    const weak = await codeOf(setMailboxPassword(cfg, m.id, 'short'));
    expect(weak.code).toBe('MAILBOX_INVALID');
    expect(weak.detail).toMatch(/at least 8/);
    expect(weak.message).not.toContain('short');

    await deleteMailbox(cfg, m.id);
    expect(await getMailbox(cfg, m.id)).toBeNull();
    expect((await codeOf(deleteMailbox(cfg, m.id))).code).toBe('MAILBOX_NOT_FOUND');
  });

  it('keeps aliases in other domains when replacing ours', async () => {
    const acc = fake.addAccount({ name: 'sales', password: 'Sales-Pass-1234' });
    acc.aliases = { '0': { name: 'sales', domainId: Object.keys(fake.domains).find((k) => fake.domains[k] === 'other.test')!, enabled: true } };
    const m = await updateMailbox(cfg, acc.id, { aliases: ['vertrieb'] });
    expect(m.aliases.sort()).toEqual(['sales@other.test', 'vertrieb@example.test']);
  });

  it('getMailbox ignores accounts of other domains', async () => {
    const foreign = fake.addAccount({ name: 'x', domain: 'other.test', password: 'Foreign-Pass-1' });
    expect(await getMailbox(cfg, foreign.id)).toBeNull();
    expect(await findMailboxByAddress(cfg, 'ADMIN@example.test')).toMatchObject({ address: 'admin@example.test' });
  });

  it('reads and writes the auto-reply as admin (UTC dates without fractions)', async () => {
    const acc = fake.addAccount({ name: 'info', password: 'Info-Pass-1234' });
    expect(await getAutoReply(cfg, acc.id)).toEqual({ enabled: false, subject: null, text: null, fromDate: null, toDate: null });
    const v = await setAutoReply(cfg, acc.id, { enabled: true, subject: 'Away', text: 'Back soon', fromDate: '2026-10-20T08:00:00.000Z', toDate: '2026-10-30T10:00:00+02:00' });
    expect(v).toEqual({ enabled: true, subject: 'Away', text: 'Back soon', fromDate: '2026-10-20T08:00:00Z', toDate: '2026-10-30T08:00:00Z' });
    expect(fake.calls.at(-2)?.user).toBe('admin@example.test');
  });

  it('self-service password change logs in as the mailbox and checks the current password', async () => {
    const acc = fake.addAccount({ name: 'anna', password: 'Anna-Old-Pass-1' });
    expect((await codeOf(changeOwnPassword(cfg, 'anna@example.test', 'wrong', 'Anna-New-Pass-2'))).code).toBe('MAILBOX_PASSWORD_WRONG');
    expect(acc.secret).toBe('Anna-Old-Pass-1');
    await changeOwnPassword(cfg, 'anna@example.test', 'Anna-Old-Pass-1', 'Anna-New-Pass-2');
    expect(acc.secret).toBe('Anna-New-Pass-2');
    expect(fake.calls.at(-1)).toMatchObject({ user: 'anna@example.test', method: 'x:AccountPassword/set' });
  });

  it('maps transport failures without leaking secrets', async () => {
    const auth = await codeOf(listMailboxes({ ...cfg, adminPassword: 'not-the-password' }));
    expect(auth.code).toBe('MAIL_SERVER_AUTH');
    expect(auth.message).not.toContain('not-the-password');

    const down = await codeOf(listMailboxes({ ...cfg, url: 'http://127.0.0.1:1' }));
    expect(down.code).toBe('MAIL_SERVER_UNREACHABLE');

    fake.delayMs = 500;
    const slow = await codeOf(listMailboxes({ ...cfg, timeoutMs: 100 }));
    expect(slow.code).toBe('MAIL_SERVER_TIMEOUT');
  });
});

describe('mailbox passwords', () => {
  it('generated passwords are strong and pass the policy', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p).toMatch(/^[A-Za-z0-9]{5}(-[A-Za-z0-9]{5}){3}$/);
      expect(mailboxPassword.safeParse(p).success).toBe(true);
      seen.add(p);
    }
    expect(seen.size).toBe(50);
  });

  it('policy: min 10 chars with letters and digits', () => {
    expect(mailboxPassword.safeParse('abc123').success).toBe(false);
    expect(mailboxPassword.safeParse('abcdefghijk').success).toBe(false);
    expect(mailboxPassword.safeParse('12345678901').success).toBe(false);
    expect(mailboxPassword.safeParse('Sommer2026x').success).toBe(true);
  });
});
