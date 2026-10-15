import { prisma } from '../db.js';
import { config } from '../config.js';
import { cached } from './cache.js';
import {
  GENERIC_META,
  PRIVATE_PREFIXES,
  SECTION_OF,
  SEO_LOCALES,
  SITE_NAME,
  SITEMAP_STATIC,
  STATIC_PAGES,
  type L10nText,
  type SeoLocale,
} from './seoCatalogue.js';

/*
 * SEO for a client-rendered SPA.
 *
 * Language/URL strategy (the site has no per-language paths, only ?lng=az|de|en|ru):
 *   - Every page exists as 5 URLs: the bare path (x-default: the app picks the visitor's language) and
 *     path?lng=az|de|en|ru (one per language).
 *   - Each of those URLs is its own canonical (self-referencing canonicals are what hreflang requires):
 *     /visas?lng=de  → canonical /visas?lng=de,  /visas → canonical /visas.
 *   - The bare path is described in the default language (az).
 *   - hreflang alternates on every indexable page: az, de, en, ru → ?lng= URLs, x-default → bare path.
 *   - Breadcrumb/og:url links keep the requested language so a crawler never jumps languages.
 *
 * All page data comes from a handful of cached collections (cleared on CMS writes, TTL 5 min), so rendering
 * the tags for a path never queries the database per request and unknown slugs cost nothing.
 */

export const DEFAULT_LOCALE: SeoLocale = 'az';
const OG_LOCALE: Record<SeoLocale, string> = { az: 'az_AZ', de: 'de_DE', en: 'en_US', ru: 'ru_RU' };
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

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Shortens text on a word boundary, adding an ellipsis, so it fits `max` characters. */
export const truncate = (s: string, max: number) => {
  const text = collapse(s);
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:—–-]+$/, '')}…`;
};

/** Reads one language from an L10n JSON value, falling back to az, then any language. */
export const pick = (value: unknown, lng: SeoLocale): string => {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const v = value as Record<string, unknown>;
  for (const key of [lng, DEFAULT_LOCALE, ...SEO_LOCALES]) {
    if (typeof v[key] === 'string' && (v[key] as string).trim()) return v[key] as string;
  }
  return '';
};

const pickList = (value: unknown, lng: SeoLocale): string[] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const v = value as Record<string, unknown>;
  for (const key of [lng, DEFAULT_LOCALE, ...SEO_LOCALES]) {
    const list = v[key];
    if (Array.isArray(list) && list.length) return list.filter((x): x is string => typeof x === 'string' && !!x.trim());
  }
  return [];
};

const pageTitle = (title: string) => {
  const suffix = ` | ${SITE_NAME}`;
  return `${truncate(title, TITLE_MAX - suffix.length)}${suffix}`;
};

/** Absolute image URL for og:image / JSON-LD, or null for data: URIs and other unusable values. */
const absoluteImage = (src: string | null | undefined) => {
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

export const isPrivatePath = (path: string) =>
  PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

/** URL of `path` in a language (null = the bare, language-negotiated x-default URL). */
export const pageUrl = (path: string, lng: SeoLocale | null) =>
  `${siteOrigin()}${path === '/' ? '/' : encodeURI(path)}${lng ? `?lng=${lng}` : ''}`;

// ─── data ─────────────────────────────────────────────────────────────

export interface SeoData {
  visas: { slug: string; title: unknown; summary: unknown; image: string; updatedAt: Date }[];
  services: { slug: string; title: unknown; summary: unknown; image: string; updatedAt: Date }[];
  posts: { slug: string; title: unknown; excerpt: unknown; cover: string; publishedAt: Date; updatedAt: Date }[];
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
  }[];
  settings: Record<string, unknown>;
  rating: { count: number; average: number } | null;
}

const loadSeoData = async (): Promise<SeoData> => {
  const now = new Date();
  const [visas, services, posts, faqs, jobs, settings, rating] = await Promise.all([
    prisma.visaCategory.findMany({
      where: { published: true },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, title: true, summary: true, image: true, updatedAt: true },
    }),
    prisma.service.findMany({
      where: { published: true },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, title: true, summary: true, image: true, updatedAt: true },
    }),
    prisma.post.findMany({
      where: { published: true },
      orderBy: { publishedAt: 'desc' },
      select: { slug: true, title: true, excerpt: true, cover: true, publishedAt: true, updatedAt: true },
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
      },
    }),
    prisma.setting.findMany({ where: { key: { in: ['contact', 'social', 'legal'] } } }),
    prisma.review.aggregate({
      where: { status: 'APPROVED', consentPublish: true, rating: { not: null } },
      _count: { rating: true },
      _avg: { rating: true },
    }),
  ]);
  const count = rating._count.rating;
  return {
    visas,
    services,
    posts,
    faqs,
    jobs,
    settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
    rating: count >= 3 && rating._avg.rating != null ? { count, average: Math.round(rating._avg.rating * 10) / 10 } : null,
  };
};

export const getSeoData = () => cached('seo:data', loadSeoData);

/** Open jobs whose closing date has not passed (the cached list may be up to a few minutes old). */
const liveJobs = (data: SeoData) => {
  const now = Date.now();
  return data.jobs.filter((j) => !j.closesAt || j.closesAt.getTime() > now);
};

// ─── page resolution ──────────────────────────────────────────────────

interface Crumb {
  name: string;
  path: string;
}

interface ResolvedPage {
  title: string;
  description: string;
  index: boolean;
  image: string | null;
  ogType: 'website' | 'article';
  crumbs: Crumb[];
  jsonLd: unknown[];
  extraMeta: [string, string][]; // [property, content]
}

const staticName = (path: string, lng: SeoLocale) => STATIC_PAGES[path]?.name[lng] ?? '';

const organizationId = () => `${siteOrigin()}/#organization`;

