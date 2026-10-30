import { prisma } from '../db.js';
import { config } from '../config.js';
import { cached } from './cache.js';
import {
  GENERIC_META,
  PRIVATE_PREFIXES,
  PREFIX_LOCALES,
  SECTION_OF,
  SEO_LOCALES,
  SITE_NAME,
  SITEMAP_STATIC,
  STATIC_PAGES,
  textIn,
  TOOL_GROUPS,
  type L10nText,
  type SeoLocale,
} from './seoCatalogue.js';
import { publishedLandingsForSeo, type LandingSeo } from './marketing/landing.js';
import { guideAlternates, guidePath, parseFaq, type GuideRow } from './guides/service.js';
import { videoEmbedUrl } from './marketing/landing.js';
import { getCaseAiSettings } from './ai/features/caseAi/config.js';
import { compareContent, currentThresholds, type CompareThresholds } from './compare/visaCompare.js';
import { occupationByCode } from './jobFeeds/occupations.js';
import { vacancyImagesOf } from './vacancyImages.js';

/*
 * SEO for a client-rendered SPA.
 *
 * Language/URL strategy:
 *   - Azerbaijani lives at the root (/visas) and is also the x-default; every other language has a path
 *     prefix: /de/visas, /en/visas, /ru/visas, /tr/visas, /uk/visas. Old ?lng=xx links are 301-redirected to
 *     the prefixed URL by Caddy (deploy/Caddyfile); a ?lng= that still reaches us is treated as that language.
 *   - Every URL is its own canonical (self-referencing canonicals are what hreflang requires).
 *   - hreflang alternates on every indexable page: az (= x-default, the root URL), de, en, ru, tr, uk.
 *     Guides have their own slug per language, so their alternates point to each language's slug; landing
 *     pages exist in one language only (canonical to that language, no alternates).
 *   - CMS content exists in az/de/en/ru; Turkish and Ukrainian pages fall back to the English text.
 *   - Breadcrumb/og:url links keep the requested language so a crawler never jumps languages.
 *
 * All page data comes from a handful of cached collections (cleared on CMS writes, TTL 5 min), so rendering
 * the tags for a path never queries the database per request and unknown slugs cost nothing.
 */

export const DEFAULT_LOCALE: SeoLocale = 'az';
export const OG_LOCALE: Record<SeoLocale, string> = { az: 'az_AZ', de: 'de_DE', en: 'en_US', ru: 'ru_RU', tr: 'tr_TR', uk: 'uk_UA' };
const TITLE_MAX = 60;
const DESCRIPTION_MAX = 155;

export const siteOrigin = () => new URL(config.clientUrl).origin;

// ─── small helpers ─────────────────────────────────────────────────────

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * JSON for a <script type="application/ld+json"> block. Inside string literals, characters that could end
 * the script element, open an HTML comment or a template action are \u-escaped, so nothing in the data can
 * break out of the block (JSON.parse still returns the original text).
 */
export const safeJsonLd = (data: unknown) =>
  JSON.stringify(data).replace(/"(?:[^"\\]|\\.)*"/g, (lit) =>
    lit.replace(/[<>&{}\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`),
  );

export const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Shortens text on a word boundary, adding an ellipsis, so it fits `max` characters. */
export const truncate = (s: string, max: number) => {
  const text = collapse(s);
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:—–-]+$/, '')}…`;
};

/** Language fallback order for CMS content: tr / uk read English, the others the default language (az). */
const fallbackOrder = (lng: SeoLocale): string[] =>
  lng === 'tr' || lng === 'uk' ? [lng, 'en', DEFAULT_LOCALE, ...SEO_LOCALES] : [lng, DEFAULT_LOCALE, ...SEO_LOCALES];

/** Reads one language from an L10n JSON value, falling back (tr/uk → en, others → az), then any language. */
export const pick = (value: unknown, lng: SeoLocale): string => {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const v = value as Record<string, unknown>;
  for (const key of fallbackOrder(lng)) {
    if (typeof v[key] === 'string' && (v[key] as string).trim()) return v[key] as string;
  }
  return '';
};

export const pickList = (value: unknown, lng: SeoLocale): string[] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const v = value as Record<string, unknown>;
  for (const key of fallbackOrder(lng)) {
    const list = v[key];
    if (Array.isArray(list) && list.length) return list.filter((x): x is string => typeof x === 'string' && !!x.trim());
  }
  return [];
};

export const pageTitle = (title: string) => {
  const suffix = ` | ${SITE_NAME}`;
  return `${truncate(title, TITLE_MAX - suffix.length)}${suffix}`;
};

/** A hand-written SEO title is used as is (no site-name suffix), only shortened to fit. */
const fullTitle = (title: string) => truncate(title, TITLE_MAX);

/** Absolute image URL for og:image / JSON-LD, or null for data: URIs and other unusable values. */
export const absoluteImage = (src: string | null | undefined) => {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith('/') && !src.startsWith('//')) return siteOrigin() + src;
  return null;
};

const isHttpUrl = (s: unknown): s is string => typeof s === 'string' && /^https?:\/\/[^\s]+$/i.test(s);

// ─── input normalisation ──────────────────────────────────────────────

