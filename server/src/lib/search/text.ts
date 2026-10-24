import { normaliseText } from '../matching.js';

/**
 * Text helpers of the public site search (lib/search/index.ts): folding, tokens, typo tolerance, synonyms.
 *
 * Folding is the matching module's: lower case, Azerbaijani / Turkish / German letters to their ASCII base
 * (ə→e, ı→i, ş→s, ç→c, ğ→g, ö→o, ü→u, ä→a, ß→ss), other diacritics stripped, Cyrillic kept as is, everything
 * that is not a letter or digit becomes a space. Index and query go through the same function, so "Fırsat
 * Kartı", "firsat karti" and "FIRSAT KARTI" are the same words.
 */

export const fold = (s: string) => normaliseText(s);

/** Folded words (length ≥ 2, or a digit). */
export const tokens = (s: string) =>
  fold(s)
    .split(' ')
    .filter((w) => w.length >= 2 || /\d/.test(w));

/** Levenshtein distance with an early exit once `max` is exceeded (returns max + 1 then). */
export const editDistance = (a: string, b: string, max = 2): number => {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
};

/** Typos allowed for a query word: none below 5 characters, 1 from 5, 2 from 9. */
export const typoBudget = (word: string) => (word.length >= 9 ? 2 : word.length >= 5 ? 1 : 0);

/**
 * Synonym groups: every phrase of a group means the same thing, in any site language. A document that
 * contains one of them matches a query with any other ("imkan kartı" finds the Chancenkarte guide in German).
 */
const SYNONYM_GROUPS: string[][] = [
  [
    'chancenkarte', 'chancen karte', 'opportunity card', 'imkan kartı', 'imkan karti', 'fırsat kartı', 'firsat karti',
    'карта возможностей', 'карта можливостей', 'шанскарте', '20a',
  ],
  ['blue card', 'blaue karte', 'bluecard', 'mavi kart', 'голубая карта', 'синяя карта', 'блакитна карта', 'блакитна картка', '18g'],
  [
    'ausbildung', 'peşə təhsili', 'pese tehsili', 'peşə təlimi', 'mesleki eğitim', 'meslek eğitimi', 'vocational training', 'berufsausbildung',
    'профобучение', 'профессиональное обучение', 'професійне навчання', 'профнавчання', '16a',
  ],
  ['anerkennung', 'recognition', 'diploma recognition', 'diplomun tanınması', 'tanınma', 'denklik', 'diploma denkliği', 'признание диплома', 'признание', 'визнання диплома', 'визнання', 'nostrifikasiya'],
  [
    'familiennachzug', 'family reunification', 'family reunion', 'ailə birləşməsi', 'aile birleşimi', 'aile birleşmesi',
    'воссоединение семьи', 'возз єднання сім ї', 'возз’єднання сім’ї', 'возз\'єднання сім\'ї', 'ehegattennachzug',
  ],
  ['skilled worker', 'fachkraft', 'fachkräfte', 'ixtisaslı işçi', 'mütəxəssis', 'nitelikli işçi', 'kalifiye', 'квалифицированный специалист', 'кваліфікований фахівець', '18a', '18b'],
  ['pflege', 'nursing', 'nurse', 'pflegekraft', 'tibb bacısı', 'hemşire', 'hemşirelik', 'медсестра', 'медсестри', 'медична сестра'],
  ['salary', 'gehalt', 'maaş', 'maas', 'lohn', 'зарплата', 'заробітна плата', 'brutto', 'netto'],
  ['visa', 'visum', 'viza', 'vize', 'виза', 'візи', 'віза'],
  ['job', 'jobs', 'vacancy', 'vacancies', 'stelle', 'stellenangebot', 'vakansiya', 'iş elanı', 'iş ilanı', 'вакансия', 'вакансії', 'вакансія', 'работа', 'робота'],
  ['blocked account', 'sperrkonto', 'bloklanmış hesab', 'bloke hesap', 'блокированный счет', 'блокований рахунок'],
  ['driver', 'fahrer', 'lkw', 'berufskraftfahrer', 'sürücü', 'şoför', 'водитель', 'водій'],
  ['apostille', 'apostil', 'апостиль'],
  ['translation', 'übersetzung', 'tərcümə', 'tercüme', 'перевод', 'переклад'],
  ['embassy', 'botschaft', 'səfirlik', 'büyükelçilik', 'konsolosluk', 'посольство', 'консульство'],
  ['permanent residence', 'niederlassungserlaubnis', 'daimi yaşayış', 'daimi oturum', 'вид на жительство', 'пмж', 'посвідка на постійне проживання'],
  ['webinar', 'veranstaltung', 'tədbir', 'etkinlik', 'вебинар', 'мероприятие', 'вебінар', 'захід'],
  ['calculator', 'rechner', 'kalkulyator', 'hesaplayıcı', 'hesaplama', 'калькулятор'],
  ['ebook', 'e-book', 'e kitab', 'e-kitab', 'e-kitap', 'электронная книга', 'електронна книга', 'pdf guide', 'ratgeber pdf'],
];

export interface SynonymGroup {
  id: number;
  /** Folded phrases, longest first. */
  phrases: string[];
}

export const SYNONYMS: SynonymGroup[] = SYNONYM_GROUPS.map((g, id) => ({
  id,
  phrases: [...new Set(g.map(fold).filter(Boolean))].sort((a, b) => b.length - a.length),
}));

const hasPhrase = (text: string, phrase: string) => ` ${text} `.includes(` ${phrase} `);

/** Synonym groups whose phrases occur in an already folded text. */
export const conceptsIn = (folded: string): Set<number> => {
  const out = new Set<number>();
  for (const g of SYNONYMS) if (g.phrases.some((p) => hasPhrase(folded, p))) out.add(g.id);
  return out;
};

/**
 * Splits a folded query into synonym concepts (longest phrases first) and the remaining plain words.
 * "imkan karti almaniya" → concepts {chancenkarte}, words ["almaniya"].
 */
export const parseQuery = (folded: string): { concepts: { id: number; phrase: string }[]; words: string[] } => {
  let rest = ` ${folded} `;
  const all = SYNONYMS.flatMap((g) => g.phrases.map((phrase) => ({ id: g.id, phrase }))).sort((a, b) => b.phrase.length - a.phrase.length);
  const concepts: { id: number; phrase: string }[] = [];
  for (const c of all) {
    if (concepts.some((x) => x.id === c.id)) continue;
    if (rest.includes(` ${c.phrase} `)) {
      concepts.push(c);
      rest = rest.replace(` ${c.phrase} `, ' ');
    }
  }
  return { concepts, words: rest.split(' ').filter((w) => w.length >= 2 || /\d/.test(w)) };
};

/** Every folded phrase of a group (to highlight the words that made a concept match). */
export const phrasesOf = (id: number) => SYNONYMS[id]?.phrases ?? [];

/** Plain text of the guide markdown subset: links → their text, markup characters removed. */
export const stripMarkdown = (md: string) =>
  md
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*\|?\s*-{3,}[-|\s:]*$/gm, ' ')
    .replace(/[*_`|]+/g, ' ')
    .replace(/^\s*(?:[-+]|\d+\.)\s+/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
