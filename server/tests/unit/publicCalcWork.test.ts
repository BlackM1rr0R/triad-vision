import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { estimatePayroll } from '../../src/lib/budget/payroll.js';

/*
 * Work & employer calculators of client/src/lib/publicCalc: driving / rest times (VO 561/2006 + §21a ArbZG),
 * shift plan check (ArbZG), Steuerklassen chooser (III/V, IV/IV, Faktor) and employer cost.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const load = async <T>(file: string) => (await import(/* @vite-ignore */ pathToFileURL(path.resolve(here, '../../../client/src/lib/publicCalc', file)).href)) as T;

type Kind = 'drive' | 'work' | 'break' | 'rest';
interface Block { kind: Kind; minutes: number }
interface Finding { code: string; severity: string; rule: string; day: number; minutes: number; fine: { driver: number; company: number } | null }
const D = await load<{
  checkDriver: (i: { days: Block[][] }) => { findings: Finding[]; weeks: { drive: number; work: number }[]; twoWeeks: number | null; status: string; fines: { driver: number; company: number }; duties: { restType: string; drive: number }[] };
  WEEK_PRESETS: Record<'legal' | 'violations', () => { days: Block[][] }>;
  DAY_PRESETS: Record<'typical' | 'long' | 'short' | 'off', Block[]>;
  drivingFine: (m: number) => { driver: number; company: number };
  breakFine: (m: number) => { driver: number; company: number };
  restFine: (m: number) => { driver: number; company: number };
  timeline: (d: Block[][]) => { kind: string; start: number; len: number }[];
}>('drivingTime.ts');

interface Shift { off: boolean; start: string; end: string; breakMin: number }
const S = await load<{
  checkSchedule: (i: { sector: string; days: Shift[] }) => { findings: { code: string; severity: string; day: number; minutes: number }[]; weeks: number[]; status: string; days: { work: number; night: boolean; restBefore: number | null }[] };
  PLAN_PRESETS: Record<'nurse' | 'cook' | 'quickReturn', () => { sector: string; days: Shift[] }>;
  SHIFT_PRESETS: Record<'early' | 'late' | 'night' | 'split' | 'off', Shift>;
  nightMinutes: (a: number, b: number) => number;
  parseHm: (s: string) => number | null;
}>('workSchedule.ts');

type Combo = 'III/V' | 'V/III' | 'IV/IV' | 'IV/IV+F';
interface PartnerMonth { taxClass: number; gross: number; tax: number; social: number; net: number }
const T = await load<{
  compareTaxClasses: (i: { grossA: number; grossB: number; state: string; church: boolean; children: number }) => {
    combos: { combo: Combo; a: PartnerMonth; b: PartnerMonth; netMonthly: number; withheldYear: number; settlement: number; mandatoryReturn: boolean }[];
    factor: number;
    annualTax: number;
    bestMonthly: Combo;
    closest: Combo;
  };
}>('taxClass.ts');

const E = await load<{
  calculateEmployerCost: (i: Record<string, unknown>) => {
    gross: number;
    lines: Record<string, number>;
    social: number;
    monthly: number;
    yearly: number;
    surchargePct: number;
    oneOff: Record<string, number>;
    firstYear: number;
    vacancy: number;
    vacancyMonths: number | null;
    lowWage: string | null;
  };
  DEFAULT_EMPLOYER_COST: Record<string, unknown>;
}>('employerCost.ts');

const h = (n: number) => Math.round(n * 60);
const blk = (kind: Kind, hours: number): Block => ({ kind, minutes: h(hours) });
const codes = (f: { code: string }[]) => f.map((x) => x.code);

