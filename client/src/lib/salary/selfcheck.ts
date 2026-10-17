/**
 * Self-check for the salary estimate (no test runner in the client).
 * Run from client/:  npx tsx src/lib/salary/selfcheck.ts
 * Not imported by the app, so it never reaches the bundle.
 */
import { calculateSalary, DEFAULT_INPUT, tariff, type SalaryInput } from './calc';

type Case = { name: string; input: Partial<SalaryInput>; check: (r: ReturnType<typeof calculateSalary>) => boolean };

const base: Partial<SalaryInput> = { ...DEFAULT_INPUT, state: 'BE', church: false, children: 0, age: 25, taxClass: 1 };

const cases: Case[] = [
  { name: 'tariff: 0 below Grundfreibetrag', input: {}, check: () => tariff(12_348) === 0 && tariff(12_349) >= 0 },
  { name: 'tariff continuous at zone limits', input: {}, check: () => Math.abs(tariff(17_799) - tariff(17_800)) <= 1 && Math.abs(tariff(69_878) - tariff(69_879)) <= 1 && Math.abs(tariff(277_825) - tariff(277_826)) <= 1 },
  { name: '3,000 €/month, class I, no church, childless, 25 → net 2,000–2,100', input: { ...base, gross: 3_000 }, check: (r) => r.monthly.net >= 2_000 && r.monthly.net <= 2_100 },
  { name: '0 € → everything 0', input: { ...base, gross: 0 }, check: (r) => Object.values(r.monthly).every((v) => v === 0) && r.hourlyNet === 0 },
  {
    name: '20,000 €/month → contributions capped at BBG',
    input: { ...base, gross: 20_000 },
    check: (r) => r.yearly.pension === 9_430.2 && r.yearly.unemployment === 1_318.2 && Math.abs(r.yearly.health - 69_750 * (0.073 + 0.0145)) < 0.01,
  },
  { name: 'class III pays less tax than class I', input: { ...base, gross: 4_500 }, check: (r) => r.monthly.incomeTax > calculateSalary({ ...base, gross: 4_500, taxClass: 3 }).monthly.incomeTax },
  { name: 'class V/VI pay more tax than class I', input: { ...base, gross: 3_000, taxClass: 5 }, check: (r) => r.monthly.incomeTax > calculateSalary({ ...base, gross: 3_000 }).monthly.incomeTax && calculateSalary({ ...base, gross: 3_000, taxClass: 6 }).monthly.incomeTax >= r.monthly.incomeTax - 1 },
  { name: 'church tax 8 % in BY vs 9 % in BE', input: { ...base, gross: 4_000, church: true, state: 'BY' }, check: (r) => r.yearly.churchTax < calculateSalary({ ...base, gross: 4_000, church: true }).yearly.churchTax },
  { name: 'childless surcharge only from 23', input: { ...base, gross: 3_000, age: 22 }, check: (r) => r.careRate === 0.018 && calculateSalary({ ...base, gross: 3_000 }).careRate === 0.024 },
  { name: '3 children → care 1.8 − 0.5 = 1.3 %', input: { ...base, gross: 3_000, children: 3 }, check: (r) => Math.abs(r.careRate - 0.013) < 1e-9 },
  { name: 'Saxony employee care share +0.5 %', input: { ...base, gross: 3_000, state: 'SN' }, check: (r) => Math.abs(r.careRate - 0.029) < 1e-9 },
  { name: 'soli 0 at 5,000 €/month (below Freigrenze)', input: { ...base, gross: 5_000 }, check: (r) => r.yearly.soli === 0 },
  { name: 'soli > 0 at 10,000 €/month', input: { ...base, gross: 10_000 }, check: (r) => r.yearly.soli > 0 },
  { name: 'yearly input = monthly × 12', input: { ...base, gross: 36_000, period: 'year' }, check: (r) => Math.abs(r.monthly.net - calculateSalary({ ...base, gross: 3_000 }).monthly.net) < 0.01 },
];

let failed = 0;
for (const c of cases) {
  const r = calculateSalary(c.input);
  const ok = c.check(r);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`);
}

const sample = (label: string, input: Partial<SalaryInput>) => {
  const r = calculateSalary(input).monthly;
  console.log(
    `  ${label.padEnd(34)} gross ${r.gross.toFixed(0).padStart(6)}  tax ${r.incomeTax.toFixed(2).padStart(8)}  soli ${r.soli.toFixed(2).padStart(7)}  church ${r.churchTax.toFixed(2).padStart(7)}  RV ${r.pension.toFixed(2).padStart(7)}  AV ${r.unemployment.toFixed(2).padStart(6)}  KV ${r.health.toFixed(2).padStart(7)}  PV ${r.care.toFixed(2).padStart(6)}  net ${r.net.toFixed(2).padStart(8)}`,
  );
};
console.log('\nSample monthly results:');
sample('3,000 I childless 25', { ...base, gross: 3_000 });
sample('3,200 I childless 30', { ...base, gross: 3_200, age: 30 });
sample('4,500 III 2 children church BY', { ...base, gross: 4_500, taxClass: 3, children: 2, church: true, state: 'BY' });
sample('2,500 V', { ...base, gross: 2_500, taxClass: 5 });
sample('20,000 I', { ...base, gross: 20_000 });

console.log(`\n${cases.length - failed}/${cases.length} checks passed`);
if (failed) throw new Error(`${failed} salary self-check(s) failed`);
