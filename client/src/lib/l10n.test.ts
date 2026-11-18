import { describe, expect, it } from 'vitest';
import { DATE_TIME_ZONE, dateOptions } from './l10n';

// QA PUB-3: useL10n().date formats in one fixed zone, so server (UTC) and browser (visitor's zone) agree.
describe('dateOptions', () => {
  it('adds the fixed zone', () => {
    expect(dateOptions({ dateStyle: 'medium' })).toEqual({ dateStyle: 'medium', timeZone: DATE_TIME_ZONE });
  });

  it('keeps a caller zone', () => {
    expect(dateOptions({ dateStyle: 'medium', timeZone: 'UTC' }).timeZone).toBe('UTC');
  });

  it('gives the same calendar day whatever the machine zone', () => {
    const late = new Date('2026-10-24T22:30:00Z'); // 25 Oct in Baku, 24 Oct in UTC
    expect(new Intl.DateTimeFormat('en-GB', dateOptions({ dateStyle: 'medium' })).format(late)).toBe('25 Oct 2026');
  });
});