describe('driving & rest times (VO 561/2006, §21a ArbZG)', () => {
  it('accepts the legal preset week without violations', () => {
    const r = D.checkDriver(D.WEEK_PRESETS.legal());
    expect(r.findings.filter((f) => f.severity === 'violation')).toEqual([]);
    expect(r.status).toBe('ok');
    expect(r.weeks[0].drive).toBe(h(42));
    // Two 10-h days are the allowed extensions.
    expect(codes(r.findings).filter((c) => c === 'extensionUsed')).toHaveLength(2);
  });

  it('finds the typical violations of the example week', () => {
    const r = D.checkDriver(D.WEEK_PRESETS.violations());
    const c = codes(r.findings);
    expect(c).toContain('break'); // 5:15 without a break
    expect(c).toContain('dailyDriving'); // 10:45 and a third 10-h day
    expect(c).toContain('dailyRest'); // 7:45 rest
    expect(c).toContain('weeklyDriving'); // > 56 h
    expect(c).toContain('weeklyRestLate'); // 7 days without a weekly rest
    expect(c).toContain('arbzgDay');
    expect(r.status).toBe('violations');
    const brk = r.findings.find((f) => f.code === 'break')!;
    expect(brk.minutes).toBe(45);
    expect(brk.fine).toEqual({ driver: 30 + 2 * 60, company: 90 + 2 * 180 });
    const rest = r.findings.find((f) => f.code === 'dailyRest')!;
    expect(rest.minutes).toBe(75);
    expect(r.fines.driver).toBeGreaterThan(0);
  });

  it('allows a split break 15 + 30 but not 30 + 15', () => {
    const ok = D.checkDriver({ days: [[blk('rest', 6), blk('drive', 4), blk('break', 0.25), blk('drive', 0.5), blk('break', 0.5), blk('drive', 4)], [], [], [], [], [], []] });
    expect(codes(ok.findings)).not.toContain('break');
    const bad = D.checkDriver({ days: [[blk('rest', 6), blk('drive', 4), blk('break', 0.5), blk('drive', 0.5), blk('break', 0.25), blk('drive', 4)], [], [], [], [], [], []] });
    expect(codes(bad.findings)).toContain('break');
  });

  it('counts reduced daily rests and flags the fourth', () => {
    // Each day 06:00 – 21:00 on duty (15 h) → 9 h rest until 06:00.
    const day = [blk('rest', 6), blk('drive', 4.5), blk('break', 0.75), blk('drive', 4), blk('break', 1), blk('work', 1.5), blk('break', 2.25), blk('work', 1)];
    const r = D.checkDriver({ days: [day, day, day, day, day, [], []] });
    expect(codes(r.findings).filter((c) => c === 'reducedRest')).toHaveLength(3);
    expect(codes(r.findings)).toContain('reducedRestTooOften');
  });

  it('recognises a split daily rest 3 h + 9 h', () => {
    const day = [blk('rest', 6), blk('drive', 4.5), blk('rest', 3), blk('drive', 4.5), blk('work', 0.5)];
    // Duty 06:00 – 18:30, then 11:30 rest; the 3-h part makes it a split rest even if the day were longer.
    const r = D.checkDriver({ days: [day, [], [], [], [], [], []] });
    expect(r.duties[0].restType).toMatch(/split|weekly/);
  });

  it('checks 56 h / 90 h and the two-week sum', () => {
    const long = [blk('rest', 5), blk('drive', 4.5), blk('break', 0.75), blk('drive', 4.5)];
    const r = D.checkDriver({ days: [long, long, long, long, long, long, [], [], [], [], [], [], [], []].map((d) => d.map((x) => ({ ...x }))) });
    expect(r.weeks[0].drive).toBe(h(54));
    expect(r.twoWeeks).toBe(h(54));
    const w = [long, long, long, long, long, long, []];
    const r2 = D.checkDriver({ days: [...w, ...w] });
    expect(r2.twoWeeks).toBe(h(108));
    expect(codes(r2.findings)).toContain('twoWeekDriving');
  });

  it('merges rest across midnight and fills unplanned time with rest', () => {
    const t = D.timeline([[blk('drive', 2)], [blk('rest', 1), blk('drive', 1)]]);
    expect(t[0]).toEqual({ kind: 'drive', start: 0, len: 120 });
    expect(t[1]).toEqual({ kind: 'off', start: 120, len: 1440 - 120 + 60 });
  });

  it('applies the indicative fine steps', () => {
    expect(D.drivingFine(30)).toEqual({ driver: 30, company: 0 });
    expect(D.drivingFine(90)).toEqual({ driver: 60, company: 90 });
    expect(D.drivingFine(150)).toEqual({ driver: 30 + 2 * 30 + 60, company: 2 * 90 + 180 });
    expect(D.breakFine(10)).toEqual({ driver: 30, company: 90 });
    expect(D.restFine(120)).toEqual({ driver: 60, company: 90 });
    expect(D.restFine(240)).toEqual({ driver: 30 + 2 * 30 + 60, company: 2 * 90 + 180 });
  });
});

