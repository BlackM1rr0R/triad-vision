import { isSubsequence, normalize } from '@/components/search/searchUtils';

/**
 * Fuzzy matching of pages and actions. `primary` is the label in the UI language; `others` holds the
 * labels in the other three languages plus the synonyms. Every query word must match somewhere; the
 * current-language label ranks above other languages and synonyms, word starts above inner matches,
 * and an in-order subsequence ("cmpg" → "campaigns") is the typo-tolerant fallback.
 */

export interface MatchHay {
  primary: string;
  others: string;
}

/** Lower-case, diacritic-free, punctuation turned into spaces, padded so ' word' finds word starts. */
export const prepHay = (text: string) => ` ${normalize(text).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

export const queryTokens = (q: string) => prepHay(q).trim().split(' ').filter(Boolean);

export const scoreMatch = (tokens: string[], hay: MatchHay): number => {
  if (!tokens.length) return 0;
  let total = 0;
  for (const tok of tokens) {
    let s: number;
    if (hay.primary.startsWith(` ${tok}`)) s = 100;
    else if (hay.primary.includes(` ${tok}`)) s = 80;
    else if (hay.primary.includes(tok)) s = 55;
    else if (hay.others.includes(` ${tok}`)) s = 45;
    else if (hay.others.includes(tok)) s = 30;
    else if (tok.length >= 3 && isSubsequence(tok, hay.primary.replace(/ /g, ''))) s = 12;
    else return 0;
    total += s;
  }
  return total;
};

/** A query that looks like a record (case / task number, e-mail, phone): server results go first. */
export const looksLikeRecord = (q: string) => /\d{2,}|@|^tv-|^t-\d/i.test(q.trim());
