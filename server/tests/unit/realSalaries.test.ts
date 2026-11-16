import { describe, expect, it } from 'vitest';
import { buildSalaryTable, groupStat, monthlyOf, round50, sampleBand, staffGroups, type SalaryRecord } from '../../src/lib/realSalaries/aggregate.js';

let seq = 0;
const rec = (over: Partial<SalaryRecord> = {}): SalaryRecord => ({
  caseId: `c${seq++}`,
  workerId: `w${seq}`,
  profession: 'truck_driver',
  city: 'Hamburg',
  state: 'HH',
  grossMonthly: 3000,
  grossYearly: null,
  weeklyHours: 40,
  contractType: 'UNLIMITED',
  at: new Date('2026-06-01'),
  excluded: false,
  ...over,
});

describe('real salaries: rounding and bands', () => {
  it('rounds to 50 € and bands the sample size', () => {
    expect(round50(3024)).toBe(3000);
    expect(round50(3025)).toBe(3050);
    expect(sampleBand(2)).toBeNull();
    expect(sampleBand(3)).toBe('3-5');
    expect(sampleBand(5)).toBe('3-5');
    expect(sampleBand(6)).toBe('6-9');
    expect(sampleBand(10)).toBe('10+');
  });
});

describe('real salaries: k-anonymity and dominance', () => {
  it('hides groups with fewer than 3 workers', () => {
    expect(groupStat([2800, 3200])).toEqual({ suppressed: 'TOO_FEW' });
  });

  it('publishes 3 distinct values as rounded P25 / median / P75', () => {
    const r = groupStat([2810, 3020, 3390]);
    expect(r).toEqual({ stat: { p25: 2900, median: 3000, p75: 3200, band: '3-5' } });
  });

  it('hides a group when one value is held by more than half of the workers', () => {
    expect(groupStat([3000, 3000, 3400])).toEqual({ suppressed: 'DOMINANT_VALUE' });
    expect(groupStat([3000, 3010, 2990, 3600])).toEqual({ suppressed: 'DOMINANT_VALUE' });
  });

  it('hides a group whose range collapses to one amount', () => {
    expect(groupStat([2990, 3000, 3010, 3020])).toMatchObject({ suppressed: expect.any(String) });
    expect('stat' in groupStat([2990, 3000, 3060, 3110])).toBe(true);
  });

  it('counts a worker once (latest contract) even with several contracts', () => {
    const t = buildSalaryTable([
      rec({ workerId: 'a', grossMonthly: 2800, at: new Date('2025-01-01') }),
      rec({ workerId: 'a', grossMonthly: 3100, at: new Date('2026-01-01') }),
      rec({ workerId: 'b', grossMonthly: 3500 }),
    ]);
    expect(t.groups).toEqual([]);
    expect(t.hiddenGroups).toBe(2);
    expect(staffGroups([rec({ workerId: 'a' }), rec({ workerId: 'a' }), rec({ workerId: 'b' })]).groups[0]!.workers).toBe(2);
  });

  it('builds city and nationwide groups and never exposes single values or counts', () => {
    const t = buildSalaryTable([
      rec({ workerId: 'a', grossMonthly: 2800 }),
      rec({ workerId: 'b', grossMonthly: 3100 }),
      rec({ workerId: 'c', grossMonthly: 3400 }),
      rec({ workerId: 'd', grossMonthly: 3900, city: 'Berlin', state: 'BE' }),
    ]);
    expect(t.groups.map((g) => [g.profession, g.city])).toEqual([
      ['truck_driver', null],
      ['truck_driver', 'Hamburg'],
    ]);
    expect(t.groups[1]).toEqual({ profession: 'truck_driver', city: 'Hamburg', state: 'HH', p25: 2950, median: 3100, p75: 3250, band: '3-5' });
    expect(t.hiddenGroups).toBe(1); // Berlin with one worker
    expect(t.workersBand).toBe('3-5');
    expect(JSON.stringify(t)).not.toContain('3900');
  });

  it('is empty without data', () => {
    expect(buildSalaryTable([])).toEqual({ groups: [], professionsCollecting: [], hiddenGroups: 0, workersBand: null });
  });
});

describe('real salaries: which records count', () => {
  it('skips excluded, Ausbildung, part-time, implausible and unrecognised records', () => {
    expect(monthlyOf(rec({ excluded: true }))).toEqual({ skip: 'EXCLUDED' });
    expect(monthlyOf(rec({ contractType: 'AUSBILDUNG' }))).toEqual({ skip: 'AUSBILDUNG' });
    expect(monthlyOf(rec({ weeklyHours: 20 }))).toEqual({ skip: 'PART_TIME' });
    expect(monthlyOf(rec({ grossMonthly: 36000 }))).toEqual({ skip: 'IMPLAUSIBLE' });
    expect(monthlyOf(rec({ grossMonthly: null }))).toEqual({ skip: 'NO_AMOUNT' });
    expect(monthlyOf(rec({ profession: null }))).toEqual({ skip: 'NO_PROFESSION' });
  });

  it('uses a twelfth of the yearly amount when the monthly one is missing', () => {
    expect(monthlyOf(rec({ grossMonthly: null, grossYearly: 42000 }))).toEqual({ gross: 3500 });
  });

  it('leaves excluded records out of the published groups', () => {
    const base = [rec({ workerId: 'a', grossMonthly: 2800 }), rec({ workerId: 'b', grossMonthly: 3100 }), rec({ workerId: 'c', grossMonthly: 3400 })];
    expect(buildSalaryTable(base).groups).toHaveLength(2);
    expect(buildSalaryTable([...base.slice(0, 2), { ...base[2]!, excluded: true }]).groups).toHaveLength(0);
  });
});
