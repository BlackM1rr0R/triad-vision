import { SITE_NAME, STATIC_PAGES, textIn, type SeoLocale } from '../seoCatalogue.js';
import { collapse, escapeHtml as e, faqPageLd, liveJobs, pageUrl, pick, truncate, type ResolvedPage, type SeoData } from '../seo.js';
import { hubOfPath, type ProfessionHubSlug } from '../professionHubs.js';
import { CAREER_COPY } from './content/index.js';
import {
  AUSBILDUNG_FACTS,
  AUSBILDUNG_SLUGS,
  CAREER_LASTMOD,
  CAREER_LOCALES,
  ausbildungPage,
  ausbildungPath,
  ausbildungSlugOf,
  cityPage,
  cityPagePath,
  cityPageSlug,
  cityPages,
  cityRowsOf,
  hubContent,
  hubFaq,
  isCareerLocale,
} from './index.js';

/**
 * SEO of the career pages for lib/seo.ts (head, status, sitemap) and lib/seoBody.ts (crawler body):
 *  - /ausbildung/<slug>: Article-like occupation page + FAQPage + breadcrumbs (Home › Ausbildung › occupation);
 *  - /cities/<slug>: city page (ItemList of its vacancies) + breadcrumbs (Home › Cities › city);
 *  - /for/<hub>: FAQPage of the hub's questions (the hub itself is a static catalogue page).
 * Languages: the six career languages (hreflang lists exactly those).
 */

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 155;

/** "<title> | Triad Vision" when it fits, else the title alone (shortened if needed). */
const fitTitle = (t: string) => {
  const withSuffix = `${t} | ${SITE_NAME}`;
  return withSuffix.length <= TITLE_MAX ? withSuffix : truncate(t, TITLE_MAX);
};

const careerAlternates = (path: string): Partial<Record<SeoLocale, string>> => Object.fromEntries(CAREER_LOCALES.map((l) => [l, path]));

const name = (path: string, lng: SeoLocale) => (STATIC_PAGES[path] ? textIn(STATIC_PAGES[path].name, lng) : '');

const jobTitle = (lng: SeoLocale) => (j: { title: unknown }) => collapse(pick(j.title, lng));

/** City rows of the pages: the active CityCost rows of the SEO data, else the seed defaults (lib/careerPages/cities.ts). */
const citiesOf = (data: SeoData) => cityRowsOf(data.cities);

/**
 * Head data of a career detail page: a ResolvedPage, 'missing' for a career path without a page in that language,
 * or null when the path is not a career detail page.
 */
export const careerResolve = (path: string, lng: SeoLocale, data: SeoData, url: string): ResolvedPage | 'missing' | null => {
  const home = { name: name('/', lng), path: '/' };
  const aSlug = ausbildungSlugOf(path);
  if (aSlug || /^\/ausbildung\/[^/]+$/.test(path)) {
    const page = aSlug ? ausbildungPage(aSlug, lng) : null;
    if (!page) return 'missing';
    const faq = faqPageLd(page.faq, lng);
    return {
      title: fitTitle(page.title),
      description: truncate(page.description, DESCRIPTION_MAX),
      index: true,
      image: null,
      ogType: 'article',
      crumbs: [home, { name: name('/ausbildung', lng), path: '/ausbildung' }, { name: page.name, path }],
      alternates: careerAlternates(path),
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: truncate(page.title, 110),
          description: page.description,
          inLanguage: lng,
          datePublished: CAREER_LASTMOD.toISOString(),
          dateModified: CAREER_LASTMOD.toISOString(),
          mainEntityOfPage: { '@type': 'WebPage', '@id': url },
          about: { '@type': 'Occupation', name: page.name, occupationLocation: { '@type': 'Country', name: 'Germany' } },
          author: { '@type': 'Organization', name: SITE_NAME, url: pageUrl('/about', lng) },
          publisher: { '@id': `${new URL(url).origin}/#organization` },
        },
        ...(faq ? [faq] : []),
      ],
      extraMeta: [['article:modified_time', CAREER_LASTMOD.toISOString()]],
    };
  }
  const cSlug = cityPageSlug(path);
  if (cSlug) {
    const page = cityPage(cSlug, lng, liveJobs(data), jobTitle(lng), citiesOf(data));
    if (!page) return 'missing';
    return {
      title: fitTitle(page.texts.title),
      description: truncate(page.texts.description, DESCRIPTION_MAX),
      index: true,
      image: null,
      ogType: 'website',
      crumbs: [home, { name: name('/cities', lng), path: '/cities' }, { name: page.name, path }],
      alternates: careerAlternates(path),
      jsonLd: page.jobs.length
        ? [
            {
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: page.texts.h1,
              numberOfItems: page.jobs.length,
              // Each vacancy page carries its own JobPosting (Google: JobPosting only on the page of the single job).
              itemListElement: page.jobs.map((j, i) => ({ '@type': 'ListItem', position: i + 1, name: j.title, url: pageUrl(`/jobs/${j.slug}`, lng) })),
            },
          ]
        : [],
      extraMeta: [],
    };
  }
  return null;
};

