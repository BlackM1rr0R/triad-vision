import { describe, expect, it } from 'vitest';
import { estimatePayroll } from '../../src/lib/budget/payroll.js';
import { calculateSalary, DEFAULT_INPUT, quickNetMonthly, sanitizeInput, type SalaryInput } from '../../src/lib/budget/salary.js';

/**
 * Public salary calculator (/salary-calculator) = lib/budget/salary.ts over the shared payroll of the budget.
 *
 * Reference values, derived by hand from the 2026 parameters in lib/budget/params.ts (BMF PAP 2026), for a
 * newly arrived single worker: class I, Berlin, no church tax, childless, age 30 (care 1.8 % + 0.6 %),
 * average Zusatzbeitrag 2.9 % (employee health 7.3 % + 1.45 % = 8.75 %). Y = 12 × monthly gross.
 *  1. Vorsorgepauschale (PAP UPEVP / MVSPHB):
 *       VSPR   = Y × 9.3 % (pension)
 *       VSPKVPV = Y × (1.45 % + 7.0 % reduced health + 2.4 % care) = Y × 10.85 %
 *       VSPALV = Y × 1.3 % (unemployment, new in 2026)
 *       VSP    = VSPR + max(VSPKVPV, min(VSPALV + VSPKVPV, 1,900 €))
 *     For every case below VSPKVPV > 1,900 €, so the unemployment part adds nothing.
 *  2. zvE = Y − 1,230 € (ANP) − 36 € (SAP) − VSP; Jahreslohnsteuer = §32a tariff 2026 (zone 3 for all four:
 *     z = (zvE − 17,799) / 10,000, (173.10 · z + 2,397) · z + 1,034.87, rounded down).
 *  3. Monthly Lohnsteuer = Jahreslohnsteuer / 12 rounded down to the cent; soli 0 (below the 20,350 €
 *     Freigrenze); contributions = monthly gross × employee rate, rounded to the cent.
 *
 *   gross  VSP        zvE     JLSt    LSt/month  RV      AV     KV      PV      net
 *   2,500  6,045.00   22,689  2,248   187.33     232.50  32.50  218.75  60.00   1,768.92
 *   3,000  7,254.00   27,480  3,517   293.08     279.00  39.00  262.50  72.00   2,054.42
 *   4,000  9,672.00   37,062  6,294   524.50     372.00  52.00  350.00  96.00   2,605.50
 *   5,500  13,299.00  51,435  11,055  921.25     511.50  71.50  481.25  132.00  3,382.50
 * Cross-check: 2,500 €/month = 30,000 €/year → 2,248 € is exactly the BMF Prüftabelle value
 * (tests/unit/budgetPayroll.test.ts); 5,000 €/month = 60,000 € → 9,389 € (also Prüftabelle).
 * The previous client calculator deducted the unemployment part on top (no 1,900 € cap) and so
 * under-stated the Lohnsteuer by 8.33 / 10.58 / 15.83 / 25.33 € per month for these four salaries.
 */
const REFERENCE: [gross: number, incomeTax: number, pension: number, unemployment: number, health: number, care: number, net: number][] = [
  [2_500, 187.33, 232.5, 32.5, 218.75, 60, 1_768.92],
  [3_000, 293.08, 279, 39, 262.5, 72, 2_054.42],
  [4_000, 524.5, 372, 52, 350, 96, 2_605.5],
  [5_500, 921.25, 511.5, 71.5, 481.25, 132, 3_382.5],
];

const single: Partial<SalaryInput> = { ...DEFAULT_INPUT, period: 'month' };

describe('salary calculator defaults', () => {
  it('newly arrived single worker: class I, no church tax, childless, 23+, average Zusatzbeitrag 2.9 %', () => {
    expect(DEFAULT_INPUT).toMatchObject({ taxClass: 1, church: false, children: 0, zusatzbeitrag: 0.029 });
    expect(DEFAULT_INPUT.age).toBeGreaterThanOrEqual(23);
    expect(calculateSalary(DEFAULT_INPUT).careRate).toBe(0.024);
  });
});

describe('2026 reference values (class I, childless, no church tax)', () => {
  it.each(REFERENCE)('%i € gross/month', (gross, incomeTax, pension, unemployment, health, care, net) => {
    const r = calculateSalary({ ...single, gross });
    expect(r.monthly).toEqual({ gross, incomeTax, soli: 0, churchTax: 0, pension, unemployment, health, care, net });
    expect(r.lowWage).toBeNull();
  });

  it('is the same computation as the first-month budget', () => {
    for (const [gross] of REFERENCE) {
      const b = estimatePayroll({ grossMonthly: gross, taxClass: 1, state: 'BE', church: false, children: 0, age: 30 });
      expect(calculateSalary({ ...single, gross }).monthly.net).toBe(b.net);
    }
    expect(quickNetMonthly(3_000)).toBe(2_054.42);
  });
});

