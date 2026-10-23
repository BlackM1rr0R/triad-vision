import crypto from 'node:crypto';
import express, { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { audit } from '../lib/audit.js';
import { limiter, notFound } from '../lib/http.js';
import { isAllowedUrl } from '../lib/campaigns/content.js';
import { readLinks } from '../lib/campaigns/engine.js';
import { setMarketingOptIn } from '../lib/campaigns/consent.js';

/**
 * Public campaign endpoints (no login), mounted at /api so they are served from our own domain:
 *
 *   GET  /api/o/:token.gif           open pixel (1×1 GIF). Apple Mail Privacy Protection and image
 *                                    proxies load it without a human opening the mail: opens are approximate.
 *   GET  /api/c/:token/:link         tracked click → 302 to the campaign's frozen, allow-listed link #link.
 *                                    The destination never comes from the request (no open redirect).
 *   GET  /api/unsubscribe/:token     what the unsubscribe page shows
 *   POST /api/unsubscribe/:token     unsubscribe: RFC 8058 one-click (List-Unsubscribe=One-Click form
 *                                    body from the mail client) or the button on /unsubscribe?token=
 *   POST /api/campaign-sms-status    optional SMS delivery report (CAMPAIGN_SMS_STATUS_SECRET in ?secret=)
 */
export const campaignPublicRouter = Router();

const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

const trackLimiter = limiter({ windowMs: 60 * 1000, limit: 120, skip: () => config.isTest });
const unsubLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 30, skip: () => config.isTest });

const noCache = (res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
};

campaignPublicRouter.get('/o/:file', trackLimiter, async (req, res) => {
  const token = String(req.params.file).replace(/\.gif$/i, '');
  if (TOKEN.test(token)) {
    // Only the first open is stored; never fails the image.
    await prisma.campaignRecipient.updateMany({ where: { token, channel: 'EMAIL', openedAt: null }, data: { openedAt: new Date() } }).catch(() => null);
  }
  noCache(res);
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Content-Length', String(GIF.length));
  res.end(GIF);
});

campaignPublicRouter.get('/c/:token/:link', trackLimiter, async (req, res) => {
  const home = config.clientUrl;
  const token = String(req.params.token);
  const index = Number(String(req.params.link));
  noCache(res);
  if (!TOKEN.test(token) || !Number.isInteger(index) || index < 0 || index > 999) return res.redirect(302, home);
  const r = await prisma.campaignRecipient.findUnique({ where: { token }, select: { id: true, openedAt: true, clickedAt: true, campaign: { select: { links: true } } } });
  const target = r ? readLinks(r.campaign.links)[index] : undefined;
  // Re-checked at redirect time: a link that is no longer allowed falls back to our home page.
  if (!r || !target || !isAllowedUrl(target)) return res.redirect(302, home);
  const now = new Date();
  // The first click time is kept; a click also counts as an open (images may be blocked).
  await prisma.campaignRecipient
    .update({ where: { id: r.id }, data: { clicks: { increment: 1 }, ...(r.clickedAt ? {} : { clickedAt: now }), ...(r.openedAt ? {} : { openedAt: now }) } })
    .catch(() => null);
  res.redirect(302, target);
});