describe('shift plan check (ArbZG)', () => {
  it('passes the nurse preset (Sunday work in a hospital, replacement day)', () => {
    const r = S.checkSchedule(S.PLAN_PRESETS.nurse());
    expect(r.status).toBe('ok');
    expect(codes(r.findings)).toContain('sundayAllowed');
    expect(codes(r.findings)).toContain('nightWorker');
    expect(r.weeks[0]).toBe(h(48));
  });

  it('warns about 50 h in the cook preset but finds no violation', () => {
    const r = S.checkSchedule(S.PLAN_PRESETS.cook());
    expect(r.status).toBe('warnings');
    expect(codes(r.findings)).toContain('weekly48');
    expect(codes(r.findings)).toContain('daily8');
  });

  it('flags quick returns (late → early) as rest violations', () => {
    const r = S.checkSchedule(S.PLAN_PRESETS.quickReturn());
    const rest = r.findings.filter((f) => f.code === 'rest');
    expect(rest).toHaveLength(2);
    expect(rest[0].minutes).toBe(h(3));
  });

  it('allows 10 h rest in hospitals only with compensation, never in other sectors', () => {
    const days = [{ off: false, start: '08:00', end: '20:00', breakMin: 60 }, { off: false, start: '06:00', end: '14:00', breakMin: 30 }, ...Array.from({ length: 5 }, () => ({ ...S.SHIFT_PRESETS.off }))];
    // 20:00 → 06:00 = 10 h.
    const hosp = S.checkSchedule({ sector: 'hospital', days });
    expect(codes(hosp.findings)).toContain('restReduced');
    expect(codes(hosp.findings)).toContain('restCompensation');
    expect(codes(hosp.findings)).not.toContain('rest');
    const other = S.checkSchedule({ sector: 'other', days });
    expect(codes(other.findings)).toContain('rest');
  });

  it('checks breaks, 10-h days and night work', () => {
    const days = [
      { off: false, start: '06:00', end: '17:30', breakMin: 30 }, // 11 h work, 30 min break (needs 45)
      { off: false, start: '22:00', end: '09:00', breakMin: 45 }, // night 10:15
      ...Array.from({ length: 5 }, () => ({ ...S.SHIFT_PRESETS.off })),
    ];
    const r = S.checkSchedule({ sector: 'other', days });
    expect(codes(r.findings)).toEqual(expect.arrayContaining(['daily10', 'break', 'night10']));
    expect(r.days[1].night).toBe(true);
    expect(S.nightMinutes(22 * 60, 24 * 60 + 6 * 60)).toBe(7 * 60);
    expect(S.parseHm('7:05')).toBe(425);
    expect(S.parseHm('25:00')).toBeNull();
  });

  it('wants a replacement rest day for Sunday work and flags Sundays outside the exempt sectors', () => {
    const work = { off: false, start: '08:00', end: '16:30', breakMin: 30 };
    const days = Array.from({ length: 7 }, () => ({ ...work }));
    const r = S.checkSchedule({ sector: 'other', days });
    expect(codes(r.findings)).toEqual(expect.arrayContaining(['sundayOther', 'noReplacementDay']));
  });
});

