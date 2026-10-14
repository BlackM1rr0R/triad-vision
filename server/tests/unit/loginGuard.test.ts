import { beforeEach, describe, expect, it } from 'vitest';
import { loginLockedFor, recordLoginFailure, recordLoginSuccess, resetLoginGuard } from '../../src/lib/loginGuard.js';
import { config } from '../../src/config.js';

beforeEach(() => resetLoginGuard());

describe('loginGuard', () => {
  it('locks after the configured number of failures, case-insensitively', () => {
    for (let i = 0; i < config.login.maxFailures - 1; i++) recordLoginFailure('A@Test.local');
    expect(loginLockedFor('a@test.local')).toBe(0);
    recordLoginFailure(' a@test.local ');
    const left = loginLockedFor('A@TEST.LOCAL');
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(config.login.lockMinutes * 60);
  });

  it('a success clears the counter', () => {
    for (let i = 0; i < config.login.maxFailures - 1; i++) recordLoginFailure('b@test.local');
    recordLoginSuccess('b@test.local');
    for (let i = 0; i < config.login.maxFailures - 1; i++) recordLoginFailure('b@test.local');
    expect(loginLockedFor('b@test.local')).toBe(0);
  });

  it('accounts are independent', () => {
    for (let i = 0; i < config.login.maxFailures; i++) recordLoginFailure('c@test.local');
    expect(loginLockedFor('c@test.local')).toBeGreaterThan(0);
    expect(loginLockedFor('d@test.local')).toBe(0);
  });
});
