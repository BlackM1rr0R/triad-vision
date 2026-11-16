import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { estimatePayroll, tariff } from '../../src/lib/budget/payroll.js';

/*
 * Public calculators of client/src/lib/publicCalc (they ship with the pages; loaded like the other client libs in
 * these tests): public holidays + bridge days, grade conversion (modified Bavarian formula), shift supplements
 * (§3b EStG), tax refund estimate and the fair-rent check.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const load = async <T>(file: string) => (await import(/* @vite-ignore */ pathToFileURL(path.resolve(here, '../../../client/src/lib/publicCalc', file)).href)) as T;

type State = 'BW' | 'BY' | 'BE' | 'BB' | 'HB' | 'HH' | 'HE' | 'MV' | 'NI' | 'NW' | 'RP' | 'SL' | 'SN' | 'ST' | 'SH' | 'TH';
interface Holiday { date: string; key: string; partial: boolean }
interface Bridge { start: string; end: string; vacationDays: number; daysOff: number; vacationDates: string[]; holidays: string[] }
const H = await load<{
  easterSunday: (y: number) => string;
  repentanceDay: (y: number) => string;
  holidaysFor: (s: State, y: number) => Holiday[];
  bridgeDays: (s: State, y: number, max?: number) => Bridge[];
  holidaysIcs: (e: { date: string; summary: string; uid: string }[], name: string, stamp: string) => string;
  weekday: (iso: string) => number;
  HOLIDAY_STATES: readonly State[];
}>('holidays.ts');

const G = await load<{
  convertGrade: (nd: number, max: number, min: number) => { raw: number; german: number | null; band: string; passed: boolean } | null;
  averageOf: (g: number[]) => number | null;
  GRADE_SYSTEMS: Record<string, { max: number; min: number }>;
}>('grades.ts');

type Kind = 'night' | 'nightCore' | 'sunday' | 'holiday' | 'special';
interface ShiftInput { hourly: number; monthlyHours: number; hours: Record<Kind, number>; rates: Record<Kind, number>; taxClass: 1; state: State; church: boolean; childless: boolean }
const S = await load<{
  calculateShift: (i: ShiftInput) => { base: number; gross: number; supplements: number; taxFree: number; socialFree: number; net: number; netFullyTaxed: number; advantage: number; lines: { kind: Kind; amount: number; taxFree: number; socialFree: number }[] };
  DEFAULT_SHIFT: ShiftInput;
  PRESETS: Record<string, Partial<ShiftInput>>;
}>('shiftPay.ts');

interface TaxInput { grossMonthly: number; months: number; taxClass: 1 | 3 | 4 | 5; state: State; church: boolean; partnerGrossYear: number; commuteKm: number; commuteDays: number; car: boolean; homeOfficeDays: number; equipment: number; unionFees: number; secondHomeRent: number; secondHomeMonths: number; homeTripKm: number; homeTrips: number; movingCosts: number; foreignIncome: number }
const T = await load<{
  estimateTaxRefund: (i: TaxInput) => { refund: number; taxableIncome: number; withheld: { incomeTax: number; total: number }; due: { incomeTax: number; total: number }; werbungskosten: { commute: number; homeOffice: number; secondHome: number; total: number; deducted: number; pauschbetragWins: boolean; commuteCapped: boolean }; progression: boolean };
  DEFAULT_TAX_REFUND: TaxInput;
}>('taxRefund.ts');

type Range = readonly [number, number];
const R = await load<{
  checkRent: (c: { flat1Cold: Range; flat2Cold: Range; flat1Util: Range; flat2Util: Range }, i: { sizeM2: number; cold: number; warm: number; condition: 'newBuild' | 'modernised' | 'standard' | 'basic' }) => { coldPerM2: number; expectedPerM2: Range; verdict: string; utilitiesVerdict: string | null; bremseException: boolean } | null;
  perM2Range: (c: { flat1Cold: Range; flat2Cold: Range; flat1Util: Range; flat2Util: Range }, m2: number) => Range;
}>('rentCheck.ts');

const dates = (s: State, y: number, partial = false) => H.holidaysFor(s, y).filter((h) => h.partial === partial).map((h) => `${h.date} ${h.key}`);

