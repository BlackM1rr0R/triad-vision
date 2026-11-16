/**
 * Pronunciation trainer (/pronunciation): compares what the browser's speech recognition heard with the target
 * sentence, word by word. Both texts are normalised (case, punctuation, umlauts / ß folded, numbers 0–20 as
 * words), then aligned with a word-level Levenshtein distance; every target word ends up "ok", "wrong"
 * (heard as another word) or "missing", and words heard in addition are counted as extra.
 */

const NUMBERS = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn', 'zwanzig'];

const fold = (w: string) =>
  w
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Lowercase words without punctuation; "3" → "drei", "ein" → "eins" is NOT folded (different words). */
export const normalizeWords = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[„“”"«»‚‘’'!?.,;:()[\]…–—-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/^\d+$/.test(w) && Number(w) <= 20 ? NUMBERS[Number(w)] : w))
    .map(fold);

export type WordStatus = 'ok' | 'wrong' | 'missing';

export interface AlignedWord {
  /** The target word as written in the sentence (with its punctuation). */
  word: string;
  status: WordStatus;
  /** What was heard instead (for "wrong"). */
  heard?: string;
}

export interface AlignResult {
  words: AlignedWord[];
  /** Words heard that are not in the sentence. */
  extra: string[];
  correct: number;
  /** 0–100: correct target words over max(target words, heard words). */
  percent: number;
}

/** Word-level alignment of `heard` against `target` (minimal edit script, substitutions before gaps). */
export const alignWords = (target: string, heard: string): AlignResult => {
  const display = target.split(/\s+/).filter(Boolean);
  // One normalised token per display word (a display word like "z. B." stays one unit in the UI).
  const tNorm = display.map((w) => normalizeWords(w).join(' '));
  const keep = tNorm.map((w, i) => (w ? i : -1)).filter((i) => i >= 0);
  const t = keep.map((i) => tNorm[i]);
  const h = normalizeWords(heard);
  const n = t.length;
  const m = h.length;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) d[i][j] = Math.min(d[i - 1][j - 1] + (t[i - 1] === h[j - 1] ? 0 : 1), d[i - 1][j] + 1, d[i][j - 1] + 1);

  const status: AlignedWord[] = display.map((word) => ({ word, status: 'ok' as WordStatus }));
  const extra: string[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (t[i - 1] === h[j - 1] ? 0 : 1)) {
      if (t[i - 1] !== h[j - 1]) status[keep[i - 1]] = { word: display[keep[i - 1]], status: 'wrong', heard: h[j - 1] };
      i--;
      j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      status[keep[i - 1]] = { word: display[keep[i - 1]], status: 'missing' };
      i--;
    } else {
      extra.unshift(h[j - 1]);
      j--;
    }
  }
  const correct = keep.filter((k) => status[k].status === 'ok').length;
  const denom = Math.max(n, m);
  return { words: status, extra, correct, percent: denom ? Math.round((correct / denom) * 100) : 0 };
};
