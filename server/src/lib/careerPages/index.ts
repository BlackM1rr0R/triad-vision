import { professionLabel } from '../jobAlerts/texts.js';
import { jobLandings, jobProfession, type LandingJob } from '../jobLandings.js';
import { PROFESSION_HUBS, hubBySlug, hubMatches, type ProfessionHubSlug } from '../professionHubs.js';
import { CAREER_COPY } from './content/index.js';
import { AUSBILDUNG_FACTS, CAREER_AS_OF, HUB_FACTS } from './facts.js';
import type { CityCostData } from '../budget/cities.js';
import { CITY_ROWS, cityPagePath, cityPages, cityRow, cityTexts, jobsInCity, stateName } from './cities.js';
import { AUSBILDUNG_SLUGS, isCareerLocale, type AusbildungSlug, type CareerLocale, type Faq } from './types.js';

export { CAREER_LOCALES, AUSBILDUNG_SLUGS, isCareerLocale, type CareerLocale, type AusbildungSlug } from './types.js';
export { CAREER_AS_OF, CAREER_LASTMOD, HUB_FACTS, AUSBILDUNG_FACTS } from './facts.js';
export { CITY_ROWS, cityPagePath, cityPageSlug, cityPages, cityRow, cityRowsOf, cityTexts, hasCityPage, jobsInCity } from './cities.js';

/**
 * Career pages: builders shared by the API (routes/careerPages.ts), the SEO head (lib/seo.ts) and the crawler body
 * (lib/seoBody.ts). Pure functions over the static texts, the given live vacancies and the given city rows.
 */

export const ausbildungPath = (slug: string) => `/ausbildung/${slug}`;
export const ausbildungSlugOf = (path: string): AusbildungSlug | null => {
  const s = /^\/ausbildung\/([a-z-]{2,40})$/.exec(path)?.[1];
  return s && (AUSBILDUNG_SLUGS as readonly string[]).includes(s) ? (s as AusbildungSlug) : null;
};
/** Path shapes of the career detail pages (known SPA routes; existence is checked per language). */
export const isCareerDetailPath = (path: string) => /^\/(ausbildung|cities)\/[^/]+$/.test(path);

/** Profession hub FAQ: the hub's own questions, then the shared ones. */
export const hubFaq = (slug: ProfessionHubSlug, lng: CareerLocale): Faq[] => [...CAREER_COPY[lng].hubs[slug].faq, ...CAREER_COPY[lng].shared.faq];

/** Cities (with a page) where the given hub has live vacancies. */
const hubCities = <J extends LandingJob>(slug: ProfessionHubSlug, jobs: J[], cities: readonly CityCostData[]) => {
  const hub = hubBySlug(slug)!;
  const own = jobs.filter((j) => hubMatches(hub, jobProfession(j)));
  return cityPages(jobs, cities)
    .map((c) => ({ slug: c.row.slug, name: c.row.name, path: cityPagePath(c.row.slug), jobs: jobsInCity(own, c.row.slug, cities).length }))
    .filter((c) => c.jobs > 0);
};

/**
 * GET /api/career/hubs/:slug — the SEO blocks of a profession hub (null in a language without these texts).
 * `cities`: the city rows (cityRowsOf(SeoData.cities)); default the seed rows.
 */
export const hubContent = <J extends LandingJob>(slug: ProfessionHubSlug, lng: string, liveJobs: J[], cities: readonly CityCostData[] = CITY_ROWS) => {
  if (!isCareerLocale(lng)) return null;
  const copy = CAREER_COPY[lng];
  const facts = HUB_FACTS[slug];
  const hub = copy.hubs[slug];
  const ausbildung = facts.ausbildung ? { slug: facts.ausbildung, path: ausbildungPath(facts.ausbildung), name: copy.ausbildung[facts.ausbildung].name, title: copy.ausbildung[facts.ausbildung].title } : null;
  return {
    asOf: CAREER_AS_OF,
    labels: copy.shared.labels,
    keywords: hub.keywords,
    germanLevel: facts.germanLevel,
    requirements: hub.requirements,
    visa: { text: hub.visa, label: facts.visaLabel, slug: facts.visaSlug, path: `/visas/${facts.visaSlug}` },
    steps: copy.shared.steps,
    faq: hubFaq(slug, lng),
    ausbildung,
    guides: facts.guides,
    cities: hubCities(slug, liveJobs, cities),
  };
};

