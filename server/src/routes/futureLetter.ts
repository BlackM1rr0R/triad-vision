import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { forbidden, limiter, parse } from '../lib/http.js';
import { LETTER_MAX_CHARS, deleteLetter, letterView, saveLetter } from '../lib/futureLetter/service.js';

/**
 * "Letter to my future self" — mounted at /api/account/future-letter (CLIENT only, always the signed-in client's
 * own letter; there is deliberately NO staff / admin counterpart):
 *   GET    /    { letter: { body, deliverOn, delivered, ... } | null, arrived } (delivers it first when due;
 *               while staff view the portal as the client: body null, hidden true)
 *   PUT    /    { body ≤ 5,000 chars, deliverOn?: YYYY-MM-DD | null } create / edit until delivered (409 LETTER_DELIVERED)
 *   DELETE /    delete any time
 */
export const futureLetterRouter = Router();
futureLetterRouter.use(requireAuth);
futureLetterRouter.use((req, _res, next) => next(req.user!.role === 'CLIENT' ? undefined : forbidden('CLIENTS_ONLY')));
futureLetterRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
});

const writeLimiter = limiter({ windowMs: 60 * 1000, limit: 20, keyGenerator: (req) => req.user?.id ?? 'anonymous', skip: () => config.isTest });

futureLetterRouter.get('/', async (req, res) => {
  res.json({ ...(await letterView(req.user!.id)), maxChars: LETTER_MAX_CHARS });
});

const saveSchema = z
  .object({
    // A little slack for line endings; the service counts the normalised text.
    body: z.string().max(LETTER_MAX_CHARS * 2),
    deliverOn: z.string().max(10).nullable().optional(),
  })
  .strict();

futureLetterRouter.put('/', writeLimiter, async (req, res) => {
  const body = parse(saveSchema, req.body ?? {});
  await saveLetter(req.user!.id, body);
  res.json({ ...(await letterView(req.user!.id)), maxChars: LETTER_MAX_CHARS });
});

futureLetterRouter.delete('/', writeLimiter, async (req, res) => {
  res.json({ deleted: await deleteLetter(req.user!.id) });
});
