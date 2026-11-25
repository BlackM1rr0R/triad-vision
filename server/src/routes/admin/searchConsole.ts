import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/http.js';
import { searchPerformance, urlInspection } from '../../lib/searchConsole.js';
import { addKeyword, exploreSearch, listKeywords, listSitemaps, removeKeyword, submitSitemap, syncAllKeywords } from '../../lib/searchConsoleTracker.js';

/**
 * Admin → Search performance (/admin/search-performance, ADMIN+): Google Search Console data
 * (totals, top queries, top pages, clicks per day, opportunities: striking distance, low CTR, per-language
 * breakdown, duplicate URLs), cached 6 h — lib/searchConsole.ts. Not configured: the setup state (which env vars
 * are missing, the service account e-mail to add in Search Console).
 *   GET  /api/admin/search-console?refresh=1             28 days (refresh: only when the cache is older than 10 min)
 *   GET  /api/admin/search-console/explore               ?days=7|28|90|180 or ?from=&to=, &country=AZ&device=MOBILE
 *                                                        (+ previous period, cached 1 h per filter)
 *   GET  /api/admin/search-console/inspection?refresh=1  URL Inspection of the key pages in every language, cached 24 h
 *   GET  /api/admin/search-console/keywords              keyword tracker: tracked keywords with 90 days of history
 *   POST /api/admin/search-console/keywords              { keyword, country? } add (history loaded at once)
 *   POST /api/admin/search-console/keywords/refresh      reload all (one run per 10 min)
 *   DELETE /api/admin/search-console/keywords/:id
 *   GET  /api/admin/search-console/sitemaps              sitemaps of the property with Google's last status
 *   POST /api/admin/search-console/sitemaps/submit       submit /sitemap.xml (needs Full permission; 1 per minute)
 */
export const adminSearchConsoleRouter = Router();

adminSearchConsoleRouter.get('/', async (req, res) => {
  res.json(await searchPerformance({ refresh: req.query.refresh === '1' }));
});

const exploreQuery = z.object({
  days: z.coerce.number().int().optional(),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
  country: z.string().max(2).optional(),
  device: z.string().max(10).optional(),
});

adminSearchConsoleRouter.get('/explore', async (req, res) => {
  const out = await exploreSearch(parse(exploreQuery, req.query), { refresh: req.query.refresh === '1' });
  if (out === 'INVALID_FILTER') throw new HttpError(400, 'INVALID_FILTER');
  res.json(out);
});

adminSearchConsoleRouter.get('/inspection', async (req, res) => {
  res.json(await urlInspection({ refresh: req.query.refresh === '1' }));
});

adminSearchConsoleRouter.get('/keywords', async (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ keywords: await listKeywords() });
});

adminSearchConsoleRouter.post('/keywords', async (req, res) => {
  const body = parse(z.object({ keyword: z.string().max(300), country: z.string().max(2).optional() }), req.body);
  const out = await addKeyword(body.keyword, body.country, req.user!.id);
  if (!out.ok) throw new HttpError(out.code === 'KEYWORD_EXISTS' ? 409 : 400, out.code);
  await audit(req, 'SEARCH_KEYWORD_ADDED', out.id, { keyword: body.keyword.trim().slice(0, 100) });
  res.status(201).json({ ...out, keywords: await listKeywords() });
});

let lastRefresh = 0;
const REFRESH_COOLDOWN_MS = 10 * 60 * 1000;

adminSearchConsoleRouter.post('/keywords/refresh', async (_req, res) => {
  const now = Date.now();
  if (now - lastRefresh < REFRESH_COOLDOWN_MS) throw new HttpError(429, 'RATE_LIMITED');
  lastRefresh = now;
  const result = await syncAllKeywords();
  res.json({ ...result, keywords: await listKeywords() });
});

adminSearchConsoleRouter.delete('/keywords/:id', async (req, res) => {
  if (!(await removeKeyword(String(req.params.id)))) throw new HttpError(404, 'NOT_FOUND');
  await audit(req, 'SEARCH_KEYWORD_REMOVED', String(req.params.id));
  res.json({ ok: true });
});

adminSearchConsoleRouter.get('/sitemaps', async (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(await listSitemaps());
});

adminSearchConsoleRouter.post('/sitemaps/submit', async (req, res) => {
  const out = await submitSitemap();
  if (!out.ok) {
    const status = out.code === 'RATE_LIMITED' ? 429 : out.code === 'NOT_CONFIGURED' ? 409 : 502;
    throw new HttpError(status, out.code === 'NOT_CONFIGURED' ? 'GSC_NOT_CONFIGURED' : out.code, out.message);
  }
  await audit(req, 'SEARCH_SITEMAP_SUBMITTED', out.sitemapUrl);
  res.json({ ...out, ...(await listSitemaps()) });
});
