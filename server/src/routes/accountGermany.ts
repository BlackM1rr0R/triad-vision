import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { forbidden, notFound, parse } from '../lib/http.js';
import { ownCaseId } from '../lib/clientPlus/portal.js';
import { germanyDay, PACKING_KEYS, setPacking } from '../lib/departure/service.js';
import { arrivalCard } from '../lib/departure/arrivalCard.js';
import { clientBadges, markBadgesSeen } from '../lib/badges/service.js';
import { BADGE_KEYS } from '../lib/badges/rules.js';

/**
 * /api/account/germany — the client's way to Germany (clients only, own data only):
 *   GET  /day?case=<id>          "My Germany day": countdown, destination weather (forecast / typical climate),
 *                                packing checklist (lib/departure/service)
 *   PUT  /packing/:key           { done } tick / untick a packing item (from 14 days before the flight)
 *   GET  /arrival-card?case=<id> the digital arrival card: German address, employer contact, first work day,
 *                                emergency numbers, embassy, support (lib/departure/arrivalCard); 404 before the visa
 *   GET  /badges                 badges locked / unlocked with dates (newly earned ones are stored here)
 *   POST /badges/seen            { keys? } the celebration of these (or all fresh) badges was shown
 * A case id of someone else is "not found".
 */
export const accountGermanyRouter = Router();
accountGermanyRouter.use(requireAuth);
accountGermanyRouter.use((req, _res, next) => next(req.user!.role === 'CLIENT' ? undefined : forbidden('CLIENTS_ONLY')));
accountGermanyRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

const chosenCase = async (userId: string, q: unknown) => {
  const wanted = typeof q === 'string' && q ? q.slice(0, 41) : null;
  if (!wanted) return null;
  const id = await ownCaseId(userId, wanted);
  if (!id) throw notFound('CASE_NOT_FOUND');
  return id;
};

accountGermanyRouter.get('/day', async (req, res) => {
  const caseId = await chosenCase(req.user!.id, req.query.case);
  res.json(await germanyDay(req.user!.id, caseId));
});

const packingSchema = z.object({ done: z.boolean() }).strict();
const packingKey = z.enum(PACKING_KEYS);

accountGermanyRouter.put('/packing/:key', async (req, res) => {
  const key = parse(packingKey, req.params.key);
  const { done } = parse(packingSchema, req.body);
  res.json({ packing: await setPacking(req.user!.id, key, done) });
});

accountGermanyRouter.get('/arrival-card', async (req, res) => {
  const caseId = await chosenCase(req.user!.id, req.query.case);
  const card = await arrivalCard(req.user!.id, caseId);
  if (!card) throw notFound('NO_APPROVED_CASE');
  res.json({ card });
});

accountGermanyRouter.get('/badges', async (req, res) => {
  res.json(await clientBadges(req.user!.id));
});

const seenSchema = z.object({ keys: z.array(z.enum(BADGE_KEYS as [string, ...string[]])).max(50).optional() }).strict();

accountGermanyRouter.post('/badges/seen', async (req, res) => {
  const { keys } = parse(seenSchema, req.body ?? {});
  res.json({ updated: await markBadgesSeen(req.user!.id, keys ?? null) });
});
