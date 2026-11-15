import { BANKING_TERMS } from './terms/banking.js';
import { EDUCATION_TERMS } from './terms/education.js';
import { EVERYDAY_TERMS } from './terms/everyday.js';
import { FAMILY_TERMS } from './terms/family.js';
import { HEALTH_TERMS } from './terms/health.js';
import { HOUSING_TERMS } from './terms/housing.js';
import { RESIDENCE_TERMS } from './terms/residence.js';
import { TAX_TERMS } from './terms/tax.js';
import { WORK_TERMS } from './terms/work.js';
import { GLOSSARY_AS_OF, GLOSSARY_CATEGORIES, GLOSSARY_LOCALES, type GlossaryCategory, type GlossaryLocale, type GlossaryLongLocale, type GlossaryTerm } from './types.js';

export * from './types.js';

/**
 * German bureaucracy glossary: every term (static data, ./terms/*.ts), lookups and the localized API shapes of
 * GET /api/glossary and /api/glossary/:slug (routes/glossary.ts). SEO output: ./seo.ts.
 */

/** All terms, in category order (as written in the category files). */
export const GLOSSARY_TERMS: readonly GlossaryTerm[] = [
  ...RESIDENCE_TERMS,
  ...WORK_TERMS,
  ...TAX_TERMS,
  ...HEALTH_TERMS,
  ...HOUSING_TERMS,
  ...BANKING_TERMS,
  ...FAMILY_TERMS,
  ...EDUCATION_TERMS,
  ...EVERYDAY_TERMS,
];

const BY_SLUG = new Map(GLOSSARY_TERMS.map((t) => [t.slug, t]));

export const glossaryTerm = (slug: string) => BY_SLUG.get(slug) ?? null;

export const GLOSSARY_PATH = '/glossary';
export const glossaryPath = (slug: string) => `${GLOSSARY_PATH}/${slug}`;
/** Slug of a /glossary/:slug path (also unknown slugs), else null. */
export const glossarySlugOf = (path: string) => /^\/glossary\/([^/]+)$/.exec(path)?.[1] ?? null;

export const glossaryLocale = (v: unknown): GlossaryLocale => {
  const l = typeof v === 'string' ? v.slice(0, 2).toLowerCase() : '';
  return (GLOSSARY_LOCALES as readonly string[]).includes(l) ? (l as GlossaryLocale) : 'az';
};

/** Long explanation in a language: tr / uk (no own text) show the English one. */
export const longIn = (t: GlossaryTerm, lng: GlossaryLocale) => {
  const own = (t.long as Partial<Record<GlossaryLocale, string>>)[lng];
  return { text: own ?? t.long.en, fallback: own ? null : ('en' as GlossaryLongLocale) };
};

/** "die Anmeldung" / "die Nebenkosten (Pl.)" / "ELSTER". */
export const withArticle = (t: Pick<GlossaryTerm, 'term' | 'article' | 'pluralOnly'>) => `${t.article ? `${t.article} ` : ''}${t.term}${t.pluralOnly ? ' (Pl.)' : ''}`;

/** Sort key of the A–Z list: umlauts as their base letter (Ä → A), case-insensitive. */
export const sortKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss');

/** A–Z letter of a term (Ä → A). */
export const letterOf = (term: string) => sortKey(term).charAt(0).toUpperCase();

export const alphabetical = <T extends { term: string }>(items: readonly T[]) => [...items].sort((a, b) => sortKey(a.term).localeCompare(sortKey(b.term), 'de'));

/** Related terms that exist (unknown slugs are skipped). */
export const relatedOf = (t: GlossaryTerm) => t.related.map((s) => BY_SLUG.get(s)).filter((x): x is GlossaryTerm => !!x && x.slug !== t.slug);

/** Terms that list this one as related (for "see also" when its own list is short). */
export const backlinksOf = (t: GlossaryTerm) => GLOSSARY_TERMS.filter((x) => x.slug !== t.slug && x.related.includes(t.slug));

// ─── API shapes ───────────────────────────────────────────────────────

export interface GlossaryListItem {
  slug: string;
  term: string;
  article: GlossaryTerm['article'];
  pluralOnly: boolean;
  pron: string;
  category: GlossaryCategory;
  aliases: string[];
  short: string;
}

const listItem = (t: GlossaryTerm, lng: GlossaryLocale): GlossaryListItem => ({
  slug: t.slug,
  term: t.term,
  article: t.article,
  pluralOnly: !!t.pluralOnly,
  pron: t.pron,
  category: t.category,
  aliases: t.aliases ?? [],
  short: t.short[lng],
});

/** GET /api/glossary: every term (alphabetical) with its short definition in one language. */
export const glossaryList = (lng: GlossaryLocale) => ({
  asOf: GLOSSARY_AS_OF,
  categories: GLOSSARY_CATEGORIES.map((c) => ({ key: c, count: GLOSSARY_TERMS.filter((t) => t.category === c).length })),
  items: alphabetical(GLOSSARY_TERMS).map((t) => listItem(t, lng)),
});

/** Up to `n` related terms: its own list first, then terms pointing to it, then the same category. */
export const relatedTerms = (t: GlossaryTerm, n = 6) => {
  const out: GlossaryTerm[] = [];
  const add = (x: GlossaryTerm) => {
    if (out.length < n && x.slug !== t.slug && !out.some((o) => o.slug === x.slug)) out.push(x);
  };
  relatedOf(t).forEach(add);
  backlinksOf(t).forEach(add);
  if (out.length < 3) GLOSSARY_TERMS.filter((x) => x.category === t.category).forEach(add);
  return out;
};

/** GET /api/glossary/:slug: one term in one language with its related terms and the A–Z neighbours. */
export const glossaryDetail = (slug: string, lng: GlossaryLocale) => {
  const t = glossaryTerm(slug);
  if (!t) return null;
  const long = longIn(t, lng);
  const sorted = alphabetical(GLOSSARY_TERMS);
  const i = sorted.findIndex((x) => x.slug === t.slug);
  const neighbour = (x: GlossaryTerm | undefined) => (x ? { slug: x.slug, term: x.term } : null);
  return {
    asOf: GLOSSARY_AS_OF,
    term: {
      ...listItem(t, lng),
      long: long.text,
      longFallback: long.fallback,
      example: t.example,
      link: t.link ?? null,
    },
    related: relatedTerms(t).map((x) => listItem(x, lng)),
    prev: neighbour(sorted[i - 1]),
    next: neighbour(sorted[i + 1]),
  };
};
export type GlossaryDetail = NonNullable<ReturnType<typeof glossaryDetail>>;
