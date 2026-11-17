import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FRESHNESS_CATEGORIES, FRESHNESS_ITEMS } from '../../src/lib/dataFreshness/registry.js';
import { addMonths, nextDue, reminderKinds, statusOf } from '../../src/lib/dataFreshness/schedule.js';
import {
  CURRENT_PARAMS,
  DEUTSCHLANDTICKET_STEPS,
  MINIMUM_WAGE_STEPS,
  deutschlandticketAt,
  minimumWageAt,
  stepValueAt,
} from '../../src/lib/budget/params.js';
import { BLUE_CARD, MINIMUM_WAGE, OLDER_WORKER } from '../../src/lib/ai/features/caseAi/config.js';
import { minimumWageOn } from '../../src/lib/officialForms/ezbWizard.js';
import { GLOSSARY_AS_OF } from '../../src/lib/glossary/types.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ISO = /^\d{4}-\d{2}-\d{2}$/;

describe('data freshness registry', () => {
  it('has unique ids, both labels, a source and a review date on every item', () => {
    expect(FRESHNESS_ITEMS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(FRESHNESS_ITEMS.map((i) => i.id)).size).toBe(FRESHNESS_ITEMS.length);
    for (const i of FRESHNESS_ITEMS) {
      expect(i.id, i.id).toMatch(/^[a-z0-9-]{2,80}$/);
      expect(FRESHNESS_CATEGORIES).toContain(i.category);
      expect(i.label.az.length, i.id).toBeGreaterThan(2);
      expect(i.label.en.length, i.id).toBeGreaterThan(2);
      expect(i.note.az && i.note.en, i.id).toBeTruthy();
      expect(i.value.length, i.id).toBeGreaterThan(0);
      expect(i.source.label.length, i.id).toBeGreaterThan(2);
      expect(i.source.url, i.id).toMatch(/^https:\/\/[^\s]+$/);
      expect(i.reviewBy, i.id).toMatch(ISO);
      expect(Number.isNaN(Date.parse(i.reviewBy)), i.id).toBe(false);
      expect(i.files.length, i.id).toBeGreaterThan(0);
      if (i.upcoming) expect(i.upcoming.from, i.id).toMatch(ISO);
    }
  });

  it('points at files that exist and still contain the registered figure', () => {
    for (const i of FRESHNESS_ITEMS) {
      for (const f of i.files) {
        const file = path.join(repo, f.path);
        expect(fs.existsSync(file), `${i.id}: ${f.path}`).toBe(true);
        if (f.needle) expect(fs.readFileSync(file, 'utf8').includes(f.needle), `${i.id}: "${f.needle}" in ${f.path}`).toBe(true);
      }
    }
  });

  it('agrees with the real constants', () => {
    const item = (id: string) => FRESHNESS_ITEMS.find((i) => i.id === id)!;
    // minimum wage: one dated table, the case-AI year table and the EzB wizard agree on every step
    for (const s of MINIMUM_WAGE_STEPS) {
      expect(MINIMUM_WAGE[s.from.slice(0, 4)]).toBe(s.value);
      expect(minimumWageOn(s.from)).toBe(s.value);
    }
    expect(item('minimum-wage').value).toContain(String(minimumWageAt()));
    expect(item('minimum-wage').upcoming!.from).toBe(MINIMUM_WAGE_STEPS.at(-1)!.from);
    expect(item('deutschlandticket').upcoming!.from).toBe(DEUTSCHLANDTICKET_STEPS.at(-1)!.from);
    expect(CURRENT_PARAMS.costs.deutschlandticket).toBe(deutschlandticketAt());
    expect(item('kindergeld').value).toContain(String(CURRENT_PARAMS.costs.kindergeld));
    expect(item('rundfunkbeitrag').value).toContain(String(CURRENT_PARAMS.costs.rundfunkMonthly));
    expect(item('income-tax-tariff').value).toContain(CURRENT_PARAMS.payroll.tax.gfb.toLocaleString('en-US'));
    expect(item('minijob-limit').value).toContain(String(CURRENT_PARAMS.payroll.minijobUpTo));
    expect(item('blue-card-thresholds').value).toContain(BLUE_CARD['2026'].standard.toLocaleString('en-US'));
    expect(item('blue-card-thresholds').value).toContain(OLDER_WORKER['2026'].toLocaleString('en-US'));
    expect(item('glossary').value).toContain(GLOSSARY_AS_OF);
  });

  it('switches dated figures on their start day', () => {
    expect(minimumWageAt('2026-12-31')).toBe(13.9);
    expect(minimumWageAt('2027-01-01')).toBe(14.6);
    expect(deutschlandticketAt(new Date('2026-12-31T12:00:00Z'))).toBe(63);
    expect(deutschlandticketAt('2027-01-01')).toBe(66.8);
    expect(stepValueAt(DEUTSCHLANDTICKET_STEPS, '2020-01-01')).toBe(63);
  });
});

describe('data freshness schedule', () => {
  const yearly = { reviewBy: '2027-01-01', cadence: 'yearly' as const };
  it('is due on reviewBy without a review', () => {
    expect(nextDue(yearly, null)).toBe('2027-01-01');
    expect(statusOf('2027-01-01', '2026-11-17')).toBe('ok');
    expect(statusOf('2027-01-01', '2026-12-02')).toBe('dueSoon');
    expect(statusOf('2027-01-01', '2027-01-01')).toBe('overdue');
    expect(statusOf(null, '2027-01-01')).toBe('done');
  });
  it('a review within 90 days before the due date settles it; earlier reviews do not', () => {
    expect(nextDue(yearly, '2026-11-17')).toBe('2028-01-01');
    expect(nextDue(yearly, '2026-09-01')).toBe('2027-01-01');
    expect(nextDue(yearly, '2027-02-10')).toBe('2028-01-01');
    expect(nextDue({ reviewBy: '2027-05-01', cadence: 'halfYearly' }, '2027-04-20')).toBe('2027-11-01');
    expect(nextDue({ reviewBy: '2027-05-01', cadence: 'once' }, '2027-04-20')).toBeNull();
    expect(nextDue({ reviewBy: '2027-05-01', cadence: 'once' }, '2026-11-17')).toBe('2027-05-01');
  });
  it('reminds 30 days before and from the due day', () => {
    expect(reminderKinds('2027-01-01', '2026-11-30')).toEqual([]);
    expect(reminderKinds('2027-01-01', '2026-12-02')).toEqual(['soon']);
    expect(reminderKinds('2027-01-01', '2027-01-03')).toEqual(['due']);
  });
  it('adds months with clamped days', () => {
    expect(addMonths('2027-08-31', 6)).toBe('2028-02-29');
    expect(addMonths('2027-01-01', -12)).toBe('2026-01-01');
  });
});
