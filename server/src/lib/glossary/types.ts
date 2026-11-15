/**
 * German bureaucracy glossary (/glossary, /glossary/:slug): static, hand-written content in code (no DB).
 * One file per category under ./terms/, collected in ./index.ts. All texts are factual and short; numbers
 * that change yearly are stated "as of" GLOSSARY_AS_OF and the official link is the reference.
 */

export const GLOSSARY_CATEGORIES = ['residence', 'work', 'tax', 'health', 'housing', 'banking', 'family', 'education', 'everyday'] as const;
export type GlossaryCategory = (typeof GLOSSARY_CATEGORIES)[number];

export const GLOSSARY_LOCALES = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;
export type GlossaryLocale = (typeof GLOSSARY_LOCALES)[number];
/** Languages with the long explanation (tr / uk show the English one, like other public pages). */
export const GLOSSARY_LONG_LOCALES = ['az', 'de', 'en', 'ru'] as const;
export type GlossaryLongLocale = (typeof GLOSSARY_LONG_LOCALES)[number];

/** Date the facts were checked against the official sources. */
export const GLOSSARY_AS_OF = '2026-11-15';

export interface GlossaryTerm {
  /** URL slug: lowercase ASCII of the German term (ä → ae, ß → ss), words joined by "-". Unique. */
  slug: string;
  /** The German term as written ("Anmeldung", "Steuer-ID"). */
  term: string;
  /** Grammatical article; null for abbreviations / names used without one. */
  article: 'der' | 'die' | 'das' | null;
  /** True for plural-only nouns ("die Nebenkosten"). */
  pluralOnly?: boolean;
  /** Pronunciation hint in Latin letters, stressed syllable in capitals: "AN-mel-dung". */
  pron: string;
  category: GlossaryCategory;
  /** Other spellings / abbreviations for the search ("GEZ", "IdNr"). */
  aliases?: string[];
  /** One-sentence definition (≤ 160 characters) in every site language. */
  short: Record<GlossaryLocale, string>;
  /** 2–4 sentence explanation (az, de, en, ru). */
  long: Record<GlossaryLongLocale, string>;
  /** A German example sentence using the term. */
  example: string;
  /** Slugs of related terms (must exist). */
  related: string[];
  /** Official page (government / authority / law text) when useful. */
  link?: { url: string; label: string };
}
