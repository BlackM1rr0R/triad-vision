import { Router } from 'express';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { requireRole } from '../middleware/auth.js';
import { forbidden, limiter, parse } from '../lib/http.js';
import {
  companyRequestInput,
  companyRequests,
  configuratorView,
  parseConfig,
  priceOf,
  publicRequestInput,
  submitCompanyRequest,
  submitPublicRequest,
} from '../lib/packageConfigurator/service.js';

/**
 * Package configurator (lib/packageConfigurator):
 *  - /api/configurator/*          public (/for-employers): catalogue view, live price, request → lead
 *  - /api/company/configurator/*  signed-in employer: same view and price, request → lead + DRAFT quote for staff
 * Prices come only from the quote catalogue (Setting `quotes`); a service without a price is "on request".
 */

const priceLimiter = limiter({ windowMs: 60 * 1000, limit: 120, skip: () => config.isTest });
const requestLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 10, skip: () => config.isTest });

// ─── Public ──────────────────────────────────────────────────────────

export const configuratorPublicRouter = Router();

configuratorPublicRouter.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json(await configuratorView(req.query.lang));
});

configuratorPublicRouter.post('/price', priceLimiter, async (req, res) => {
  res.json({ price: await priceOf(parseConfig(req.body?.config)) });
});

configuratorPublicRouter.post('/requests', requestLimiter, async (req, res) => {
  const body = parse(publicRequestInput, req.body ?? {});
  if (body.website) {
    // A bot filled the hidden field. Answer exactly like a success so it learns nothing.
    res.status(201).json({ ok: true, id: 'ok' });
    return;
  }
  const r = await submitPublicRequest(req, body);
  res.status(201).json({ ok: true, id: r.inquiryId, price: r.priced });
});

// ─── Company portal ──────────────────────────────────────────────────

export const companyConfiguratorRouter = Router();
companyConfiguratorRouter.use(requireRole('COMPANY'));
companyConfiguratorRouter.use(async (req, res, next) => {
  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { company: { select: { id: true, status: true } } } });
  if (!u?.company) return next(forbidden('NO_COMPANY'));
  if (u.company.status === 'SUSPENDED') return next(forbidden('COMPANY_SUSPENDED'));
  res.locals.companyId = u.company.id;
  next();
});

const companyId = (res: { locals: Record<string, unknown> }) => res.locals.companyId as string;

companyConfiguratorRouter.get('/', async (req, res) => {
  res.json(await configuratorView(req.query.lang ?? req.user!.locale));
});

companyConfiguratorRouter.post('/price', priceLimiter, async (req, res) => {
  res.json({ price: await priceOf(parseConfig(req.body?.config)) });
});

companyConfiguratorRouter.get('/requests', async (_req, res) => {
  res.json({ items: await companyRequests(companyId(res)) });
});

companyConfiguratorRouter.post('/requests', requestLimiter, async (req, res) => {
  const body = parse(companyRequestInput, req.body ?? {});
  const r = await submitCompanyRequest(req, companyId(res), body);
  res.status(201).json({ ok: true, id: r.inquiryId, price: r.priced });
});