/** Normalises the `path` query value: absolute, no query/hash, single slashes, no trailing slash. */
export const normalizePath = (raw: unknown): string => {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.length > 512) return '/';
  let p = raw.split(/[?#]/)[0];
  try {
    p = decodeURIComponent(p);
  } catch {
    /* keep as is */
  }
  p = p.replace(/\/{2,}/g, '/');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
};

export const parseLocale = (raw: unknown): SeoLocale | null =>
  typeof raw === 'string' && (SEO_LOCALES as readonly string[]).includes(raw) ? (raw as SeoLocale) : null;

/** "/de/visas" → { lng: 'de', path: '/visas' }; "/visas" → { lng: null, path: '/visas' }. Expects a normalised path. */
export const splitLocalePath = (path: string): { lng: SeoLocale | null; path: string } => {
  const m = /^\/([a-z]{2})(\/.*)?$/.exec(path);
  if (m && (PREFIX_LOCALES as readonly string[]).includes(m[1])) return { lng: m[1] as SeoLocale, path: m[2] || '/' };
  return { lng: null, path };
};

export const isPrivatePath = (path: string) =>
  PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

/** Site path of `path` in a language (az and null = the root, x-default). */
export const localizedPath = (path: string, lng: SeoLocale | null) =>
  !lng || lng === DEFAULT_LOCALE ? path : `/${lng}${path === '/' ? '' : path}`;

/** Absolute URL of `path` in a language (az and null = the root URL, which is also the x-default). */
export const pageUrl = (path: string, lng: SeoLocale | null) => {
  const p = localizedPath(path, lng);
  return `${siteOrigin()}${p === '/' ? '/' : encodeURI(p)}`;
};

export type OgKind = 'visas' | 'services' | 'news' | 'jobs' | 'events' | 'guides';

/** Dynamic Open Graph image (1200×630 PNG with the page title, lib/ogImage.ts). */
export const ogImageUrl = (kind: OgKind, slug: string, lng: SeoLocale) =>
  `${siteOrigin()}/og/${kind}/${lng}/${encodeURIComponent(slug)}.png`;

// ─── data ─────────────────────────────────────────────────────────────

/** SEO overrides edited in the CMS (Post / Service / VisaCategory). Optional so older fixtures stay valid. */
interface SeoOverrides {
  seoTitle?: unknown;
  seoDescription?: unknown;
  ogImage?: string | null;
  noindex?: boolean;
}

export interface SeoData {
  visas: ({
    slug: string;
    title: unknown;
    summary: unknown;
    image: string;
    updatedAt: Date;
    visaLabel?: string;
    body?: unknown;
    items?: unknown;
    requirements?: unknown;
    documents?: unknown;
    faq?: unknown;
  } & SeoOverrides)[];
  services: ({
    slug: string;
    title: unknown;
    summary: unknown;
    image: string;
    updatedAt: Date;
    body?: unknown;
    features?: unknown;
    steps?: unknown;
    /** all | company | candidate (audience pages /for-workers, /for-employers). Optional for older fixtures. */
    audience?: string;
  } & SeoOverrides)[];
  posts: ({ slug: string; title: unknown; excerpt: unknown; cover: string; publishedAt: Date; updatedAt: Date; body?: unknown } & SeoOverrides)[];
  faqs: { question: unknown; answer: unknown }[];
  jobs: {
    slug: string;
    title: unknown;
    description: unknown;
    requirements: unknown;
    benefits: unknown;
    city: string | null;
    employmentType: string;
    salaryMin: number | null;
    salaryMax: number | null;
    positions: number;
    showCompany: boolean;
    publishedAt: Date | null;
    closesAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    company: { name: string; website: string | null } | null;
    /** Optional so older fixtures stay valid: Google for Jobs extras (experience, KldB code, postal code). */
    minExperience?: number | null;
    distribution?: { occupationCode: string | null; postalCode: string | null } | null;
    /** Cover + gallery photos ([{ url, alt? }], lib/vacancyImages.ts); optional for older fixtures. */
    images?: unknown;
  }[];
  settings: Record<string, unknown>;
  rating: { count: number; average: number } | null;
  /** Upcoming published info sessions / webinars (/events/:slug). Optional so older fixtures stay valid. */
  events?: {
    slug: string;
    title: unknown;
    description: unknown;
    mode: string;
    address: string | null;
    startsAt: Date;
    endsAt: Date;
    language: string;
    updatedAt: Date;
  }[];
  /** Published landing pages (/l/:slug, lib/marketing/landing.ts). Optional so older fixtures stay valid. */
  landings?: LandingSeo[];
  /** Published topic guides (/guides/:slug, every language with its own slug). Optional for older fixtures. */
  guides?: GuideRow[];
  /** Published success stories (/stories: VideoObject JSON-LD for the video ones). Optional for older fixtures. */
  testimonials?: { id: string; quote: unknown; author: unknown; role: unknown; kind: string; videoUrl: string | null; posterUrl: string | null; profession: string | null; country: string | null; city: string | null; visaType: string | null }[];
  /** Published e-book lead magnets (/ebook/:slug). Optional for older fixtures. */
  leadMagnets?: { slug: string; title: unknown; description: unknown; coverUrl: string | null; updatedAt: Date }[];
  /** Blue Card / 45+ thresholds of the current year (/compare-visas FAQ). Optional for older fixtures. */
  compareThresholds?: CompareThresholds;
  /** Published service packages (/packages: Offer JSON-LD, crawlable body). Optional for older fixtures. */
  packages?: { slug: string; tier: string; title: unknown; summary: unknown; features: unknown; priceCents: number; currency: string; updatedAt: Date }[];
}

const SEO_FIELDS = { seoTitle: true, seoDescription: true, ogImage: true, noindex: true } as const;

const loadSeoData = async (): Promise<SeoData> => {
  const now = new Date();
  const [visas, services, posts, faqs, jobs, settings, rating, events, guides] = await Promise.all([
    prisma.visaCategory.findMany({
      where: { published: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        slug: true,
        title: true,
        summary: true,
        image: true,
        updatedAt: true,
        visaLabel: true,
        body: true,
        items: true,
        requirements: true,
        documents: true,
        faq: true,
        ...SEO_FIELDS,
      },
    }),
    prisma.service.findMany({
      where: { published: true },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, title: true, summary: true, image: true, updatedAt: true, body: true, features: true, steps: true, audience: true, ...SEO_FIELDS },
    }),
    prisma.post.findMany({
      where: { published: true },
      orderBy: { publishedAt: 'desc' },
      select: { slug: true, title: true, excerpt: true, cover: true, publishedAt: true, updatedAt: true, body: true, ...SEO_FIELDS },
    }),
    prisma.faq.findMany({ where: { published: true }, orderBy: { sortOrder: 'asc' }, select: { question: true, answer: true } }),
    prisma.vacancy.findMany({
      where: {
        status: 'OPEN',
        OR: [{ publishedAt: null }, { publishedAt: { lte: now } }],
        AND: [{ OR: [{ closesAt: null }, { closesAt: { gt: now } }] }],
      },
      orderBy: { publishedAt: 'desc' },
      take: 2000,
      select: {
        slug: true,
        title: true,
        description: true,
        requirements: true,
        benefits: true,
        city: true,
        employmentType: true,
        salaryMin: true,
        salaryMax: true,
        positions: true,
        showCompany: true,
        publishedAt: true,
        closesAt: true,
        createdAt: true,
        updatedAt: true,
        company: { select: { name: true, website: true } },
        minExperience: true,
        distribution: { select: { occupationCode: true, postalCode: true } }, // job feeds (lib/jobFeeds)
        images: true, // cover = first (lib/vacancyImages.ts)
      },
    }),
    prisma.setting.findMany({ where: { key: { in: ['contact', 'social', 'legal', 'analytics'] } } }),
    prisma.review.aggregate({
      where: { status: 'APPROVED', consentPublish: true, rating: { not: null } },
      _count: { rating: true },
      _avg: { rating: true },
    }),
    prisma.infoEvent.findMany({
      where: { status: 'PUBLISHED', endsAt: { gt: now } },
      orderBy: { startsAt: 'asc' },
      take: 200,
      select: { slug: true, title: true, description: true, mode: true, address: true, startsAt: true, endsAt: true, language: true, updatedAt: true },
    }),
    prisma.guidePage.findMany({ where: { published: true }, orderBy: [{ key: 'asc' }, { locale: 'asc' }] }),
  ]);
  const [testimonials, leadMagnets, caseAi, packages] = await Promise.all([
    prisma.testimonial.findMany({
      where: { published: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, quote: true, author: true, role: true, kind: true, videoUrl: true, posterUrl: true, profession: true, country: true, city: true, visaType: true },
    }),
    prisma.leadMagnet.findMany({ where: { published: true }, orderBy: { createdAt: 'asc' }, select: { slug: true, title: true, description: true, coverUrl: true, updatedAt: true } }),
    getCaseAiSettings(),
    // Service packages (/packages): cards, Offer JSON-LD, crawlable body.
    prisma.servicePackage.findMany({ where: { published: true }, orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }], select: { slug: true, tier: true, title: true, summary: true, features: true, priceCents: true, currency: true, updatedAt: true } }),
  ]);
  const count = rating._count.rating;
  return {
    visas,
    services,
    posts,
    faqs,
    jobs,
    events,
    guides,
    testimonials,
    leadMagnets,
    packages,
    compareThresholds: currentThresholds(caseAi),
    landings: await publishedLandingsForSeo(),
    settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
    rating: count >= 3 && rating._avg.rating != null ? { count, average: Math.round(rating._avg.rating * 10) / 10 } : null,
  };
};

