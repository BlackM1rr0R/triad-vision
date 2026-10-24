/**
 * Seed content of the long-form topic guides (/guides/:slug, model GuidePage). One file per guide key with
 * a hand-written version in each of the six site languages. Seeded only when the (key, locale) row does not
 * exist yet, so edits made in the admin panel (/admin/guides) are never overwritten by a later deploy.
 *
 * Markdown subset understood by the renderer (server/src/lib/guides/markdown.ts and the client page):
 *   ## / ### headings (## entries form the table of contents), paragraphs, "- " and "1. " lists,
 *   **bold**, *italic*, [links](…), pipe tables (| a | b | + |---|---|), "> " notes. No raw HTML.
 *   Internal links are written without a language prefix (/booking, /eligibility, /chancenkarte-calculator…);
 *   [text](guide:blue-card) links to another guide in the reader's language.
 */
export const GUIDE_LOCALES = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;
export type GuideLocale = (typeof GUIDE_LOCALES)[number];

export interface GuidePageSeed {
  /** Lowercase ASCII, words separated by "-", unique per language. */
  slug: string;
  /** H1 and <title>; at most 60 characters. */
  title: string;
  /** Meta description; 120–155 characters. */
  description: string;
  /** Markdown body (no H1, no disclaimer — the page adds both). */
  body: string;
  /** 4–6 questions with short plain-text answers (FAQPage JSON-LD). */
  faq: { q: string; a: string }[];
}

export interface GuideSeed {
  key: string;
  pages: Record<GuideLocale, GuidePageSeed>;
}
