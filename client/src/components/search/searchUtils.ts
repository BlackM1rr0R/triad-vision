/** Text helpers for the site search: diacritic-insensitive normalisation with an index map for highlighting. */

const CHAR_MAP: Record<string, string> = {
  ə: 'e',
  ı: 'i',
  ß: 'ss',
  ё: 'е',
  æ: 'ae',
  œ: 'oe',
};

export interface Normalized {
  /** Lower-cased, diacritic-free text. */
  norm: string;
  /** For every char in `norm`, the index of the source char in the original text. */
  map: number[];
}

/** Lower-cases and strips diacritics (ə→e, ı→i, ö→o, ü→u, ş→s, ç→c, ğ→g, ä→a, ß→ss, ё→е …), keeping an index map. */
export const normalizeWithMap = (text: string): Normalized => {
  let norm = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let c = text[i].toLowerCase();
    c = CHAR_MAP[c] ?? c;
    c = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (const ch of c) {
      norm += ch;
      map.push(i);
    }
  }
  return { norm, map };
};

export const normalize = (text: string) => normalizeWithMap(text).norm.replace(/\s+/g, ' ').trim();

export const tokenize = (query: string) => normalize(query).split(' ').filter(Boolean);

/** True when every char of `needle` appears in `hay` in order (typo-tolerant fallback). */
export const isSubsequence = (needle: string, hay: string) => {
  let j = 0;
  for (let i = 0; i < hay.length && j < needle.length; i++) if (hay[i] === needle[j]) j++;
  return j === needle.length;
};

/** Merged [start, end) ranges in the ORIGINAL text where any token matches. */
export const matchRanges = (text: string, tokens: string[]): [number, number][] => {
  if (!tokens.length || !text) return [];
  const { norm, map } = normalizeWithMap(text);
  const raw: [number, number][] = [];
  for (const tok of tokens) {
    let from = 0;
    for (;;) {
      const i = norm.indexOf(tok, from);
      if (i === -1) break;
      raw.push([map[i], map[i + tok.length - 1] + 1]);
      from = i + tok.length;
    }
  }
  raw.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
};

/** A short excerpt of `text` around the first token match (or its beginning). */
export const snippet = (text: string, tokens: string[], radius = 60, length = 150) => {
  const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const first = matchRanges(clean, tokens)[0];
  if (!first || first[0] < radius) return clean.length > length ? `${clean.slice(0, length).trimEnd()}…` : clean;
  const start = clean.lastIndexOf(' ', first[0] - radius) + 1 || first[0] - radius;
  const out = clean.slice(start, start + length).trimEnd();
  return `…${out}${start + length < clean.length ? '…' : ''}`;
};
