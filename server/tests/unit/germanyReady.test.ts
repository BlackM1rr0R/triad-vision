import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { READY_ACTIVITIES } from '../../src/lib/readyProgress/activities.js';
import {
  CHALLENGES,
  CHALLENGE_KEYS,
  LEVELS,
  MAX_POINTS,
  VOCAB_GOAL,
  certificateLevel,
  challengeForWeek,
  challengeOrder,
  cleanResult,
  evaluateChallenge,
  isoWeek,
  practiceBand,
  readinessBand,
  sceneForProfession,
  summarize,
  type StoredResult,
} from '../../src/lib/readyProgress/logic.js';
import { deliveryReason, parseDeliverOn } from '../../src/lib/futureLetter/rules.js';
import { open, seal } from '../../src/lib/secretBox.js';

/** "Germany Ready" points model, sync validation, weekly challenge; letter to my future self (dates, sealing). */

const NOW = new Date('2026-11-18T10:00:00Z'); // Wednesday, ISO week 2026-W47
const facts0 = { wordsLearned: 0, readinessScore: 0 };
const r = (activityId: string, percent: number, item = '', at = NOW, score = percent, max = 100): StoredResult => ({ activityId, item, score, max, percent, completedAt: at });

describe('registry', () => {
  it('server copy equals the canonical client registry (ids, points, limits)', async () => {
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src/lib/readyProgress/activities.ts');
    const client = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as { READY_ACTIVITIES: unknown };
    expect(JSON.parse(JSON.stringify(client.READY_ACTIVITIES))).toEqual(JSON.parse(JSON.stringify(READY_ACTIVITIES)));
  });

  it('ids are unique kebab-case; every challenge points at registered activities', () => {
    const ids = READY_ACTIVITIES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{2,40}$/);
    for (const c of CHALLENGES) for (const a of c.activityIds) expect(ids, c.key).toContain(a);
    expect(MAX_POINTS).toBe(READY_ACTIVITIES.reduce((s, a) => s + a.points, 0));
    expect(LEVELS[LEVELS.length - 1].points).toBeLessThanOrEqual(MAX_POINTS);
  });
});

describe('cleanResult (sync validation)', () => {
  it('accepts a known activity and clamps score / max to the registry', () => {
    expect(cleanResult({ activityId: 'traffic-signs', score: 27, max: 30 }, NOW)).toMatchObject({ activityId: 'traffic-signs', item: '', score: 27, max: 30, percent: 90 });
    expect(cleanResult({ activityId: 'traffic-signs', score: 500, max: 30 }, NOW)).toMatchObject({ score: 30, percent: 100 });
    expect(cleanResult({ activityId: 'traffic-signs', score: -4, max: 30 }, NOW)).toMatchObject({ score: 0, percent: 0 });
    expect(cleanResult({ activityId: 'traffic-signs', score: 5000, max: 99999 }, NOW)).toMatchObject({ max: 100, score: 100 });
  });

  it('refuses unknown / server activities, bad items and bad numbers', () => {
    expect(cleanResult({ activityId: 'nope', score: 1, max: 1 }, NOW)).toBe('UNKNOWN_ACTIVITY');
    expect(cleanResult({ activityId: 'vocabulary', score: 1, max: 1 }, NOW)).toBe('SERVER_ACTIVITY');
    expect(cleanResult({ activityId: 'german-simulator', item: 'casino', score: 1, max: 1 }, NOW)).toBe('BAD_ITEM');
    expect(cleanResult({ activityId: 'german-simulator', score: 1, max: 1 }, NOW)).toBe('BAD_ITEM');
    expect(cleanResult({ activityId: 'price-game', item: 'x', score: 1, max: 1 }, NOW)).toBe('BAD_ITEM');
    expect(cleanResult({ activityId: 'pronunciation', item: 'p bad id!', score: 1, max: 1 }, NOW)).toBe('BAD_ITEM');
    expect(cleanResult({ activityId: 'pronunciation', item: 'p-a1-greet-3', score: 1, max: 1 }, NOW)).toMatchObject({ item: 'p-a1-greet-3' });
    expect(cleanResult({ activityId: 'price-game', score: 1, max: 0 }, NOW)).toBe('BAD_SCORE');
    expect(cleanResult({ activityId: 'price-game', score: Number.NaN, max: 10 }, NOW)).toBe('BAD_SCORE');
  });

  it('completedAt: whole seconds (idempotent resend), never in the future, at most a year old', () => {
    const a = cleanResult({ activityId: 'price-game', score: 1, max: 10, completedAt: '2026-11-18T09:59:58.734Z' }, NOW);
    expect(a).toMatchObject({ completedAt: new Date('2026-11-18T09:59:58.000Z') });
    expect(cleanResult({ activityId: 'price-game', score: 1, max: 10, completedAt: '2030-01-01T00:00:00Z' }, NOW)).toMatchObject({ completedAt: NOW });
    expect(cleanResult({ activityId: 'price-game', score: 1, max: 10, completedAt: '2024-01-01T00:00:00Z' }, NOW)).toBe('BAD_COMPLETED_AT');
    expect(cleanResult({ activityId: 'price-game', score: 1, max: 10, completedAt: 'yesterday' }, NOW)).toBe('BAD_COMPLETED_AT');
  });
});

