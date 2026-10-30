import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetStalwartCaches } from '../../src/lib/stalwart/client.js';
import type { StalwartConfig } from '../../src/lib/stalwart/config.js';
import { SELF_REASON, ownAddresses, syncSelfAllowed } from '../../src/lib/stalwart/allowSelf.js';
import { startFakeStalwart, type FakeStalwart } from '../helpers/fakeStalwart';

const ADMIN = { domain: 'example.test', adminUser: 'admin@example.test', adminPassword: 'Admin-Secret-123' };
let fake: FakeStalwart;
let cfg: StalwartConfig;

beforeAll(async () => {
  fake = await startFakeStalwart(ADMIN);
  cfg = { url: fake.url, adminUser: ADMIN.adminUser, adminPassword: ADMIN.adminPassword, domain: ADMIN.domain, mailHost: 'mail.example.test', timeoutMs: 2000 };
});
afterAll(async () => {
  await fake.close();
});
beforeEach(() => {
  fake.reset();
  resetStalwartCaches();
});

const addresses = () => [...fake.allowedIps.values()].map((a) => a.address).sort();

describe('allowing our own container on the mail server', () => {
  it('adds our address once, replaces the address of an earlier container and keeps entries made by hand', async () => {
    fake.allowedIps.set('h', { id: 'h', address: '203.0.113.7', reason: 'office' });

    expect(await syncSelfAllowed(cfg, ['172.18.0.3'])).toEqual({ added: ['172.18.0.3'], removed: 0 });
    expect(addresses()).toEqual(['172.18.0.3', '203.0.113.7']);
    expect(fake.ipListReloads).toBe(1);

    // Restart with the same address: nothing to change, no reload.
    expect(await syncSelfAllowed(cfg, ['172.18.0.3'])).toEqual({ added: [], removed: 0 });
    expect(fake.ipListReloads).toBe(1);

    // Recreated on deploy with a new address: the old one goes, the hand-made entry stays.
    expect(await syncSelfAllowed(cfg, ['172.18.0.6'])).toEqual({ added: ['172.18.0.6'], removed: 1 });
    expect(addresses()).toEqual(['172.18.0.6', '203.0.113.7']);
    expect([...fake.allowedIps.values()].find((a) => a.address === '172.18.0.6')?.reason).toMatch(new RegExp(`^${SELF_REASON}`));
  });

  it('only lists non-internal IPv4 addresses', () => {
    const ifaces = {
      lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      eth0: [
        { address: '172.18.0.3', family: 'IPv4', internal: false },
        { address: 'fe80::1', family: 'IPv6', internal: false },
      ],
    } as unknown as Parameters<typeof ownAddresses>[0];
    expect(ownAddresses(ifaces)).toEqual(['172.18.0.3']);
  });
});