describe('Steuerklassen chooser', () => {
  const input = { grossA: 4_200, grossB: 2_200, state: 'BE', church: false, children: 0 };

  it('uses the payroll engine per class and keeps social contributions independent of the class', () => {
    const r = T.compareTaxClasses(input);
    const c35 = r.combos.find((c) => c.combo === 'III/V')!;
    const p3 = estimatePayroll({ grossMonthly: 4_200, taxClass: 3, state: 'BE', church: false, children: 0, age: 30, lowWageRules: true });
    expect(c35.a.net).toBeCloseTo(p3.net, 2);
    const c44 = r.combos.find((c) => c.combo === 'IV/IV')!;
    expect(c35.a.social).toBe(c44.a.social);
  });

  it('gives III/V the highest monthly net for unequal salaries and a back payment risk', () => {
    const r = T.compareTaxClasses(input);
    expect(r.bestMonthly).toBe('III/V');
    const c35 = r.combos.find((c) => c.combo === 'III/V')!;
    const c44 = r.combos.find((c) => c.combo === 'IV/IV')!;
    expect(c35.netMonthly).toBeGreaterThan(c44.netMonthly);
    // IV/IV overpays for unequal salaries → refund.
    expect(c44.settlement).toBeGreaterThan(0);
    expect(c35.mandatoryReturn).toBe(true);
    expect(c44.mandatoryReturn).toBe(false);
  });

  it('computes a Faktor < 1 that brings the withholding close to the annual tax', () => {
    const r = T.compareTaxClasses(input);
    expect(r.factor).toBeGreaterThan(0.8);
    expect(r.factor).toBeLessThan(1);
    expect(Math.round(r.factor * 1000)).toBe(r.factor * 1000);
    const f = r.combos.find((c) => c.combo === 'IV/IV+F')!;
    const c44 = r.combos.find((c) => c.combo === 'IV/IV')!;
    expect(Math.abs(f.settlement)).toBeLessThan(Math.abs(c44.settlement));
    expect(r.closest).toBe('IV/IV+F');
  });

  it('has a Faktor of 1 for equal salaries', () => {
    const r = T.compareTaxClasses({ ...input, grossB: 4_200 });
    expect(r.factor).toBe(1);
    const f = r.combos.find((c) => c.combo === 'IV/IV+F')!;
    const c44 = r.combos.find((c) => c.combo === 'IV/IV')!;
    expect(f.netMonthly).toBeCloseTo(c44.netMonthly, 1);
  });

  it('treats a partner without income: III/V withholding ≈ annual tax', () => {
    const r = T.compareTaxClasses({ ...input, grossB: 0 });
    const c35 = r.combos.find((c) => c.combo === 'III/V')!;
    expect(c35.b.tax).toBe(0);
    expect(Math.abs(c35.settlement)).toBeLessThan(300);
  });
});

describe('employer cost', () => {
  it('adds the 2026 employer shares and the Umlagen', () => {
    const r = E.calculateEmployerCost({ ...E.DEFAULT_EMPLOYER_COST, grossMonthly: 4_000 });
    expect(r.lines.pension).toBe(372);
    expect(r.lines.unemployment).toBe(52);
    expect(r.lines.health).toBe(350);
    expect(r.lines.care).toBe(72);
    expect(r.lines.u3).toBe(6);
    expect(r.monthly).toBeCloseTo(4_000 + r.social, 2);
    expect(r.surchargePct).toBeGreaterThan(20);
    expect(r.surchargePct).toBeLessThan(25);
    expect(r.yearly).toBeCloseTo(r.monthly * 12, 2);
  });

  it('agrees with the payroll engine for the four insurances', () => {
    const p = estimatePayroll({ grossMonthly: 5_000, taxClass: 1, state: 'BE', church: false, children: 0, age: 30, lowWageRules: true });
    const r = E.calculateEmployerCost({ ...E.DEFAULT_EMPLOYER_COST, grossMonthly: 5_000 });
    expect(r.lines.pension + r.lines.unemployment + r.lines.health + r.lines.care).toBeCloseTo(p.employer!.total, 2);
  });

  it('caps at the contribution ceilings and uses the Saxony care rate', () => {
    const r = E.calculateEmployerCost({ ...E.DEFAULT_EMPLOYER_COST, grossMonthly: 10_000, saxony: true });
    expect(r.lines.pension).toBe(785.85);
    expect(r.lines.care).toBe(75.56);
  });

  it('adds one-off costs, hires and the vacancy cost', () => {
    const r = E.calculateEmployerCost({ ...E.DEFAULT_EMPLOYER_COST, recognition: 200, relocation: 1_000, housingMonthly: 300, housingMonths: 3, agencyFee: 0, hires: 2, vacancyDailyLoss: 400, vacancyDays: 60 });
    expect(r.oneOff.total).toBe(75 + 411 + 200 + 1_000 + 900);
    expect(r.firstYear).toBeCloseTo((r.yearly + r.oneOff.total) * 2, 2);
    expect(r.vacancy).toBe(48_000);
    expect(r.vacancyMonths).toBeGreaterThan(0);
    expect(E.calculateEmployerCost({ ...E.DEFAULT_EMPLOYER_COST, grossMonthly: 1_500 }).lowWage).toBe('midijob');
  });
});
