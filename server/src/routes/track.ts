import crypto from 'node:crypto';
import express, { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { limiter } from '../lib/http.js';
import { normaliseSource, utcDay } from '../lib/funnel.js';
import { recordVisitorEvent, visitorBeaconSchema } from '../lib/marketing/visitors.js';

// Cookie-less funnel analytics beacon — mounted at /api/track
export const trackRouter = Router();

/**
 * Privacy: nothing that identifies a visitor is stored — only a per-day counter per traffic
 * source. The IP address is used solely as the in-memory rate-limit key and never persisted.
 */
const trackLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 30 });

const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|curl|wget|python|axios|node-fetch/i;

const bodySchema = z.object({
  metric: z.literal('visit'),
  source: z.string().max(200).optional().default(''),
});

// navigator.sendBeacon sends text/plain (a CORS-safelisted type); JSON is accepted too.
trackRouter.post('/', trackLimiter, express.text({ type: 'text/plain', limit: '1kb' }), async (req, res) => {
  if (req.get('dnt') === '1' || req.get('sec-gpc') === '1' || BOT_UA.test(req.get('user-agent') ?? '')) {
    res.status(204).end();
    return;
  }
  let raw: unknown = req.body;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      res.status(400).json({ error: 'INVALID_JSON' });
      return;
    }
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION' });
    return;
  }
  const source = normaliseSource(parsed.data.source);
  const day = utcDay(new Date());
  // Atomic upsert-increment; the unique key is (day, metric, source).
  await prisma.$executeRaw`
    INSERT INTO AnalyticsDaily (id, day, metric, source, count)
    VALUES (${crypto.randomUUID()}, ${day}, ${parsed.data.metric}, ${source}, 1)
    ON DUPLICATE KEY UPDATE count = count + 1`;
  res.status(204).end();
});

// ─── Lead visitors (only after analytics consent) ──────────────────────

/**
 * POST /api/track/lead — first-party visitor counters for lead scoring (lib/marketing/visitors.ts). The
 * browser only sends this after the visitor accepted analytics cookies (client lib/consent.ts); the body
 * carries a random visitor id, the event and the page path. Bots, Do-Not-Track and GPC are ignored.
 */
const leadLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 120 });

trackRouter.post('/lead', leadLimiter, express.text({ type: 'text/plain', limit: '2kb' }), async (req, res) => {
  if (req.get('dnt') === '1' || req.get('sec-gpc') === '1' || BOT_UA.test(req.get('user-agent') ?? '')) {
    res.status(204).end();
    return;
  }
  let raw: unknown = req.body;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      res.status(400).json({ error: 'INVALID_JSON' });
      return;
    }
  }
  const parsed = visitorBeaconSchema.safeParse(raw);
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION' });
    return;
  }
  await recordVisitorEvent(parsed.data);
  res.status(204).end();
});