export const organizationLd = (data: SeoData, lng: SeoLocale) => {
  const origin = siteOrigin();
  const contact = (data.settings.contact ?? {}) as Record<string, unknown>;
  const social = (data.settings.social ?? {}) as Record<string, unknown>;
  const legal = (data.settings.legal ?? {}) as Record<string, unknown>;
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
    description: GENERIC_META.description[lng],
    ...(email ? { email } : {}),
    ...(phone ? { telephone: phone } : {}),
    areaServed: [
      { '@type': 'Country', name: 'Azerbaijan' },
      { '@type': 'Country', name: 'Germany' },
    ],
    knowsLanguage: ['az', 'de', 'en', 'ru'],
  };
  if (phone || email) {
    org.contactPoint = [
      {
        '@type': 'ContactPoint',
        contactType: 'customer service',
        ...(phone ? { telephone: phone } : {}),
        ...(email ? { email } : {}),
        availableLanguage: ['Azerbaijani', 'German', 'English', 'Russian'],
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

const EMPLOYMENT_TYPE: Record<string, string | string[]> = {
  FULL_TIME: 'FULL_TIME',
  PART_TIME: 'PART_TIME',
  SEASONAL: 'TEMPORARY',
  // A dual apprenticeship is full-time paid training; Google has no dedicated value for it.
  AUSBILDUNG: ['FULL_TIME', 'OTHER'],
};

/** Plain text (paragraphs separated by blank lines) → minimal escaped HTML for JobPosting.description. */
const textToHtml = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

const listHtml = (heading: string, items: string[]) =>
  items.length ? `<p><strong>${escapeHtml(heading)}</strong></p><ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '';

const JOB_LABELS: Record<SeoLocale, { requirements: string; benefits: string }> = {
  az: { requirements: 'Tələblər', benefits: 'Üstünlüklər' },
  de: { requirements: 'Anforderungen', benefits: 'Wir bieten' },
  en: { requirements: 'Requirements', benefits: 'Benefits' },
  ru: { requirements: 'Требования', benefits: 'Мы предлагаем' },
};

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
      address: { '@type': 'PostalAddress', ...(job.city ? { addressLocality: job.city } : {}), addressCountry: 'DE' },
    },
    directApply: true,
    totalJobOpenings: job.positions,
    url,
    inLanguage: lng,
  };
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

const resolvePage = (path: string, lng: SeoLocale, data: SeoData, requestLng: SeoLocale | null): ResolvedPage => {
  const origin = siteOrigin();
  const url = pageUrl(path, requestLng);
  const generic: ResolvedPage = {
    title: GENERIC_META.title[lng],
    description: GENERIC_META.description[lng],
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
      title: page.fullTitle ? page.title[lng] : pageTitle(page.title[lng]),
      description: page.description[lng],
      index: page.index !== false,
      image: null,
      ogType: 'website',
      crumbs: path === '/' ? [] : [home, { name: page.name[lng], path }],
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
    if (path === '/faq' && data.faqs.length) {
      const entities = data.faqs
        .map((f) => ({ q: collapse(pick(f.question, lng)), a: pick(f.answer, lng).trim() }))
        .filter((f) => f.q && f.a)
        .map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }));
      if (entities.length) {
        resolved.jsonLd.push({ '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: lng, mainEntity: entities });
      }
    }
    return resolved;
  }

  const m = /^\/(visas|services|news|jobs)\/([^/]+)$/.exec(path);
  if (!m) return generic;
  const [, section, slug] = m;
  const sectionPath = SECTION_OF[section];
  const crumbsFor = (name: string) => [home, { name: staticName(sectionPath, lng), path: sectionPath }, { name, path }];

  if (section === 'visas') {
    const visa = data.visas.find((v) => v.slug === slug);
    if (!visa) return generic;
    const name = collapse(pick(visa.title, lng));
    return {
      title: pageTitle(name),
      description: truncate(pick(visa.summary, lng) || STATIC_PAGES['/visas'].description[lng], DESCRIPTION_MAX),
      index: true,
      image: absoluteImage(visa.image),
      ogType: 'website',
      crumbs: crumbsFor(name),
      jsonLd: [],
      extraMeta: [],
    };
  }

  if (section === 'services') {
    const service = data.services.find((s) => s.slug === slug);
    if (!service) return generic;
    const name = collapse(pick(service.title, lng));
    const description = truncate(pick(service.summary, lng) || STATIC_PAGES['/services'].description[lng], DESCRIPTION_MAX);
    const image = absoluteImage(service.image);
    return {
      title: pageTitle(name),
      description,
      index: true,
      image,
      ogType: 'website',
      crumbs: crumbsFor(name),
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'Service',
          name,
          serviceType: name,
          description: collapse(pick(service.summary, lng)) || description,
          url,
          ...(image ? { image } : {}),
          provider: { '@id': organizationId() },
          areaServed: [
            { '@type': 'Country', name: 'Azerbaijan' },
            { '@type': 'Country', name: 'Germany' },
          ],
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
    const description = truncate(pick(post.excerpt, lng) || STATIC_PAGES['/news'].description[lng], DESCRIPTION_MAX);
    const image = absoluteImage(post.cover);
    return {
      title: pageTitle(name),
      description,
      index: true,
      image,
      ogType: 'article',
      crumbs: crumbsFor(name),
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'NewsArticle',
          headline: truncate(name, 110),
          description: collapse(pick(post.excerpt, lng)) || description,
          image: [image ?? `${origin}/og-default.png`],
          datePublished: post.publishedAt.toISOString(),
          dateModified: post.updatedAt.toISOString(),
          inLanguage: lng,
          mainEntityOfPage: { '@type': 'WebPage', '@id': url },
          author: { '@type': 'Organization', name: SITE_NAME, url: `${origin}/` },
          publisher: { '@id': organizationId() },
        },
      ],
      extraMeta: [
        ['article:published_time', post.publishedAt.toISOString()],
        ['article:modified_time', post.updatedAt.toISOString()],
      ],
    };
  }

  // jobs
  const job = liveJobs(data).find((j) => j.slug === slug);
  if (!job) return generic;
  const name = collapse(pick(job.title, lng));
  const where = job.city ? `${name} — ${job.city}` : name;
  return {
    title: pageTitle(where),
    description: truncate(pick(job.description, lng) || STATIC_PAGES['/jobs'].description[lng], DESCRIPTION_MAX),
    index: true,
    image: null,
    ogType: 'website',
    crumbs: crumbsFor(name),
    jsonLd: [jobPostingLd(job, lng, url)],
    extraMeta: [],
  };
};

// ─── rendering ────────────────────────────────────────────────────────

/**
 * The head tags for one page, as an HTML fragment. Every tag carries `data-seo` so the SPA can replace
 * them on navigation. `requestLng` is the ?lng= of the page URL (null = bare URL, described in az).
 */
export const renderHead = (rawPath: string, requestLng: SeoLocale | null, data: SeoData) => {
  const path = normalizePath(rawPath);
  const lng = requestLng ?? DEFAULT_LOCALE;
  const page = resolvePage(path, lng, data, requestLng);
  const origin = siteOrigin();
  const url = pageUrl(path, requestLng);
  const image = page.image ?? `${origin}/og-default.png`;
  const a = escapeHtml;
  const out: string[] = [];
  const meta = (attr: 'name' | 'property', key: string, content: string) =>
    out.push(`<meta data-seo ${attr}="${a(key)}" content="${a(content)}">`);

  out.push(`<title data-seo>${a(page.title)}</title>`);
  meta('name', 'description', page.description);
  meta('name', 'robots', page.index ? 'index, follow, max-image-preview:large' : 'noindex, nofollow');
  if (page.index) {
    out.push(`<link data-seo rel="canonical" href="${a(url)}">`);
    for (const l of SEO_LOCALES) out.push(`<link data-seo rel="alternate" hreflang="${l}" href="${a(pageUrl(path, l))}">`);
    out.push(`<link data-seo rel="alternate" hreflang="x-default" href="${a(pageUrl(path, null))}">`);
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
    meta('property', 'og:image:alt', 'Triad Vision — Azerbaijan → Germany');
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
          item: pageUrl(c.path, requestLng),
        })),
      });
    }
    blocks.push(...page.jsonLd);
  }
  for (const b of blocks) out.push(`<script data-seo type="application/ld+json">${safeJsonLd(b)}</script>`);
  return out.join('\n');
};

// ─── robots.txt / sitemap.xml ─────────────────────────────────────────

export const renderRobots = () =>
  [
    'User-agent: *',
    'Allow: /',
    ...PRIVATE_PREFIXES.map((p) => `Disallow: ${p === '/api' ? '/api/' : p}`),
    '',
    `Sitemap: ${siteOrigin()}/sitemap.xml`,
    '',
  ].join('\n');

const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

/** Content release date of the hand-written static pages (bump when their text changes). */
const STATIC_LASTMOD = new Date('2026-10-15T00:00:00.000Z');

const latest = (dates: Date[], fallback = STATIC_LASTMOD) =>
  dates.reduce((max, d) => (d.getTime() > max.getTime() ? d : max), fallback);

export const renderSitemap = (data: SeoData) => {
  const jobs = liveJobs(data);
  const entries: { path: string; lastmod: Date }[] = [];
  const sectionLastmod: Record<string, Date> = {
    '/visas': latest(data.visas.map((v) => v.updatedAt)),
    '/services': latest(data.services.map((s) => s.updatedAt)),
    '/news': latest(data.posts.map((p) => p.updatedAt)),
    '/jobs': latest(jobs.map((j) => j.updatedAt)),
  };
  for (const path of SITEMAP_STATIC) {
    const lastmod = path === '/' ? latest(Object.values(sectionLastmod)) : (sectionLastmod[path] ?? STATIC_LASTMOD);
    entries.push({ path, lastmod });
  }
  for (const v of data.visas) entries.push({ path: `/visas/${v.slug}`, lastmod: v.updatedAt });
  for (const s of data.services) entries.push({ path: `/services/${s.slug}`, lastmod: s.updatedAt });
  for (const p of data.posts) entries.push({ path: `/news/${p.slug}`, lastmod: p.updatedAt });
  for (const j of jobs) entries.push({ path: `/jobs/${j.slug}`, lastmod: j.updatedAt });

  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ];
  for (const { path, lastmod } of entries) {
    const alternates = [
      ...SEO_LOCALES.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${escapeXml(pageUrl(path, l))}"/>`),
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(pageUrl(path, null))}"/>`,
    ].join('\n');
    // One <url> per language version (and the x-default URL), each listing the full set of alternates.
    for (const l of [null, ...SEO_LOCALES]) {
      out.push(
        '  <url>',
        `    <loc>${escapeXml(pageUrl(path, l))}</loc>`,
        `    <lastmod>${lastmod.toISOString()}</lastmod>`,
        alternates,
        '  </url>',
      );
    }
  }
  out.push('</urlset>', '');
  return out.join('\n');
};

export const getSitemap = () => cached('seo:sitemap', async () => renderSitemap(await getSeoData()));

export type { L10nText, SeoLocale };
