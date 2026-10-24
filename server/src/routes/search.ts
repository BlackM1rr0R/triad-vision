import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { limiter, parse } from '../lib/http.js';
import { parseLocale } from '../lib/seo.js';
import { SEARCH_TYPES, logSearch, siteSearch } from '../lib/search/index.js';

/**
 * Public site search — mounted at /api/search:
 *   GET  /?q=&lng=&types=guide,job&limit=  ranked hits { type, title, url (localised), snippet, highlights }
 *   POST /log { q, lng }                    counts a finished search (anonymous daily aggregates only)
 * The instant search dialog calls GET on every pause in typing; only a settled query (the visitor stopped
 * typing, opened a result or the results page) is logged, so half-typed words never reach the statistics.
 */
export const searchRouter = Router();

const searchLimiter = limiter({ windowMs: 60 * 1000, limit: 120, skip: () => config.isTest });
const logLimiter = limiter({ windowMs: 60 * 1000, limit: 30, skip: () => config.isTest });

const queryInput = z.object({
  q: z.string().trim().max(200).catch(''),
  lng: z.string().optional(),
  types: z
    .string()
    .max(200)
    .optional()
    .transform((v) => (v ? v.split(',').filter((t): t is (typeof SEARCH_TYPES)[number] => (SEARCH_TYPES as readonly string[]).includes(t)) : undefined)),
  limit: z.coerce.number().int().min(1).max(60).catch(30),
});

searchRouter.get('/', searchLimiter, async (req, res) => {
  const q = parse(queryInput, req.query);
  const lng = parseLocale(q.lng) ?? 'az';
  const hits = q.q.length >= 2 || /\d/.test(q.q) ? await siteSearch(q.q, lng, { limit: q.limit, types: q.types?.length ? q.types : undefined }) : [];
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({ q: q.q, lng, total: hits.length, items: hits });
});

searchRouter.post('/log', logLimiter, async (req, res) => {
  const body = parse(z.object({ q: z.string().trim().min(1).max(200), lng: z.string().optional() }), req.body);
  const lng = parseLocale(body.lng) ?? 'az';
  const hits = await siteSearch(body.q, lng, { limit: 1 });
  const logged = await logSearch(body.q, hits.length);
  res.json({ ok: true, logged });
});
