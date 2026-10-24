import { Router } from 'express';
import { z } from 'zod';
import { limiter, parse } from '../lib/http.js';
import { config } from '../config.js';
import { cached } from '../lib/cache.js';
import { currentRef } from '../lib/legal/documents.js';
import { createOrder, orderStatus, publicPackageView, publishedPackages, resendOrderLink } from '../lib/billing/packages.js';

/**
 * Public service packages (/packages) and the online order — mounted at /api/packages. No login: the order's
 * status page is opened with the token the browser generated for the order (only its hash is stored).
 */
export const packagesRouter = Router();

const orderLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 10, skip: () => config.isTest });
const statusLimiter = limiter({ windowMs: 60 * 1000, limit: 60, skip: () => config.isTest });
const resendLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 5, skip: () => config.isTest });

packagesRouter.get('/', async (_req, res) => {
  const data = await cached('packages:public', async () => {
    const [packages, terms, privacy] = await Promise.all([publishedPackages(), currentRef('TERMS'), currentRef('PRIVACY')]);
    return { packages: packages.map(publicPackageView), terms: { version: terms.version }, privacy: { version: privacy.version } };
  });
  res.json(data);
});

packagesRouter.post('/orders', orderLimiter, async (req, res) => {
  // Honeypot: real users never fill this hidden field.
  if (typeof req.body?.website === 'string' && req.body.website) {
    res.status(201).json({ ok: true });
    return;
  }
  res.status(201).json({ order: await createOrder(req.body ?? {}, req) });
});

packagesRouter.get('/orders/:token', statusLimiter, async (req, res) => {
  res.json({ order: await orderStatus(String(req.params.token)) });
});

packagesRouter.post('/orders/:token/resend', resendLimiter, async (req, res) => {
  parse(z.object({}).passthrough(), req.body ?? {});
  res.json(await resendOrderLink(String(req.params.token)));
});
