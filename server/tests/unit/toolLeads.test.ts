import { describe, expect, it } from 'vitest';
import {
  canConfirm,
  followUpDueAt,
  isToolSlug,
  leadToken,
  maskEmail,
  pathMatchesTool,
  resultPathSchema,
  summarySchema,
  toolSlugs,
  verifyLeadToken,
} from '../../src/lib/toolLeads/tools.js';
import { computeToolAnalytics, dayRange, pct } from '../../src/lib/toolAnalytics/compute.js';
import { TOOL_MAIL } from '../../src/lib/toolLeads/texts.js';
import { SEO_LOCALES } from '../../src/lib/seoCatalogue.js';

const DAY = 24 * 60 * 60 * 1000;

describe('tool slugs', () => {
  it('knows the tools of the hub and the extra tool pages, not content sections', () => {
    const s = toolSlugs();
    expect(s).toEqual(expect.arrayContaining(['salary-calculator', 'blue-card-check', 'work-scenes/truck-cab', 'german-mock-exam/a1', 'uygunluq-testi']));
    expect(s).not.toContain('jobs');
    expect(s).not.toContain('guides');
    expect(isToolSlug('salary-calculator')).toBe(true);
    expect(isToolSlug('/salary-calculator')).toBe(false);
    expect(isToolSlug('admin')).toBe(false);
    expect(isToolSlug('x'.repeat(61))).toBe(false);
    expect(isToolSlug(42)).toBe(false);
  });
});

describe('result summary', () => {
  it('accepts short plain lines and trims whitespace', () => {
    const r = summarySchema.parse([{ label: ' Net  per month ', value: '2.345,67 €' }]);
    expect(r).toEqual([{ label: 'Net per month', value: '2.345,67 €' }]);
  });

  it('refuses links, e-mail addresses, HTML, empty and too many lines', () => {
    for (const value of ['see https://evil.example', 'www.evil.com', 'mail me@x.de', '<b>x</b>', 'visit evil.com now']) {
      expect(summarySchema.safeParse([{ label: 'A', value }]).success, value).toBe(false);
    }
    expect(summarySchema.safeParse([]).success).toBe(false);
    expect(summarySchema.safeParse([{ label: 'A', value: '' }]).success).toBe(false);
    expect(summarySchema.safeParse(Array.from({ length: 13 }, () => ({ label: 'A', value: '1' }))).success).toBe(false);
    expect(summarySchema.safeParse([{ label: 'A', value: 'x'.repeat(161) }]).success).toBe(false);
  });

  it('only links back to the tool itself', () => {
    expect(resultPathSchema.safeParse('/de/salary-calculator?gross=3000&class=1').success).toBe(true);
    expect(resultPathSchema.safeParse('//evil.com/x').success).toBe(false);
    expect(resultPathSchema.safeParse('https://evil.com').success).toBe(false);
    expect(pathMatchesTool('/de/salary-calculator?gross=1', 'salary-calculator')).toBe(true);
    expect(pathMatchesTool('/salary-calculator', 'salary-calculator')).toBe(true);
    expect(pathMatchesTool('/budget', 'salary-calculator')).toBe(false);
  });
});

describe('signed links', () => {
  it('round-trips and rejects tampering', () => {
    const t = leadToken('clxyz1234567890abc');
    expect(verifyLeadToken(t)).toBe('clxyz1234567890abc');
    expect(verifyLeadToken(`${t}x`)).toBeNull();
    expect(verifyLeadToken(t.replace('clxyz', 'clxya'))).toBeNull();
    expect(verifyLeadToken('nope')).toBeNull();
    expect(verifyLeadToken(undefined)).toBeNull();
  });

  it('masks addresses', () => {
    expect(maskEmail('elchin@example.com')).toBe('el••••@example.com');
  });
});

describe('follow-up timing (double opt-in)', () => {
  const created = new Date('2026-11-10T10:00:00Z');
  it('is due three days after the result, or at confirmation when that is later', () => {
    expect(followUpDueAt(created, new Date(created.getTime() + DAY)).toISOString()).toBe('2026-11-13T10:00:00.000Z');
    expect(followUpDueAt(created, new Date(created.getTime() + 5 * DAY)).toISOString()).toBe('2026-11-15T10:00:00.000Z');
  });
  it('accepts a confirmation for 7 days only', () => {
    expect(canConfirm(created, new Date(created.getTime() + 6 * DAY))).toBe(true);
    expect(canConfirm(created, new Date(created.getTime() + 8 * DAY))).toBe(false);
  });
  it('has mail texts in every site language', () => {
    for (const l of SEO_LOCALES) {
      expect(TOOL_MAIL[l].resultSubject('X')).toContain('X');
      expect(TOOL_MAIL[l].unsubscribe).toBeTruthy();
    }
  });
});

describe('tool analytics aggregation', () => {
  it('builds the day range', () => {
    expect(dayRange('2026-11-16', 3)).toEqual(['2026-11-14', '2026-11-15', '2026-11-16']);
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(1, 0)).toBeNull();
  });

  it('sums the current and previous period per tool, with rates, trend and daily views', () => {
    const rows = [
      { day: '2026-11-16', metric: 'tool_view', source: 'salary-calculator', count: 10 },
      { day: '2026-11-15', metric: 'tool_view', source: 'salary-calculator', count: 10 },
      { day: '2026-11-16', metric: 'tool_use', source: 'salary-calculator', count: 5 },
      { day: '2026-11-16', metric: 'tool_lead', source: 'salary-calculator', count: 1 },
      { day: '2026-11-15', metric: 'tool_register', source: 'salary-calculator', count: 1 },
      { day: '2026-11-14', metric: 'tool_embed_view', source: 'salary-calculator', count: 7 },
      // previous period (3 days before 2026-11-14)
      { day: '2026-11-12', metric: 'tool_view', source: 'salary-calculator', count: 10 },
      // outside both periods
      { day: '2026-10-01', metric: 'tool_view', source: 'salary-calculator', count: 999 },
      // other metrics are ignored
      { day: '2026-11-16', metric: 'visit', source: 'salary-calculator', count: 50 },
      { day: '2026-11-16', metric: 'tool_view', source: 'budget', count: 2 },
    ];
    const r = computeToolAnalytics(rows, { today: '2026-11-16', days: 3, known: ['rent-check'] });
    const salary = r.items.find((i) => i.slug === 'salary-calculator')!;
    expect(salary).toMatchObject({ views: 20, uses: 5, leads: 1, registrations: 1, inquiries: 0, embedViews: 7, conversions: 2, useRate: 25, conversionRate: 10, viewsTrend: 100 });
    expect(salary.prev.views).toBe(10);
    expect(salary.daily).toEqual([0, 10, 10]);
    expect(r.items.map((i) => i.slug)).toEqual(['salary-calculator', 'budget', 'rent-check']);
    expect(r.items.find((i) => i.slug === 'rent-check')).toMatchObject({ views: 0, conversionRate: null, viewsTrend: null });
    expect(r.totals).toMatchObject({ views: 22, conversions: 2, prevViews: 10 });
    expect(r.series.map((s) => s.views)).toEqual([0, 10, 12]);
    expect(r.from).toBe('2026-11-14');
  });
});