const maskEmail = (email: string) => {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(6, local.length - 2)))}@${domain}`;
};

const loadRecipient = (token: string) =>
  prisma.campaignRecipient.findUnique({
    where: { token },
    select: {
      id: true,
      userId: true,
      campaignId: true,
      unsubscribedAt: true,
      campaign: { select: { kind: true, name: true } },
      user: { select: { email: true, locale: true, marketingOptIn: true, emailNotifications: true } },
    },
  });

campaignPublicRouter.get('/unsubscribe/:token', unsubLimiter, async (req, res) => {
  noCache(res);
  const token = String(req.params.token);
  if (token === 'test') return res.json({ test: true });
  const r = TOKEN.test(token) ? await loadRecipient(token) : null;
  if (!r) throw notFound('UNSUBSCRIBE_TOKEN_INVALID');
  res.json({
    test: false,
    kind: r.campaign.kind,
    email: maskEmail(r.user.email),
    locale: r.user.locale,
    marketingOptIn: r.user.marketingOptIn,
    emailNotifications: r.user.emailNotifications,
    unsubscribedAt: r.unsubscribedAt,
  });
});

const unsubBody = z.object({ scope: z.enum(['marketing', 'all']).optional() }).passthrough();

/**
 * Marketing campaign → marketing consent withdrawn. Service campaign → e-mail notifications off
 * (non-essential mail). scope "all" does both. Honoured at once: the sender re-checks before each message.
 */
const unsubscribe = async (req: Request, res: Response) => {
  noCache(res);
  const token = String(req.params.token);
  if (token === 'test') return res.json({ ok: true, test: true });
  const r = TOKEN.test(token) ? await loadRecipient(token) : null;
  if (!r) throw notFound('UNSUBSCRIBE_TOKEN_INVALID');
  const parsed = unsubBody.safeParse(typeof req.body === 'object' && req.body ? req.body : {});
  const oneClick = (req.body as Record<string, unknown> | undefined)?.['List-Unsubscribe'] === 'One-Click';
  const scope = parsed.success && parsed.data.scope ? parsed.data.scope : r.campaign.kind === 'MARKETING' ? 'marketing' : 'all';
  const now = new Date();
  const marketingChanged = await setMarketingOptIn(r.userId, false, 'UNSUBSCRIBE', req);
  let emailOff = false;
  if (scope === 'all' || r.campaign.kind === 'SERVICE') {
    const u = await prisma.user.update({ where: { id: r.userId }, data: { emailNotifications: false }, select: { id: true } }).catch(() => null);
    emailOff = !!u;
  }
  await prisma.campaignRecipient.updateMany({ where: { campaignId: r.campaignId, userId: r.userId, unsubscribedAt: null }, data: { unsubscribedAt: now } });
  await audit(req, 'CAMPAIGN_UNSUBSCRIBE', `user:${r.userId}`, { campaignId: r.campaignId, scope, oneClick, marketingChanged, emailOff });
  res.json({ ok: true, scope });
};

// One-click POSTs arrive as application/x-www-form-urlencoded ("List-Unsubscribe=One-Click").
campaignPublicRouter.post('/unsubscribe/:token', unsubLimiter, express.urlencoded({ extended: false, limit: '2kb' }), unsubscribe);

// ─── SMS delivery reports (optional) ───────────────────────────────────

const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

/**
 * Twilio StatusCallback (MessageSid, MessageStatus) or a generic gateway ({ id, status }). Enabled only
 * when CAMPAIGN_SMS_STATUS_SECRET is set; the provider calls …/api/campaign-sms-status?secret=….
 */
campaignPublicRouter.post('/campaign-sms-status', express.urlencoded({ extended: false, limit: '8kb' }), async (req, res) => {
  const secret = (process.env.CAMPAIGN_SMS_STATUS_SECRET ?? '').trim();
  if (!secret || typeof req.query.secret !== 'string' || !safeEqual(secret, req.query.secret)) throw notFound();
  const b = (req.body ?? {}) as Record<string, unknown>;
  const id = String(b.MessageSid ?? b.id ?? b.messageId ?? '').slice(0, 120);
  const status = String(b.MessageStatus ?? b.status ?? '').toLowerCase();
  if (!id) return res.status(204).end();
  if (status === 'delivered') {
    await prisma.campaignRecipient.updateMany({ where: { providerId: id, channel: 'SMS', deliveredAt: null }, data: { deliveredAt: new Date() } });
  } else if (status === 'undelivered' || status === 'failed') {
    await prisma.campaignRecipient.updateMany({ where: { providerId: id, channel: 'SMS' }, data: { status: 'BOUNCED', error: `SMS ${status}` } });
  }
  res.status(204).end();
});
