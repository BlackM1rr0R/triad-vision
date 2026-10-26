import { Router, type Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { limiter, parse } from '../lib/http.js';
import { attachmentHeader } from '../lib/cv/pdf.js';
import { budgetConfig, budgetFor, budgetQuerySchema, portalPrefill, shareQuery } from '../lib/budget/service.js';
import { renderBudgetPdf } from '../lib/budget/pdf.js';
import { budgetLang } from '../lib/budget/texts.js';

/**
 * First-month budget in Germany — mounted at /api/budget:
 *   GET /config     cities (CityCost table), visas with blocked-account amounts, defaults, yearly parameters
 *   GET /estimate   budget for the query (see lib/budget/service.ts budgetQuerySchema); pure maths, cacheable
 *   GET /pdf        the same as an A4 PDF (?lang=az|de|en|ru)
 *   GET /me         client portal: prefill from the own application (contract, vacancy, arrival, family)
 */
export const budgetRouter = Router();

const publicCache = (res: Response, seconds: number) => res.setHeader('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=600`);
const estimateLimiter = limiter({ windowMs: 60 * 1000, limit: 120 });
const pdfLimiter = limiter({ windowMs: 60 * 1000, limit: 20 });

budgetRouter.get('/config', async (_req, res) => {
  publicCache(res, 300);
  res.json(await budgetConfig());
});

budgetRouter.get('/estimate', estimateLimiter, async (req, res) => {
  const r = await budgetFor(parse(budgetQuerySchema, req.query));
  publicCache(res, 300);
  res.json({ ...r, share: shareQuery(r) });
});

budgetRouter.get('/pdf', pdfLimiter, async (req, res) => {
  const lang = budgetLang(req.query.lang);
  const r = await budgetFor(parse(budgetQuerySchema, req.query));
  const bytes = await renderBudgetPdf(r, lang);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', attachmentHeader(`budget-${r.city.slug}-${r.input.start}.pdf`, req.query.inline === '1'));
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(Buffer.from(bytes));
});

budgetRouter.get('/me', requireRole('CLIENT'), async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(await portalPrefill(req.user!.id));
});
