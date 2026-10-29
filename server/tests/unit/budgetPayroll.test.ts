import { describe, expect, it } from 'vitest';
import { careRate, estimatePayroll, lohnsteuerJahr, soliJahr, tariff } from '../../src/lib/budget/payroll.js';
import { CURRENT_PARAMS } from '../../src/lib/budget/params.js';

/**
 * Reference values: BMF, Programmablaufplan Lohnsteuer 2026 (Anlage 1 to the BMF letter of 12.11.2025),
 * page 39 "Allgemeine maschinelle Jahreslohnsteuer 2026 (Prüftabelle)": all social insurances, KVZ 2.90 %,
 * PVZ = 1 (childless surcharge) in classes I, III and IV. Columns: yearly gross, Jahreslohnsteuer I, III, IV.
 */
const PRUEFTABELLE_2026: [number, number, number, number][] = [
  [5_000, 0, 0, 0],
  [7_500, 0, 0, 0],
  [10_000, 0, 0, 0],
  [12_500, 0, 0, 0],
  [15_000, 0, 0, 0],
  [17_500, 51, 0, 51],
  [20_000, 380, 0, 380],
  [22_500, 782, 0, 782],
  [25_000, 1_251, 0, 1_251],
  [27_500, 1_742, 0, 1_742],
  [30_000, 2_248, 0, 2_248],
  [32_500, 2_767, 0, 2_767],
  [35_000, 3_300, 294, 3_300],
  [37_500, 3_847, 628, 3_847],
  [40_000, 4_407, 1_000, 4_407],
  [42_500, 4_982, 1_406, 4_982],
  [45_000, 5_570, 1_850, 5_570],
  [47_500, 6_172, 2_324, 6_172],
  [50_000, 6_788, 2_810, 6_788],
  [52_500, 7_417, 3_302, 7_417],
  [55_000, 8_060, 3_802, 8_060],
  [57_500, 8_718, 4_308, 8_718],
  [60_000, 9_389, 4_822, 9_389],
  [62_500, 10_073, 5_342, 10_073],
  [65_000, 10_772, 5_870, 10_772],
  [67_500, 11_484, 6_402, 11_484],
  [70_000, 12_220, 6_952, 12_220],
  [72_500, 13_062, 7_574, 13_062],
  [75_000, 13_922, 8_206, 13_922],
  [77_500, 14_799, 8_846, 14_799],
  [80_000, 15_694, 9_496, 15_694],
  [82_500, 16_607, 10_154, 16_607],
  [85_000, 17_538, 10_822, 17_538],
  [87_500, 18_486, 11_498, 18_486],
  [90_000, 19_438, 12_182, 19_438],
  [92_500, 20_390, 12_876, 20_390],
  [95_000, 21_343, 13_580, 21_343],
  [97_500, 22_295, 14_292, 22_295],
  [100_000, 23_248, 15_012, 23_248],
  [102_500, 24_243, 15_774, 24_243],
  [105_000, 25_293, 16_590, 25_293],
  [107_500, 26_343, 17_416, 26_343],
  [110_000, 27_393, 18_252, 27_393],
];

const PV_CHILDLESS = 0.024; // 1.8 % + 0.6 % childless surcharge

describe('Lohnsteuer 2026 against the BMF Prüftabelle', () => {
  it.each(PRUEFTABELLE_2026)('yearly gross %i € → I %i / III %i / IV %i', (gross, i, iii, iv) => {
    const opts = { children: 0, pvRate: PV_CHILDLESS, zusatzbeitrag: 0.029 };
    expect(lohnsteuerJahr(gross, { ...opts, taxClass: 1 }).incomeTax).toBe(i);
    expect(lohnsteuerJahr(gross, { ...opts, taxClass: 3 }).incomeTax).toBe(iii);
    expect(lohnsteuerJahr(gross, { ...opts, taxClass: 4 }).incomeTax).toBe(iv);
  });
});

describe('tariff §32a EStG 2026', () => {
  it('is 0 up to the Grundfreibetrag and continuous at the zone limits', () => {
    expect(tariff(12_348)).toBe(0);
    expect(tariff(12_349)).toBe(0);
    expect(tariff(12_448)).toBeGreaterThan(0);
    for (const limit of [17_799, 69_878, 277_825]) expect(Math.abs(tariff(limit + 1) - tariff(limit))).toBeLessThanOrEqual(1);
  });
  it('known points of the 2026 formula', () => {
    // zone 4 / 5 are linear: 0.42 · x − 11,135.63 and 0.45 · x − 19,470.38
    expect(tariff(100_000)).toBe(Math.floor(42_000 - 11_135.63));
    expect(tariff(300_000)).toBe(Math.floor(135_000 - 19_470.38));
  });
});