describe('month / year toggle', () => {
  it('a yearly gross gives the same monthly result; yearly amounts are 12 × the monthly ones', () => {
    const m = calculateSalary({ ...single, gross: 3_000 });
    const y = calculateSalary({ ...single, gross: 36_000, period: 'year' });
    expect(y.monthly).toEqual(m.monthly);
    expect(y.yearly.gross).toBe(36_000);
    expect(y.yearly.incomeTax).toBeCloseTo(293.08 * 12, 2);
    expect(y.yearly.net).toBeCloseTo(2_054.42 * 12, 2);
    expect(m.yearly).toEqual(y.yearly);
  });

  it('keeps an odd yearly gross exactly', () => {
    const y = calculateSalary({ ...single, gross: 50_000, period: 'year' });
    expect(y.yearly.gross).toBe(50_000);
    const deductions = y.yearly.incomeTax + y.yearly.soli + y.yearly.churchTax + y.yearly.pension + y.yearly.unemployment + y.yearly.health + y.yearly.care;
    expect(y.yearly.net).toBeCloseTo(50_000 - deductions, 2);
  });
});

describe('inputs that change the net', () => {
  const at = (o: Partial<SalaryInput>) => calculateSalary({ ...single, gross: 4_000, ...o }).monthly;

  it('church tax 9 % (8 % in Bavaria) of the Lohnsteuer', () => {
    expect(at({ church: true }).churchTax).toBe(Math.floor(6_294 / 12 * 0.09 * 100) / 100);
    expect(at({ church: true, state: 'BY' }).churchTax).toBe(Math.floor(6_294 / 12 * 0.08 * 100) / 100);
  });

  it('childless surcharge only from 23; children reduce care and the church-tax base', () => {
    expect(at({ age: 22 }).care).toBe(72);
    expect(at({ children: 1 }).care).toBe(72);
    expect(at({ children: 3 }).care).toBe(52);
    expect(at({ children: 1, church: true }).churchTax).toBeLessThan(at({ church: true }).churchTax);
  });

  it('Zusatzbeitrag: half is paid by the employee', () => {
    expect(at({ zusatzbeitrag: 0.035 }).health).toBe(362); // 4,000 × (7.3 % + 1.75 %)
  });

  it('tax classes: III < II < I = IV < V < VI', () => {
    const tax = (taxClass: SalaryInput['taxClass']) => at({ taxClass }).incomeTax;
    expect(tax(3)).toBeLessThan(tax(2));
    expect(tax(2)).toBeLessThan(tax(1));
    expect(tax(4)).toBe(tax(1));
    expect(tax(5)).toBeGreaterThan(tax(1));
    expect(tax(6)).toBeGreaterThan(tax(5));
    // class II: Entlastungsbetrag 4,260 € → zvE 32,802 → tariff 5,020 €
    expect(tax(2)).toBe(Math.floor((5_020 / 12) * 100) / 100);
  });
});

describe('Minijob and Übergangsbereich (Midijob)', () => {
  it('Minijob up to 603 €: only the 3.6 % pension share, no Lohnsteuer', () => {
    const r = calculateSalary({ ...single, gross: 500 });
    expect(r.lowWage).toBe('minijob');
    expect(r.monthly).toMatchObject({ incomeTax: 0, pension: 18, unemployment: 0, health: 0, care: 0, net: 482 });
  });

  it('1,500 €: employee contributions on 2,000 / 1,397 × (1,500 − 603) = 1,284.18 €', () => {
    // Lohnsteuer on the actual wage: Y 18,000, VSP 1,674 + min(234 + 1,953, 1,900) = 3,627, zvE 13,107 → 111 €/year.
    const r = calculateSalary({ ...single, gross: 1_500 });
    expect(r.lowWage).toBe('midijob');
    expect(r.monthly).toMatchObject({ incomeTax: 9.25, pension: 119.43, unemployment: 16.69, health: 112.37, care: 30.82, net: 1_211.44 });
  });

  it('is continuous at 2,000 € and 603 €', () => {
    const at2000 = calculateSalary({ ...single, gross: 2_000 });
    const above = calculateSalary({ ...single, gross: 2_000.01 });
    expect(at2000.lowWage).toBe('midijob');
    expect(above.lowWage).toBeNull();
    expect(Math.abs(above.monthly.net - at2000.monthly.net)).toBeLessThan(0.05);
    expect(calculateSalary({ ...single, gross: 603.01 }).monthly.pension).toBe(0);
  });

  it('the budget module keeps flagging instead of applying the rules', () => {
    const b = estimatePayroll({ grossMonthly: 1_500, taxClass: 1, state: 'BE', church: false, children: 0, age: 30 });
    expect(b.midijob).toBe(true);
    expect(b.lowWage).toBeNull();
    expect(b.pension).toBe(139.5);
  });
});

describe('input sanitising', () => {
  it('clamps bad values', () => {
    expect(sanitizeInput({ gross: -5, taxClass: 9 as never, children: 99, age: 3, zusatzbeitrag: 1 })).toMatchObject({ gross: 0, taxClass: 1, children: 15, age: 14, zusatzbeitrag: 0.1 });
    const zero = calculateSalary({ ...single, gross: 0 });
    expect(Object.values(zero.monthly).every((v) => v === 0)).toBe(true);
    expect(zero.deductionRate).toBe(0);
  });
});
