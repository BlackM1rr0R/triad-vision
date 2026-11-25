import { Router } from 'express';
import { limiter, notFound } from '../lib/http.js';
import { collapse, getSeoData, liveJobs, parseLocale, pick } from '../lib/seo.js';
import { hubBySlug, type ProfessionHubSlug } from '../lib/professionHubs.js';
import { ausbildungList, ausbildungPage, cityPage, cityPagePath, cityPages, hubContent, isCareerLocale } from '../lib/careerPages/index.js';

/**
 * Career pages (lib/careerPages) — mounted at /api/career, public, the same for everyone (SSR query key 'career'):
 *   GET /hubs/:slug?lng=        SEO blocks of a profession hub (requirements, visa path, steps, FAQ, related);
 *                               null in a language without these texts (uk). 404 for an unknown hub.
 *   GET /ausbildung?lng=        the Ausbildung occupation pages (list).
 *   GET /ausbildung/:slug?lng=  one Ausbildung page; 404 for an unknown slug or a language without the text.
 *   GET /cities?lng=            the city pages (metropolises + cities with live vacancies).
 *   GET /cities/:slug?lng=      one city page: cost figures + live vacancies there (no employer names); 404 otherwise.
 * Vacancies come from the cached SEO data (open, published, not expired: liveJobs).
 */
export const careerPagesRouter = Router();

const publicLimiter = limiter({ windowMs: 60 * 1000, limit: 120 });
const lngOf = (q: unknown) => parseLocale(q) ?? 'az';

careerPagesRouter.get('/hubs/:slug', publicLimiter, async (req, res) => {
  const hub = hubBySlug(String(req.params.slug));
  if (!hub) throw notFound('HUB_NOT_FOUND');
  const data = await getSeoData();
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(hubContent(hub.slug as ProfessionHubSlug, lngOf(req.query.lng), liveJobs(data)));
});

careerPagesRouter.get('/ausbildung', publicLimiter, (req, res) => {
  const lng = lngOf(req.query.lng);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ items: isCareerLocale(lng) ? ausbildungList(lng) : [] });
});

careerPagesRouter.get('/ausbildung/:slug', publicLimiter, (req, res) => {
  const page = ausbildungPage(String(req.params.slug), lngOf(req.query.lng));
  if (!page) throw notFound('PAGE_NOT_FOUND');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(page);
});

careerPagesRouter.get('/cities', publicLimiter, async (req, res) => {
  const lng = lngOf(req.query.lng);
  const data = await getSeoData();
  res.setHeader('Cache-Control', 'public, max-age=120');
  res.json({
    items: isCareerLocale(lng) ? cityPages(liveJobs(data)).map((c) => ({ slug: c.row.slug, name: c.row.name, path: cityPagePath(c.row.slug), jobs: c.jobs })) : [],
  });
});

careerPagesRouter.get('/cities/:slug', publicLimiter, async (req, res) => {
  const lng = lngOf(req.query.lng);
  const data = await getSeoData();
  const page = cityPage(String(req.params.slug), lng, liveJobs(data), (j) => collapse(pick(j.title, lng)));
  if (!page) throw notFound('PAGE_NOT_FOUND');
  res.setHeader('Cache-Control', 'public, max-age=120');
  res.json(page);
});
