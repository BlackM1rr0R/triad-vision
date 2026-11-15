import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Home "world" pieces (client/src/components/world): the German phrase of the day (picked by the day in Germany,
 * so the server render and the browser agree) and the Baku ↔ Berlin time difference (summer time from Intl).
 * The client modules are loaded by URL so the server type-check does not pull client sources in.
 */

interface Phrase {
  id: string;
  topic: string;
  de: string;
  deNote: string;
  az: string;
  ru: string;
  en: string;
  tr: string;
  uk: string;
  pron: { az: string; ru: string };
}
interface PhraseMod {
  PHRASES: Phrase[];
  PHRASE_TOPICS: readonly string[];
}
interface DayMod {
  berlinDay: (at: Date) => string;
  isDay: (s: unknown) => boolean;
  dayNumber: (day: string) => number;
  shiftDay: (day: string, delta: number) => string;
  strideFor: (n: number) => number;
  phraseIndex: (day: string, n?: number) => number;
  phraseForDay: (day: string) => Phrase;
  recentPhrases: (today: string, count: number) => { day: string; phrase: Phrase }[];
}
interface TimeMod {
  tzOffsetMinutes: (tz: string, at: Date) => number;
  zoneDifferenceMinutes: (at: Date, a?: string, b?: string) => number;
  formatDifference: (m: number) => string;
  berlinSummerTime: (at: Date) => boolean;
  clockTime: (tz: string, at: Date) => string;
  bothInOfficeHours: (at: Date) => boolean;
}
interface GlobeMod {
  toVec: (ll: [number, number]) => [number, number, number];
  phiFor: (lng: number) => number;
  project: (ll: [number, number], phi: number, theta: number, elevation?: number) => { x: number; y: number; z: number; front: boolean };
  HOME_VIEW: { phi: number; theta: number };
  BAKU: [number, number];
}

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src/components/world');
const load = async <T>(file: string) => (await import(/* @vite-ignore */ pathToFileURL(path.join(dir, file)).href)) as T;

let P: PhraseMod;
let D: DayMod;
let T: TimeMod;
let G: GlobeMod;
beforeAll(async () => {
  [P, D, T, G] = await Promise.all([load<PhraseMod>('phrases.ts'), load<DayMod>('dailyPhrase.ts'), load<TimeMod>('twinTime.ts'), load<GlobeMod>('globeMath.ts')]);
});

describe('phrase of the day: the curated list', () => {
  it('has at least 120 phrases with every translation and both pronunciations', () => {
    expect(P.PHRASES.length).toBeGreaterThanOrEqual(120);
    for (const p of P.PHRASES) {
      for (const k of ['id', 'de', 'deNote', 'az', 'ru', 'en', 'tr', 'uk'] as const) expect(p[k]?.trim(), `${p.id} ${k}`).toBeTruthy();
      expect(p.pron.az.trim(), `${p.id} pron.az`).toBeTruthy();
      expect(p.pron.ru.trim(), `${p.id} pron.ru`).toBeTruthy();
      expect(P.PHRASE_TOPICS, p.id).toContain(p.topic);
    }
  });

  it('has unique, URL-safe ids and no duplicate German phrase', () => {
    const ids = P.PHRASES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
    const de = P.PHRASES.map((p) => p.de.toLowerCase());
    expect(new Set(de).size).toBe(de.length);
  });

  it('writes the Russian / Ukrainian texts and pronunciations in Cyrillic and the Azerbaijani pronunciation in Latin letters', () => {
    for (const p of P.PHRASES) {
      expect(p.ru, p.id).toMatch(/[а-яё]/i);
      expect(p.uk, p.id).toMatch(/[а-яєіїґ]/i);
      expect(p.pron.ru, p.id).toMatch(/[а-яё]/i);
      expect(p.pron.ru, p.id).not.toMatch(/[a-z]/i);
      expect(p.pron.az, p.id).not.toMatch(/[а-яё]/i);
      // No Russian-only letters in Ukrainian, no Latin look-alikes mixed in.
      expect(p.uk, p.id).not.toMatch(/[ыэъё]/i);
    }
  });
});

