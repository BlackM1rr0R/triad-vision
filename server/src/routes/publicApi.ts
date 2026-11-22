import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { notFound, parse } from '../lib/http.js';
import { GERMAN_LEVELS } from '../lib/matching.js';
import { openVacancyWhere, publicVacancy } from '../lib/vacancies.js';
import { publicApiKeyAuth } from '../lib/publicApi/keys.js';
import { vacancyListSchema } from '../lib/publicApi/schema.js';
import { API_LANGS, API_VERSION, apiVacancy, matchesFilter } from '../lib/publicApi/vacancies.js';

/**
 * Public vacancy API for partners — mounted at /api/public/v1 (docs: /developers).
 *   GET /schema.json          JSON Schema of the list response (no key)
 *   GET /vacancies            published Triad Vision vacancies (key), filters profession, city, germanLevel, lng, page, pageSize
 *   GET /vacancies/:slug      one published vacancy (key)
 * Key: `Authorization: Bearer tvp_…` or `X-API-Key: tvp_…` (Admin → Public API keys), rate-limited per key.
 * Third-party listings (Germany jobs search) are never part of it. CORS: any origin, no credentials.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-API-Key, Content-Type',
  'Access-Control-Expose-Headers': 'RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After, X-Request-Id',
  'Access-Control-Max-Age': '600',
} as const;

const setCors = (res: Response) => {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
  // The site-wide CORS middleware allows credentials for our own origins; this API never uses cookies.
  res.removeHeader('Access-Control-Allow-Credentials');
};

/** Mounted before the site-wide CORS middleware: answers preflights for any origin. */
export const publicApiCors = (req: Request, res: Response, next: NextFunction) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
};

export const publicApiRouter = Router();

// Runs after the site-wide CORS middleware: restore "*" and drop credentials it may have set for our own origins.
publicApiRouter.use((_req, res, next) => {
  setCors(res);
  next();
});

publicApiRouter.get('/schema.json', (_req, res) => {
  res.json(vacancyListSchema(config.clientUrl));
});

publicApiRouter.use(publicApiKeyAuth);

const MAX_SCAN = 1000;

const listQuery = z.object({
  profession: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  germanLevel: z.enum(GERMAN_LEVELS).optional(),
  lng: z.enum(API_LANGS).default('en'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const include = { company: { select: { name: true, logo: true } }, visaCategory: { select: { slug: true, title: true, visaLabel: true } } } as const;

publicApiRouter.get('/vacancies', async (req, res) => {
  const q = parse(listQuery, req.query);
  const rows = await prisma.vacancy.findMany({ where: openVacancyWhere(), orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }], take: MAX_SCAN, include });
  const key = req.publicApiKey!;
  const matching = rows.filter((v) => matchesFilter(v, q));
  const start = (q.page - 1) * q.pageSize;
  res.json({
    apiVersion: API_VERSION,
    page: q.page,
    pageSize: q.pageSize,
    total: matching.length,
    items: matching
      .slice(start, start + q.pageSize)
      .map((v) => apiVacancy(publicVacancy(v, { withCompany: true }), { lng: q.lng, siteUrl: config.clientUrl, partnerCode: key.partnerCode, keyPrefix: key.prefix })),
  });
});

publicApiRouter.get('/vacancies/:slug', async (req, res) => {
  const { lng } = parse(listQuery.pick({ lng: true }), req.query);
  const v = await prisma.vacancy.findFirst({ where: { AND: [openVacancyWhere(), { slug: String(req.params.slug).slice(0, 200) }] }, include });
  if (!v) throw notFound('VACANCY_NOT_FOUND');
  const key = req.publicApiKey!;
  res.json({ apiVersion: API_VERSION, vacancy: apiVacancy(publicVacancy(v, { withCompany: true }), { lng, siteUrl: config.clientUrl, partnerCode: key.partnerCode, keyPrefix: key.prefix }) });
});
