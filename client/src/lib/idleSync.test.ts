import { describe, expect, it } from 'vitest';
import { decodeActivity, encodeActivity, latestActivity } from './idleSync';
import { parseRememberedVisa, VISA_TTL_MS } from './referralCookie';

describe('idleSync (idle logout shared by every tab)', () => {
  it('round-trips the shared activity of the same user only', () => {
    const raw = encodeActivity('user_1', 1_700_000_000_000);
    expect(decodeActivity(raw, 'user_1')).toBe(1_700_000_000_000);
    expect(decodeActivity(raw, 'user_2')).toBeNull(); // another login in this browser never keeps a session alive
    expect(decodeActivity(null, 'user_1')).toBeNull();
    expect(decodeActivity('garbage', 'user_1')).toBeNull();
    expect(decodeActivity('user_1:abc', 'user_1')).toBeNull();
  });

  it('a background tab counts activity in another tab: the latest time wins, never one in the future', () => {
    const now = 10_000_000;
    const ownIdle = now - 31 * 60_000; // this tab: idle for 31 minutes
    const otherTab = now - 60_000; // the tab in use: active a minute ago
    expect(now - latestActivity(ownIdle, otherTab, now)).toBe(60_000);
    expect(latestActivity(ownIdle, null, now)).toBe(ownIdle); // nothing shared: own clock
    expect(latestActivity(ownIdle, now + 3_600_000, now)).toBe(now); // a skewed value does not postpone the logout forever
  });
});

describe('remembered visa (?visa=, kept across tabs for a week)', () => {
  const now = Date.UTC(2026, 10, 18);
  it('fresh entries are read, stale or broken ones are not', () => {
    expect(parseRememberedVisa(JSON.stringify({ s: 'blue-card', at: now - 1000 }), now)).toBe('blue-card');
    expect(parseRememberedVisa(JSON.stringify({ s: 'blue-card', at: now - VISA_TTL_MS - 1 }), now)).toBe('');
    expect(parseRememberedVisa(JSON.stringify({ s: 'Blue Card!', at: now }), now)).toBe('bluecard');
    expect(parseRememberedVisa('blue-card', now)).toBe('');
    expect(parseRememberedVisa(null, now)).toBe('');
  });
});
