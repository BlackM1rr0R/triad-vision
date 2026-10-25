import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { badRequest, conflict, forbidden, limiter, notFound, parse } from '../lib/http.js';
import { notifyStaff } from '../lib/notifications.js';
import { recordConsent } from '../lib/privacy/consents.js';
import { onInquiryCreated } from '../lib/assignment/inquiry.js';
import { attachLeadContext, utmSchema, visitorIdSchema } from '../lib/marketing/leadScoring.js';
import { getReferralSettings } from '../lib/growth/referral.js';
import { CARD_FORMATS, successCardPng, type CardFormat } from '../lib/successShare/card.js';
import {
  NAME_STYLES,
  cardInputOf,
  countShareLead,
  publicShareJson,
  revokeShare,
  shareUrlOf,
  shareView,
  shareableCases,
  sharesOf,
  upsertShare,
  visaLineOf,
} from '../lib/successShare/service.js';
import { CARD_LOCALES, asCardLocale } from '../lib/successShare/texts.js';

/**
 * "Visa approved" share cards (lib/successShare).
 *
 * Client portal — mounted at /api/account/success-share (CLIENT only):
 *   GET    /           approved cases that can be shared + the existing share of each
 *   POST   /           create / update the share of a case (explicit consent required)
 *   DELETE /:token     revoke: the public page, the images and the lead form answer 404 from now on
 *
 * Public — mounted at /api/success:
 *   GET  /:token                     what the public page shows (first name / initials only)
 *   GET  /:token/card-post.png       1080×1350 card (…?download=1 → attachment)
 *   GET  /:token/card-story.png      1080×1920 card
 *   POST /:token/lead                "Start your journey" form → Inquiry (source success-share:<token>), lead scoring
 */
export const accountSuccessShareRouter = Router();
accountSuccessShareRouter.use(requireAuth);
accountSuccessShareRouter.use((req, _res, next) => (req.user?.role === 'CLIENT' ? next() : next(forbidden())));

const shareJson = (token: string, r: { nameStyle: string; showReferral: boolean; allowIndexing: boolean; locale: string; createdAt: string; updatedAt: string; leads: number }) => ({
  token,
  nameStyle: r.nameStyle,
  showReferral: r.showReferral,
  allowIndexing: r.allowIndexing,
  locale: r.locale,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  leads: r.leads,
  url: shareUrlOf(token, r.locale),
  cards: { post: `/api/success/${token}/card-post.png`, story: `/api/success/${token}/card-story.png` },
});

accountSuccessShareRouter.get('/', async (req, res) => {
  const userId = req.user!.id;
  const [cases, shares, referral, me] = await Promise.all([
    shareableCases(userId),
    sharesOf(userId),
    getReferralSettings(),
    prisma.user.findUnique({ where: { id: userId }, select: { locale: true } }),
  ]);
  const locale = asCardLocale(me?.locale);
  res.json({
    referralEnabled: referral.enabled,
    items: cases.map((c) => {
      const share = shares.find((s) => s.record.caseId === c.id);
      return {
        caseId: c.id,
        number: c.number,
        decisionAt: c.decisionAt,
        visaLine: visaLineOf(c, locale),
        share: share ? shareJson(share.token, share.record) : null,
      };
    }),
  });
});

accountSuccessShareRouter.post('/', async (req, res) => {
  const body = parse(
    z.object({
      caseId: z.string().min(1).max(40),
      // DSGVO: nothing becomes public without this explicit tick.
      consent: z.literal(true, { errorMap: () => ({ message: 'CONSENT_REQUIRED' }) }),
      nameStyle: z.enum(NAME_STYLES).default('first'),
      showReferral: z.boolean().default(true),
      allowIndexing: z.boolean().default(false),
      locale: z.enum(CARD_LOCALES).optional(),
    }),
    req.body ?? {},
  );
  const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { locale: true } });
  const result = await upsertShare(req.user!.id, { ...body, locale: body.locale ?? me?.locale ?? 'az' });
  if ('error' in result) throw result.error === 'CASE_NOT_FOUND' ? notFound(result.error) : conflict(result.error!);
  res.status(201).json({ share: shareJson(result.token, result.record) });
});

