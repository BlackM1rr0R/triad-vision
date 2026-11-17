import express, { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { limiter, notFound, parse } from '../lib/http.js';
import { parseLocale } from '../lib/seo.js';
import { utmSchema, visitorIdSchema } from '../lib/marketing/leadScoring.js';
import { BEACON_EVENTS } from '../lib/toolAnalytics/compute.js';
import { recordToolEvent } from '../lib/toolAnalytics/service.js';
import { isToolSlug, pathMatchesTool, resultPathSchema, summarySchema, toolSlugSchema, verifyLeadToken } from '../lib/toolLeads/tools.js';
import { confirmLead, createToolLead, findLead, leadView, unsubscribeLead } from '../lib/toolLeads/service.js';
import { getFeaturedTools } from '../lib/featuredTools.js';

/**
 * Public tool endpoints — mounted at /api/tools:
 *   GET  /featured                      the "most useful" tools (ordered paths) of /tools and the header menu
 *   POST /track                         cookie-less tool counter { t: slug, e: view | use | register | inquiry |
 *                                       embed_view } (text/plain beacon or JSON). DNT / GPC / bots ignored.
 *   POST /result-email                  "e-mail me my result" { tool, email, name?, phone?, lng, summary[], path?,
 *                                       followUp (separate consent), website (honeypot), visitorId?, utm? }
 *   GET  /result-email/manage?token=    masked state of a lead (page /result-email)
 *   POST /result-email/confirm          { token } double opt-in of the follow-up
 *   POST /result-email/unsubscribe      { token } (page button)
 *   POST /result-email/unsubscribe/:token   RFC 8058 one-click (List-Unsubscribe-Post from the mail client)
 */
export const toolsRouter = Router();

const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|curl|wget|python|axios|node-fetch/i;

const trackLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 120, skip: () => config.isTest });
const leadLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 8, skip: () => config.isTest });
const tokenLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 40, skip: () => config.isTest });

const noStore = (res: Response) => res.setHeader('Cache-Control', 'no-store, private');

toolsRouter.get('/featured', async (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(await getFeaturedTools());
});

const beaconSchema = z.object({ t: z.string().max(60), e: z.enum(BEACON_EVENTS) });

toolsRouter.post('/track', trackLimiter, express.text({ type: 'text/plain', limit: '1kb' }), async (req, res) => {
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
  const parsed = beaconSchema.safeParse(raw);
  if (!parsed.success || !isToolSlug(parsed.data.t)) {
    res.status(400).json({ error: 'VALIDATION' });
    return;
  }
  await recordToolEvent(parsed.data.t, parsed.data.e);
  res.status(204).end();
});

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));

toolsRouter.post('/result-email', leadLimiter, async (req, res) => {
  noStore(res);
  const body = parse(
    z.object({
      tool: toolSlugSchema,
      email: z.string().trim().toLowerCase().email().max(190),
      name: z
        .string()
        .trim()
        .max(120)
        .refine((s) => !/[<>@]|https?:|www\./i.test(s), 'NAME_INVALID')
        .optional()
        .or(z.literal('').transform(() => undefined)),
      phone: z
        .string()
        .trim()
        .max(40)
        .regex(/^[+\d][\d\s()-]{5,}$/, 'PHONE_INVALID')
        .optional()
        .or(z.literal('').transform(() => undefined)),
      lng: z.string().max(5).optional(),
      summary: summarySchema,
      path: resultPathSchema.optional().or(z.literal('').transform(() => undefined)),
      /** Separate, unticked checkbox: one follow-up e-mail after 3 days (double opt-in). */
      followUp: z.boolean().optional().default(false),
      // honeypot: real users never fill this hidden field
      website: z.string().max(200).optional(),
      visitorId: visitorIdSchema.optional().catch(undefined),
      utm: utmSchema.optional().catch(undefined),
      from: optionalText(160),
    }),
    req.body ?? {},
  );
  if (body.website) {
    res.status(201).json({ ok: true, followUp: false }); // look like a success to bots
    return;
  }
  const lng = parseLocale(body.lng) ?? 'az';
  const path = body.path && pathMatchesTool(body.path, body.tool) ? body.path : undefined;
  const r = await createToolLead(
    { slug: body.tool, email: body.email, name: body.name, phone: body.phone, lng, summary: body.summary, path, followUp: body.followUp, visitorId: body.visitorId, utm: body.utm },
    req,
  );
  res.status(201).json({ ok: true, followUp: r.lead.followUpConsent });
});

const tokenBody = z.object({ token: z.string().min(12).max(120) });

const leadOf = async (raw: unknown) => {
  const id = verifyLeadToken(raw);
  const lead = id ? await findLead(id) : null;
  if (!lead) throw notFound('LINK_INVALID');
  return lead;
};

toolsRouter.get('/result-email/manage', tokenLimiter, async (req, res) => {
  noStore(res);
  res.json({ lead: leadView(await leadOf(req.query.token)) });
});

toolsRouter.post('/result-email/confirm', tokenLimiter, async (req, res) => {
  noStore(res);
  const { token } = parse(tokenBody, req.body ?? {});
  const r = await confirmLead(await leadOf(token), req);
  res.json({ status: r.status, lead: leadView(r.lead) });
});

const unsubscribe = async (req: Request, res: Response, token: unknown) => {
  noStore(res);
  const lead = await unsubscribeLead(await leadOf(token), req);
  res.json({ ok: true, lead: leadView(lead) });
};

toolsRouter.post('/result-email/unsubscribe', tokenLimiter, async (req, res) => {
  const { token } = parse(tokenBody, req.body ?? {});
  await unsubscribe(req, res, token);
});

// One-click POSTs arrive as application/x-www-form-urlencoded ("List-Unsubscribe=One-Click").
toolsRouter.post('/result-email/unsubscribe/:token', tokenLimiter, express.urlencoded({ extended: false, limit: '2kb' }), async (req, res) => {
  await unsubscribe(req, res, String(req.params.token));
});
