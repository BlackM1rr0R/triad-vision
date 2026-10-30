import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Locale } from '@prisma/client';
import { prisma } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, conflict, limiter, notFound, parse } from '../lib/http.js';
import { ensureReferralCode, getReferralSettings, maskedName, referralLink } from '../lib/growth/referral.js';
import { config } from '../config.js';
import {
  fillTemplate,
  getReferralTemplates,
  getReferralTerms,
  landingSchema,
  normaliseSlug,
  removeLandingPhoto,
  storeLandingPhoto,
} from '../lib/growth/referralExtras.js';
import { receiptNumber, referralCardPdf, rewardReceiptPdf } from '../lib/growth/referralPdf.js';

/**
 * Sharing side of the client referral programme — mounted inside /api/growth:
 *   GET    /referral/share                  landing page settings + share messages per profession (link filled in)
 *   PUT    /referral/landing                { enabled, slug, quote } — opt-in personal page /r/<slug>
 *   POST   /referral/landing/photo          optional photo (multipart "file"); DELETE removes it
 *   GET    /referral/card.pdf               QR business card (?layout=single|sheet, ?lang)
 *   GET    /referral/rewards/:id/receipt.pdf  receipt of the client's own settled cash payout
 *   GET    /r/:slug                         public landing data (opt-in only; noindex)
 *   GET    /referral-terms                  programme terms (public)
 */
export const referralShareRouter = Router();
const client = requireRole('CLIENT');
const LOCALES = ['az', 'de', 'en', 'ru'] as const;

const landingView = (c: { slug: string | null; landingEnabled: boolean; landingQuote: string | null; landingPhotoUrl: string | null } | null) => ({
  enabled: !!c?.landingEnabled,
  slug: c?.slug ?? null,
  quote: c?.landingQuote ?? '',
  photoUrl: c?.landingPhotoUrl ?? null,
  url: c?.slug ? `${config.clientUrl}/r/${c.slug}` : null,
});

referralShareRouter.get('/referral/share', client, async (req, res) => {
  const settings = await getReferralSettings();
  const code = settings.enabled ? await ensureReferralCode(req.user!.id) : await prisma.clientReferralCode.findUnique({ where: { userId: req.user!.id } });
  const landing = landingView(code);
  // Share the personal page when it is on, else the plain sign-up link.
  const link = code ? (landing.enabled && landing.url ? landing.url : referralLink(code.code)) : null;
  const { items } = await getReferralTemplates();
  res.json({
    landing,
    link,
    templates: link
      ? items.map((t) => ({ key: t.key, label: t.label, text: Object.fromEntries(LOCALES.map((l) => [l, fillTemplate(t.text[l] || t.text.en, link)])) }))
      : [],
  });
});

referralShareRouter.put('/referral/landing', client, async (req, res) => {
  const body = parse(landingSchema, req.body);
  const code = await ensureReferralCode(req.user!.id);
  let slug = code.slug;
  if (body.slug !== undefined) {
    slug = body.slug ? normaliseSlug(body.slug) : null;
    if (body.slug && !slug) throw badRequest('INVALID_SLUG');
  }
  if (body.enabled && !slug) throw badRequest('SLUG_REQUIRED');
  try {
    const updated = await prisma.clientReferralCode.update({
      where: { id: code.id },
      data: { slug, landingEnabled: body.enabled, ...(body.quote !== undefined ? { landingQuote: body.quote?.trim() || null } : {}) },
    });
    res.json({ landing: landingView(updated) });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw conflict('SLUG_TAKEN');
    throw err;
  }
});

const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
const singlePhoto = (req: Request, res: Response, next: NextFunction) =>
  photoUpload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) return next(badRequest(err.code === 'LIMIT_FILE_SIZE' ? 'IMAGE_TOO_LARGE' : 'INVALID_IMAGE'));
    next(err as Error | undefined);
  });

referralShareRouter.post('/referral/landing/photo', client, singlePhoto, async (req, res) => {
  if (!req.file) throw badRequest('FILE_REQUIRED');
  const code = await ensureReferralCode(req.user!.id);
  const url = await storeLandingPhoto(req.file.buffer);
  await prisma.clientReferralCode.update({ where: { id: code.id }, data: { landingPhotoUrl: url } });
  await removeLandingPhoto(code.landingPhotoUrl);
  res.json({ photoUrl: url });
});