/** FAQPage JSON-LD of a profession hub (/for/<slug>) in a career language, else null. */
export const hubFaqLd = (path: string, lng: SeoLocale) => {
  const hub = hubOfPath(path);
  if (!hub || !isCareerLocale(lng)) return null;
  return faqPageLd(hubFaq(hub.slug as ProfessionHubSlug, lng), lng);
};

/** HTTP status of a career detail page (null: not a career path). */
export const careerStatus = (path: string, lng: SeoLocale, data: SeoData): 200 | 404 | null => {
  if (/^\/ausbildung\/[^/]+$/.test(path)) return ausbildungSlugOf(path) && isCareerLocale(lng) ? 200 : 404;
  const c = cityPageSlug(path);
  if (c || /^\/cities\/[^/]+$/.test(path)) return c && isCareerLocale(lng) && cityPages(liveJobs(data), citiesOf(data)).some((p) => p.row.slug === c) ? 200 : 404;
  return null;
};

/** Sitemap rows: every Ausbildung page and every city page with a page, in the six career languages. */
export const careerSitemapPaths = (data: SeoData) => [
  ...AUSBILDUNG_SLUGS.map((s) => ausbildungPath(s)),
  ...cityPages(liveJobs(data), citiesOf(data)).map((c) => cityPagePath(c.row.slug)),
];

// ─── crawler body (lib/seoBody.ts) ─────────────────────────────────────

type Link = (path: string, text: string) => string;
const ul = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '');
const faqHtml = (heading: string, faq: { q: string; a: string }[]) =>
  faq.length ? `<h2>${e(heading)}</h2>${faq.map((f) => `<h3>${e(f.q)}</h3><p>${e(f.a)}</p>`).join('')}` : '';