/** Short list of the Ausbildung pages (the /ausbildung hub and the "other occupations" block). */
export const ausbildungList = (lng: CareerLocale) =>
  AUSBILDUNG_SLUGS.map((s) => ({
    slug: s,
    path: ausbildungPath(s),
    name: CAREER_COPY[lng].ausbildung[s].name,
    title: CAREER_COPY[lng].ausbildung[s].title,
    years: AUSBILDUNG_FACTS[s].years,
    allowance: AUSBILDUNG_FACTS[s].allowance,
  }));

/** GET /api/career/ausbildung/:slug — one Ausbildung page (null: unknown slug or language without the text). */
export const ausbildungPage = (slug: string, lng: string) => {
  if (!isCareerLocale(lng) || !(AUSBILDUNG_SLUGS as readonly string[]).includes(slug)) return null;
  const s = slug as AusbildungSlug;
  const copy = CAREER_COPY[lng];
  const facts = AUSBILDUNG_FACTS[s];
  return {
    slug: s,
    asOf: CAREER_AS_OF,
    labels: copy.shared.labels,
    allowanceNote: copy.shared.allowanceNote,
    ...copy.ausbildung[s],
    faq: [...copy.ausbildung[s].faq, ...copy.shared.faq],
    years: facts.years,
    germanLevel: facts.germanLevel,
    allowance: facts.allowance,
    hub: { slug: facts.hub, path: `/for/${facts.hub}` },
    visa: { slug: facts.visaSlug, path: `/visas/${facts.visaSlug}` },
    steps: copy.shared.steps,
    others: ausbildungList(lng).filter((o) => o.slug !== s),
  };
};

type CityJob = LandingJob & { city: string | null };

/**
 * GET /api/career/cities/:slug — one city page from the live vacancies and the city rows (cityRowsOf(SeoData.cities);
 * default the seed rows). Null: no page in that language / for that city.
 */
export const cityPage = <J extends CityJob>(slug: string, lng: string, liveJobs: J[], titleOf: (j: J) => string, cities: readonly CityCostData[] = CITY_ROWS) => {
  if (!isCareerLocale(lng)) return null;
  const row = cityRow(slug, cities);
  const pages = cityPages(liveJobs, cities);
  if (!row || !pages.some((p) => p.row.slug === slug)) return null;
  const jobs = jobsInCity(liveJobs, slug, cities);
  const professions = [...new Set(jobs.map((j) => jobProfession(j)).filter((p): p is string => !!p))];
  const hubs = PROFESSION_HUBS.filter((h) => professions.some((p) => hubMatches(h, p))).map((h) => h.slug);
  return {
    slug,
    name: row.name,
    state: stateName(row.state),
    asOf: CAREER_AS_OF,
    texts: cityTexts(row, jobs.length, lng),
    costs: {
      flat1: [row.flat1ColdMin, row.flat1ColdMax],
      flat2: [row.flat2ColdMin, row.flat2ColdMax],
      wg: [row.wgMin, row.wgMax],
      food: [row.foodMin, row.foodMax],
      transport: row.transport,
    },
    jobs: jobs.slice(0, 12).map((j) => ({ slug: j.slug, title: titleOf(j), city: j.city, salaryMin: j.salaryMin, salaryMax: j.salaryMax })),
    total: jobs.length,
    landings: jobLandings(jobs).map((l) => ({ path: l.path, label: `${professionLabel(l.profession, lng)} — ${l.city}`, count: l.jobs.length })),
    hubs: hubs.length ? hubs : (['truck-driver', 'nurse', 'cook'] as ProfessionHubSlug[]),
    others: pages.filter((p) => p.row.slug !== slug).map((p) => ({ slug: p.row.slug, name: p.row.name, path: cityPagePath(p.row.slug) })),
  };
};