describe('public holidays', () => {
  it('computes Easter Sunday for known years', () => {
    expect(H.easterSunday(2024)).toBe('2024-03-31');
    expect(H.easterSunday(2025)).toBe('2025-04-20');
    expect(H.easterSunday(2026)).toBe('2026-04-05');
    expect(H.easterSunday(2027)).toBe('2027-03-28');
    expect(H.easterSunday(2028)).toBe('2028-04-16');
    expect(H.easterSunday(2038)).toBe('2038-04-25');
  });

  it('puts Buß- und Bettag on the Wednesday before 23 November', () => {
    expect(H.repentanceDay(2025)).toBe('2025-11-19');
    expect(H.repentanceDay(2026)).toBe('2026-11-18');
    expect(H.repentanceDay(2027)).toBe('2027-11-17');
    expect(H.repentanceDay(2028)).toBe('2028-11-22');
    for (const y of [2026, 2027, 2028]) expect(H.weekday(H.repentanceDay(y))).toBe(3);
  });

  it('matches the published list for Bavaria 2026 (with the regional days flagged)', () => {
    expect(dates('BY', 2026)).toEqual([
      '2026-01-01 newYear',
      '2026-01-06 epiphany',
      '2026-04-03 goodFriday',
      '2026-04-06 easterMonday',
      '2026-05-01 labourDay',
      '2026-05-14 ascension',
      '2026-05-25 whitMonday',
      '2026-06-04 corpusChristi',
      '2026-10-03 germanUnity',
      '2026-11-01 allSaints',
      '2026-12-25 christmas',
      '2026-12-26 boxingDay',
    ]);
    expect(dates('BY', 2026, true)).toEqual(['2026-08-08 peaceFestival', '2026-08-15 assumption']);
  });

  it('has the state-specific days', () => {
    expect(dates('BE', 2027)).toContain('2027-03-08 womensDay');
    expect(dates('MV', 2027)).toContain('2027-03-08 womensDay');
    expect(dates('MV', 2027)).toContain('2027-10-31 reformation');
    expect(dates('TH', 2028)).toContain('2028-09-20 childrensDay');
    expect(dates('TH', 2028, true)).toEqual(['2028-06-15 corpusChristi']);
    expect(dates('SN', 2028)).toContain('2028-11-22 repentance');
    expect(dates('SL', 2027)).toContain('2027-08-15 assumption');
    expect(dates('BB', 2028)).toEqual(expect.arrayContaining(['2028-04-16 easterSunday', '2028-06-04 whitSunday']));
    expect(dates('NW', 2027)).toEqual(expect.arrayContaining(['2027-05-27 corpusChristi', '2027-11-01 allSaints']));
    expect(dates('HH', 2026)).toHaveLength(10);
    expect(dates('BE', 2026)).toHaveLength(10);
    expect(dates('BB', 2026)).toHaveLength(12);
    // Nine nationwide holidays plus at least one state holiday everywhere (10 – 14).
    for (const s of H.HOLIDAY_STATES) for (const y of [2026, 2027, 2028]) expect(dates(s, y).length).toBeGreaterThanOrEqual(10);
  });

  it('finds bridge days (Ascension Thursday + Friday = 4 days off for 1 vacation day)', () => {
    const list = H.bridgeDays('BE', 2026);
    const asc = list.find((b) => b.start === '2026-05-14' && b.end === '2026-05-17');
    expect(asc).toMatchObject({ vacationDays: 1, daysOff: 4, vacationDates: ['2026-05-15'] });
    for (const b of list) {
      expect(b.vacationDays).toBeGreaterThanOrEqual(1);
      expect(b.vacationDays).toBeLessThanOrEqual(4);
      expect(b.daysOff / b.vacationDays).toBeGreaterThanOrEqual(2);
      for (const d of b.vacationDates) expect([0, 6]).not.toContain(H.weekday(d));
    }
    // Easter: 4 vacation days around Good Friday / Easter Monday give at least 9 days off.
    expect(list.some((b) => b.holidays.includes('goodFriday') && b.vacationDays === 4 && b.daysOff >= 9)).toBe(true);
  });

  it('writes a valid all-day iCalendar file', () => {
    const ics = H.holidaysIcs([{ date: '2026-12-25', summary: 'Christmas, 1st day', uid: 'x@tv' }], 'Holidays BE', '20261116T000000Z');
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261225\r\nDTEND;VALUE=DATE:20261226');
    expect(ics).toContain('SUMMARY:Christmas\\, 1st day');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });
});

