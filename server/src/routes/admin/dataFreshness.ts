import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { listFreshness, markReviewed, reviewHistory } from '../../lib/dataFreshness/service.js';

/**
 * Data freshness — /api/admin/data-freshness (mounted with requireMinRole('ADMIN') in the admin index):
 *   GET  /                 registry items with value, files, source, next due date, status and the latest review
 *   GET  /:id/reviews      review history of one item (latest 50)
 *   POST /:id/review       { note? } mark reviewed now (reviewer + date + note; audited)
 */
export const adminDataFreshnessRouter = Router();

const idParam = (v: unknown) => String(v ?? '').slice(0, 80);

adminDataFreshnessRouter.get('/', async (_req, res) => {
  res.json(await listFreshness());
});

adminDataFreshnessRouter.get('/:id/reviews', async (req, res) => {
  res.json({ reviews: await reviewHistory(idParam(req.params.id)) });
});

adminDataFreshnessRouter.post('/:id/review', async (req, res) => {
  const body = parse(z.object({ note: z.string().trim().max(1000).optional().nullable() }), req.body ?? {});
  const u = req.user!;
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email;
  const result = await markReviewed(idParam(req.params.id), { id: u.id, name }, body.note || null);
  await audit(req, 'DATA_FRESHNESS_REVIEWED', `data-freshness:${result.itemId}`, { note: body.note ?? null, settledDue: result.settledDue, nextDue: result.nextDue });
  res.json(result);
});