/** Body of a career detail page or the SEO blocks of a hub (null: nothing to add). */
export const careerBody = (path: string, lng: SeoLocale, data: SeoData, link: Link): string[] | null => {
  if (!isCareerLocale(lng)) return null;
  const labels = CAREER_COPY[lng].shared.labels;
  const aSlug = ausbildungSlugOf(path);
  if (aSlug) {
    const p = ausbildungPage(aSlug, lng)!;
    const f = AUSBILDUNG_FACTS[aSlug];
    return [
      `<h1>${e(p.title)}</h1>`,
      `<p>${e(p.intro)}</p>`,
      `<p>${e(labels.years)}: ${f.years} · ${e(labels.germanLevel)}: ${e(f.germanLevel)} · ${e(labels.allowance)}: ${f.allowance[0]}–${f.allowance[1]} € ${e(labels.perMonth)} (${e(labels.estimate)})</p>`,
      `<h2>${e(labels.about)}</h2><p>${e(p.about)}</p>`,
      `<h2>${e(labels.requirements)}</h2>${ul(p.requirements.map(e))}`,
      `<h2>${e(labels.allowance)}</h2><p>${e(p.pay)}</p><p>${e(p.allowanceNote)}</p>`,
      `<h2>${e(labels.after)}</h2><p>${e(p.after)}</p>`,
      `<h2>${e(labels.steps)}</h2><ol>${p.steps.map((s) => `<li><strong>${e(s.title)}</strong>: ${e(s.text)}</li>`).join('')}</ol>`,
      faqHtml(labels.faq, p.faq),
      `<h2>${e(labels.related)}</h2>${ul([link(p.hub.path, textIn(STATIC_PAGES[p.hub.path]?.name ?? { az: p.hub.path, de: p.hub.path, en: p.hub.path, ru: p.hub.path }, lng)), link(p.visa.path, labels.visaLink), link('/ausbildung', labels.ausbildungHub), ...p.others.map((o) => link(o.path, o.title))])}`,
      `<p>${link('/booking', labels.cta)}</p>`,
    ];
  }
  const cSlug = cityPageSlug(path);
  if (cSlug) {
    const p = cityPage(cSlug, lng, liveJobs(data), jobTitle(lng), citiesOf(data));
    if (!p) return null;
    const t = p.texts.labels;
    const range = (r: number[]) => `${r[0]}–${r[1]} €`;
    return [
      `<h1>${e(p.texts.h1)}</h1>`,
      `<p>${e(p.texts.intro)}</p>`,
      `<h2>${e(t.costs)} (${e(t.estimate)})</h2>`,
      ul([`${e(t.flat1)}: ${range(p.costs.flat1)}`, `${e(t.flat2)}: ${range(p.costs.flat2)}`, `${e(t.wg)}: ${range(p.costs.wg)}`, `${e(t.food)}: ${range(p.costs.food)}`, `${e(t.transport)}: ${p.costs.transport} €`]),
      `<p>${e(t.source)}</p>`,
      `<h2>${e(t.jobs)}</h2>`,
      p.jobs.length ? ul(p.jobs.map((j) => link(`/jobs/${j.slug}`, j.title))) : `<p>${e(t.jobsNone)}</p>`,
      p.landings.length ? `<h2>${e(t.landings)}</h2>${ul(p.landings.map((l) => link(l.path, l.label)))}` : '',
      `<h2>${e(t.professions)}</h2>${ul(p.hubs.map((h) => link(`/for/${h}`, textIn(STATIC_PAGES[`/for/${h}`].name, lng))))}`,
      `<h2>${e(t.tools)}</h2>${ul(['/budget', '/rent-check', '/salary-calculator', '/cities'].filter((x) => STATIC_PAGES[x]).map((x) => link(x, textIn(STATIC_PAGES[x].name, lng))))}`,
      `<h2>${e(t.others)}</h2>${ul(p.others.map((o) => link(o.path, o.name)))}`,
      `<p>${link('/booking', labels.cta)}</p>`,
    ];
  }
  const hub = hubOfPath(path);
  if (hub) {
    const c = hubContent(hub.slug as ProfessionHubSlug, lng, liveJobs(data), citiesOf(data))!;
    return [
      `<h2>${e(labels.requirements)}</h2>${ul(c.requirements.map(e))}`,
      `<h2>${e(labels.visa)}: ${e(c.visa.label)}</h2><p>${e(c.visa.text)}</p><p>${link(c.visa.path, labels.visaLink)}</p>`,
      `<h2>${e(labels.steps)}</h2><ol>${c.steps.map((s) => `<li><strong>${e(s.title)}</strong>: ${e(s.text)}</li>`).join('')}</ol>`,
      faqHtml(labels.faq, c.faq),
      `<h2>${e(labels.related)}</h2>${ul([...(c.ausbildung ? [link(c.ausbildung.path, c.ausbildung.title)] : []), ...c.cities.map((x) => link(x.path, x.name)), link('/salary-calculator', textIn(STATIC_PAGES['/salary-calculator'].name, lng)), link('/jobs', textIn(STATIC_PAGES['/jobs'].name, lng))])}`,
    ];
  }
  return null;
};

/** Ausbildung hub (/ausbildung) and city guide (/cities): links to the detail pages (crawler body). */
export const careerIndexLinks = (path: string, lng: SeoLocale, data: SeoData, link: Link): string[] => {
  if (!isCareerLocale(lng)) return [];
  if (path === '/ausbildung') return [`<h2>${e(CAREER_COPY[lng].shared.labels.ausbildungOthers)}</h2>`, ul(AUSBILDUNG_SLUGS.map((s) => link(ausbildungPath(s), CAREER_COPY[lng].ausbildung[s].title)))];
  if (path === '/cities') return [ul(cityPages(liveJobs(data), citiesOf(data)).map((c) => link(cityPagePath(c.row.slug), c.row.name)))];
  return [];
};