describe('solidarity surcharge', () => {
  it('Freigrenze 20,350 € (40,700 € in class III) and the 11.9 % Milderungszone', () => {
    expect(soliJahr(20_350, 1)).toBe(0);
    expect(soliJahr(21_000, 1)).toBeCloseTo((21_000 - 20_350) * 0.119, 2);
    expect(soliJahr(40_000, 3)).toBe(0);
    expect(soliJahr(60_000, 1)).toBeCloseTo(60_000 * 0.055, 2);
  });
});

describe('care insurance rate', () => {
  it('childless surcharge from 23, child discounts from the 2nd child, Saxony', () => {
    expect(careRate('BE', 0, 22)).toBe(0.018);
    expect(careRate('BE', 0, 23)).toBe(0.024);
    expect(careRate('BE', 1, 30)).toBe(0.018);
    expect(careRate('BE', 3, 30)).toBe(0.013);
    expect(careRate('BE', 7, 30)).toBe(0.008); // at most 4 reductions
    expect(careRate('SN', 0, 30)).toBe(0.029);
  });
});

describe('monthly payroll estimate', () => {
  const base = { taxClass: 1 as const, state: 'BE' as const, church: false, children: 0, age: 30 };

  it('3,000 € class I, childless: contributions and the tax of the Prüftabelle logic', () => {
    const r = estimatePayroll({ ...base, grossMonthly: 3_000 });
    expect(r.pension).toBe(279);
    expect(r.unemployment).toBe(39);
    expect(r.health).toBe(262.5); // 7.3 % + 1.45 %
    expect(r.care).toBe(72); // 2.4 %
    expect(r.incomeTax).toBe(Math.floor((lohnsteuerJahr(36_000, { taxClass: 1, children: 0, pvRate: 0.024, zusatzbeitrag: 0.029 }).incomeTax / 12) * 100) / 100);
    expect(r.soli).toBe(0);
    expect(r.churchTax).toBe(0);
    expect(r.net).toBeCloseTo(3_000 - r.incomeTax - 279 - 39 - 262.5 - 72, 2);
    expect(r.net).toBeGreaterThan(1_950);
    expect(r.net).toBeLessThan(2_100);
  });

  it('60,000 €/year class I: monthly tax = Prüftabelle / 12', () => {
    const r = estimatePayroll({ ...base, grossMonthly: 5_000 });
    expect(r.incomeTax).toBe(Math.floor((9_389 / 12) * 100) / 100);
  });

  it('class III pays less than IV, IV equals I without children', () => {
    const one = estimatePayroll({ ...base, grossMonthly: 4_000 });
    const three = estimatePayroll({ ...base, grossMonthly: 4_000, taxClass: 3 });
    const four = estimatePayroll({ ...base, grossMonthly: 4_000, taxClass: 4 });
    expect(three.incomeTax).toBeLessThan(four.incomeTax);
    expect(four.incomeTax).toBe(one.incomeTax);
  });

  it('church tax toggle: 9 % in Berlin, 8 % in Bavaria, base = tax after child allowances', () => {
    const be = estimatePayroll({ ...base, grossMonthly: 4_000, church: true });
    const by = estimatePayroll({ ...base, grossMonthly: 4_000, church: true, state: 'BY' });
    expect(be.churchTax).toBeCloseTo(Math.floor(be.yearly.incomeTax / 12 * 0.09 * 100) / 100, 1);
    expect(by.churchTax).toBeLessThan(be.churchTax);
    const kids = estimatePayroll({ ...base, grossMonthly: 4_000, church: true, children: 2 });
    // Lohnsteuer ignores the child allowances; church tax is computed on the tax after them.
    expect(kids.churchTax).toBeLessThan(Math.floor((kids.yearly.incomeTax / 12) * 0.09 * 100) / 100);
  });

  it('soli only above the Freigrenze', () => {
    expect(estimatePayroll({ ...base, grossMonthly: 6_000 }).soli).toBe(0);
    expect(estimatePayroll({ ...base, grossMonthly: 12_000 }).soli).toBeGreaterThan(0);
  });

  it('contributions are capped at the monthly ceilings (8,450 € / 5,812.50 €)', () => {
    const r = estimatePayroll({ ...base, grossMonthly: 20_000 });
    expect(r.pension).toBe(785.85);
    expect(r.unemployment).toBe(109.85);
    expect(r.health).toBeCloseTo(5_812.5 * 0.0875, 2);
    expect(r.care).toBeCloseTo(5_812.5 * 0.024, 2);
  });

  it('flags the Midijob range and handles 0', () => {
    expect(estimatePayroll({ ...base, grossMonthly: 1_800 }).midijob).toBe(true);
    expect(estimatePayroll({ ...base, grossMonthly: 2_500 }).midijob).toBe(false);
    const zero = estimatePayroll({ ...base, grossMonthly: 0 });
    expect(zero.net).toBe(0);
    expect(zero.incomeTax).toBe(0);
  });

  it('uses the 2026 parameters', () => {
    expect(CURRENT_PARAMS.payroll.year).toBe(2026);
    expect(estimatePayroll({ ...base, grossMonthly: 3_000 }).year).toBe(2026);
  });
});