export const getSeoData = () => cached('seo:data', loadSeoData);

/** Open jobs whose closing date has not passed (the cached list may be up to a few minutes old). */
export const liveJobs = (data: SeoData) => {
  const now = Date.now();
  return data.jobs.filter((j) => !j.closesAt || j.closesAt.getTime() > now);
};

/** Indexable CMS items (the editor can mark a single item noindex). */
export const indexable = <T extends { noindex?: boolean }>(items: T[]) => items.filter((i) => !i.noindex);

// ─── page resolution ──────────────────────────────────────────────────

interface Crumb {
  name: string;
  path: string;
}

export interface ResolvedPage {
  title: string;
  description: string;
  index: boolean;
  image: string | null;
  /** og:image when `image` is empty: the generated title card of this page. */
  ogCard?: { kind: OgKind; slug: string } | null;
  ogType: 'website' | 'article';
  crumbs: Crumb[];
  jsonLd: unknown[];
  extraMeta: [string, string][]; // [property, content]
  /**
   * Language versions of this page. undefined = the same path in every language; an object = locale → path
   * (guides: one slug per language); null = one language only (landing pages: no hreflang).
   */
  alternates?: Partial<Record<SeoLocale, string>> | null;
  /** Language of the canonical URL when it differs from the requested one (single-language pages). */
  canonicalLng?: SeoLocale;
}

const staticName = (path: string, lng: SeoLocale) => (STATIC_PAGES[path] ? textIn(STATIC_PAGES[path].name, lng) : '');

const organizationId = () => `${siteOrigin()}/#organization`;

const asRecord = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

const SERVED_COUNTRIES = ['Azerbaijan', 'Türkiye', 'Ukraine', 'Germany'];

export const organizationLd = (data: SeoData, lng: SeoLocale) => {
  const origin = siteOrigin();
  const contact = asRecord(data.settings.contact);
  const social = asRecord(data.settings.social);
  const legal = asRecord(data.settings.legal);
  const phone = typeof contact.phone === 'string' ? contact.phone : undefined;
  const email = typeof contact.email === 'string' ? contact.email : undefined;
  const offices = Array.isArray(contact.offices) ? (contact.offices as Record<string, unknown>[]) : [];
  const legalName = [legal.companyName, legal.legalName, legal.name].find((v): v is string => typeof v === 'string' && !!v.trim());
  const org: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': organizationId(),
    name: SITE_NAME,
    ...(legalName ? { legalName } : {}),
    url: `${origin}/`,
    logo: { '@type': 'ImageObject', url: `${origin}/logo-512.png`, width: 512, height: 512 },
    image: `${origin}/og-default.png`,
    description: textIn(GENERIC_META.description, lng),
    ...(email ? { email } : {}),
    ...(phone ? { telephone: phone } : {}),
    areaServed: SERVED_COUNTRIES.map((name) => ({ '@type': 'Country', name })),
    knowsLanguage: [...SEO_LOCALES],
  };
  if (phone || email) {
    org.contactPoint = [
      {
        '@type': 'ContactPoint',
        contactType: 'customer service',
        ...(phone ? { telephone: phone } : {}),
        ...(email ? { email } : {}),
        availableLanguage: ['Azerbaijani', 'German', 'English', 'Russian', 'Turkish', 'Ukrainian'],
      },
    ];
  }
  const addresses = offices
    .filter((o) => typeof o?.address === 'string')
    .map((o) => ({
      '@type': 'PostalAddress',
      streetAddress: o.address as string,
      ...(pick(o.city, 'en') ? { addressLocality: pick(o.city, lng) } : {}),
    }));
  if (addresses.length) org.address = addresses;
  const sameAs = Object.values(social).filter(isHttpUrl);
  if (sameAs.length) org.sameAs = sameAs;
  if (data.rating) {
    org.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: data.rating.average,
      reviewCount: data.rating.count,
      bestRating: 5,
      worstRating: 1,
    };
  }
  return org;
};

const DAY_NAMES: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** "Mon – Fri, 09:00 – 18:00" (the English contact.hours text) → OpeningHoursSpecification, or null. */
export const parseOpeningHours = (text: string) => {
  const days = /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s*[–—-]\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*/i.exec(text);
  const time = /(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/.exec(text);
  if (!days || !time) return null;
  const from = DAY_ORDER.indexOf(days[1].toLowerCase());
  const to = DAY_ORDER.indexOf(days[2].toLowerCase());
  if (from < 0 || to < from) return null;
  const hm = (h: string, m: string) => `${h.padStart(2, '0')}:${m}`;
  return {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: DAY_ORDER.slice(from, to + 1).map((d) => DAY_NAMES[d]),
    opens: hm(time[1], time[2]),
    closes: hm(time[3], time[4]),
  };
};

const COUNTRY_BY_CITY: Record<string, string> = { baku: 'AZ', ganja: 'AZ', sumgait: 'AZ', istanbul: 'TR', ankara: 'TR', izmir: 'TR', kyiv: 'UA', lviv: 'UA' };

/** One ProfessionalService (a LocalBusiness) per office from the contact settings: NAP, geo, hours, sameAs. */
export const localBusinessLd = (data: SeoData, lng: SeoLocale) => {
  const origin = siteOrigin();
  const contact = asRecord(data.settings.contact);
  const social = asRecord(data.settings.social);
  const phone = typeof contact.phone === 'string' ? contact.phone : undefined;
  const email = typeof contact.email === 'string' ? contact.email : undefined;
  const hours = parseOpeningHours(pick(contact.hours, 'en'));
  const sameAs = Object.values(social).filter(isHttpUrl);
  const offices = (Array.isArray(contact.offices) ? (contact.offices as Record<string, unknown>[]) : []).filter(
    (o) => typeof o?.address === 'string' && (o.address as string).trim(),
  );
  return offices.map((o, i) => {
    const cityEn = pick(o.city, 'en');
    const country = COUNTRY_BY_CITY[cityEn.toLowerCase()] ?? (/\b\d{5}\b/.test(String(o.address)) ? 'DE' : undefined);
    const lat = typeof o.lat === 'number' ? o.lat : null;
    const lon = typeof o.lng === 'number' ? o.lng : null;
    return {
      '@context': 'https://schema.org',
      '@type': 'ProfessionalService',
      '@id': `${origin}/#office-${i + 1}`,
      name: cityEn ? `${SITE_NAME} — ${pick(o.city, lng)}` : SITE_NAME,
      url: pageUrl('/contact', lng),
      image: `${origin}/og-default.png`,
      logo: `${origin}/logo-512.png`,
      description: textIn(GENERIC_META.description, lng),
      ...(phone ? { telephone: phone } : {}),
      ...(email ? { email } : {}),
      address: {
        '@type': 'PostalAddress',
        streetAddress: collapse(String(o.address)),
        ...(cityEn ? { addressLocality: cityEn } : {}),
        ...(country ? { addressCountry: country } : {}),
      },
      ...(lat != null && lon != null ? { geo: { '@type': 'GeoCoordinates', latitude: lat, longitude: lon } } : {}),
      ...(hours ? { openingHoursSpecification: [hours] } : {}),
      ...(sameAs.length ? { sameAs } : {}),
      areaServed: SERVED_COUNTRIES.map((name) => ({ '@type': 'Country', name })),
      knowsLanguage: [...SEO_LOCALES],
      parentOrganization: { '@id': organizationId() },
      ...(data.rating
        ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: data.rating.average, reviewCount: data.rating.count, bestRating: 5, worstRating: 1 } }
        : {}),
    };
  });
};

