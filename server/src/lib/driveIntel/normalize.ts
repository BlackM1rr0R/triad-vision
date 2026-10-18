/**
 * Text normalisation for the drive's full-text search (pure, unit tested).
 *
 * `foldText` maps every UTF-16 code unit to exactly ONE code unit (lower case, Azerbaijani / German /
 * Turkish / Russian letters folded to their plain base letter, every whitespace to a space), so a hit at
 * index i of the folded text is the same index in the original text — the snippet comes from the
 * original. The indexer stores both: `original + MARKER + folded` in DriveNode.textContent.
 */

const MAP: Record<string, string> = {
  ı: 'i',
  İ: 'i',
  I: 'i',
  ə: 'e',
  Ə: 'e',
  ß: 's',
  ẞ: 's',
  ё: 'е',
  Ё: 'е',
  й: 'и',
  Й: 'и',
  æ: 'a',
  Æ: 'a',
  ø: 'o',
  Ø: 'o',
  œ: 'o',
  Œ: 'o',
  đ: 'd',
  Đ: 'd',
  ł: 'l',
  Ł: 'l',
  ' ': ' ',
};

const COMBINING = /[̀-ͯ]/g;

/** One character → one character (see above). Surrogates and anything that would grow stay as they are. */
const foldChar = (ch: string): string => {
  const m = MAP[ch];
  if (m) return m;
  const code = ch.charCodeAt(0);
  if (code >= 0xd800 && code <= 0xdfff) return ch;
  if (/\s/.test(ch)) return ' ';
  const base = ch.normalize('NFD').replace(COMBINING, '');
  const lower = (base.length === 1 ? base : ch).toLowerCase();
  return lower.length === 1 ? lower : ch;
};

/** Length-preserving fold of a whole text. */
export const foldText = (text: string) => {
  let out = '';
  for (let i = 0; i < text.length; i++) out += foldChar(text[i]);
  return out;
};

/** The search query, folded the same way and with whitespace collapsed. */
export const foldQuery = (q: string) => foldText(q.normalize('NFC')).replace(/ +/g, ' ').trim();

/**
 * Tidies extracted text: NFC, control characters dropped, runs of spaces/tabs collapsed, at most one
 * empty line in a row, trimmed lines. Done BEFORE folding, so a query "a b" also matches "a  b".
 */
export const tidyText = (raw: string) =>
  raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f﻿]/g, '')
    .replace(/[ \t ]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Separator between the original and the folded copy inside textContent. */
export const MARKER = '\n\u0001\u0001fold\u0001\u0001\n';

/** Max characters of extracted text kept per file (the folded copy doubles it: ≈ 1 MB in total). */
export const MAX_TEXT_CHARS = 500_000;

/** What the indexer stores: the original (capped) + marker + its folded copy. */
export const storedText = (text: string) => {
  let t = tidyText(text);
  if (t.length > MAX_TEXT_CHARS) {
    t = t.slice(0, MAX_TEXT_CHARS);
    // never cut a surrogate pair in half
    if (/[\ud800-\udbff]$/.test(t)) t = t.slice(0, -1);
  }
  return t ? `${t}${MARKER}${foldText(t)}` : '';
};

/** The original part of a stored textContent. */
export const originalOf = (stored: string | null | undefined) => {
  if (!stored) return '';
  const i = stored.indexOf(MARKER);
  return i >= 0 ? stored.slice(0, i) : stored;
};

export interface Snippet {
  before: string;
  match: string;
  after: string;
}

/** ±`radius` characters around the first hit of the folded query in the text (null when not found). */
export const snippetOf = (original: string, foldedQuery: string, radius = 60): Snippet | null => {
  if (!foldedQuery) return null;
  const folded = foldText(original);
  const at = folded.indexOf(foldedQuery);
  if (at < 0) return null;
  return cutSnippet(original, at, foldedQuery.length, radius);
};

/** Snippet around a known hit position (word boundaries where cheap, ellipses when cut). */
export const cutSnippet = (original: string, at: number, len: number, radius = 60): Snippet => {
  let from = Math.max(0, at - radius);
  let to = Math.min(original.length, at + len + radius);
  if (from > 0) {
    const sp = original.indexOf(' ', from);
    if (sp >= 0 && sp < at) from = sp + 1;
  }
  if (to < original.length) {
    const sp = original.lastIndexOf(' ', to);
    if (sp > at + len) to = sp;
  }
  const flat = (s: string) => s.replace(/\s+/g, ' ');
  return {
    before: (from > 0 ? '…' : '') + flat(original.slice(from, at)),
    match: flat(original.slice(at, at + len)),
    after: flat(original.slice(at + len, to)) + (to < original.length ? '…' : ''),
  };
};
