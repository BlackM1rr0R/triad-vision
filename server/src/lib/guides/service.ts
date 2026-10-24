import { prisma } from '../../db.js';
import { cached } from '../cache.js';
import { SEO_LOCALES, type SeoLocale } from '../seoCatalogue.js';
import { renderGuideMarkdown, type TocEntry } from './markdown.js';

/**
 * Long-form topic guides (model GuidePage): one row per (key, locale), each language with its own slug.
 * Public URL: /guides/<slug> under the language prefix (/tr/guides/almanya-firsat-karti-chancenkarte).
 */

export const GUIDE_LOCALES = SEO_LOCALES;
export type GuideLocale = SeoLocale;

export interface GuideFaq {
  q: string;
  a: string;
}

export interface GuideRow {
  id: string;
  key: string;
  locale: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  faq: unknown;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const guidePath = (slug: string) => `/guides/${slug}`;

/** Language-prefixed site path (az = root). */
export const localizedPath = (path: string, lng: SeoLocale) => (lng === 'az' ? path : `/${lng}${path === '/' ? '' : path}`);

export const parseFaq = (v: unknown): GuideFaq[] =>
  Array.isArray(v)
    ? v
        .filter((f): f is { q: unknown; a: unknown } => !!f && typeof f === 'object')
        .map((f) => ({ q: typeof f.q === 'string' ? f.q.trim() : '', a: typeof f.a === 'string' ? f.a.trim() : '' }))
        .filter((f) => f.q && f.a)
    : [];

/** All published guides (cached; cleared on admin writes like the other CMS collections). */
export const getPublishedGuides = () =>
  cached('seo:guides', () =>
    prisma.guidePage.findMany({ where: { published: true }, orderBy: [{ key: 'asc' }, { locale: 'asc' }] }) as Promise<GuideRow[]>,
  );

/** locale → slug of every published language version of a guide key. */
export const guideAlternates = (guides: GuideRow[], key: string): Partial<Record<SeoLocale, string>> =>
  Object.fromEntries(guides.filter((g) => g.key === key && (SEO_LOCALES as readonly string[]).includes(g.locale)).map((g) => [g.locale, g.slug]));

export const findGuide = (guides: GuideRow[], lng: SeoLocale, slug: string) => guides.find((g) => g.locale === lng && g.slug === slug) ?? null;

/** Guides listed for a language: its own versions, plus the English version of keys missing in it. */
export const guidesFor = (guides: GuideRow[], lng: SeoLocale) => {
  const own = guides.filter((g) => g.locale === lng);
  const keys = new Set(own.map((g) => g.key));
  const fallback = guides.filter((g) => g.locale === 'en' && !keys.has(g.key));
  return [...own, ...fallback];
};

export interface RenderedGuide {
  key: string;
  locale: string;
  slug: string;
  title: string;
  description: string;
  html: string;
  toc: TocEntry[];
  faq: GuideFaq[];
  updatedAt: string;
  createdAt: string;
  /** locale → path of each language version (for the language switcher and hreflang). */
  alternates: Partial<Record<SeoLocale, string>>;
  related: { key: string; slug: string; title: string; description: string; path: string }[];
}

/** A guide rendered for its own language (links localised, other guides resolved to that language). */
export const renderGuide = (guides: GuideRow[], g: GuideRow): RenderedGuide => {
  const lng = g.locale as SeoLocale;
  const inLang = guidesFor(guides, lng);
  const { html, toc } = renderGuideMarkdown(g.body, {
    localize: (p) => localizedPath(p, lng),
    guideHref: (key) => {
      const target = inLang.find((x) => x.key === key);
      return target ? localizedPath(guidePath(target.slug), target.locale as SeoLocale) : null;
    },
  });
  const alt = guideAlternates(guides, g.key);
  return {
    key: g.key,
    locale: g.locale,
    slug: g.slug,
    title: g.title,
    description: g.description,
    html,
    toc,
    faq: parseFaq(g.faq),
    updatedAt: g.updatedAt.toISOString(),
    createdAt: g.createdAt.toISOString(),
    alternates: Object.fromEntries(Object.entries(alt).map(([l, slug]) => [l, localizedPath(guidePath(slug!), l as SeoLocale)])),
    related: inLang
      .filter((x) => x.key !== g.key)
      .slice(0, 4)
      .map((x) => ({ key: x.key, slug: x.slug, title: x.title, description: x.description, path: localizedPath(guidePath(x.slug), x.locale as SeoLocale) })),
  };
};