accountSuccessShareRouter.delete('/:token', async (req, res) => {
  if (!(await revokeShare(req.user!.id, String(req.params.token)))) throw notFound('SHARE_NOT_FOUND');
  res.json({ ok: true });
});

// ─── Public ─────────────────────────────────────────────────────────────

export const publicSuccessShareRouter = Router();
const readLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 300, skip: () => config.isTest });
const leadLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 10, skip: () => config.isTest });

const viewOr404 = async (token: string) => {
  const view = await shareView(token);
  if (!view) throw notFound('SHARE_NOT_FOUND');
  return view;
};

publicSuccessShareRouter.get('/:token', readLimiter, async (req, res) => {
  const view = await viewOr404(String(req.params.token));
  if (!view.record.allowIndexing) res.setHeader('X-Robots-Tag', 'noindex');
  res.json(publicShareJson(view));
});

publicSuccessShareRouter.get('/:token/:file', readLimiter, async (req, res) => {
  const format = /^card-(post|story)\.png$/.exec(String(req.params.file))?.[1] as CardFormat | undefined;
  if (!format || !CARD_FORMATS[format]) throw notFound();
  const view = await viewOr404(String(req.params.token));
  const png = await successCardPng(cardInputOf(view, format));
  res.type('image/png');
  // Short cache: a revoked share must disappear soon from browsers and the CDN too.
  res.setHeader('Cache-Control', 'public, max-age=300');
  if (!view.record.allowIndexing) res.setHeader('X-Robots-Tag', 'noindex');
  if (req.query.download) res.setHeader('Content-Disposition', `attachment; filename="triad-vision-${format}.png"`);
  res.send(png);
});

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal('').transform(() => undefined));

publicSuccessShareRouter.post('/:token/lead', leadLimiter, async (req, res) => {
  const body = parse(
    z.object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().toLowerCase().email().max(200).optional().or(z.literal('').transform(() => undefined)),
      phone: z
        .string()
        .trim()
        .max(40)
        .regex(/^[+\d][\d\s()-]{5,}$/, 'PHONE_INVALID')
        .optional()
        .or(z.literal('').transform(() => undefined)),
      message: optional(2000),
      locale: z.enum(['az', 'de', 'en', 'ru', 'tr', 'uk']).default('az'),
      consent: z.literal(true),
      website: z.string().max(200).optional(), // honeypot
      visitorId: visitorIdSchema.optional().catch(undefined),
      utm: utmSchema.optional().catch(undefined),
    }),
    req.body ?? {},
  );
  const token = String(req.params.token);
  const view = await viewOr404(token);
  if (body.website) {
    res.status(201).json({ ok: true }); // look like a success to bots
    return;
  }
  if (!body.email && !body.phone) throw badRequest('CONTACT_REQUIRED');
  const message = [`Uğur kartı (paylaşım): ${view.visaLine}${view.city ? ` · ${view.city}` : ''}`, view.referralCode ? `Tövsiyə kodu: ${view.referralCode}` : null, body.message ? `\n${body.message}` : null]
    .filter((l): l is string => l !== null)
    .join('\n')
    .slice(0, 5000);
  const inquiry = await prisma.inquiry.create({
    data: {
      kind: 'contact',
      source: `success-share:${token}`.slice(0, 80),
      contactName: body.name,
      email: body.email ?? '',
      phone: body.phone ?? null,
      message,
      // Staff languages are az/de/en/ru: Turkish is handled by the Azerbaijani team, Ukrainian by the Russian one.
      locale: ({ tr: 'az', uk: 'ru' } as Record<string, string>)[body.locale] ?? body.locale,
    },
  });
  void onInquiryCreated(inquiry.id);
  if (body.email) await recordConsent({ email: body.email, type: 'PRIVACY_POLICY', granted: true, source: 'SUCCESS_SHARE', req });
  await countShareLead(token);
  await notifyStaff(
    `Uğur kartından müraciət: ${body.name}`,
    [body.email ? `Email: ${body.email}` : null, body.phone ? `Telefon: ${body.phone}` : null, `Dil: ${body.locale}`, '', message].filter((l): l is string => l !== null).join('\n'),
    { link: '/admin/inquiries' },
  );
  await attachLeadContext(inquiry.id, { visitorId: body.visitorId, utm: body.utm });
  res.status(201).json({ ok: true });
});