describe('grade converter (modified Bavarian formula)', () => {
  const { azSchool, azUniversity } = G.GRADE_SYSTEMS;
  it('converts the Azerbaijani school scale (5 best, 3 pass)', () => {
    expect(G.convertGrade(5, azSchool.max, azSchool.min)?.german).toBe(1);
    expect(G.convertGrade(3, azSchool.max, azSchool.min)?.german).toBe(4);
    expect(G.convertGrade(4, azSchool.max, azSchool.min)?.german).toBe(2.5);
    expect(G.convertGrade(4.5, azSchool.max, azSchool.min)).toMatchObject({ german: 1.7, band: 'good' });
    expect(G.convertGrade(2, azSchool.max, azSchool.min)).toMatchObject({ german: null, passed: false, band: 'fail' });
  });
  it('converts the university 100-point scale (51 pass) and cuts to one decimal', () => {
    expect(G.convertGrade(100, azUniversity.max, azUniversity.min)?.german).toBe(1);
    expect(G.convertGrade(51, azUniversity.max, azUniversity.min)?.german).toBe(4);
    const r = G.convertGrade(75, azUniversity.max, azUniversity.min)!;
    expect(r.raw).toBeCloseTo(2.5306, 4);
    expect(r.german).toBe(2.5);
    expect(G.convertGrade(91, azUniversity.max, azUniversity.min)).toMatchObject({ german: 1.5, band: 'veryGood' });
  });
  it('handles "lower is better" scales and invalid input', () => {
    expect(G.convertGrade(1, 1, 4)?.german).toBe(1);
    expect(G.convertGrade(5, 1, 4)?.passed).toBe(false);
    expect(G.convertGrade(3, 5, 5)).toBeNull();
    expect(G.averageOf([5, 4, NaN, 4])).toBeCloseTo(13 / 3);
    expect(G.averageOf([])).toBeNull();
  });
});

describe('shift supplements (§3b EStG)', () => {
  const base: ShiftInput = { ...S.DEFAULT_SHIFT, hourly: 20, monthlyHours: 160, hours: { night: 10, nightCore: 0, sunday: 8, holiday: 0, special: 0 }, rates: { night: 0.3, nightCore: 0.4, sunday: 0.5, holiday: 1.25, special: 1.5 } };
  it('caps the tax-free part at the legal rate', () => {
    const r = S.calculateShift(base);
    const night = r.lines.find((l) => l.kind === 'night')!;
    expect(night.amount).toBe(60); // 20 € × 30 % × 10 h
    expect(night.taxFree).toBe(50); // only 25 % tax-free
    expect(r.base).toBe(3200);
    expect(r.gross).toBe(3200 + 60 + 80);
    expect(r.advantage).toBeGreaterThan(0);
    expect(r.net).toBeGreaterThan(r.netFullyTaxed);
  });
  it('caps the base at 50 € (tax) and 25 € (social insurance)', () => {
    const r = S.calculateShift({ ...base, hourly: 60, hours: { ...base.hours, night: 10 }, rates: { ...base.rates, night: 0.25 } });
    const night = r.lines.find((l) => l.kind === 'night')!;
    expect(night.amount).toBe(150);
    expect(night.taxFree).toBe(125);
    expect(night.socialFree).toBe(62.5);
  });
  it('without supplements the net equals the payroll engine', () => {
    const r = S.calculateShift({ ...base, hours: { night: 0, nightCore: 0, sunday: 0, holiday: 0, special: 0 } });
    expect(r.net).toBeCloseTo(estimatePayroll({ grossMonthly: 3200, taxClass: 1, state: base.state, church: false, children: 0, age: 30, lowWageRules: true }).net, 2);
    expect(r.advantage).toBe(0);
  });
  it('has the three presets', () => expect(Object.keys(S.PRESETS).sort()).toEqual(['cook', 'driver', 'nurse']));
});

