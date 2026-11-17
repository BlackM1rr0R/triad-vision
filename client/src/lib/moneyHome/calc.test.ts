import { describe, expect, it } from 'vitest';
import { cityBySlug } from '../cities/data';
import { aznText, DEFAULT_MONEY_HOME, livingCosts, moneyHome, moneyHomeFromParams, moneyHomeToQuery, transferFee } from './calc';
import { BAKU, BAKU_ITEMS, MONEY_HOME_SOURCES } from './data';

const RATE = 1.93;

describe('money for family', () => {
  it('orders the lifestyles: frugal (WG) < normal < comfortable', () => {
    const berlin = cityBySlug('berlin')!;
    const f = livingCosts(berlin, 'frugal').total;
    const n = livingCosts(berlin, 'normal').total;
    const c = livingCosts(berlin, 'comfortable').total;
    expect(f).toBeLessThan(n);
    expect(n).toBeLessThan(c);
    // A single person in Berlin: plausible monthly costs (rent included).
    expect(n).toBeGreaterThan(900);
    expect(n).toBeLessThan(2000);
  });

  it('sends what is left after costs and own savings, and converts at the rate', () => {
    const r = moneyHome({ ...DEFAULT_MONEY_HOME, net: 2400, save: 200 }, RATE);
    expect(r.send).toBe(2400 - r.costs - 200);
    expect(r.short).toBe(0);
    expect(r.fee[0]).toBeLessThanOrEqual(r.fee[1]);
    expect(r.arrives).toEqual([r.send - r.fee[1], r.send - r.fee[0]]);
    expect(r.azn).toBe(Math.round(((r.arrives[0] + r.arrives[1]) / 2) * RATE));
    expect(r.yearAzn).toBe(r.azn! * 12);
    expect(r.equivalents.map((e) => e.key)).toEqual([...BAKU_ITEMS]);
    const pension = r.equivalents.find((e) => e.key === 'pension')!;
    expect(pension.times).toBeCloseTo(r.azn! / BAKU.pension.azn, 1);
  });

  it('reports a shortfall instead of a negative transfer', () => {
    const r = moneyHome({ ...DEFAULT_MONEY_HOME, net: 900, city: 'muenchen', style: 'comfortable', save: 300 }, RATE);
    expect(r.send).toBe(0);
    expect(r.short).toBeGreaterThan(0);
    expect(r.fee).toEqual([0, 0]);
    expect(r.azn).toBe(0);
  });

  it('works without a rate (no AZN, no equivalents)', () => {
    const r = moneyHome(DEFAULT_MONEY_HOME, null);
    expect(r.azn).toBeNull();
    expect(r.equivalents).toEqual([]);
  });

  it('charges a bank transfer more than an online service', () => {
    const bank = transferFee(500, 'bank');
    const online = transferFee(500, 'online');
    expect(bank[0]).toBeGreaterThan(online[0]);
    expect(bank[1]).toBeGreaterThan(online[1]);
    expect(transferFee(0, 'bank')).toEqual([0, 0]);
  });

  it('round-trips the URL and converts ?gross with the given payroll function', () => {
    const q = moneyHomeToQuery({ net: 2222, city: 'leipzig', style: 'frugal', save: 50, method: 'bank' });
    expect(moneyHomeFromParams(new URLSearchParams(q))).toEqual({ net: 2222, city: 'leipzig', style: 'frugal', save: 50, method: 'bank' });
    expect(moneyHomeFromParams(new URLSearchParams('gross=3000'), (g) => g * 0.66).net).toBe(1980);
    expect(moneyHomeFromParams(new URLSearchParams('city=atlantis&style=lavish&method=pigeon'))).toEqual(DEFAULT_MONEY_HOME);
  });

  it('formats manat without Intl, per language', () => {
    expect(aznText(1234567, 'en')).toBe('1,234,567 ₼');
    expect(aznText(1234, 'de')).toBe('1.234 ₼');
    expect(aznText(1234, 'az')).toBe('1 234 ₼');
  });

  it('cites a source for every Baku figure and labels only the rent as an estimate', () => {
    for (const k of BAKU_ITEMS) {
      expect(BAKU[k].source.url).toMatch(/^https:\/\//);
      expect(BAKU[k].azn).toBeGreaterThan(0);
    }
    expect(BAKU_ITEMS.filter((k) => BAKU[k].estimate)).toEqual(['rent2']);
    expect(MONEY_HOME_SOURCES.length).toBeGreaterThanOrEqual(6);
  });
});
