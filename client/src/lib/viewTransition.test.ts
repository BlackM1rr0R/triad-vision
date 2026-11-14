import { describe, expect, it } from 'vitest';
import { navDirection } from './viewTransition';

describe('navDirection (app page motion between private pages)', () => {
  it('sibling pages of one area rise; deeper / up slide', () => {
    expect(navDirection('/admin/my-day', '/admin/cases')).toBe('app');
    expect(navDirection('/admin/cases', '/admin/cases/abc')).toBe('app-deeper');
    expect(navDirection('/admin/cases/abc', '/admin/cases')).toBe('app-up');
    expect(navDirection('/account', '/account/cases/1/')).toBe('app-deeper');
  });

  it('back / forward flips the direction', () => {
    expect(navDirection('/admin/cases', '/admin/cases/abc', true)).toBe('app-up');
    expect(navDirection('/admin/cases/abc', '/admin/cases', true)).toBe('app-deeper');
  });

  it('public pages, area changes and the same page keep the plain cross-fade', () => {
    expect(navDirection('/visas', '/visas/blue-card')).toBeNull();
    expect(navDirection('/de/jobs', '/account')).toBeNull();
    expect(navDirection('/admin/cases', '/workspace/drive')).toBeNull();
    expect(navDirection('/admin/cases', '/admin/cases/')).toBeNull();
    // "/admin/casesX" is not inside "/admin/cases"
    expect(navDirection('/admin/cases', '/admin/casesx')).toBe('app');
  });
});
