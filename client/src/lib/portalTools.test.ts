import { describe, expect, it } from 'vitest';
import { PORTAL_TOOL_KEYS, PORTAL_TOOLS, TOOL_GROUPS, foldSearch, hiddenBadge, matchesQuery, toolOfLocation, toolPath, toolsOfGroup } from './portalTools';
import { pagesPortalStage } from '@/i18n/pagesPortalStage';

const ctx = { caseId: 'c1', caseCount: 1, approvedCaseId: null };

describe('portal tools catalogue', () => {
  it('every tool belongs to exactly one group and has copy in all four languages', () => {
    const grouped = TOOL_GROUPS.flatMap(toolsOfGroup);
    expect([...grouped].sort()).toEqual([...PORTAL_TOOL_KEYS].sort());
    for (const lang of ['az', 'de', 'en', 'ru'] as const) {
      const tools = pagesPortalStage[lang].pstage.tools as Record<string, { t: string; d: string }>;
      for (const k of PORTAL_TOOL_KEYS) {
        expect(tools[k]?.t, `${lang}.${k}`).toBeTruthy();
        expect(tools[k]?.d, `${lang}.${k}`).toBeTruthy();
      }
    }
  });

  it('every tool page links back to its tool (deep links keep their tab)', () => {
    for (const k of PORTAL_TOOL_KEYS) {
      const to = toolPath(k, { ...ctx, approvedCaseId: 'c9' });
      expect(to, k).toBeTruthy();
      if (PORTAL_TOOLS[k].publicPage) continue;
      const url = new URL(to!, 'https://x.test');
      if (k === 'family') continue; // the case page's family block (hash)
      expect(toolOfLocation(url.pathname, url.search), k).toBe(k);
    }
  });

  it('home, all tools, case tabs and sub-pages', () => {
    expect(toolOfLocation('/account')).toBe('home');
    expect(toolOfLocation('/account/')).toBe('home');
    expect(toolOfLocation('/account/all')).toBe('all');
    expect(toolOfLocation('/account/cases/c1', '?tab=docs')).toBe('documents');
    expect(toolOfLocation('/account/cases/c1', '?tab=messages')).toBe('messages');
    expect(toolOfLocation('/account/cases/c1')).toBe('cases');
    expect(toolOfLocation('/account/cases/c1/forms/f1')).toBe('cases');
    expect(toolOfLocation('/account/letters/abc')).toBe('letters');
    expect(toolOfLocation('/account/visa-story/c1')).toBe('visaStory');
    expect(toolOfLocation('/jobs')).toBeNull();
  });

  it('links depend on the case: list for several, the visa story only with an approval', () => {
    expect(toolPath('cases', { caseId: 'c1', caseCount: 2 })).toBe('/account/cases');
    expect(toolPath('cases', ctx)).toBe('/account/cases/c1');
    expect(toolPath('documents', { caseId: null, caseCount: 0 })).toBe('/account/checklist');
    expect(toolPath('visaStory', ctx)).toBeNull();
    expect(toolPath('visaStory', { ...ctx, approvedCaseId: 'c2' })).toBe('/account/visa-story/c2');
  });

  it('the "All tools" counter only counts what the menu does not show (messages once)', () => {
    const b = { unreadMessages: 2, unreadNotifications: 3, pendingSignatures: 1, pendingLegal: 1, openInvoices: 0 };
    expect(hiddenBadge(['messages', 'signatures'], b)).toBe(3 + 1);
    expect(hiddenBadge([], b)).toBe(3 + 1 + 1);
  });

  it('search: accents and Azerbaijani letters folded, every word must match', () => {
    expect(foldSearch('Əmək İcazəsi ß')).toBe('emek icazesi ss');
    expect(matchesQuery('Müsahibəyə hazırlıq interview', 'musahibe')).toBe(true);
    expect(matchesQuery('CV (Lebenslauf) Build a German-style CV', 'lebenslauf cv')).toBe(true);
    expect(matchesQuery('CV (Lebenslauf)', 'lebenslauf payslip')).toBe(false);
  });
});
