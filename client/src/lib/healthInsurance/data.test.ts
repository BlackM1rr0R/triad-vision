import { describe, expect, it } from 'vitest';
import { FEDERAL_STATES } from '@/lib/salary';
import { KASSEN, KASSEN_CHECKED, KASSE_SOURCES } from './data';
import { AVERAGE_ZB, BBG_MONTH, GENERAL_RATE, availableKassen, compareKassen, employeeMonthly } from './compare';

describe('health insurance funds data', () => {
  it('has unique ids and names, plausible rates and a check date', () => {
    expect(new Set(KASSEN.map((k) => k.id)).size).toBe(KASSEN.length);
    expect(new Set(KASSEN.map((k) => k.name.toLowerCase())).size).toBe(KASSEN.length);
    for (const k of KASSEN) {
      expect(k.zb, k.id).toBeGreaterThanOrEqual(1.5);
      expect(k.zb, k.id).toBeLessThanOrEqual(5);
      expect(Math.abs(Math.round(k.zb * 100) - k.zb * 100), k.id).toBeLessThan(1e-9); // at most two decimals
      expect(k.id, k.id).toMatch(/^[a-z0-9-]+$/);
    }
    expect(KASSEN_CHECKED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const s of KASSE_SOURCES) expect(s.url.startsWith('https://')).toBe(true);
  });

  it('lists regional funds with valid states and covers every state with an AOK', () => {
    for (const k of KASSEN.filter((x) => x.scope === 'regional')) {
      expect(k.states?.length, k.id).toBeGreaterThan(0);
      for (const s of k.states!) expect(FEDERAL_STATES).toContain(s);
    }
    for (const k of KASSEN.filter((x) => x.scope === 'nationwide')) expect(k.states, k.id).toBeUndefined();
    for (const s of FEDERAL_STATES) expect(KASSEN.some((k) => k.type === 'AOK' && k.states?.includes(s)), s).toBe(true);
  });

  it('uses the 2026 statutory figures', () => {
    expect(GENERAL_RATE).toBe(14.6);
    expect(AVERAGE_ZB).toBe(2.9);
    expect(BBG_MONTH).toBe(5812.5);
  });
});

describe('compareKassen', () => {
  it('computes the employee share and sorts cheapest first', () => {
    const r = compareKassen({ gross: 3000, state: 'BY', scope: 'all' });
    expect(r.base).toBe(3000);
    expect(r.capped).toBe(false);
    // 3000 × (7.3 % + 1.45 %) = 262.50
    expect(r.average.monthly).toBe(262.5);
    for (let i = 1; i < r.rows.length; i++) expect(r.rows[i].kasse.zb).toBeGreaterThanOrEqual(r.rows[i - 1].kasse.zb);
    expect(r.rows.some((x) => x.kasse.id === 'aok-bayern')).toBe(true);
    expect(r.rows.some((x) => x.kasse.id === 'aok-nordost')).toBe(false);
    const tk = r.rows.find((x) => x.kasse.id === 'tk')!;
    expect(tk.monthly).toBe(employeeMonthly(3000, 2.69));
    expect(tk.monthly).toBe(259.35);
    expect(tk.yearly).toBe(3112.2);
    expect(r.priciest!.vsMaxYear).toBe(0);
    expect(r.cheapest!.vsMaxYear).toBeGreaterThan(0);
  });

  it('caps the base at the Beitragsbemessungsgrenze', () => {
    const a = compareKassen({ gross: 9000, state: 'BE', scope: 'all' });
    const b = compareKassen({ gross: 6000, state: 'BE', scope: 'all' });
    expect(a.capped).toBe(true);
    expect(a.base).toBe(5812.5);
    expect(a.rows[0].monthly).toBe(b.rows[0].monthly);
  });

  it('filters nationwide and regional funds', () => {
    expect(availableKassen('HH', 'regional').map((k) => k.id)).toEqual(['aok-rheinland-hamburg']);
    expect(availableKassen('HH', 'nationwide').every((k) => k.scope === 'nationwide')).toBe(true);
    expect(availableKassen('NW', 'regional').map((k) => k.id).sort()).toEqual(['aok-nordwest', 'aok-rheinland-hamburg']);
  });

  it('handles zero and invalid input', () => {
    const r = compareKassen({ gross: Number.NaN, state: 'BE', scope: 'all' });
    expect(r.rows.every((x) => x.monthly === 0)).toBe(true);
  });
});