describe('points and certificate thresholds', () => {
  it('nothing done → 0 points, no level, suggestions offered', () => {
    const s = summarize([], facts0);
    expect(s.points).toBe(0);
    expect(s.level).toBeNull();
    expect(s.next).toMatchObject({ level: 'BRONZE' });
    expect(s.suggestions).toHaveLength(3);
  });

  it('single activities: proportional below the pass mark, full points at it', () => {
    const half = summarize([r('traffic-signs', 45)], facts0).activities.find((a) => a.id === 'traffic-signs')!;
    expect(half).toMatchObject({ done: false, earned: 5, best: 45 });
    const full = summarize([r('traffic-signs', 45), r('traffic-signs', 93)], facts0).activities.find((a) => a.id === 'traffic-signs')!;
    expect(full).toMatchObject({ done: true, earned: 10, best: 93, attempts: 2 });
  });

  it('item activities need distinct passed items; repeats of one item do not count twice', () => {
    const rows = [r('german-simulator', 90, 'bank'), r('german-simulator', 95, 'bank'), r('german-simulator', 75, 'doctor')];
    const a = summarize(rows, facts0).activities.find((x) => x.id === 'german-simulator')!;
    expect(a).toMatchObject({ itemsPassed: 2, itemsRequired: 3, done: false, earned: 10 });
    const b = summarize([...rows, r('german-simulator', 70, 'anmeldung')], facts0).activities.find((x) => x.id === 'german-simulator')!;
    expect(b).toMatchObject({ itemsPassed: 3, done: true, earned: 15 });
  });

  it('server activities: vocabulary words and the readiness score', () => {
    const s = summarize([], { wordsLearned: VOCAB_GOAL, readinessScore: 30 });
    expect(s.activities.find((a) => a.id === 'vocabulary')).toMatchObject({ done: true, earned: 10 });
    expect(s.activities.find((a) => a.id === 'readiness')).toMatchObject({ done: false, earned: 5 });
  });

  it('levels need points AND completed activities', () => {
    expect(certificateLevel(59, 10)).toBeNull();
    expect(certificateLevel(60, 4)).toBeNull();
    expect(certificateLevel(60, 5)).toBe('BRONZE');
    expect(certificateLevel(90, 7)).toBe('BRONZE');
    expect(certificateLevel(90, 8)).toBe('SILVER');
    expect(certificateLevel(MAX_POINTS, 15)).toBe('GOLD');
  });

  it('a realistic run reaches bronze', () => {
    const rows = [
      r('traffic-signs', 93),
      r('waste-sorting', 80),
      r('price-game', 70, '', NOW, 700, 1000),
      r('work-scenes', 85, 'truck-cab'),
      r('mock-a1', 70, 'lesen'),
      r('mock-a1', 65, 'hoeren'),
      r('level-self', 50, '', NOW, 2, 4),
    ];
    const s = summarize(rows, { wordsLearned: 60, readinessScore: 70 });
    expect(s.done).toBeGreaterThanOrEqual(8);
    expect(s.points).toBeGreaterThanOrEqual(60);
    expect(s.level).toBe('BRONZE');
  });
});

