import { describe, expect, it } from 'vitest';
import { CELLS, COUNTRIES, COUNTRY_SOURCES, CRITERIA, LANGS, netOf, PRICE_LEVEL, PROFESSIONS, SALARY, UK_ELIGIBLE, yearlyOf } from './data';
import { pagesCountryCompare } from '@/i18n/pagesCountryCompare';

describe('country comparison data', () => {
  it('has every cell in all six languages', () => {
    for (const k of CRITERIA)
      for (const c of COUNTRIES)
        for (const l of LANGS) expect(CELLS[k][c][l]?.trim(), `${k} ${c} ${l}`).toBeTruthy();
  });

  it('keeps the price level cells in line with the Eurostat numbers', () => {
    for (const c of COUNTRIES) expect(CELLS.priceLevel[c].en).toBe(PRICE_LEVEL[c].toFixed(1));
  });

  it('has sane salary ranges and estimates', () => {
    for (const p of PROFESSIONS)
      for (const c of COUNTRIES) {
        const [lo, hi] = SALARY[p][c];
        expect(lo, `${p} ${c}`).toBeGreaterThan(800);
        expect(hi).toBeGreaterThanOrEqual(lo);
        expect(netOf(lo, c)).toBeLessThan(lo);
      }
    expect(yearlyOf(1000, 'at')).toBe(14000);
    expect(yearlyOf(1000, 'de')).toBe(12000);
    expect(UK_ELIGIBLE.nurse).toBe('yes');
    expect(COUNTRY_SOURCES.every((s) => s.url.startsWith('https://'))).toBe(true);
  });

  it('has the page copy (incl. FAQ) in all six languages', () => {
    for (const l of LANGS) {
      const c = pagesCountryCompare[l].countryCompare;
      expect(c.faq.length, l).toBeGreaterThanOrEqual(4);
      for (const k of CRITERIA) expect(c.criteria[k], `${l} ${k}`).toBeTruthy();
    }
  });
});