referralShareRouter.delete('/referral/landing/photo', client, async (req, res) => {
  const code = await prisma.clientReferralCode.findUnique({ where: { userId: req.user!.id } });
  if (code?.landingPhotoUrl) {
    await prisma.clientReferralCode.update({ where: { id: code.id }, data: { landingPhotoUrl: null } });
    await removeLandingPhoto(code.landingPhotoUrl);
  }
  res.json({ ok: true });
});

referralShareRouter.get('/referral/card.pdf', client, async (req, res) => {
  const q = parse(z.object({ layout: z.enum(['single', 'sheet']).default('sheet'), lang: z.enum(LOCALES).optional() }), req.query);
  const settings = await getReferralSettings();
  if (!settings.enabled) throw notFound('REFERRAL_DISABLED');
  const code = await ensureReferralCode(req.user!.id);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { firstName: true, lastName: true, locale: true } });
  const link = code.landingEnabled && code.slug ? `${config.clientUrl}/r/${code.slug}` : referralLink(code.code);
  const pdf = await referralCardPdf({ name: `${user.firstName} ${user.lastName}`.trim(), link, code: code.code, locale: q.lang ?? user.locale, layout: q.layout });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="referral-card-${q.layout}.pdf"`);
  res.send(pdf);
});

/** Receipt data of a settled cash payout (null when the reward is not one). Shared with the admin route. */
export const receiptFor = async (rewardId: string, ownerId?: string) => {
  const reward = await prisma.referralReward.findUnique({
    where: { id: rewardId },
    include: {
      referral: { select: { referred: { select: { firstName: true, lastName: true } } } },
      source: { select: { referred: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!reward || reward.status !== 'PAID' || reward.kind !== 'PAYOUT' || !reward.settledAt || (ownerId && reward.referrerId !== ownerId)) return null;
  const user = await prisma.user.findUnique({ where: { id: reward.referrerId }, select: { firstName: true, lastName: true, email: true, locale: true } });
  if (!user) return null;
  const friend = reward.referral?.referred ?? reward.source?.referred;
  const reason =
    reward.type === 'TIER'
      ? `Stufenbonus / Tier bonus (${reward.dedupeKey?.split(':')[2] ?? '?'})`
      : `${reward.type === 'STAGE' ? 'Antragsbonus / Application bonus' : 'Empfehlung / Referral'}${friend ? `: ${maskedName(friend.firstName, friend.lastName)}` : ''}`;
  const input = {
    id: reward.id,
    amount: reward.amount,
    currency: reward.currency,
    settledAt: reward.settledAt,
    reason,
    note: reward.note,
    recipient: { name: `${user.firstName} ${user.lastName}`.trim(), email: user.email, locale: user.locale as Locale },
  };
  return { input, number: receiptNumber({ id: reward.id, settledAt: reward.settledAt }) };
};

export const sendReceipt = async (res: Response, r: NonNullable<Awaited<ReturnType<typeof receiptFor>>>) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${r.number}.pdf"`);
  res.send(await rewardReceiptPdf(r.input));
};

referralShareRouter.get('/referral/rewards/:id/receipt.pdf', client, async (req, res) => {
  const r = await receiptFor(String(req.params.id), req.user!.id);
  if (!r) throw notFound();
  await sendReceipt(res, r);
});

// ─── Public ────────────────────────────────────────────────────────────

const publicLimiter = limiter({ windowMs: 60 * 1000, limit: 60 });

referralShareRouter.get('/r/:slug', publicLimiter, async (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const slug = normaliseSlug(String(req.params.slug));
  const settings = await getReferralSettings();
  const code = slug && settings.enabled
    ? await prisma.clientReferralCode.findUnique({ where: { slug }, include: { user: { select: { firstName: true, role: true, isActive: true } } } })
    : null;
  if (!code || !code.landingEnabled || code.user.role !== 'CLIENT' || !code.user.isActive) throw notFound();
  // First name only: the page is public.
  res.json({ firstName: code.user.firstName.trim(), quote: code.landingQuote ?? '', photoUrl: code.landingPhotoUrl, code: code.code, registerUrl: referralLink(code.code) });
});

referralShareRouter.get('/referral-terms', async (_req, res) => {
  const [terms, settings] = await Promise.all([getReferralTerms(), getReferralSettings()]);
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
  res.json({
    body: terms.body,
    updatedAt: terms.updatedAt || null,
    rule: { enabled: settings.enabled, trigger: settings.trigger, kind: settings.kind, amount: settings.amount, currency: settings.currency, terms: settings.terms },
  });
});
