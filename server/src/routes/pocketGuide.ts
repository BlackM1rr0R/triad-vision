import { Router, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { forbidden, limiter, parse } from '../lib/http.js';
import { arrivalCard } from '../lib/departure/arrivalCard.js';
import { POCKET_LOCALES } from '../lib/pocketGuide/content.js';
import { LAYOUTS, POCKET_GUIDE_VERSION, buildPocketGuide, genericPocketGuide, type PocketLayout } from '../lib/pocketGuide/pdf.js';

/**
 * Germany pocket guide PDF — mounted at /api/pocket-guide (lib/pocketGuide/pdf.ts):
 *   GET /pdf?lng=az|ru|en|de&layout=a5|booklet     public, cached per language / layout / facts
 *   GET /mine?lng=…&layout=…                        signed-in clients: with name, employer and the city's Bürgeramt
 *                                                   link from their approved case (built on demand, never stored)
 */
export const pocketGuideRouter = Router();

const pdfLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 30, skip: () => config.isTest });
const mineLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 10, skip: () => config.isTest });

const query = z.object({ lng: z.enum(POCKET_LOCALES).catch('az').default('az'), layout: z.enum(LAYOUTS).catch('a5').default('a5') });

const send = (res: Response, pdf: Buffer, lng: string, layout: PocketLayout, personal: boolean) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="germany-pocket-guide-${lng}-${layout === 'booklet' ? 'a4-booklet' : 'a5'}${personal ? '-personal' : ''}.pdf"`);
  res.setHeader('X-Pocket-Guide-Version', POCKET_GUIDE_VERSION);
  res.send(pdf);
};

pocketGuideRouter.get('/pdf', pdfLimiter, async (req, res) => {
  const q = parse(query, req.query);
  const pdf = await genericPocketGuide(q.lng, q.layout);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  send(res, pdf, q.lng, q.layout, false);
});

pocketGuideRouter.get('/mine', requireAuth, mineLimiter, async (req, res) => {
  if (req.user!.role !== 'CLIENT') throw forbidden('CLIENTS_ONLY');
  const q = parse(query, req.query);
  const [card, user] = await Promise.all([
    arrivalCard(req.user!.id, null),
    prisma.user.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true } }),
  ]);
  const personal = {
    name: card?.holder.name || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || null,
    employer: card?.employer ? { name: card.employer.name, address: card.employer.address, phone: card.employer.phone } : null,
    city: card?.address.city ?? null,
  };
  const pdf = await buildPocketGuide(q.lng, q.layout, personal);
  res.setHeader('Cache-Control', 'private, no-store');
  send(res, pdf, q.lng, q.layout, true);
});
