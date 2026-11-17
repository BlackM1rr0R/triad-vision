import { describe, expect, it } from 'vitest';
import { SITE_LOCALES } from '@/lib/siteLocale';
import { DOOR_ORDER, adventState, berlinDay, isOpenable, withAnswer, withOpened } from './calendar';
import { adventPromoActive, changes2027PromoActive } from '@/lib/seasonal';
import { DOORS, QUIZ_DAYS } from './doors';
import { readyActivity } from '@/lib/readyProgress/activities';

describe('advent calendar dates', () => {
  it('uses the Berlin calendar day (Baku is 3 hours ahead in winter)', () => {
    // 23:30 UTC on 30 Nov = 00:30 Berlin on 1 Dec = 03:30 Baku
    expect(berlinDay(new Date('2026-11-30T23:30:00Z'))).toBe('2026-12-01');
    expect(berlinDay(new Date('2026-11-30T22:59:00Z'))).toBe('2026-11-30');
  });

  it('counts down before 1 December, opens one door a day, then all', () => {
    expect(adventState('2026-11-17')).toMatchObject({ phase: 'before', unlocked: 0, daysToStart: 14, season: 2026 });
    expect(adventState('2026-12-01')).toMatchObject({ phase: 'advent', unlocked: 1 });
    expect(adventState('2026-12-24')).toMatchObject({ phase: 'advent', unlocked: 24 });
    expect(adventState('2026-12-25')).toMatchObject({ phase: 'after', unlocked: 24, season: 2026 });
    expect(adventState('2027-01-06')).toMatchObject({ phase: 'after', season: 2026 });
    expect(adventState('2027-02-01')).toMatchObject({ phase: 'before', season: 2027 });
    const s = adventState('2026-12-06');
    expect(isOpenable(6, s)).toBe(true);
    expect(isOpenable(7, s)).toBe(false);
    expect(isOpenable(24, adventState('2026-11-20'), true)).toBe(true);
  });

  it('promotes the calendar only 15 November – 6 January', () => {
    expect(adventPromoActive('2026-11-14')).toBe(false);
    expect(adventPromoActive('2026-11-15')).toBe(true);
    expect(adventPromoActive('2027-01-06')).toBe(true);
    expect(adventPromoActive('2027-01-07')).toBe(false);
    expect(changes2027PromoActive('2026-11-17')).toBe(true);
    expect(changes2027PromoActive('2027-04-01')).toBe(false);
  });

  it('keeps the first quiz answer', () => {
    const p = withAnswer(withOpened({ opened: [], quiz: {} }, 4), 4, 1);
    expect(withAnswer(p, 4, 2).quiz[4]).toBe(1);
    expect(withOpened(p, 4).opened).toEqual([4]);
  });
});

describe('advent doors', () => {
  it('has 24 doors, each day once, in the scattered order too', () => {
    expect(DOORS.map((d) => d.day)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    expect([...DOOR_ORDER].sort((a, b) => a - b)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
  });

  it('has every text in all six languages and valid quizzes', () => {
    for (const d of DOORS) {
      for (const l of SITE_LOCALES) {
        expect(d.title[l]?.length, `${d.day} title ${l}`).toBeGreaterThan(2);
        expect(d.text[l]?.length, `${d.day} text ${l}`).toBeGreaterThan(20);
        if (d.quiz) {
          expect(d.quiz.q[l]?.length, `${d.day} q ${l}`).toBeGreaterThan(5);
          for (const o of d.quiz.options) expect(o[l]?.length, `${d.day} option ${l}`).toBeGreaterThan(0);
        }
        if (d.phrase && l !== 'de') expect(d.phrase.tx[l]?.length, `${d.day} phrase ${l}`).toBeGreaterThan(3);
      }
      if (d.kind === 'quiz') expect(d.quiz && d.quiz.answer >= 0 && d.quiz.answer < 3, String(d.day)).toBe(true);
      if (d.kind === 'phrase') expect(d.phrase?.de.length, String(d.day)).toBeGreaterThan(5);
      if (d.source) expect(d.source.url).toMatch(/^https:\/\//);
    }
  });

  it('has enough quizzes for the Germany Ready activity', () => {
    const a = readyActivity('advent-calendar');
    expect(a).toBeTruthy();
    expect(QUIZ_DAYS.length).toBeGreaterThanOrEqual(a!.requiredItems ?? 1);
    // answers are spread over the three positions
    expect(new Set(DOORS.filter((d) => d.quiz).map((d) => d.quiz!.answer)).size).toBe(3);
  });
});