const EMPLOYMENT_TYPE: Record<string, string | string[]> = {
  FULL_TIME: 'FULL_TIME',
  PART_TIME: 'PART_TIME',
  SEASONAL: 'TEMPORARY',
  // A dual apprenticeship is full-time paid training; Google has no dedicated value for it.
  AUSBILDUNG: ['FULL_TIME', 'OTHER'],
};

/** Plain text (paragraphs separated by blank lines) → minimal escaped HTML for JobPosting.description. */
export const textToHtml = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

const listHtml = (heading: string, items: string[]) =>
  items.length ? `<p><strong>${escapeHtml(heading)}</strong></p><ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '';

export const JOB_LABELS: Record<SeoLocale, { requirements: string; benefits: string }> = {
  az: { requirements: 'Tələblər', benefits: 'Üstünlüklər' },
  de: { requirements: 'Anforderungen', benefits: 'Wir bieten' },
  en: { requirements: 'Requirements', benefits: 'Benefits' },
  ru: { requirements: 'Требования', benefits: 'Мы предлагаем' },
  tr: { requirements: 'Aranan nitelikler', benefits: 'Sunduklarımız' },
  uk: { requirements: 'Вимоги', benefits: 'Ми пропонуємо' },
};

/** Absolute URLs of a vacancy's photos (cover first). */
export const jobImageUrls = (job: { images?: unknown }) =>
  vacancyImagesOf(job.images)
    .map((i) => absoluteImage(i.url))
    .filter((u): u is string => !!u);

export const jobPostingLd = (job: SeoData['jobs'][number], lng: SeoLocale, url: string) => {
  const origin = siteOrigin();
  const title = collapse(pick(job.title, lng));
  const description =
    textToHtml(pick(job.description, lng)) +
    listHtml(JOB_LABELS[lng].requirements, pickList(job.requirements, lng)) +
    listHtml(JOB_LABELS[lng].benefits, pickList(job.benefits, lng));
  const hiringOrganization =
    job.showCompany && job.company?.name
      ? {
          '@type': 'Organization',
          name: job.company.name,
          ...(isHttpUrl(job.company.website) ? { sameAs: job.company.website } : {}),
        }
      : { '@type': 'Organization', name: SITE_NAME, sameAs: `${origin}/`, logo: `${origin}/logo-512.png` };
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title,
    description: description || `<p>${escapeHtml(title)}</p>`,
    identifier: { '@type': 'PropertyValue', name: SITE_NAME, value: job.slug },
    datePosted: (job.publishedAt ?? job.createdAt).toISOString(),
    ...(job.closesAt ? { validThrough: job.closesAt.toISOString() } : {}),
    employmentType: EMPLOYMENT_TYPE[job.employmentType] ?? 'OTHER',
    hiringOrganization,
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        ...(job.city ? { addressLocality: job.city } : {}),
        ...(job.distribution?.postalCode ? { postalCode: job.distribution.postalCode } : {}),
        addressCountry: 'DE',
      },
    },
    directApply: true,
    totalJobOpenings: job.positions,
    url,
    inLanguage: lng,
  };
  // Cover + gallery photos (absolute URLs) when the vacancy has any.
  const images = jobImageUrls(job);
  if (images.length) ld.image = images;
  // KldB 2010 occupation code (vacancy distribution settings, lib/jobFeeds) as the occupational category.
  const occupationCode = job.distribution?.occupationCode;
  if (occupationCode) {
    const occupation = occupationByCode(occupationCode);
    ld.occupationalCategory = occupation ? `${occupation.code} ${occupation.de}` : occupationCode;
  }
  if (job.minExperience != null && job.minExperience > 0) {
    ld.experienceRequirements = { '@type': 'OccupationalExperienceRequirements', monthsOfExperience: job.minExperience * 12 };
  }
  if (job.salaryMin != null || job.salaryMax != null) {
    const min = job.salaryMin ?? job.salaryMax!;
    const max = job.salaryMax ?? job.salaryMin!;
    ld.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: 'EUR',
      value:
        min === max
          ? { '@type': 'QuantitativeValue', value: min, unitText: 'MONTH' }
          : { '@type': 'QuantitativeValue', minValue: Math.min(min, max), maxValue: Math.max(min, max), unitText: 'MONTH' },
    };
  }
  return ld;
};

/** Pages shown under "Tools" in breadcrumbs: the tools hub's own pages (not the top-level sections it also links to). */
const TOOL_CRUMB_PAGES = new Set(TOOL_GROUPS.flatMap((g) => g.paths).filter((p) => !['/guides', '/jobs', '/visas'].includes(p)));

/** Interactive tools: WebApplication JSON-LD (free, runs in the browser). */
const TOOL_PAGES = new Set(['/chancenkarte-calculator', '/blue-card-check', '/salary-calculator', '/calculator', '/cost-calculator', '/anerkennung', '/budget']);

const faqPageLd = (items: { q: string; a: string }[], lng: SeoLocale) =>
  items.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        inLanguage: lng,
        mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      }
    : null;

const COMPARE_FALLBACK: CompareThresholds = { year: '2026', standard: 50_700, shortage: 45_934.2, olderWorker: 55_770 };

/** Release date of story videos without their own date (Testimonial has no timestamps). */
const STORY_VIDEO_DATE = '2026-10-24';

/** YouTube video id of a watch / share / embed link (for its thumbnail), else null. */
export const youtubeId = (url: string) => /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/.exec(url)?.[1] ?? null;

/** Embed URL (YouTube no-cookie / Vimeo dnt) or the site-relative MP4 of a story video, else null. */
export const storyVideo = (url: string | null | undefined): { embedUrl: string | null; contentUrl: string | null } | null => {
  if (!url) return null;
  const embed = videoEmbedUrl(url);
  if (embed) return { embedUrl: embed, contentUrl: null };
  if (/^\/uploads\/[\w.-]+\.(mp4|webm)$/i.test(url)) return { embedUrl: null, contentUrl: url };
  return null;
};

/** VideoObject JSON-LD of the published video success stories (/stories). */
export const storyVideosLd = (data: SeoData, lng: SeoLocale) =>
  (data.testimonials ?? []).flatMap((t) => {
    const video = storyVideo(t.videoUrl);
    if (!video) return [];
    const author = collapse(pick(t.author, lng));
    const role = collapse(pick(t.role, lng));
    const quote = collapse(pick(t.quote, lng));
    const yt = t.videoUrl ? youtubeId(t.videoUrl) : null;
    const thumb = absoluteImage(t.posterUrl) ?? (yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : `${siteOrigin()}/og-default.png`);
    return [
      {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: truncate([author, role || t.profession].filter(Boolean).join(' — ') || SITE_NAME, 100),
        description: truncate(quote || textIn(STATIC_PAGES['/stories'].description, lng), 300),
        thumbnailUrl: [thumb],
        uploadDate: STORY_VIDEO_DATE,
        inLanguage: lng,
        ...(video.embedUrl ? { embedUrl: video.embedUrl } : {}),
        ...(video.contentUrl ? { contentUrl: absoluteImage(video.contentUrl) } : {}),
        publisher: { '@id': organizationId() },
      },
    ];
  });

/** Title / description / image / robots of a CMS item, honouring its per-item SEO overrides. */
const withOverrides = (item: SeoOverrides & { image?: string; cover?: string }, lng: SeoLocale, name: string, fallbackDescription: string) => {
  const ownTitle = collapse(pick(item.seoTitle, lng));
  const ownDescription = collapse(pick(item.seoDescription, lng));
  return {
    title: ownTitle ? fullTitle(ownTitle) : pageTitle(name),
    description: truncate(ownDescription || fallbackDescription, DESCRIPTION_MAX),
    image: absoluteImage(item.ogImage) ?? absoluteImage(item.image ?? item.cover),
    index: !item.noindex,
  };
};

/** Published guides shown for a language (its own versions, English for keys it lacks). */
export const guidesInLanguage = (data: SeoData, lng: SeoLocale) => {
  const all = data.guides ?? [];
  const own = all.filter((g) => g.locale === lng);
  const keys = new Set(own.map((g) => g.key));
  return [...own, ...all.filter((g) => g.locale === 'en' && !keys.has(g.key))];
};

export const resolvePage = (path: string, lng: SeoLocale, data: SeoData): ResolvedPage => {
  const origin = siteOrigin();
  const url = pageUrl(path, lng);
  const generic: ResolvedPage = {
    title: textIn(GENERIC_META.title, lng),
    description: textIn(GENERIC_META.description, lng),
    index: false,
    image: null,
    ogType: 'website',
    crumbs: [],
    jsonLd: [],
    extraMeta: [],
  };
  if (isPrivatePath(path)) return generic;

  const home: Crumb = { name: staticName('/', lng), path: '/' };
  const page = STATIC_PAGES[path];
  if (page) {
    const resolved: ResolvedPage = {
      title: page.fullTitle ? textIn(page.title, lng) : pageTitle(textIn(page.title, lng)),
      description: textIn(page.description, lng),
      index: page.index !== false,
      image: null,
      ogType: 'website',
      // Calculators and checks sit under the tools hub (Home › Tools › Salary calculator), as on the page.
      crumbs: path === '/' ? [] : [home, ...(TOOL_CRUMB_PAGES.has(path) ? [{ name: staticName('/tools', lng), path: '/tools' }] : []), { name: textIn(page.name, lng), path }],
      jsonLd: [],
      extraMeta: [],
    };
    if (path === '/') {
      resolved.jsonLd.push({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        name: SITE_NAME,
        url: `${origin}/`,
        inLanguage: SEO_LOCALES,
        publisher: { '@id': organizationId() },
      });
    }
    if (path === '/' || path === '/contact') resolved.jsonLd.push(...localBusinessLd(data, lng));
    if (path === '/faq' && data.faqs.length) {
      const ld = faqPageLd(
        data.faqs.map((f) => ({ q: collapse(pick(f.question, lng)), a: pick(f.answer, lng).trim() })).filter((f) => f.q && f.a),
        lng,
      );
      if (ld) resolved.jsonLd.push(ld);
    }
    if (path === '/guides') {
      const list = guidesInLanguage(data, lng);
      if (list.length) {
        resolved.jsonLd.push({
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          itemListElement: list.map((g, i) => ({ '@type': 'ListItem', position: i + 1, name: g.title, url: pageUrl(guidePath(g.slug), g.locale as SeoLocale) })),
        });
      }
    }
    if (TOOL_PAGES.has(path)) {
      resolved.jsonLd.push({
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: textIn(page.name, lng),
        description: textIn(page.description, lng),
        url,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript',
        isAccessibleForFree: true,
        inLanguage: lng,
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'EUR' },
        provider: { '@id': organizationId() },
      });
    }
    if (path === '/compare-visas') {
      const content = compareContent(lng, data.compareThresholds ?? COMPARE_FALLBACK);
      const ld = faqPageLd(content.faq, lng);
      if (ld) resolved.jsonLd.push(ld);
    }
    if (path === '/stories') resolved.jsonLd.push(...storyVideosLd(data, lng));
    if (path === '/packages' && (data.packages ?? []).length) {
      // One Service with an OfferCatalog: each package is an Offer with its price (VAT included).
      resolved.jsonLd.push({
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: textIn(page.title, lng),
        description: textIn(page.description, lng),
        serviceType: 'Visa and relocation support',
        provider: { '@id': organizationId() },
        areaServed: SERVED_COUNTRIES.map((n) => ({ '@type': 'Country', name: n })),
        url,
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: textIn(page.name, lng),
          itemListElement: (data.packages ?? []).map((p) => ({
            '@type': 'Offer',
            name: collapse(pick(p.title, lng)),
            description: truncate(collapse(pick(p.summary, lng)), 300),
            price: (p.priceCents / 100).toFixed(2),
            priceCurrency: p.currency,
            availability: 'https://schema.org/InStock',
            url,
            itemOffered: { '@type': 'Service', name: collapse(pick(p.title, lng)), category: p.tier },
          })),
        },
      });
    }
    if (path === '/tools') {
      // The tools hub: an ItemList of every tool page (same groups and order as the page).
      const items = TOOL_GROUPS.flatMap((g) => g.paths).filter((p) => STATIC_PAGES[p]);
      resolved.jsonLd.push({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: textIn(page.title, lng),
        itemListElement: items.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: textIn(STATIC_PAGES[p].name, lng), url: pageUrl(p, lng) })),
      });
    }
    return resolved;
  }

  // E-book lead magnets: one page per e-book, text in every language (CMS fallback rules).
  const eb = /^\/ebook\/([^/]+)$/.exec(path);
  if (eb) {
    const magnet = (data.leadMagnets ?? []).find((m) => m.slug === eb[1]);
    if (!magnet) return generic;
    const name = collapse(pick(magnet.title, lng));
    return {
      title: pageTitle(name),
      description: truncate(pick(magnet.description, lng) || name, DESCRIPTION_MAX),
      index: true,
      image: absoluteImage(magnet.coverUrl),
      ogType: 'website',
      crumbs: [home, { name: staticName('/guides', lng), path: '/guides' }, { name, path }],
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'Book',
          name,
          bookFormat: 'https://schema.org/EBook',
          inLanguage: lng,
          isAccessibleForFree: true,
          url,
          ...(absoluteImage(magnet.coverUrl) ? { image: absoluteImage(magnet.coverUrl) } : {}),
          publisher: { '@id': organizationId() },
        },
      ],
      extraMeta: [],
    };
  }

  // Landing pages: written in one language, with their own SEO title / description / image.
  const lp = /^\/l\/([^/]+)$/.exec(path);
  if (lp) {
    const landing = (data.landings ?? []).find((l) => l.slug === lp[1]);
    if (!landing) return generic;
    const own = parseLocale(landing.locale);
    return {
      title: landing.seoTitle || pageTitle(landing.title),
      description: truncate(landing.seoDescription || landing.heroSubtitle || textIn(GENERIC_META.description, lng), DESCRIPTION_MAX),
      index: true,
      image: absoluteImage(landing.ogImage || landing.heroImage),
      ogType: 'website',
      crumbs: [],
      jsonLd: [],
      extraMeta: [],
      // One language only: canonical to that language's URL, no hreflang set.
      alternates: null,
      ...(own ? { canonicalLng: own } : {}),
    };
  }

  const m = /^\/(visas|services|news|jobs|events|guides)\/([^/]+)$/.exec(path);
  if (!m) return generic;
  const [, section, slug] = m;
  const sectionPath = SECTION_OF[section];
  const crumbsFor = (name: string) => [home, { name: staticName(sectionPath, lng), path: sectionPath }, { name, path }];

  if (section === 'guides') {
    const guides = data.guides ?? [];
    const guide = guides.find((g) => g.locale === lng && g.slug === slug);
    if (!guide) return generic;
    const alternates = Object.fromEntries(Object.entries(guideAlternates(guides, guide.key)).map(([l, s]) => [l, guidePath(s!)])) as Partial<
      Record<SeoLocale, string>
    >;
    const faqLd = faqPageLd(parseFaq(guide.faq), lng);
    return {
      title: guide.title.length + ` | ${SITE_NAME}`.length <= TITLE_MAX ? pageTitle(guide.title) : fullTitle(guide.title),
      description: truncate(guide.description, DESCRIPTION_MAX),
      index: true,
      image: null,
      ogCard: { kind: 'guides', slug: guide.slug },
      ogType: 'article',
      crumbs: crumbsFor(collapse(guide.title)),
      alternates,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: truncate(guide.title, 110),
          description: guide.description,
          image: [ogImageUrl('guides', guide.slug, lng)],
          datePublished: guide.createdAt.toISOString(),
          dateModified: guide.updatedAt.toISOString(),
          inLanguage: lng,
          mainEntityOfPage: { '@type': 'WebPage', '@id': url },
          author: { '@type': 'Organization', name: SITE_NAME, url: pageUrl('/about', lng) },
          publisher: { '@id': organizationId() },
        },
        ...(faqLd ? [faqLd] : []),
      ],
      extraMeta: [
        ['article:published_time', guide.createdAt.toISOString()],
        ['article:modified_time', guide.updatedAt.toISOString()],
      ],
    };
  }

  if (section === 'visas') {
    const visa = data.visas.find((v) => v.slug === slug);
    if (!visa) return generic;
    const name = collapse(pick(visa.title, lng));
    const o = withOverrides(visa, lng, name, pick(visa.summary, lng) || textIn(STATIC_PAGES['/visas'].description, lng));
    const faq = Array.isArray(visa.faq)
      ? (visa.faq as { q?: unknown; a?: unknown }[]).map((f) => ({ q: collapse(pick(f?.q, lng)), a: pick(f?.a, lng).trim() })).filter((f) => f.q && f.a)
      : [];
    const faqLd = faqPageLd(faq, lng);
    return { ...o, ogCard: { kind: 'visas', slug }, ogType: 'website', crumbs: crumbsFor(name), jsonLd: faqLd ? [faqLd] : [], extraMeta: [] };
  }

  if (section === 'services') {
    const service = data.services.find((s) => s.slug === slug);
    if (!service) return generic;
    const name = collapse(pick(service.title, lng));
    const o = withOverrides(service, lng, name, pick(service.summary, lng) || textIn(STATIC_PAGES['/services'].description, lng));
    return {
      ...o,
      ogCard: { kind: 'services', slug },
      ogType: 'website',
      crumbs: crumbsFor(name),
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'Service',
          name,
          serviceType: name,
          description: collapse(pick(service.summary, lng)) || o.description,
          url,
          ...(o.image ? { image: o.image } : {}),
          provider: { '@id': organizationId() },
          areaServed: SERVED_COUNTRIES.map((n) => ({ '@type': 'Country', name: n })),
          inLanguage: lng,
        },
      ],
      extraMeta: [],
    };
  }

  if (section === 'news') {
    const post = data.posts.find((p) => p.slug === slug);
    if (!post) return generic;
    const name = collapse(pick(post.title, lng));
    const o = withOverrides(post, lng, name, pick(post.excerpt, lng) || textIn(STATIC_PAGES['/news'].description, lng));
    const modified = post.updatedAt > post.publishedAt ? post.updatedAt : post.publishedAt;
    return {
      ...o,
      ogCard: { kind: 'news', slug },
      ogType: 'article',
      crumbs: crumbsFor(name),
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'NewsArticle',
          headline: truncate(name, 110),
          description: collapse(pick(post.excerpt, lng)) || o.description,
          image: [o.image ?? ogImageUrl('news', slug, lng)],
          datePublished: post.publishedAt.toISOString(),
          dateModified: modified.toISOString(),
          inLanguage: lng,
          mainEntityOfPage: { '@type': 'WebPage', '@id': url },
          author: { '@type': 'Organization', name: SITE_NAME, url: pageUrl('/about', lng) },
          publisher: { '@id': organizationId() },
        },
      ],
      extraMeta: [
        ['article:published_time', post.publishedAt.toISOString()],
        ['article:modified_time', modified.toISOString()],
        ['article:author', SITE_NAME],
      ],
    };
  }

  if (section === 'events') {
    const ev = (data.events ?? []).find((e) => e.slug === slug && e.endsAt.getTime() > Date.now());
    if (!ev) return generic;
    const name = collapse(pick(ev.title, lng));
    const description = truncate(pick(ev.description, lng) || textIn(STATIC_PAGES['/events'].description, lng), DESCRIPTION_MAX);
    const online = ev.mode === 'ONLINE';
    return {
      title: pageTitle(name),
      description,
      index: true,
      image: null,
      ogCard: { kind: 'events', slug },
      ogType: 'website',
      crumbs: crumbsFor(name),
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'Event',
          name,
          description,
          startDate: ev.startsAt.toISOString(),
          endDate: ev.endsAt.toISOString(),
          eventStatus: 'https://schema.org/EventScheduled',
          eventAttendanceMode: online ? 'https://schema.org/OnlineEventAttendanceMode' : 'https://schema.org/OfflineEventAttendanceMode',
          location: online
            ? { '@type': 'VirtualLocation', url }
            : { '@type': 'Place', name: SITE_NAME, address: collapse(ev.address ?? '') || 'Baku, Azerbaijan' },
          image: [ogImageUrl('events', slug, lng)],
          inLanguage: ev.language,
          isAccessibleForFree: true,
          url,
          organizer: { '@id': organizationId() },
          offers: { '@type': 'Offer', price: 0, priceCurrency: 'AZN', availability: 'https://schema.org/InStock', url },
        },
      ],
      extraMeta: [],
    };
  }

  // jobs
  const job = liveJobs(data).find((j) => j.slug === slug);
  if (!job) return generic;
  const name = collapse(pick(job.title, lng));
  const where = job.city ? `${name} — ${job.city}` : name;
  return {
    title: pageTitle(where),
    description: truncate(pick(job.description, lng) || textIn(STATIC_PAGES['/jobs'].description, lng), DESCRIPTION_MAX),
    index: true,
    // The vacancy's cover photo when it has one, else the generated card.
    image: jobImageUrls(job)[0] ?? null,
    ogCard: { kind: 'jobs', slug },
    ogType: 'website',
    crumbs: crumbsFor(name),
    jsonLd: [jobPostingLd(job, lng, url)],
    extraMeta: [],
  };
};

// ─── rendering ────────────────────────────────────────────────────────

/** The language and page path of a requested URL path (a path prefix wins over a legacy ?lng=). */
export const requestTarget = (rawPath: string, queryLng: SeoLocale | null) => {
  const { lng: prefixLng, path } = splitLocalePath(normalizePath(rawPath));
  return { path, lng: prefixLng ?? queryLng ?? DEFAULT_LOCALE };
};

export const RSS_TITLE: Record<SeoLocale, string> = {
  az: 'Triad Vision — xəbərlər və bələdçilər',
  de: 'Triad Vision — News und Ratgeber',
  en: 'Triad Vision — news and guides',
  ru: 'Triad Vision — новости и гиды',
  tr: 'Triad Vision — haberler ve rehberler',
  uk: 'Triad Vision — новини та посібники',
};

/** RSS feed URL of a language (/rss.xml for az, /de/rss.xml …). */
export const rssUrl = (lng: SeoLocale) => `${siteOrigin()}${localizedPath('/rss.xml', lng)}`;

/**
 * The head tags for one page, as an HTML fragment. Every tag carries `data-seo` so the SPA can replace
 * them on navigation. `rawPath` is the URL path including any language prefix (/de/visas); `queryLng` a
 * legacy ?lng= value (only used when the path has no prefix).
 */
export const renderHead = (rawPath: string, queryLng: SeoLocale | null, data: SeoData) => {
  const { path, lng } = requestTarget(rawPath, queryLng);
  const page = resolvePage(path, lng, data);
  const origin = siteOrigin();
  const url = pageUrl(path, page.canonicalLng ?? lng);
  const image = page.image ?? (page.ogCard ? ogImageUrl(page.ogCard.kind, page.ogCard.slug, lng) : `${origin}/og-default.png`);
  const a = escapeHtml;
  const out: string[] = [];
  const meta = (attr: 'name' | 'property', key: string, content: string) =>
    out.push(`<meta data-seo ${attr}="${a(key)}" content="${a(content)}">`);

  out.push(`<title data-seo>${a(page.title)}</title>`);
  meta('name', 'description', page.description);
  meta('name', 'robots', page.index ? 'index, follow, max-image-preview:large' : 'noindex, nofollow');
  if (page.index) {
    out.push(`<link data-seo rel="canonical" href="${a(url)}">`);
    if (page.alternates === undefined) {
      for (const l of SEO_LOCALES) out.push(`<link data-seo rel="alternate" hreflang="${l}" href="${a(pageUrl(path, l))}">`);
      out.push(`<link data-seo rel="alternate" hreflang="x-default" href="${a(pageUrl(path, null))}">`);
    } else if (page.alternates) {
      const alts = page.alternates;
      for (const l of SEO_LOCALES) if (alts[l]) out.push(`<link data-seo rel="alternate" hreflang="${l}" href="${a(pageUrl(alts[l]!, l))}">`);
      const xd = alts.az ? pageUrl(alts.az, 'az') : alts.en ? pageUrl(alts.en, 'en') : null;
      if (xd) out.push(`<link data-seo rel="alternate" hreflang="x-default" href="${a(xd)}">`);
    }
    out.push(`<link data-seo rel="alternate" type="application/rss+xml" title="${a(RSS_TITLE[lng])}" href="${a(rssUrl(lng))}">`);
  }
  meta('property', 'og:site_name', SITE_NAME);
  meta('property', 'og:type', page.ogType);
  meta('property', 'og:title', page.title);
  meta('property', 'og:description', page.description);
  meta('property', 'og:url', url);
  meta('property', 'og:image', image);
  if (!page.image) {
    meta('property', 'og:image:width', '1200');
    meta('property', 'og:image:height', '630');
    meta('property', 'og:image:alt', page.ogCard ? page.title : 'Triad Vision — Germany: work, visas, family');
  }
  meta('property', 'og:locale', OG_LOCALE[lng]);
  for (const l of SEO_LOCALES) if (l !== lng) meta('property', 'og:locale:alternate', OG_LOCALE[l]);
  for (const [k, v] of page.extraMeta) meta('property', k, v);
  meta('name', 'twitter:card', 'summary_large_image');
  meta('name', 'twitter:title', page.title);
  meta('name', 'twitter:description', page.description);
  meta('name', 'twitter:image', image);

  const blocks: unknown[] = [organizationLd(data, lng)];
  if (page.index) {
    if (page.crumbs.length) {
      blocks.push({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: page.crumbs.map((c, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: c.name,
          item: pageUrl(c.path, lng),
        })),
      });
    }
    blocks.push(...page.jsonLd);
  }
  for (const b of blocks) out.push(`<script data-seo type="application/ld+json">${safeJsonLd(b)}</script>`);
  return out.join('\n');
};

// ─── robots.txt / sitemaps / RSS ──────────────────────────────────────

const ROBOTS_EXACT = new Set(['/partner', '/q', '/share', '/agent']);

export const renderRobots = () =>
  [
    'User-agent: *',
    'Allow: /',
    // robots.txt rules are plain prefixes: "/partner" would also block the public /partners page, so prefixes
    // that start a public path are written as "/partner$" + "/partner/".
    ...PRIVATE_PREFIXES.flatMap((p) =>
      p === '/api' ? ['Disallow: /api/'] : ROBOTS_EXACT.has(p) ? [`Disallow: ${p}$`, `Disallow: ${p}/`] : [`Disallow: ${p}`],
    ),
    'Disallow: /__seo/',
    '',
    `Sitemap: ${siteOrigin()}/sitemap.xml`,
    '',
  ].join('\n');

export const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

/** Content release date of the hand-written static pages (bump when their text changes). */
const STATIC_LASTMOD = new Date('2026-10-24T00:00:00.000Z');

const latest = (dates: Date[], fallback = STATIC_LASTMOD) =>
  dates.reduce((max, d) => (d.getTime() > max.getTime() ? d : max), fallback);

/** Child sitemaps of /sitemap.xml (/sitemaps/<group>.xml). */
export const SITEMAP_GROUPS = ['pages', 'content', 'guides', 'jobs', 'events', 'landing'] as const;
export type SitemapGroup = (typeof SITEMAP_GROUPS)[number];

interface SitemapUrl {
  loc: string;
  lastmod: Date;
  /** [hreflang, href] (empty for single-language pages). */
  alternates: [string, string][];
  images: { loc: string; title: string }[];
}

/** One <url> per language version, each listing the full set of language alternates (+ x-default). */
const allLanguages = (path: string, lastmod: Date, image?: { src: string | null | undefined; title: (l: SeoLocale) => string }): SitemapUrl[] => {
  const alternates: [string, string][] = [...SEO_LOCALES.map((l): [string, string] => [l, pageUrl(path, l)]), ['x-default', pageUrl(path, null)]];
  const img = absoluteImage(image?.src);
  return SEO_LOCALES.map((l) => ({
    loc: pageUrl(path, l),
    lastmod,
    alternates,
    images: img && image ? [{ loc: img, title: image.title(l) }] : [],
  }));
};

export const sitemapUrls = (data: SeoData, group: SitemapGroup): SitemapUrl[] => {
  const jobs = liveJobs(data);
  const visas = indexable(data.visas);
  const services = indexable(data.services);
  const posts = indexable(data.posts);
  switch (group) {
    case 'pages': {
      const sectionLastmod: Record<string, Date> = {
        '/visas': latest(visas.map((v) => v.updatedAt)),
        '/services': latest(services.map((s) => s.updatedAt)),
        '/news': latest(posts.map((p) => p.updatedAt)),
        '/jobs': latest(jobs.map((j) => j.updatedAt)),
        '/events': latest((data.events ?? []).map((e) => e.updatedAt)),
        '/guides': latest((data.guides ?? []).map((g) => g.updatedAt)),
        '/packages': latest((data.packages ?? []).map((p) => p.updatedAt)),
      };
      return SITEMAP_STATIC.flatMap((path) =>
        allLanguages(path, path === '/' ? latest(Object.values(sectionLastmod)) : (sectionLastmod[path] ?? STATIC_LASTMOD)),
      );
    }
    case 'content':
      return [
        ...visas.flatMap((v) => allLanguages(`/visas/${v.slug}`, v.updatedAt, { src: v.ogImage || v.image, title: (l) => collapse(pick(v.title, l)) })),
        ...services.flatMap((s) => allLanguages(`/services/${s.slug}`, s.updatedAt, { src: s.ogImage || s.image, title: (l) => collapse(pick(s.title, l)) })),
        ...posts.flatMap((p) => allLanguages(`/news/${p.slug}`, p.updatedAt, { src: p.ogImage || p.cover, title: (l) => collapse(pick(p.title, l)) })),
        ...(data.leadMagnets ?? []).flatMap((m) => allLanguages(`/ebook/${m.slug}`, m.updatedAt, { src: m.coverUrl, title: (l) => collapse(pick(m.title, l)) })),
      ];
    case 'guides': {
      const guides = data.guides ?? [];
      return guides
        .filter((g) => parseLocale(g.locale))
        .map((g) => {
          const alt = guideAlternates(guides, g.key);
          const alternates: [string, string][] = SEO_LOCALES.filter((l) => alt[l]).map((l): [string, string] => [l, pageUrl(guidePath(alt[l]!), l)]);
          const xd = alt.az ? pageUrl(guidePath(alt.az), 'az') : alt.en ? pageUrl(guidePath(alt.en), 'en') : null;
          if (xd) alternates.push(['x-default', xd]);
          return { loc: pageUrl(guidePath(g.slug), g.locale as SeoLocale), lastmod: g.updatedAt, alternates, images: [] };
        });
    }
    case 'jobs':
      return jobs.flatMap((j) => allLanguages(`/jobs/${j.slug}`, j.updatedAt, { src: vacancyImagesOf(j.images)[0]?.url, title: (l) => collapse(pick(j.title, l)) }));
    case 'events':
      return (data.events ?? []).flatMap((e) => allLanguages(`/events/${e.slug}`, e.updatedAt));
    case 'landing':
      return (data.landings ?? []).map((l) => {
        const img = absoluteImage(l.ogImage || l.heroImage);
        return { loc: pageUrl(`/l/${l.slug}`, parseLocale(l.locale)), lastmod: l.updatedAt, alternates: [], images: img ? [{ loc: img, title: l.title }] : [] };
      });
  }
};

const urlsetXml = (urls: SitemapUrl[]) => {
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
  ];
  for (const u of urls) {
    out.push('  <url>', `    <loc>${escapeXml(u.loc)}</loc>`, `    <lastmod>${u.lastmod.toISOString()}</lastmod>`);
    for (const [hreflang, href] of u.alternates) out.push(`    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${escapeXml(href)}"/>`);
    for (const img of u.images) {
      out.push('    <image:image>', `      <image:loc>${escapeXml(img.loc)}</image:loc>`);
      if (img.title) out.push(`      <image:title>${escapeXml(img.title)}</image:title>`);
      out.push('    </image:image>');
    }
    out.push('  </url>');
  }
  out.push('</urlset>', '');
  return out.join('\n');
};