describe('phrase of the day: selection by date', () => {
  it('uses the calendar day in Germany (Europe/Berlin), also around midnight and in summer time', () => {
    expect(D.berlinDay(new Date('2026-11-15T10:00:00Z'))).toBe('2026-11-15');
    // 23:30 UTC on 14 Nov = 00:30 on 15 Nov in Berlin (CET, UTC+1) — already the next day in Germany.
    expect(D.berlinDay(new Date('2026-11-14T23:30:00Z'))).toBe('2026-11-15');
    expect(D.berlinDay(new Date('2026-11-14T22:59:00Z'))).toBe('2026-11-14');
    // Summer (CEST, UTC+2): 22:30 UTC is 00:30 the next day.
    expect(D.berlinDay(new Date('2026-07-10T22:30:00Z'))).toBe('2026-07-11');
    expect(D.berlinDay(new Date('2026-07-10T21:30:00Z'))).toBe('2026-07-10');
  });

  it('is deterministic: the same day always gives the same phrase, whatever the time of day', () => {
    const a = D.phraseForDay(D.berlinDay(new Date('2026-11-15T00:05:00+01:00')));
    const b = D.phraseForDay(D.berlinDay(new Date('2026-11-15T23:55:00+01:00')));
    expect(a.id).toBe(b.id);
    expect(D.phraseForDay('2026-11-15').id).toBe(a.id);
    expect(D.phraseIndex('2026-11-15')).toBe(D.phraseIndex('2026-11-15'));
  });

  it('shows every phrase once before any repeats, and consecutive days differ', () => {
    const n = P.PHRASES.length;
    const seen = new Set<string>();
    let prev = '';
    for (let i = 0; i < n; i++) {
      const id = D.phraseForDay(D.shiftDay('2026-01-01', i)).id;
      expect(id).not.toBe(prev);
      prev = id;
      seen.add(id);
    }
    expect(seen.size).toBe(n);
    // The cycle repeats after n days.
    expect(D.phraseForDay(D.shiftDay('2026-01-01', n)).id).toBe(D.phraseForDay('2026-01-01').id);
  });

  it('picks a stride coprime with the list length', () => {
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    for (const n of [1, 2, 37, 74, 120, 135, 148, 200]) expect(gcd(D.strideFor(n), n), String(n)).toBe(1);
  });

  it('lists the recent days newest first, across month and year ends', () => {
    const r = D.recentPhrases('2026-01-02', 4);
    expect(r.map((x) => x.day)).toEqual(['2026-01-02', '2026-01-01', '2025-12-31', '2025-12-30']);
    expect(new Set(r.map((x) => x.phrase.id)).size).toBe(4);
    expect(D.shiftDay('2028-02-28', 1)).toBe('2028-02-29');
    expect(D.isDay('2026-11-15')).toBe(true);
    expect(D.isDay('15.11.2026')).toBe(false);
    expect(D.isDay(null)).toBe(false);
  });
});

describe('Baku ↔ Berlin clock: time difference', () => {
  it('is 3 hours in German winter time and 2 hours in summer time (Baku has no DST)', () => {
    const winter = new Date('2026-01-15T10:00:00Z');
    const summer = new Date('2026-07-15T10:00:00Z');
    expect(T.tzOffsetMinutes('Asia/Baku', winter)).toBe(240);
    expect(T.tzOffsetMinutes('Asia/Baku', summer)).toBe(240);
    expect(T.tzOffsetMinutes('Europe/Berlin', winter)).toBe(60);
    expect(T.tzOffsetMinutes('Europe/Berlin', summer)).toBe(120);
    expect(T.zoneDifferenceMinutes(winter)).toBe(180);
    expect(T.zoneDifferenceMinutes(summer)).toBe(120);
    expect(T.berlinSummerTime(winter)).toBe(false);
    expect(T.berlinSummerTime(summer)).toBe(true);
  });

  it('switches exactly at the German DST changes (last Sunday of March / October, 01:00 UTC)', () => {
    expect(T.zoneDifferenceMinutes(new Date('2026-03-29T00:59:00Z'))).toBe(180);
    expect(T.zoneDifferenceMinutes(new Date('2026-03-29T01:00:00Z'))).toBe(120);
    expect(T.zoneDifferenceMinutes(new Date('2026-10-25T00:59:00Z'))).toBe(120);
    expect(T.zoneDifferenceMinutes(new Date('2026-10-25T01:00:00Z'))).toBe(180);
  });

  it('formats the difference and the clock time', () => {
    expect(T.formatDifference(180)).toBe('+3');
    expect(T.formatDifference(-120)).toBe('−2');
    expect(T.formatDifference(210)).toBe('+3:30');
    expect(T.formatDifference(0)).toBe('0');
    const at = new Date('2026-01-15T10:00:00Z');
    expect(T.clockTime('Asia/Baku', at)).toBe('14:00');
    expect(T.clockTime('Europe/Berlin', at)).toBe('11:00');
    expect(T.clockTime('Europe/Berlin', new Date('2026-01-14T23:05:00Z'))).toBe('00:05');
  });

  it('knows when both offices are open (weekdays 9–18 local in both cities)', () => {
    expect(T.bothInOfficeHours(new Date('2026-01-15T10:00:00Z'))).toBe(true); // Thu 14:00 Baku, 11:00 Berlin
    expect(T.bothInOfficeHours(new Date('2026-01-15T07:00:00Z'))).toBe(false); // 08:00 Berlin
    expect(T.bothInOfficeHours(new Date('2026-01-15T15:30:00Z'))).toBe(false); // 19:30 Baku
    expect(T.bothInOfficeHours(new Date('2026-01-17T10:00:00Z'))).toBe(false); // Saturday
  });
});

describe('globe projection (same maths as cobe)', () => {
  it('puts the view centre in the middle and the far side behind', () => {
    const { phi } = { phi: G.phiFor(31) };
    const centre = G.project([0, 31], phi, 0);
    expect(centre.x).toBeCloseTo(0.5, 5);
    expect(centre.y).toBeCloseTo(0.5, 5);
    expect(centre.z).toBeGreaterThan(0.79);
    expect(G.project([0, 31 + 180], phi, 0).z).toBeLessThan(0);
  });

  it('shows Baku and Berlin on the front of the home view, Berlin to the west (left) of Baku', () => {
    const baku = G.project(G.BAKU, G.HOME_VIEW.phi, G.HOME_VIEW.theta);
    const berlin = G.project([52.52, 13.405], G.HOME_VIEW.phi, G.HOME_VIEW.theta);
    expect(baku.z).toBeGreaterThan(0);
    expect(berlin.z).toBeGreaterThan(0);
    expect(berlin.x).toBeLessThan(baku.x);
    expect(berlin.y).toBeLessThan(baku.y); // further north = higher up
  });
});
