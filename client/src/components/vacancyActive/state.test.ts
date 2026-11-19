import { describe, expect, it } from 'vitest';
import { activeStateOf, isDeactivated } from './state';

describe('vacancy activation helpers', () => {
  it('reads the public flag (missing = open)', () => {
    expect(isDeactivated({ active: false })).toBe(true);
    expect(isDeactivated({ active: true })).toBe(false);
    expect(isDeactivated({})).toBe(false);
  });

  it('shows the admin switch for published vacancies only', () => {
    const now = Date.parse('2026-11-19T12:00:00Z');
    expect(activeStateOf({ id: 'a', status: 'OPEN' }, now)).toBe('active');
    expect(activeStateOf({ id: 'a', status: 'OPEN', closesAt: '2026-12-01T00:00:00Z' }, now)).toBe('active');
    expect(activeStateOf({ id: 'a', status: 'OPEN', closesAt: '2026-11-01T00:00:00Z' }, now)).toBe('inactive'); // expired
    expect(activeStateOf({ id: 'a', status: 'CLOSED' }, now)).toBe('inactive');
    expect(activeStateOf({ id: 'a', status: 'DRAFT' }, now)).toBeNull();
    expect(activeStateOf({ id: 'a', status: 'PENDING' }, now)).toBeNull();
  });
});
