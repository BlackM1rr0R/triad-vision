import { SITE_NAME, type SeoLocale } from '../seoCatalogue.js';
import { collapse, escapeHtml as e, padDescription, pageTitle, pageUrl, truncate } from '../seo.js';
import { alphabetical, GLOSSARY_AS_OF, GLOSSARY_CATEGORIES, GLOSSARY_PATH, GLOSSARY_TERMS, glossaryPath, glossarySlugOf, glossaryTerm, longIn, relatedTerms, withArticle, type GlossaryTerm } from './index.js';
import { GLOSSARY_TEXTS } from './texts.js';

/**
 * SEO of the glossary (/glossary, /glossary/:slug): head data for lib/seo.ts resolvePage (title, description,
 * DefinedTerm / DefinedTermSet JSON-LD), the crawler body for lib/seoBody.ts and the sitemap rows. Static data,
 * all six languages (tr / uk show the English long explanation), same path in every language.
 */

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 155;

/** Last content change of the glossary (sitemap lastmod). */
export const GLOSSARY_LASTMOD = new Date(`${GLOSSARY_AS_OF}T00:00:00.000Z`);

export { glossarySlugOf };
export const glossaryTermOfPath = (path: string) => {
  const slug = glossarySlugOf(path);
  return slug ? glossaryTerm(slug) : null;
};

export const glossaryTitle = (t: GlossaryTerm, lng: SeoLocale) => {
  for (const c of [GLOSSARY_TEXTS[lng].termTitle(t.term), GLOSSARY_TEXTS[lng].termTitleShort(t.term), t.term]) {
    const full = pageTitle(c);
    if (full.length <= TITLE_MAX && !full.includes('…')) return full;
  }
  return truncate(`${t.term} | ${SITE_NAME}`, TITLE_MAX);
};

export const glossaryDescription = (t: GlossaryTerm, lng: SeoLocale) => {
  const short = collapse(t.short[lng]);
  const text = short.toLowerCase().includes(t.term.toLowerCase()) ? short : `${t.term}: ${short}`;
  return truncate(padDescription(text, GLOSSARY_TEXTS[lng].descTail), DESCRIPTION_MAX);
};

const setId = (lng: SeoLocale) => `${pageUrl(GLOSSARY_PATH, lng)}#terms`;

/** JSON-LD DefinedTerm of a term page (schema.org). */
export const glossaryTermLd = (t: GlossaryTerm, lng: SeoLocale, name: string) => {
  const url = pageUrl(glossaryPath(t.slug), lng);
  return {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    '@id': `${url}#term`,
    name: t.term,
    ...(t.aliases?.length ? { alternateName: t.aliases } : {}),
    termCode: t.slug,
    description: truncate(longIn(t, lng).text, 500),
    url,
    inLanguage: 'de',
    ...(t.link ? { sameAs: t.link.url } : {}),
    inDefinedTermSet: { '@type': 'DefinedTermSet', '@id': setId(lng), name, url: pageUrl(GLOSSARY_PATH, lng) },
  };
};

/** JSON-LD DefinedTermSet of /glossary with every term. */
export const glossarySetLd = (lng: SeoLocale, name: string, description: string) => ({
  '@context': 'https://schema.org',
  '@type': 'DefinedTermSet',
  '@id': setId(lng),
  name,
  description,
  url: pageUrl(GLOSSARY_PATH, lng),
  inLanguage: lng,
  dateModified: GLOSSARY_AS_OF,
  hasDefinedTerm: alphabetical(GLOSSARY_TERMS).map((t) => ({
    '@type': 'DefinedTerm',
    name: t.term,
    termCode: t.slug,
    description: collapse(t.short[lng]),
    url: pageUrl(glossaryPath(t.slug), lng),
  })),
});

/** The sitemap paths (one per term; every language). */
export const glossarySitemapPaths = () => GLOSSARY_TERMS.map((t) => glossaryPath(t.slug));

// ─── crawler HTML ─────────────────────────────────────────────────────

type Link = (path: string, label: string) => string;

const termItem = (t: GlossaryTerm, lng: SeoLocale, link: Link) => `<li>${link(glossaryPath(t.slug), withArticle(t))} — ${e(collapse(t.short[lng]))}</li>`;

/** Body of /glossary/:slug (inside <main>, after the breadcrumbs). */
export const glossaryTermBody = (t: GlossaryTerm, lng: SeoLocale, link: Link) => {
  const L = GLOSSARY_TEXTS[lng];
  const long = longIn(t, lng);
  const related = relatedTerms(t);
  return [
    `<article><h1 lang="de">${e(withArticle(t))}</h1>`,
    `<p>${e(L.categories[t.category])} · ${e(L.pron)}: <span lang="de">[${e(t.pron)}]</span></p>`,
    `<p><strong>${e(collapse(t.short[lng]))}</strong></p>`,
    `<p${long.fallback ? ' lang="en"' : ''}>${e(long.text)}</p>`,
    long.fallback && L.fallback ? `<p><small>${e(L.fallback)}</small></p>` : '',
    `<section><h2>${e(L.example)}</h2><blockquote lang="de">${e(t.example)}</blockquote></section>`,
    t.link ? `<p>${e(L.official)}: <a href="${e(t.link.url)}" rel="noopener" target="_blank">${e(t.link.label)}</a></p>` : '',
    `<p><small>${e(L.asOf)}: <time datetime="${GLOSSARY_AS_OF}">${GLOSSARY_AS_OF}</time>. ${e(L.disclaimer)}</small></p>`,
    '</article>',
    related.length ? `<section><h2>${e(L.related)}</h2><ul>${related.map((x) => termItem(x, lng, link)).join('')}</ul></section>` : '',
    `<p>${link(GLOSSARY_PATH, L.allTerms)}</p>`,
  ];
};

/** Body of /glossary: every term by category. */
export const glossaryListBody = (lng: SeoLocale, link: Link) => {
  const L = GLOSSARY_TEXTS[lng];
  return [
    ...GLOSSARY_CATEGORIES.map((c) => {
      const items = alphabetical(GLOSSARY_TERMS.filter((t) => t.category === c));
      return `<section><h2>${e(L.categories[c])}</h2><ul>${items.map((t) => termItem(t, lng, link)).join('')}</ul></section>`;
    }),
    `<p><small>${e(L.asOf)}: <time datetime="${GLOSSARY_AS_OF}">${GLOSSARY_AS_OF}</time>. ${e(L.disclaimer)}</small></p>`,
  ];
};