describe('weekly challenge', () => {
  it('ISO weeks (incl. the year boundary)', () => {
    expect(isoWeek(NOW).key).toBe('2026-W47');
    expect(isoWeek(NOW).start.toISOString()).toBe('2026-11-16T00:00:00.000Z');
    expect(isoWeek(new Date('2027-01-01T12:00:00Z')).key).toBe('2026-W53');
    expect(isoWeek(new Date('2025-12-29T12:00:00Z')).key).toBe('2026-W01');
  });

  it('deterministic per week; consecutive weeks rotate through the pool; admin order overrides', () => {
    const a = challengeForWeek(NOW);
    expect(challengeForWeek(new Date('2026-11-22T23:00:00Z')).key).toBe(a.key); // same ISO week (Sunday)
    const keys = new Set(Array.from({ length: CHALLENGES.length }, (_, i) => challengeForWeek(new Date(NOW.getTime() + i * 7 * 86_400_000)).key));
    expect(keys.size).toBe(CHALLENGES.length);
    const order = challengeOrder(['VOCAB_20', 'VOCAB_20', 'nope']);
    expect(order[0]).toBe('VOCAB_20');
    expect(order).toHaveLength(CHALLENGE_KEYS.length);
    // With the same rotation index, a reordered pool gives the reordered key.
    const idx = CHALLENGE_KEYS.indexOf(a.key);
    const rotated = [...CHALLENGE_KEYS.slice(1), CHALLENGE_KEYS[0]];
    expect(challengeForWeek(NOW, rotated).key).toBe(rotated[idx]);
  });

  it('evaluates the week\'s results per kind', () => {
    const c = (k: string) => CHALLENGES.find((x) => x.key === k)!;
    expect(evaluateChallenge(c('TRAFFIC_30'), [r('traffic-signs', 60, '', NOW, 18, 30), r('traffic-signs', 50, '', NOW, 15, 30)])).toEqual({ value: 30, goal: 30, done: true });
    expect(evaluateChallenge(c('SIM_ANMELDUNG_80'), [r('german-simulator', 95, 'bank'), r('german-simulator', 79, 'anmeldung')])).toMatchObject({ done: false, value: 79 });
    expect(evaluateChallenge(c('MOCK_LESEN_60'), [r('mock-b1', 61, 'lesen')])).toMatchObject({ done: true });
    expect(evaluateChallenge(c('PRON_10'), Array.from({ length: 10 }, (_, i) => r('pronunciation', 75, `p-${i}`)))).toMatchObject({ done: true, value: 10 });
    expect(evaluateChallenge(c('VOCAB_20'), [], 19)).toMatchObject({ done: false, value: 19 });
    expect(evaluateChallenge(c('VOCAB_20'), [], 25)).toEqual({ value: 20, goal: 20, done: true });
  });
});

describe('employer bands and profession scene', () => {
  it('bands only, no exact values', () => {
    expect([0, 39, 40, 59, 60, 79, 80, 100].map(readinessBand)).toEqual(['0-39', '0-39', '40-59', '40-59', '60-79', '60-79', '80-100', '80-100']);
    expect([0, 1, 4, 5, 9, 10, 15].map(practiceBand)).toEqual(['0', '1-4', '1-4', '5-9', '5-9', '10+', '10+']);
  });
  it('maps free-text professions to the work scene', () => {
    expect(sceneForProfession('LKW-Fahrer')).toBe('truck-cab');
    expect(sceneForProfession('Pflegekraft')).toBe('hospital-ward');
    expect(sceneForProfession('Aşpaz')).toBe('restaurant-kitchen');
    expect(sceneForProfession('Elektriker')).toBe('electrical-panel');
    expect(sceneForProfession('Schweißer')).toBe('construction-site');
    expect(sceneForProfession('Buchhalter')).toBeNull();
    expect(sceneForProfession(null)).toBeNull();
  });
});

describe('letter to my future self', () => {
  it('fallback date: tomorrow … ~5 years, real calendar days only', () => {
    expect(parseDeliverOn(null, NOW)).toBeNull();
    expect(parseDeliverOn('2026-11-18', NOW)).toBe('INVALID'); // today
    expect(parseDeliverOn('2026-11-19', NOW)).toEqual(new Date('2026-11-19T00:00:00Z'));
    expect(parseDeliverOn('2027-02-30', NOW)).toBe('INVALID');
    expect(parseDeliverOn('2035-01-01', NOW)).toBe('INVALID');
    expect(parseDeliverOn('19.11.2026', NOW)).toBe('INVALID');
  });

  it('delivered once: on arrival or when the fallback day began', () => {
    const l = { deliveredAt: null, deliverOn: new Date('2026-12-01T00:00:00Z') };
    expect(deliveryReason(l, false, NOW)).toBeNull();
    expect(deliveryReason(l, true, NOW)).toBe('ARRIVAL');
    expect(deliveryReason(l, false, new Date('2026-12-01T00:00:01Z'))).toBe('DATE');
    expect(deliveryReason({ ...l, deliveredAt: NOW }, true, NOW)).toBeNull();
    expect(deliveryReason({ deliveredAt: null, deliverOn: null }, false, NOW)).toBeNull();
  });

  it('sealed at rest: the stored value does not contain the text and opens to it', () => {
    const text = 'Salam, gələcək mən! Bu gün Bakıdayam. 🇩🇪';
    const sealed = seal(text);
    expect(sealed).not.toContain('Salam');
    expect(open(sealed)).toBe(text);
  });
});