/** One child sitemap (/sitemaps/<group>.xml). */
export const renderSitemapGroup = (data: SeoData, group: SitemapGroup) => urlsetXml(sitemapUrls(data, group));

/** Every URL of every group in one urlset (tests, debugging). */
export const renderSitemap = (data: SeoData) => urlsetXml(SITEMAP_GROUPS.flatMap((g) => sitemapUrls(data, g)));

/** /sitemap.xml: the index of the child sitemaps that have URLs (pages always). */
export const renderSitemapIndex = (data: SeoData) => {
  const origin = siteOrigin();
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
  for (const g of SITEMAP_GROUPS) {
    const urls = sitemapUrls(data, g);
    if (!urls.length && g !== 'pages') continue;
    out.push('  <sitemap>', `    <loc>${origin}/sitemaps/${g}.xml</loc>`, `    <lastmod>${latest(urls.map((u) => u.lastmod)).toISOString()}</lastmod>`, '  </sitemap>');
  }
  out.push('</sitemapindex>', '');
  return out.join('\n');
};

export const getSitemap = () => cached('seo:sitemap', async () => renderSitemapIndex(await getSeoData()));
export const getSitemapGroup = (group: SitemapGroup) => cached(`seo:sitemap:${group}`, async () => renderSitemapGroup(await getSeoData(), group));

