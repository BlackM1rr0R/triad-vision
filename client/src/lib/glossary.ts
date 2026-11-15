/**
 * German bureaucracy glossary (/glossary, /glossary/:slug): response types of GET /api/glossary and
 * /api/glossary/:slug (server lib/glossary/index.ts, static data) and small helpers of the pages.
 */
export const GLOSSARY_CATEGORIES = ['residence', 'work', 'tax', 'health', 'housing', 'banking', 'family', 'education', 'everyday'] as const;
export type GlossaryCategory = (typeof GLOSSARY_CATEGORIES)[number];

export interface GlossaryListItem {
  slug: string;
  term: string;
  article: 'der' | 'die' | 'das' | null;
  pluralOnly: boolean;
  pron: string;
  category: GlossaryCategory;
  aliases: string[];
  short: string;
}

export interface GlossaryListResponse {
  asOf: string;
  categories: { key: GlossaryCategory; count: number }[];
  items: GlossaryListItem[];
}

export interface GlossaryDetailResponse {
  asOf: string;
  term: GlossaryListItem & { long: string; longFallback: 'en' | null; example: string; link: { url: string; label: string } | null };
  related: GlossaryListItem[];
  prev: { slug: string; term: string } | null;
  next: { slug: string; term: string } | null;
}

/** "die Anmeldung" / "die Nebenkosten (Pl.)". */
export const withArticle = (t: Pick<GlossaryListItem, 'term' | 'article' | 'pluralOnly'>) => `${t.article ? `${t.article} ` : ''}${t.term}${t.pluralOnly ? ' (Pl.)' : ''}`;

/** Lowercase, umlauts and accents folded (ä → a, ß → ss, ə → e), for the search and the A–Z letters. */
export const foldText = (s: string) =>
  s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ə/g, 'e')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export const letterOf = (term: string) => foldText(term).charAt(0).toUpperCase();

/** Items matching every word of the query in the term, its aliases or the definition; term matches first. */
export const searchGlossary = (items: GlossaryListItem[], query: string) => {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  const scored = items
    .map((i) => {
      const name = foldText([i.term, ...i.aliases].join(' '));
      const text = `${name} ${foldText(i.short)}`;
      if (!words.every((w) => text.includes(w))) return null;
      const score = foldText(i.term).startsWith(words[0]) ? 0 : words.every((w) => name.includes(w)) ? 1 : 2;
      return { i, score };
    })
    .filter((x): x is { i: GlossaryListItem; score: number } => !!x);
  return scored.sort((a, b) => a.score - b.score).map((x) => x.i);
};
