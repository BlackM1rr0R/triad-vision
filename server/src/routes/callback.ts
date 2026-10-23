import { Router, type Request } from 'express';
import { parse } from '../lib/http.js';
import { takeHit } from '../lib/publicAi/guard.js';
import { callbackInput, createCallback, slotsFor } from '../lib/calls/callbacks.js';

/**
 * "Mənə zəng edin" (/api/callback) — public site (contact page, footer, AI advisor, live chat fallback) and the
 * client portal (cookie session → linked to the client, phone prefilled by the UI):
 *   GET  /slots   office hours (Asia/Baku) + 1-hour windows for today / tomorrow + whether "ASAP" is now
 *   POST /        request a callback (honeypot `website`, 5 per hour per IP / account, consent required)
 */
export const callbackRouter = Router();

const ipOf = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'unknown';
export const CALLBACKS_PER_HOUR = 5;

callbackRouter.get('/slots', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await slotsFor());
});

callbackRouter.post('/', async (req, res) => {
  const body = parse(callbackInput, req.body);
  if (body.website) {
    // A bot filled the hidden field: look like a success, store nothing.
    res.status(201).json({ ok: true });
    return;
  }
  const key = req.user ? `callback:u:${req.user.id}` : `callback:${ipOf(req)}`;
  if (takeHit(key, { hour: CALLBACKS_PER_HOUR })) {
    res.status(429).json({ error: 'TOO_MANY_REQUESTS', scope: 'hour' });
    return;
  }
  const clientId = req.user?.role === 'CLIENT' && !req.impersonator ? req.user.id : null;
  const r = await createCallback(body, { clientId });
  res.status(201).json({ ok: true, ...r });
});
