import { describe, expect, it } from 'vitest';
import { referrerOf, stripReferrer, withReferrer } from '../../src/lib/drive/referrerName.js';
import { looksLikeClientFolderName } from '../../src/lib/drive/workflowLinkRules.js';

describe('referrer client folder names', () => {
  it('adds the " · Ref <partner>" suffix and reads it back', () => {
    const name = withReferrer('Aysel Məmmədova · Pass-Nr. C123', 'İlqar Quliyev');
    expect(name).toBe('Aysel Məmmədova · Pass-Nr. C123 · Ref İlqar Quliyev');
    expect(referrerOf(name)).toBe('İlqar Quliyev');
    expect(stripReferrer(name)).toBe('Aysel Məmmədova · Pass-Nr. C123');
  });

  it('is idempotent and replaces an older referrer', () => {
    const once = withReferrer('A B · TV-2026-0012', 'Ali');
    expect(withReferrer(once, 'Ali')).toBe(once);
    expect(withReferrer(once, 'Vali')).toBe('A B · TV-2026-0012 · Ref Vali');
  });

  it('leaves names without a partner alone', () => {
    expect(withReferrer('A B · TV-2026-0012', null)).toBe('A B · TV-2026-0012');
    expect(withReferrer('A B · TV-2026-0012', '  ')).toBe('A B · TV-2026-0012');
    expect(referrerOf('A B · TV-2026-0012')).toBeNull();
    expect(stripReferrer('A B · TV-2026-0012')).toBe('A B · TV-2026-0012');
  });

  it('is still recognised as a client folder name', () => {
    expect(looksLikeClientFolderName(withReferrer('A B · Pass-Nr. C1', 'Ali'))).toBe(true);
    expect(looksLikeClientFolderName(withReferrer('A B · TV-2026-0012', 'Ali'))).toBe(true);
  });

  it('never exceeds the folder name limit', () => {
    expect(withReferrer(`${'x'.repeat(170)} · Pass-Nr. C1`, 'Partner').length).toBeLessThanOrEqual(180);
  });
});