describe('tax refund estimate', () => {
  const plain: TaxInput = { ...T.DEFAULT_TAX_REFUND, months: 12, commuteKm: 0, commuteDays: 0, equipment: 0, foreignIncome: 0 };
  it('a full year with only the flat allowances is close to zero', () => {
    const r = T.estimateTaxRefund(plain);
    expect(Math.abs(r.refund)).toBeLessThan(150);
    expect(r.werbungskosten.pauschbetragWins).toBe(true);
  });
  it('starting mid-year gives a refund (full Grundfreibetrag, withholding as if all year)', () => {
    const r = T.estimateTaxRefund({ ...plain, months: 6 });
    expect(r.refund).toBeGreaterThan(500);
    expect(r.due.incomeTax).toBe(tariff(r.taxableIncome));
  });
  it('Werbungskosten above 1,230 € raise the refund; commute 0.38 €/km from km 1, homeoffice 6 €/day max 210', () => {
    const r = T.estimateTaxRefund({ ...plain, commuteKm: 20.7, commuteDays: 200, homeOfficeDays: 250 });
    expect(r.werbungskosten.commute).toBe(1520); // 20 km × 0.38 × 200
    expect(r.werbungskosten.homeOffice).toBe(1260);
    expect(r.werbungskosten.deducted).toBe(2780);
    expect(r.refund).toBeGreaterThan(T.estimateTaxRefund(plain).refund + 300);
  });
  it('caps the commute at 4,500 € without a car and the second flat at 1,000 €/month', () => {
    const far = T.estimateTaxRefund({ ...plain, commuteKm: 100, commuteDays: 220 });
    expect(far.werbungskosten.commute).toBe(4500);
    expect(far.werbungskosten.commuteCapped).toBe(true);
    expect(T.estimateTaxRefund({ ...plain, commuteKm: 100, commuteDays: 220, car: true }).werbungskosten.commute).toBe(8360);
    expect(T.estimateTaxRefund({ ...plain, secondHomeRent: 1400, secondHomeMonths: 6 }).werbungskosten.secondHome).toBe(6000);
  });
  it('foreign income of the same year lowers the refund (Progressionsvorbehalt)', () => {
    const a = T.estimateTaxRefund({ ...plain, months: 6 });
    const b = T.estimateTaxRefund({ ...plain, months: 6, foreignIncome: 15_000 });
    expect(b.progression).toBe(true);
    expect(b.refund).toBeLessThan(a.refund);
  });
  it('married couples are assessed jointly (splitting)', () => {
    const r = T.estimateTaxRefund({ ...plain, taxClass: 3, partnerGrossYear: 12_000 });
    expect(r.due.incomeTax).toBe(2 * tariff(Math.floor(r.taxableIncome / 2)));
  });
});

describe('fair rent check', () => {
  const berlin = { flat1Cold: [590, 810] as Range, flat2Cold: [770, 1050] as Range, flat1Util: [100, 130] as Range, flat2Util: [150, 200] as Range };
  it('uses the 1-room rate for small flats and the 2-room rate for 55 m²', () => {
    expect(R.perM2Range(berlin, 30)[0]).toBeCloseTo(590 / 35);
    expect(R.perM2Range(berlin, 55)[1]).toBeCloseTo(1050 / 55);
    expect(R.perM2Range(berlin, 90)[1]).toBeCloseTo((1050 / 55) * 0.95);
  });
  it('rates cheap / normal / expensive and the utilities', () => {
    expect(R.checkRent(berlin, { sizeM2: 55, cold: 700, warm: 0, condition: 'standard' })?.verdict).toBe('cheap');
    expect(R.checkRent(berlin, { sizeM2: 55, cold: 900, warm: 1080, condition: 'standard' })).toMatchObject({ verdict: 'normal', utilitiesVerdict: 'normal' });
    expect(R.checkRent(berlin, { sizeM2: 55, cold: 1120, warm: 0, condition: 'standard' })?.verdict).toBe('expensive');
    expect(R.checkRent(berlin, { sizeM2: 55, cold: 1400, warm: 0, condition: 'standard' })?.verdict).toBe('veryExpensive');
    expect(R.checkRent(berlin, { sizeM2: 55, cold: 1120, warm: 0, condition: 'newBuild' })).toMatchObject({ verdict: 'normal', bremseException: true });
    expect(R.checkRent(berlin, { sizeM2: 0, cold: 500, warm: 0, condition: 'standard' })).toBeNull();
  });
});