/** RSS 2.0 feed of the news posts and topic guides in one language (CMS text falls back like the pages). */
export const renderRss = (data: SeoData, lng: SeoLocale) => {
  const now = Date.now();
  const NEWS = textIn(STATIC_PAGES['/news'].name, lng);
  const GUIDES = STATIC_PAGES['/guides'] ? textIn(STATIC_PAGES['/guides'].name, lng) : 'Guides';
  const items: { title: string; link: string; description: string; date: Date; category: string }[] = [];
  for (const p of indexable(data.posts).filter((x) => x.publishedAt.getTime() <= now).slice(0, 50)) {
    items.push({
      title: collapse(pick(p.title, lng)),
      link: pageUrl(`/news/${p.slug}`, lng),
      description: collapse(pick(p.excerpt, lng)),
      date: p.publishedAt,
      category: NEWS,
    });
  }
  for (const g of guidesInLanguage(data, lng)) {
    items.push({ title: g.title, link: pageUrl(guidePath(g.slug), g.locale as SeoLocale), description: g.description, date: g.updatedAt, category: GUIDES });
  }
  items.sort((x, y) => y.date.getTime() - x.date.getTime());
  const self = rssUrl(lng);
  const news = pageUrl('/news', lng);
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    `  <title>${escapeXml(RSS_TITLE[lng])}</title>`,
    `  <link>${escapeXml(news)}</link>`,
    `  <description>${escapeXml(textIn(STATIC_PAGES['/news'].description, lng))}</description>`,
    `  <language>${lng}</language>`,
    `  <atom:link href="${escapeXml(self)}" rel="self" type="application/rss+xml"/>`,
    `  <lastBuildDate>${latest(items.map((i) => i.date)).toUTCString()}</lastBuildDate>`,
    '  <image>',
    `    <url>${siteOrigin()}/logo-512.png</url>`,
    `    <title>${escapeXml(RSS_TITLE[lng])}</title>`,
    `    <link>${escapeXml(news)}</link>`,
    '  </image>',
  ];
  for (const i of items) {
    out.push(
      '  <item>',
      `    <title>${escapeXml(i.title)}</title>`,
      `    <link>${escapeXml(i.link)}</link>`,
      `    <guid isPermaLink="true">${escapeXml(i.link)}</guid>`,
      `    <pubDate>${i.date.toUTCString()}</pubDate>`,
      `    <category>${escapeXml(i.category)}</category>`,
      `    <description>${escapeXml(i.description)}</description>`,
      '  </item>',
    );
  }
  out.push('</channel>', '</rss>', '');
  return out.join('\n');
};

export const getRss = (lng: SeoLocale) => cached(`seo:rss:${lng}`, async () => renderRss(await getSeoData(), lng));

export type { L10nText, SeoLocale };
