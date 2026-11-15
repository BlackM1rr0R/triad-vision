/**
 * Office TV mode — pure helpers (unit tested in tests/unit/tvDisplay.test.ts).
 *
 * Data minimisation: the wall TV is visible to visitors, so a person is never shown with the full name. Only the
 * first given name and the initial of the family name ("Aysel M.") leave the server; contact data, documents,
 * case numbers and ids are never part of the TV payload.
 */

/** Letters (any script, with combining marks), apostrophes and hyphens; everything else (digits, @, dots) goes. */
const clean = (s: string) => s.normalize('NFC').replace(/[^\p{L}\p{M}'’-]+/gu, ' ').trim();

/** First character of a string that is a letter (Unicode-aware, so "Ə", "Ş", "Ж" stay whole). */
const firstLetter = (s: string) => Array.from(s).find((ch) => /\p{L}/u.test(ch)) ?? '';

/** Azerbaijani upper case ("i" → "İ"), the office language; other scripts are unaffected. */
const upper = (s: string) => s.toLocaleUpperCase('az');

const MAX_FIRST = 20;

/**
 * "Aysel Gül" + "Məmmədova" → "Aysel M."; only the first given name is kept (a second given name can identify a
 * person as well as a surname). Missing parts degrade gracefully: no family name → "Aysel", no given name → "M.",
 * nothing usable → "".
 */
export const maskName = (firstName: string | null | undefined, lastName: string | null | undefined): string => {
  const given = clean(firstName ?? '').split(/\s+/)[0] ?? '';
  const first = Array.from(given).slice(0, MAX_FIRST).join('');
  const initial = firstLetter(clean(lastName ?? ''));
  const head = first ? upper(Array.from(first)[0]) + Array.from(first).slice(1).join('') : '';
  if (head && initial) return `${head} ${upper(initial)}.`;
  if (head) return head;
  return initial ? `${upper(initial)}.` : '';
};

/** A whole name in one string ("Aysel Məmmədova", e.g. an inquiry contact) → "Aysel M.". */
export const maskFullName = (full: string | null | undefined): string => {
  const parts = clean(full ?? '').split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return maskName(parts[0], parts.length > 1 ? parts[parts.length - 1] : '');
};

/** Short free text for the TV (profession, city): one line, no e-mail / phone / URL fragments, capped. */
export const tvText = (s: string | null | undefined, max = 60): string | null => {
  if (!s) return null;
  const line = s
    .replace(/\S+@\S+/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\+?\d[\d\s()./-]{6,}\d/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!line) return null;
  const chars = Array.from(line);
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : line;
};

// ─── Baku time windows (UTC+4, no daylight saving since 2016) ─────────

export const BAKU_OFFSET_MS = 4 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

const shifted = (d: Date) => new Date(d.getTime() + BAKU_OFFSET_MS);

/** [start, end) of the Baku calendar day containing `now`, plus its YYYY-MM-DD key. */
export const bakuDayWindow = (now: Date) => {
  const s = shifted(now);
  const start = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) - BAKU_OFFSET_MS);
  return { key: s.toISOString().slice(0, 10), start, end: new Date(start.getTime() + DAY) };
};

/** [start, end) of the Baku week (Monday 00:00 → next Monday) containing `now`. */
export const bakuWeekWindow = (now: Date) => {
  const day = bakuDayWindow(now);
  const weekday = (shifted(now).getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(day.start.getTime() - weekday * DAY);
  return { start, end: new Date(start.getTime() + 7 * DAY) };
};

/** [start, end) of the Baku calendar month containing `now`, plus its YYYY-MM key. */
export const bakuMonthWindow = (now: Date) => {
  const s = shifted(now);
  const start = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1) - BAKU_OFFSET_MS);
  const end = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 1) - BAKU_OFFSET_MS);
  return { key: s.toISOString().slice(0, 7), start, end };
};

/** Whole days between two instants (never negative). */
export const daysBetween = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY));
